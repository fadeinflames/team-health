#!/usr/bin/env node
// Ротация пароля администратора без рестарта приложения.
//
//   node scripts/admin-password.mjs rotate [--password <value>]
//
// Обновляет users и app_meta в одной транзакции, гасит сессии админа и
// печатает пароль ровно один раз.
//
// Отпечаток в app_meta обновляется вместе с паролем — именно поэтому
// ротация переживает рестарт: приложение при старте увидит, что
// ADMIN_PASSWORD в окружении не менялся, и не станет ничего перезаписывать.
// Обратная сторона: если ADMIN_PASSWORD в окружении задан и отличается от
// нового, ближайший рестарт с несовпавшим отпечатком вернёт значение из
// переменной. Поэтому в конце — напоминание.

import { scryptSync, randomBytes, createHash } from "node:crypto";

const args = process.argv.slice(2);
const command = args[0] || "rotate";

if (command !== "rotate") {
  console.error(`Неизвестная команда ${command}. Доступна: rotate.`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const adminUsername = process.env.ADMIN_USERNAME || "admin";

const explicitIndex = args.indexOf("--password");
const explicit = explicitIndex >= 0 ? args[explicitIndex + 1] : null;
if (explicitIndex >= 0 && !explicit) {
  console.error("--password указан без значения");
  process.exit(1);
}
if (explicit && explicit.length < 12) {
  console.error("Пароль короче 12 символов");
  process.exit(1);
}

const password = explicit || randomBytes(24).toString("base64url");

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

async function main() {
  const { default: pg } = await import("pg");
  const sslOption = ssl();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    application_name: "team-health-admin-password",
    ...(sslOption === undefined ? {} : { ssl: sslOption })
  });
  await client.connect();

  try {
    await client.query("begin");
    const found = await client.query("select id from users where lower(username) = lower($1)", [adminUsername]);
    if (!found.rows[0]) {
      throw new Error(`Учётной записи ${adminUsername} в базе нет. Задайте ADMIN_USERNAME или сначала запустите приложение.`);
    }
    const userId = found.rows[0].id;

    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync(password, salt, 64).toString("hex");
    const fingerprint = createHash("sha256").update(`${adminUsername}:${password}`).digest("hex");

    await client.query("update users set salt = $1, password_hash = $2 where id = $3", [salt, passwordHash, userId]);
    await client.query(
      `
        insert into app_meta (key, value) values ('admin_password_fingerprint', $1)
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
      [fingerprint]
    );
    const killed = await client.query("delete from sessions where user_id = $1", [userId]);
    await client.query("commit");

    console.log("");
    console.log(`  Новый пароль администратора ${adminUsername}:`);
    console.log("");
    console.log(`      ${password}`);
    console.log("");
    console.log(`  Показан один раз. Активных сессий сброшено: ${killed.rowCount}.`);
    console.log("  Обновите ADMIN_PASSWORD в окружении — иначе ближайший рестарт вернёт старое значение.");
    console.log("");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
