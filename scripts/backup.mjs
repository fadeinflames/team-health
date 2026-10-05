#!/usr/bin/env node
// Резервные копии боевой базы по DATABASE_URL.
//
// Зачем отдельный скрипт, если есть `make db-dump`: тот ходит только в
// контейнер db из compose и не годится для Railway. А политика отката схемы
// на проде (migrations/README.md) — это именно «восстановить из бэкапа»,
// поэтому бэкап обязан существовать и обязан быть проверяемым.
//
// Использование:
//   node scripts/backup.mjs dump [--out каталог]          снять дамп (по умолчанию backups/)
//   node scripts/backup.mjs verify <файл>                 проверить, что файл читается и содержит нужные таблицы
//   node scripts/backup.mjs restore-check <файл> --into <URL тестовой базы>
//                                                         восстановить в ЧУЖУЮ базу и сравнить число строк
//
// Нужен клиент PostgreSQL (pg_dump и pg_restore в PATH), версия не ниже серверной.
// Запуск без shell: так одинаково работает в Windows PowerShell и в sh.

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// Ключевые таблицы: если их нет в дампе, это не бэкап этого продукта.
// Порядок — порядок строк в итоговой таблице.
const KEY_TABLES = ["users", "people", "cards", "actions", "goals", "pgmigrations"];

const HELP = `Резервные копии базы team-health.

Команды:
  dump [--out каталог]
      pg_dump -Fc базы из DATABASE_URL в <каталог>/team-health-<база>-<дата>.dump
      (по умолчанию backups/). DATABASE_SSL учитывается так же, как в migrate.
  verify <файл>
      pg_restore --list: файл читается, ключевые таблицы (${KEY_TABLES.join(", ")}) на месте.
  restore-check <файл> --into <URL>
      восстановить дамп в другую базу и сравнить число строк. Имя базы в URL
      обязано содержать "test"; с базой из DATABASE_URL команда не работает.
      ВНИМАНИЕ: объекты в тестовой базе перед восстановлением удаляются (--clean).

Примеры:
  node scripts/backup.mjs dump
  node scripts/backup.mjs verify backups/team-health-railway-20261004-101500.dump
  node scripts/backup.mjs restore-check backups/....dump --into postgresql://user:pass@localhost:5432/team_health_test

С ноутбука для боевой базы нужен её публичный адрес: внутренний хост Railway снаружи недоступен.
Пароль никогда не печатается и не передаётся в аргументах pg_dump/pg_restore, только через PGPASSWORD.
URL тестовой базы для restore-check можно взять и из переменной RESTORE_CHECK_DATABASE_URL:
аргумент --into с паролем виден в списке процессов самого node.
`;

// Запасной путь для URL тестовой базы без пароля в argv самого node.
const RESTORE_ENV = "RESTORE_CHECK_DATABASE_URL";

class UserError extends Error {}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

// ---- Строка подключения: разбираем сами и отдаём клиенту через PG* ----------

