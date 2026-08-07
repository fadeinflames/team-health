#!/usr/bin/env node
// Управляемый способ получить секрет — то, чего в проекте не было совсем.
//
//   node scripts/secrets.mjs generate [name]   напечатать одно значение
//   node scripts/secrets.mjs init [--force]    заполнить пустые секреты в .env
//   node scripts/secrets.mjs check             найти пустые и слабые значения
//
// init идемпотентен: заполняет только пустые ключи, существующие значения не
// перетирает. Это важно — иначе повторный `make env` на живом окружении
// сменил бы ADMIN_PASSWORD и разлогинил всех.

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(rootDir, ".env");

// 24 байта → 32 символа base64url: 192 бита энтропии, безопасно для URL и
// не ломается при копировании из терминала.
const generate = () => randomBytes(24).toString("base64url");

// POSTGRES_PASSWORD отдельно: его смена требует пересоздания volume, иначе
// база просто перестанет пускать. Трогаем только по --force и с криком.
const MANAGED = ["ADMIN_PASSWORD", "SURVEY_RESPONSE_SECRET", "DEMO_PASSWORD", "PROD_ADMIN_PASSWORD"];
const VOLUME_BOUND = ["POSTGRES_PASSWORD"];

const WEAK = new Set([
  "passwb121",
  "admin",
  "password",
  "changeme",
  "change-me-locally",
  "local-survey-secret",
  "test-survey-secret",
  "demo",
  "team_health",
  ""
]);

function readEnv() {
  if (!existsSync(envFile)) {
    console.error(".env не найден. Сначала: make env");
    process.exit(1);
  }
  return readFileSync(envFile, "utf8");
}

function valueOf(text, key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

function setValue(text, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  return pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
}

function commandInit(force) {
  let text = readEnv();
  const filled = [];
  const skipped = [];

  for (const key of MANAGED) {
    const current = valueOf(text, key);
    if (current && !force) {
      skipped.push(key);
      continue;
    }
    text = setValue(text, key, generate());
    filled.push(key);
  }

  for (const key of VOLUME_BOUND) {
    const current = valueOf(text, key);
    if (!force) {
      if (!current) {
        text = setValue(text, key, generate());
        filled.push(key);
      } else {
        skipped.push(key);
      }
      continue;
    }
    text = setValue(text, key, generate());
    filled.push(key);
    console.warn(
      `ВНИМАНИЕ: ${key} перегенерирован. Существующий volume с базой продолжит ждать старый пароль — ` +
        "выполните `make down-v`, иначе postgres не пустит."
    );
  }

  writeFileSync(envFile, text);
  if (filled.length) console.log(`Сгенерировано: ${filled.join(", ")}`);
  if (skipped.length) console.log(`Оставлено как есть: ${skipped.join(", ")} (перегенерировать: make secrets-force)`);
  if (!filled.length) console.log("Все управляемые секреты уже заданы.");
}

function commandCheck() {
  const text = readEnv();
  const problems = [];
  const warnings = [];

  const appEnv = valueOf(text, "APP_ENV") || "local";

  for (const key of [...MANAGED, ...VOLUME_BOUND]) {
    const value = valueOf(text, key);

    // Пустое значение — всегда проблема: без него приложение либо не
    // стартует, либо стартует не тем, чем надо.
    if (value === null || value === "") {
      problems.push(`${key}: пусто в .env`);
      continue;
    }

    // DEMO_PASSWORD — витрина, а не доступ: слабое значение в local это
    // осознанное решение, а не упущение.
    if (key === "DEMO_PASSWORD" && appEnv === "local") continue;

    const weak = WEAK.has(value) || value.length < 12;
    if (!weak) continue;

    // POSTGRES_PASSWORD в local — пароль контейнера на localhost, и его
    // смена требует пересоздания volume. Ругаться стоит, ронять сборку —
    // нет: цена ошибки несопоставима с ценой `make down-v`.
    if (VOLUME_BOUND.includes(key) && appEnv === "local") {
      warnings.push(`${key}: слабое значение. Сменить: make secrets-force && make down-v`);
      continue;
    }

    problems.push(`${key}: слабое или скомпрометированное значение`);
  }

  const adminPassword = valueOf(text, "ADMIN_PASSWORD");
  const surveySecret = valueOf(text, "SURVEY_RESPONSE_SECRET");
  if (adminPassword && surveySecret && adminPassword === surveySecret) {
    problems.push("SURVEY_RESPONSE_SECRET совпадает с ADMIN_PASSWORD: анонимность опросов фиктивна");
  }

  if (valueOf(text, "ENABLE_DEMO_RESET") === "1" && appEnv !== "local") {
    problems.push(`ENABLE_DEMO_RESET=1 при APP_ENV=${appEnv}: /api/reset открыт и сносит рабочие данные`);
  }

  for (const warning of warnings) console.warn(`  предупреждение: ${warning}`);

  if (!problems.length) {
    console.log("Секреты в .env в порядке.");
    return;
  }
  console.error("Проблемы в .env:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  console.error("Заполнить пустые: make secrets. Перегенерировать всё: make secrets-force.");
  process.exit(1);
}

const [command = "check", ...rest] = process.argv.slice(2);

switch (command) {
  case "generate":
    console.log(generate());
    break;
  case "init":
    commandInit(rest.includes("--force"));
    break;
  case "check":
    commandCheck();
    break;
  default:
    console.error(`Неизвестная команда ${command}. Доступны: generate, init, check.`);
    process.exit(1);
}
