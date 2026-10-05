// Сессии в базе хранятся хэшем (решение D7, контракт C3): в sessions.id лежит
// sha256 от значения cookie, а не сам токен. Утёкший дамп или бэкап не должен
// давать готовых сессий для входа. Репозиторий принимает СЫРОЙ токен и хэширует
// внутри, поэтому вызывающий код (server.js) не меняется.
//
// Запуск: TEST_DATABASE_URL=postgres://.../team_health_test npm run test:integration
// (схема уже применена migrate; имя базы должно содержать "test").

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  createSession,
  deleteOtherSessions,
  deleteSession,
  findSessionUser,
  hashSessionToken
} from "../../db/repositories/auth.js";
import { connectTestDb, truncateDataTables } from "./_db.mjs";

// Без базы тест пропускается с причиной, а не падает: юнит-прогон и CI без
// Postgres не должны краснеть из-за отсутствия окружения.
const skip = process.env.TEST_DATABASE_URL
  ? false
  : "TEST_DATABASE_URL не задан: интеграционные тесты сессий требуют отдельной тестовой базы Postgres";

const HOUR = 60 * 60 * 1000;

function newToken() {
  return randomBytes(24).toString("hex");
}

function session(userId, token, { ttlMs = 24 * HOUR } = {}) {
  const now = Date.now();
  return {
    id: token,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString()
  };
}

describe("сессии: в базе только хэш токена", { skip }, () => {
  let pool;

  before(async () => {
    pool = await connectTestDb();
  });

  after(async () => {
    await pool?.end();
  });

  // Пользователь вставляется прямым SQL с обязательными колонками (миграция
  // 0003): репозиторий auth читает users, но не создаёт их.
  async function insertUser(id, username) {
    await pool.query(
      `insert into users (id, username, name, role, salt, password_hash)
       values ($1, $2, $3, 'employee', 'salt', 'hash')`,
      [id, username, `Пользователь ${username}`]
    );
  }

  const storedIds = async (userId) =>
    (await pool.query("select id from sessions where user_id = $1 order by created_at, id", [userId])).rows.map(
      (row) => row.id
    );

  beforeEach(async () => {
    await truncateDataTables(pool);
    await insertUser("u1", "alice");
    await insertUser("u2", "bob");
  });

  test("hashSessionToken даёт sha256 в hex и не возвращает исходный токен", () => {
    const token = "abc";
    assert.equal(hashSessionToken(token), createHash("sha256").update(token).digest("hex"));
    assert.equal(hashSessionToken(token), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.match(hashSessionToken(newToken()), /^[0-9a-f]{64}$/);
    assert.notEqual(hashSessionToken(token), token);
  });

  test("createSession кладёт в sessions.id хэш, а не сырой токен", async () => {
    const token = newToken();
    await createSession(pool, session("u1", token));

    const ids = await storedIds("u1");
    assert.deepEqual(ids, [hashSessionToken(token)]);
    assert.ok(!ids.includes(token), "сырой токен не должен попасть в базу");
  });

  test("findSessionUser(сырой токен) находит пользователя и возвращает session.id равным сырому токену", async () => {
    const token = newToken();
    await createSession(pool, session("u1", token));

    const found = await findSessionUser(pool, token);
    assert.ok(found, "сессия по сырому токену не найдена");
    assert.equal(found.user.id, "u1");
    assert.equal(found.user.username, "alice");
    // Вызывающие передают session.id обратно в deleteSession/deleteOtherSessions,
    // поэтому наружу уходит сырой токен, а не хэш из базы.
    assert.equal(found.session.id, token);
    assert.equal(found.session.userId, "u1");
  });

  test("хэш из базы как токен не подходит: утёкший дамп не даёт войти", async () => {
    const token = newToken();
    await createSession(pool, session("u1", token));

    assert.equal(await findSessionUser(pool, hashSessionToken(token)), null);
    const [stored] = await storedIds("u1");
    assert.equal(await findSessionUser(pool, stored), null);
  });

  test("пустой и неизвестный токен сессию не находят", async () => {
    await createSession(pool, session("u1", newToken()));
    assert.equal(await findSessionUser(pool, ""), null);
    assert.equal(await findSessionUser(pool, undefined), null);
    assert.equal(await findSessionUser(pool, newToken()), null);
  });

  test("протухшая сессия не находится", async () => {
    // Вставка напрямую: createSession сам чистит протухшие строки в той же
    // транзакции, и через него фильтр expires_at > now() не проверить.
    const token = newToken();
    await pool.query(
      `insert into sessions (id, user_id, created_at, expires_at)
       values ($1, 'u1', now() - interval '2 hours', now() - interval '1 hour')`,
      [hashSessionToken(token)]
    );
    assert.deepEqual(await storedIds("u1"), [hashSessionToken(token)]);
    assert.equal(await findSessionUser(pool, token), null);

    // Контроль: та же сессия с неистёкшим сроком находится.
    await pool.query("update sessions set expires_at = now() + interval '1 hour' where user_id = 'u1'");
    assert.ok(await findSessionUser(pool, token));
  });

  test("deleteSession(сырой токен) удаляет сессию", async () => {
    const token = newToken();
    await createSession(pool, session("u1", token));
    assert.ok(await findSessionUser(pool, token));

    await deleteSession(pool, token);

    assert.equal(await findSessionUser(pool, token), null);
    assert.deepEqual(await storedIds("u1"), []);
  });

  test("deleteSession по хэшу вместо токена ничего не удаляет", async () => {
    const token = newToken();
    await createSession(pool, session("u1", token));

    await deleteSession(pool, hashSessionToken(token));

    assert.ok(await findSessionUser(pool, token), "сессия должна пережить удаление по хэшу");
  });

  test("повторный createSession оставляет одну сессию пользователя", async () => {
    const first = newToken();
    const second = newToken();
    await createSession(pool, session("u1", first));
    await createSession(pool, session("u1", second));

    assert.deepEqual(await storedIds("u1"), [hashSessionToken(second)]);
    assert.equal(await findSessionUser(pool, first), null);
    assert.ok(await findSessionUser(pool, second));
  });

  test("createSession одного пользователя не трогает сессию другого", async () => {
    const aliceToken = newToken();
    const bobToken = newToken();
    await createSession(pool, session("u1", aliceToken));
    await createSession(pool, session("u2", bobToken));

    assert.ok(await findSessionUser(pool, aliceToken));
    assert.ok(await findSessionUser(pool, bobToken));
  });

  test("deleteOtherSessions(сырой токен) оставляет текущую сессию и гасит остальные", async () => {
    const keep = newToken();
    const other = newToken();
    const bobToken = newToken();
    await createSession(pool, session("u1", keep));
    await createSession(pool, session("u2", bobToken));
    // createSession оставляет одну сессию на пользователя, поэтому вторую
    // сессию Алисы добавляем напрямую: так выглядит рассинхрон, который
    // deleteOtherSessions и должен подчищать.
    await pool.query(
      "insert into sessions (id, user_id, created_at, expires_at) values ($1, 'u1', now(), now() + interval '1 day')",
      [hashSessionToken(other)]
    );
    assert.equal((await storedIds("u1")).length, 2);

    await deleteOtherSessions(pool, "u1", keep);

    assert.deepEqual(await storedIds("u1"), [hashSessionToken(keep)]);
    assert.ok(await findSessionUser(pool, keep), "текущая сессия обязана остаться");
    assert.equal(await findSessionUser(pool, other), null);
    // Сессия другого пользователя не затронута.
    assert.ok(await findSessionUser(pool, bobToken));
  });
});