// Строку целиком в argv не отдаём: argv виден всем пользователям машины
// (ps, диспетчер задач), а в нём пароль.
function parseConnection(raw, label) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    // В сообщение значение не подставляем: в нём может быть пароль.
    throw new UserError(`${label}: не удалось разобрать строку подключения (ожидается postgresql://пользователь:пароль@хост:порт/база)`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new UserError(`${label}: ожидается схема postgresql://`);
  }
  const dec = (value) => decodeURIComponent(value);
  const params = url.searchParams;
  const database = dec(url.pathname.replace(/^\//, "")) || params.get("dbname") || "";
  if (!database) throw new UserError(`${label}: в строке подключения не указана база`);
  return {
    // У IPv6-адреса URL оставляет квадратные скобки, а libpq их не понимает.
    host: url.hostname.replace(/^\[(.*)\]$/, "$1") || params.get("host") || "",
    port: url.port || params.get("port") || "",
    user: dec(url.username) || params.get("user") || "",
    password: dec(url.password) || params.get("password") || "",
    database,
    sslmode: params.get("sslmode") || ""
  };
}

// DATABASE_SSL — те же значения, что у server.js и migrate.mjs. Для целевой
// базы restore-check он не применяется: переменная описывает боевую базу, а
// тестовая локальная обычно без TLS (там работает sslmode из самого URL).
function sslModeFor(conn, useEnv) {
  if (useEnv) {
    const fromEnv = { require: "require", "verify-full": "verify-full", disable: "disable" }[process.env.DATABASE_SSL];
    if (fromEnv) return fromEnv;
  }
  return conn.sslmode;
}

function pgEnv(conn, useEnvSsl) {
  // Дочерний процесс не должен унаследовать ничего, что перебьёт наши параметры.
  // Имена сверяем без учёта регистра: в Windows переменные бывают Path/PgHost.
  const drop = new Set(["DATABASE_URL", "PGHOST", "PGHOSTADDR", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE", "PGSERVICE", "PGOPTIONS", RESTORE_ENV]);
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!drop.has(key.toUpperCase())) env[key] = value;
  }
  if (conn.host) env.PGHOST = conn.host;
  if (conn.port) env.PGPORT = conn.port;
  if (conn.user) env.PGUSER = conn.user;
  if (conn.password) env.PGPASSWORD = conn.password;
  env.PGDATABASE = conn.database;
  const sslmode = sslModeFor(conn, useEnvSsl);
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

// Всё, что пришло от клиентских утилит, прогоняем через маску: сообщения об
// ошибках иногда повторяют параметры подключения.
function masker(...conns) {
  const secrets = conns
    .flatMap((c) => (c?.password ? [c.password, encodeURIComponent(c.password)] : []))
    .filter(Boolean);
  return (text) => {
    let out = String(text).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***");
    for (const secret of secrets) out = out.split(secret).join("***");
    return out;
  };
}

function describe(conn) {
  const where = conn.host ? `${conn.host}${conn.port ? `:${conn.port}` : ""}` : "локальный сокет";
  return `${where}/${conn.database}`;
}

// ---- Запуск pg_dump / pg_restore ---------------------------------------------

function toolMissing(tool) {
  return new UserError(
    `${tool} не найден в PATH. Установите клиент PostgreSQL (версии не ниже серверной) и откройте новое окно терминала.\n` +
      "Windows: установщик EnterpriseDB, пункт Command Line Tools, затем добавьте каталог bin в PATH."
  );
}

// Запускает утилиту без shell. onStdout — построчный обработчик (для подсчёта
// строк большого вывода без накопления в памяти); без него stdout копится
// в строку. stderr всегда накапливается, маскируется и возвращается.
function run(tool, args, { env, mask, onLine } = {}) {
  return new Promise((resolvePromise, reject) => {
    let child;
    try {
      child = spawn(tool, args, { env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      reject(error.code === "ENOENT" ? toolMissing(tool) : error);
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    if (onLine) {
      createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", onLine);
    } else {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    child.on("error", (error) => reject(error.code === "ENOENT" ? toolMissing(tool) : error));
    child.on("close", (code, signal) =>
      resolvePromise({ code, signal, stdout, stderr: (mask ?? String)(stderr).trim(), child })
    );
    // Ctrl-C во время работы: ребёнок в той же группе процессов и получит сигнал сам,
    // но .partial за собой убирает вызывающий код по результату (signal / code != 0).
  });
}

// ---- dump ---------------------------------------------------------------------

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

async function cmdDump(args) {
  let outDir = join(rootDir, "backups");
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--out") {
      if (!args[i + 1]) throw new UserError("--out требует каталог");
      outDir = resolve(args[(i += 1)]);
    } else {
      throw new UserError(`Неизвестный аргумент: ${args[i]}`);
    }
  }
  if (!process.env.DATABASE_URL) throw new UserError("DATABASE_URL не задан");
  const conn = parseConnection(process.env.DATABASE_URL, "DATABASE_URL");
  const mask = masker(conn);

  await mkdir(outDir, { recursive: true });
  const finalPath = join(outDir, `team-health-${conn.database.replace(/[^A-Za-z0-9_-]/g, "_")}-${stamp()}.dump`);
  // Пишем во временный файл: оборванный дамп с именем .dump выглядит настоящим
  // бэкапом, и об обмане узнаёшь только при восстановлении.
  const partialPath = `${finalPath}.partial`;

  console.log(`Снимаю дамп базы ${describe(conn)}...`);
  const result = await run(
    "pg_dump",
    ["-Fc", "--no-owner", "--no-privileges", "--no-password", `--file=${partialPath}`],
    { env: pgEnv(conn, true), mask }
  );

  if (result.code !== 0) {
    await rm(partialPath, { force: true });
    throw new UserError(
      `pg_dump завершился с ошибкой (${result.signal ? `сигнал ${result.signal}` : `код ${result.code}`}), бэкап не создан.` +
        (result.stderr ? `\n${result.stderr}` : "")
    );
  }

  // Нулевой размер при кодe 0 бывает, например, при пустом выводе из-за
  // подмены pg_dump в PATH; такой файл бэкапом не считаем.
  let size = 0;
  try {
    size = (await stat(partialPath)).size;
  } catch {
    // файла нет вовсе — тот же отказ, что и для нулевого размера
  }
  if (size === 0) {
    await rm(partialPath, { force: true });
    throw new UserError("pg_dump вернул успех, но файл пуст или не создан: бэкап не создан.");
  }

  await rename(partialPath, finalPath);
  // В дампе хэши паролей и персональные данные: читать должен только владелец
  // (в Windows chmod почти ничего не меняет, права там у каталога).
  await chmod(finalPath, 0o600).catch(() => {});
  console.log(`Готово: ${finalPath}`);
  console.log(`Размер: ${humanSize(size)} (${size} байт)`);
  console.log("Проверить: node scripts/backup.mjs verify <файл>");
}

// ---- verify -------------------------------------------------------------------

// Строки оглавления: `215; 1259 16431 TABLE public users owner` и
// `4012; 0 16431 TABLE DATA public users owner`. Комментарии начинаются с «;».
function parseToc(listing) {
  const tables = new Set();
  const data = new Set();
  let objects = 0;
  for (const line of listing.split(/\r?\n/)) {
    if (!line || line.startsWith(";")) continue;
    objects += 1;
    // Только схема public: счёт строк и сравнение с базой тоже идут по ней.
    let m = /^\d+; \d+ \d+ TABLE DATA (\S+) (\S+)(?: |$)/.exec(line);
    if (m) {
      if (m[1] === "public") data.add(m[2]);
      continue;
    }
    m = /^\d+; \d+ \d+ TABLE (\S+) (\S+)(?: |$)/.exec(line);
    if (m && m[1] === "public") tables.add(m[2]);
  }
  return { objects, tables, data };
}

async function fileSize(path) {
  let info;
  try {
    info = await stat(path);
  } catch {
    throw new UserError(`${path} не найден`);
  }
  if (!info.isFile()) throw new UserError(`${path} не файл`);
  if (info.size === 0) throw new UserError(`${path} пуст: это не бэкап`);
  return info.size;
}

async function listArchive(file) {
  const result = await run("pg_restore", ["--list", file], { env: process.env });
  if (result.code !== 0) {
    throw new UserError(
      `pg_restore не смог прочитать ${file}: файл повреждён или это не дамп формата custom.` +
        (result.stderr ? `\n${result.stderr}` : "")
    );
  }
  return result.stdout;
}

async function cmdVerify(args) {
  const [file, ...rest] = args;
  if (!file || rest.length > 0) throw new UserError("Использование: verify <файл>");
  const size = await fileSize(file);
  const listing = await listArchive(file);
  const { objects, tables, data } = parseToc(listing);

  console.log(`Файл: ${file} (${humanSize(size)})`);
  console.log(`Объектов в оглавлении: ${objects}`);
  const missing = [];
  for (const table of KEY_TABLES) {
    const ok = tables.has(table) && data.has(table);
    if (!ok) missing.push(table);
    console.log(`  ${ok ? "ok     " : "ОТСУТСТВУЕТ"} ${table}`);
  }
  if (missing.length > 0) {
    throw new UserError(`В дампе нет таблиц или их данных: ${missing.join(", ")}. Файл нельзя считать бэкапом.`);
  }
  console.log("Дамп читается, ключевые таблицы на месте.");
  console.log("Это проверка оглавления; полную проверку (восстановление) делает restore-check.");
}

// ---- restore-check ------------------------------------------------------------

// Сколько строк каждой таблицы лежит в самом дампе: считаем из потока
// pg_restore --data-only, а не берём живую базу (она к тому моменту уже
// изменилась бы). В формате COPY строка данных — это ровно одна строка вывода:
// переводы строк внутри значений экранируются, а терминатор блока — `\.`.
async function countRowsInDump(file, table) {
  let inCopy = false;
  let rows = 0;
  let sawData = false;
  const result = await run("pg_restore", ["--data-only", "-n", "public", "-t", table, "-f", "-", file], {
    env: process.env,
    onLine(line) {
      if (inCopy) {
        if (line === "\\.") inCopy = false;
        else rows += 1;
      } else if (line.startsWith("COPY ")) {
        inCopy = true;
        sawData = true;
      } else if (line.startsWith("INSERT INTO ")) {
        // Дамп снят с --inserts: одна строка вывода — одна запись.
        rows += 1;
        sawData = true;
      }
    }
  });
  if (result.code !== 0) {
    throw new UserError(`Не удалось прочитать данные ${table} из дампа.${result.stderr ? `\n${result.stderr}` : ""}`);
  }
  return sawData ? rows : null;
}

async function countRowsInDatabase(conn, tables) {
  const { default: pg } = await import("pg");
  // node-pg подставляет PGHOST/PGUSER/PGPASSWORD из окружения, если параметр не
  // задан: при «локальном сокете» в URL это увело бы подсчёт в чужую базу.
  for (const key of Object.keys(process.env)) {
    if (/^PG(HOST|HOSTADDR|PORT|USER|PASSWORD|DATABASE|SSLMODE|SERVICE|OPTIONS)$/i.test(key)) delete process.env[key];
  }
  const ssl =
    conn.sslmode === "disable"
      ? false
      : conn.sslmode === "require"
        ? { rejectUnauthorized: false }
        : conn.sslmode === "verify-full" || conn.sslmode === "verify-ca"
          ? { rejectUnauthorized: true }
          : undefined;
  const client = new pg.Client({
    host: conn.host || undefined,
    port: conn.port ? Number(conn.port) : undefined,
    user: conn.user || undefined,
    password: conn.password || undefined,
    database: conn.database,
    ...(ssl === undefined ? {} : { ssl })
  });
  await client.connect();
  try {
    const counts = new Map();
    for (const table of tables) {
      // Имена из константы KEY_TABLES, не из ввода: подстановка безопасна.
      try {
        const { rows } = await client.query(`select count(*)::int as n from public."${table}"`);
        counts.set(table, rows[0].n);
      } catch (error) {
        if (error.code !== "42P01") throw error;
        counts.set(table, null);
      }
    }
    return counts;
  } finally {
    await client.end();
  }
}

// Сравнение «та же база»: порт по умолчанию 5432, localhost и петлевые адреса
// считаются одним хостом, регистр имени хоста и базы не важен.
function sameServerDatabase(a, b) {
  const host = (h) => {
    const v = (h || "localhost").toLowerCase();
    return v === "127.0.0.1" || v === "::1" ? "localhost" : v;
  };
  return (
    a.database.toLowerCase() === b.database.toLowerCase() &&
    host(a.host) === host(b.host) &&
    (a.port || "5432") === (b.port || "5432")
  );
}

async function cmdRestoreCheck(args) {
  let file;
  let into;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--into") {
      if (!args[i + 1]) throw new UserError("--into требует URL тестовой базы");
      into = args[(i += 1)];
    } else if (args[i].startsWith("--")) {
      throw new UserError(`Неизвестный аргумент: ${args[i]}`);
    } else if (!file) {
      file = args[i];
    } else {
      throw new UserError("Лишний аргумент: файл указывается один раз");
    }
  }
  into ??= process.env[RESTORE_ENV];
  if (!file || !into) throw new UserError("Использование: restore-check <файл> --into <URL тестовой базы>");

  const target = parseConnection(into, "--into");
  const mask = masker(target);

  // libpq читает --dbname со знаком «=» или префиксом postgresql:// как целую
  // строку подключения, а имя с «-» в начале похоже на опцию: такие имена не берём.
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.$-]*$/.test(target.database)) {
    throw new UserError(`Отказ: недопустимое имя тестовой базы "${target.database}" (допустимы буквы, цифры, _ . $ -).`);
  }

  // Защита от самого дорогого промаха: restore --clean поверх боевой базы.
  if (!target.database.toLowerCase().includes("test")) {
    throw new UserError(
      `Отказ: имя базы "${target.database}" не содержит "test". Восстанавливать можно только в отдельную тестовую базу, ` +
        "например team_health_test: перед восстановлением её объекты удаляются."
    );
  }
  if (process.env.DATABASE_URL) {
    let source = null;
    try {
      source = parseConnection(process.env.DATABASE_URL, "DATABASE_URL");
    } catch {
      // Невалидный DATABASE_URL сравнению не мешает: ниже он всё равно не используется.
    }
    if (source && sameServerDatabase(source, target)) {
      throw new UserError("Отказ: --into указывает на ту же базу, что DATABASE_URL.");
    }
  }

  const size = await fileSize(file);
  // Сначала дешёвая проверка оглавления, чтобы не трогать базу из-за битого файла.
  const { tables, data } = parseToc(await listArchive(file));
  const absent = KEY_TABLES.filter((t) => !tables.has(t) || !data.has(t));
  if (absent.length > 0) throw new UserError(`В дампе нет таблиц или данных: ${absent.join(", ")}. Восстановление не начато.`);

  console.log(`Файл: ${file} (${humanSize(size)})`);
  console.log(`Целевая база: ${describe(target)}`);
  console.log("Считаю строки в дампе...");
  const expected = new Map();
  for (const table of KEY_TABLES) expected.set(table, await countRowsInDump(file, table));

  console.log("Восстанавливаю (pg_restore --clean --if-exists)...");
  const restore = await run(
    "pg_restore",
    ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--no-password", "--dbname", target.database, file],
    { env: pgEnv(target, false), mask }
  );
  // Код 1 у pg_restore — «были проигнорированные ошибки». Не проваливаем сразу:
  // решает сравнение строк, а ошибки покажем.
  if (restore.code !== 0 && restore.stderr) console.error(restore.stderr);
  if (restore.code !== 0 && restore.code !== 1) {
    throw new UserError(`pg_restore завершился с кодом ${restore.code ?? restore.signal}, восстановление не удалось.`);
  }

  let actual;
  try {
    actual = await countRowsInDatabase(target, KEY_TABLES);
  } catch (error) {
    throw new UserError(`Не удалось посчитать строки в ${describe(target)}: ${mask(error.message)}`);
  }

  const width = Math.max(...KEY_TABLES.map((t) => t.length), "таблица".length);
  console.log("");
  console.log(`${"таблица".padEnd(width)}  ${"в дампе".padStart(9)}  ${"в базе".padStart(9)}  итог`);
  let bad = 0;
  for (const table of KEY_TABLES) {
    const inDump = expected.get(table);
    const inDb = actual.get(table);
    const ok = inDump !== null && inDb !== null && inDump === inDb;
    if (!ok) bad += 1;
    const cell = (n) => String(n === null ? "нет" : n).padStart(9);
    console.log(`${table.padEnd(width)}  ${cell(inDump)}  ${cell(inDb)}  ${ok ? "ok" : "РАСХОЖДЕНИЕ"}`);
  }
  console.log("");
  if (bad > 0 || restore.code === 1) {
    throw new UserError(
      bad > 0
        ? `Расхождение по ${bad} табл.: бэкап нельзя считать восстановимым.`
        : "Строки совпали, но pg_restore сообщил об ошибках (выше): проверьте их вручную."
    );
  }
  console.log("Восстановление прошло, число строк совпадает.");
}

// ---- main ---------------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);
const commands = { dump: cmdDump, verify: cmdVerify, "restore-check": cmdRestoreCheck };

if (command === "--help" || command === "-h" || command === "help") {
  console.log(HELP);
} else if (!command) {
  console.error(HELP);
  process.exit(2);
} else if (!commands[command]) {
  console.error(`Неизвестная команда: ${command}\n\n${HELP}`);
  process.exit(2);
} else {
  try {
    await commands[command](rest);
  } catch (error) {
    if (error instanceof UserError) fail(error.message);
    // Неожиданное: стек не печатаем целиком, в сообщении могут быть параметры подключения.
    fail(`Ошибка: ${masker()(error?.message ?? error)}`);
  }
}
