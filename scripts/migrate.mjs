#!/usr/bin/env node
// Тонкая обёртка над node-pg-migrate.
//
// Зачем она нужна, если у инструмента есть свой CLI:
//   1. Свой advisory-лок с выходом 0, а не с ошибкой. Два процесса могут
//      стартовать одновременно (rolling update, ручной запуск поверх Job,
//      ретрай CI). Второй процесс не «упал» — он просто не нужен, и ронять
//      его ошибкой значит получить CrashLoopBackOff на ровном месте.
//   2. Единая точка настройки SSL: те же правила, что у пула приложения.
//   3. Команда baseline для существующих баз — единственная ручная операция
//      во всём переходе на миграции.
//
// Использование:
//   node scripts/migrate.mjs up            применить всё, что не применено
//   node scripts/migrate.mjs down 1        откатить одну последнюю (только local)
//   node scripts/migrate.mjs status        что применено, что ожидает
//   node scripts/migrate.mjs baseline      отметить 0001-0016 применёнными без выполнения
//   node scripts/migrate.mjs create <name> создать пустой файл миграции

import { spawn } from "node:child_process";
import { readdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(rootDir, "migrations");

// Произвольная константа, зафиксирована навсегда. Менять её нельзя: старый и
// новый код должны конкурировать за один и тот же лок.
const LOCK_ID = 41730001;

// Последняя миграция baseline. Всё до неё включительно описывает состояние,
// в котором уже находятся существующие базы.
const BASELINE_LAST = "0016_app_meta";

function ssl() {
  switch (process.env.DATABASE_SSL) {
    case "require":
      return { rejectUnauthorized: false };
    case "verify-full":
      return { rejectUnauthorized: true };
    case "disable":
      return false;
    default:
      return undefined;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function connect() {
  const { default: pg } = await import("pg");
  const sslOption = ssl();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    application_name: "team-health-migrate",
    ...(sslOption === undefined ? {} : { ssl: sslOption })
  });
  await client.connect();
  return client;
}

async function migrationNames() {
  const files = await readdir(migrationsDir);
  return files
    .filter((file) => file.endsWith(".sql") || file.endsWith(".js"))
    .map((file) => file.replace(/\.(sql|js)$/, ""))
    .sort();
}

// Лок берётся на сессии и освобождается разрывом соединения, включая
// аварийный. Именно pg_try_advisory_lock, а не блокирующий вариант: висеть
// в ожидании — худший из исходов, Job должен либо сделать работу, либо
// быстро уйти.
async function withLock(client, run) {
  const got = await client.query("select pg_try_advisory_lock($1) as ok", [LOCK_ID]);
  if (!got.rows[0].ok) {
    console.log("Миграции уже выполняет другой процесс, выходим без ошибки");
    process.exit(0);
  }
  try {
    return await run();
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
  }
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(rootDir, "node_modules", "node-pg-migrate", "bin", "node-pg-migrate.js"), ...args],
      {
        cwd: rootDir,
        stdio: "inherit",
        env: process.env
      }
    );
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`node-pg-migrate вышел с кодом ${code}`))));
  });
}

const commonArgs = [
  "--migrations-dir",
  "migrations",
  "--no-lock",
  // Дефолтный паттерн прячет только dot-файлы, а в каталоге лежит ещё и
  // README.md с правилами. Без этого инструмент попытается выполнить его
  // как миграцию.
  "--ignore-pattern",
  String.raw`(\..*|.*\.md)`,
  // Каждая миграция — своя транзакция, а не одна общая на весь прогон.
  // Иначе `set local lock_timeout` из одного файла протекает во все
  // следующие, а упавшая двадцатая откатывает семнадцатую, которая
  // отработала нормально.
  "--no-single-transaction",
  ...(process.env.DATABASE_SSL === "require" ? ["--reject-unauthorized=false"] : [])
];

async function commandStatus(client) {
  const files = await migrationNames();
  const { rows } = await client
    .query("select name, run_on from pgmigrations order by id")
    .catch(() => ({ rows: null }));

  if (rows === null) {
    console.log("Таблица pgmigrations отсутствует: база ещё не инициализирована.");
    console.log(`Ожидают применения: ${files.length}`);
    for (const name of files) console.log(`  pending  ${name}`);
    return;
  }

  const applied = new Map(rows.map((row) => [row.name, row.run_on]));
  for (const name of files) {
    const runOn = applied.get(name);
    console.log(runOn ? `  applied  ${name}  ${new Date(runOn).toISOString()}` : `  pending  ${name}`);
  }
  // Миграция, которая есть в журнале, но не на диске, означает откат кода
  // без отката базы. Само по себе это штатно при rolling update, но знать
  // об этом надо.
  for (const name of applied.keys()) {
    if (!files.includes(name)) console.log(`  ORPHAN   ${name} — в журнале есть, файла нет`);
  }
}

async function commandBaseline(client) {
  const files = await migrationNames();
  const baselineIndex = files.indexOf(BASELINE_LAST);
  if (baselineIndex < 0) fail(`Не найден файл baseline ${BASELINE_LAST}`);
  const baseline = files.slice(0, baselineIndex + 1);

  const existing = await client
    .query("select count(*)::int as count from pgmigrations")
    .catch(() => null);
  if (existing && existing.rows[0].count > 0) {
    fail("В pgmigrations уже есть записи. baseline применяется один раз к базе, созданной до перехода на миграции.");
  }

  const tables = await client.query(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = 'people'"
  );
  if (tables.rows[0].count === 0) {
    fail("В базе нет таблицы people: это чистая база, baseline не нужен — выполните `up`.");
  }

  // pgcrypto и app_meta — единственное, чего нет в базах, созданных старым
  // литералом. Их создаём по-настоящему, остальное только отмечаем.
  await client.query("begin");
  try {
    await client.query("create extension if not exists pgcrypto");
    await client.query(`
      create table if not exists app_meta (
        key        text primary key,
        value      text not null,
        updated_at timestamptz not null default now()
      )
    `);
    await client.query(`
      create table if not exists pgmigrations (
        id serial primary key,
        name varchar(255) not null,
        run_on timestamp not null
      )
    `);
    await client.query("insert into pgmigrations (name, run_on) select unnest($1::text[]), now()", [baseline]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  console.log(`Отмечено применёнными: ${baseline.length} миграций (${baseline[0]} … ${BASELINE_LAST}).`);
  console.log("Дальше применяйте всё как обычно: node scripts/migrate.mjs up");
}

async function commandCreate(name) {
  if (!name) fail('Укажите имя: node scripts/migrate.mjs create add_teams');
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) fail("Имя должно содержать латиницу или цифры");

  const files = await migrationNames();
  const last = files.at(-1) || "0000";
  const next = String(Number(last.slice(0, 4)) + 1).padStart(4, "0");
  const target = join(migrationsDir, `${next}_${slug}.sql`);

  const exists = await access(target).then(
    () => true,
    () => false
  );
  if (exists) fail(`${target} уже существует`);

  await writeFile(
    target,
    [
      "-- Что и зачем меняется. Одна миграция — одно логическое изменение.",
      "-- Если трогаете существующую таблицу, начните с ограничения локов:",
      "--   set local lock_timeout = '3s';",
      "--   set local statement_timeout = '60s';",
      "-- Правила и чек-лист ревьюера: migrations/README.md",
      "",
      "-- Up Migration",
      "",
      "",
      "-- Down Migration",
      ""
    ].join("\n")
  );
  console.log(`Создан ${target.replace(`${rootDir}/`, "")}`);
}

async function main() {
  const [command = "up", ...rest] = process.argv.slice(2);

  if (command === "create") {
    await commandCreate(rest.join(" "));
    return;
  }

  if (!process.env.DATABASE_URL) fail("DATABASE_URL не задан");

  if (command === "down" && process.env.APP_ENV && process.env.APP_ENV !== "local") {
    fail(
      "down запрещён вне local. На проде откат схемы делается восстановлением из бэкапа " +
        "или новой миграцией вперёд, см. migrations/README.md."
    );
  }

  const client = await connect();
  try {
    if (command === "status") {
      await commandStatus(client);
      return;
    }
    if (command === "baseline") {
      await withLock(client, () => commandBaseline(client));
      return;
    }
    if (command !== "up" && command !== "down" && command !== "redo") {
      fail(`Неизвестная команда ${command}. Доступны: up, down, redo, status, baseline, create.`);
    }
    await withLock(client, () => runCli([command, ...rest, ...commonArgs]));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
