// Запись разностью (контракт K2): syncWorkspace с base не трогает то, чего
// снимок не видел и не менял. Тесты идут против настоящего Postgres, потому
// что вся суть в поведении параллельных транзакций, FK и триггера updated_at.
//
// «Параллельная запись» здесь — это отдельное соединение пула, которое успело
// закоммитить между чтением base и нашей записью. Порядок детерминирован
// намеренно: гонка в тесте дала бы плавающий результат вместо диагноза.
//
// Запуск: TEST_DATABASE_URL=postgres://.../team_health_test npm run test:integration
// (схема уже применена migrate; имя базы должно содержать "test").

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { snapshotRows, syncWorkspace, VersionConflictError } from "../../db/repositories/workspace.js";
import { connectTestDb, truncateDataTables } from "./_db.mjs";

// Без базы тест пропускается с причиной, а не падает: юнит-прогон и CI без
// Postgres не должны краснеть из-за отсутствия окружения.
const skip = process.env.TEST_DATABASE_URL
  ? false
  : "TEST_DATABASE_URL не задан: интеграционные тесты записи разностью требуют отдельной тестовой базы Postgres";

const CREATED = "2026-09-01T09:00:00.000Z";

function person(id, name) {
  return {
    id,
    name,
    meetingName: name,
    role: "Engineer",
    team: "Core",
    initials: name.slice(0, 2).toUpperCase(),
    nextMeeting: "в пятницу",
    nextMeetingAt: null,
    cadence: "weekly",
    managerFocus: "",
    lastSummary: "",
    trend: "stable",
    meetingType: "regular",
    mentorshipMode: "coach",
    growthNarrative: "",
    performanceNarrative: "",
    archivedAt: null
  };
}

function card(id, personId, title) {
  return {
    id,
    personId,
    lprId: "",
    source: "manager",
    category: "checkin",
    priority: "medium",
    status: "todo",
    title,
    body: "",
    createdAt: CREATED
  };
}

function action(id, personId, title) {
  return { id, personId, owner: "manager", title, due: "к следующему 1:1", dueDate: null, done: false, createdAt: CREATED };
}

// Маленький, но полный объект db: все ключи, которые знает syncWorkspace.
// Люди p1 и p2 с учётками, у p1 есть данные во всех таблицах, у p2 — карточка,
// шаг, заметка (чтобы проверять каскад).
function makeDb() {
  return {
    people: [person("p1", "Анна Первая"), person("p2", "Борис Второй")],
    lprs: [{ id: "l1", personId: "p1", title: "ЛПР", focus: "рост", status: "active", createdAt: CREATED }],
    cards: [card("c1", "p1", "первая"), card("c2", "p1", "вторая"), card("c3", "p2", "третья")],
    actions: [action("a1", "p1", "шаг один"), action("a2", "p2", "шаг два")],
    goals: [
      {
        id: "g1",
        personId: "p1",
        lprId: "l1",
        title: "цель",
        description: "",
        horizon: "Q4",
        progress: 40,
        status: "active",
        dueDate: "",
        createdAt: CREATED
      }
    ],
    competencyAssessments: [
      {
        id: "as1",
        personId: "p1",
        title: "оценка",
        roleContext: "",
        source: "manual",
        status: "draft",
        scaleMax: 5,
        averageScore: 3,
        minScore: 2,
        grade: "middle",
        competencies: [],
        cases: [],
        recommendations: [],
        validatedAt: null,
        createdAt: CREATED
      }
    ],
    prep: { p1: { employeeAgenda: true, managerAgenda: false, pulse: false, lastActions: false, growth: false, commitments: false } },
    notes: { p1: "заметка про Анну", p2: "заметка про Бориса" },
    meetingDrafts: { p1: "черновик" },
    surveys: [
      {
        id: "sv1",
        title: "опрос",
        description: "",
        anonymous: false,
        status: "active",
        questions: [],
        isDemoSeed: false,
        isTemplate: false,
        ownerUserId: null,
        anonymousMinResponses: 3,
        createdAt: CREATED
      }
    ],
    surveyResponses: [
      { id: "r1", surveyId: "sv1", personId: "p1", respondentHash: null, secretVersion: 1, answers: {}, submittedAt: CREATED }
    ],
    managerNotes: [{ id: "mn1", personId: "p1", body: "наблюдение", tags: ["рост"], createdAt: CREATED }],
    meetingLog: [{ id: "ml1", personId: "p1", heldAt: CREATED, meetingType: "regular", summary: "", attended: true }],
    oncallLoad: [
      { personId: "p1", weekStart: "2026-09-28", pagesTotal: 3, afterHoursPages: 1, incidentsLed: 0, sleepDisruptedNights: 0 }
    ],
    pulseHistory: [{ personId: "p1", capturedAt: "2026-09-20", energy: 6, load: 5, clarity: 7, trust: 8 }],
    pulse: { p1: { energy: 7, load: 5, clarity: 7, trust: 8 } },
    users: [
      { id: "u-lead", username: "lead_test", name: "Лид", role: "lead", personId: null, leadUserId: null, teamLabel: "Core", salt: "s-lead", passwordHash: "h-lead", createdAt: CREATED },
      { id: "u-1", username: "emp_one", name: "Анна Первая", role: "employee", personId: "p1", leadUserId: "u-lead", teamLabel: "Core", salt: "s-1", passwordHash: "h-1", createdAt: CREATED },
      { id: "u-2", username: "emp_two", name: "Борис Второй", role: "employee", personId: "p2", leadUserId: "u-lead", teamLabel: "Core", salt: "s-2", passwordHash: "h-2", createdAt: CREATED }
    ],
    sessions: [{ id: "sess-lead", userId: "u-lead", createdAt: CREATED, expiresAt: "2099-01-01T00:00:00.000Z" }]
  };
}

describe("запись разностью (syncWorkspace с base)", { skip }, () => {
  let pool;

  before(async () => {
    pool = await connectTestDb();
  });

  after(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await truncateDataTables(pool);
  });

  // Тесты могут упасть посреди транзакции параллельной записи; чистим и после,
  // чтобы следующий файл интеграционных тестов не унаследовал мусор.
  afterEach(async () => {
    await truncateDataTables(pool);
  });

  // Транзакция на отдельном клиенте пула, как в writeDb().
  async function inTx(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  // Начальное состояние кладём прежним путём (полный снимок): он не зависит от
  // того, что проверяется ниже.
  async function seed(db) {
    await inTx((client) => syncWorkspace(client, db, { replaceAuth: true }));
  }

  const write = (db, options) => inTx((client) => syncWorkspace(client, db, options));

  // Сортировка в JS (по кодовым единицам), а не order by: порядок строк с
  // дефисом ("c-foreign" против "c1") зависит от collation базы, и тест не
  // должен краснеть на en_US.UTF-8 там, где проходит на C.
  const ids = async (table, column = "id") =>
    (await pool.query(`select ${column} as id from ${table}`)).rows.map((row) => row.id).sort();

  const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];

  // Версия строки в том же формате, в каком её отдаёт сервер клиенту
  // (микросекунды сохраняются; toISOString() их бы обрезал до миллисекунд).
  const versionOf = async (table, id) =>
    (await one(`select to_json(updated_at)#>>'{}' as v from ${table} where id = $1`, [id])).v;

  // Строка, которую успел записать кто-то другой (параллельная транзакция).
  const insertForeignCard = (id, title = "чужая карточка") =>
    pool.query(
      `insert into cards (id, person_id, source, category, priority, status, title, body)
       values ($1, 'p1', 'employee', 'checkin', 'medium', 'todo', $2, '')`,
      [id, title]
    );

  test("строка, вставленная параллельно после чтения base, не удаляется записью", async () => {
    const db = makeDb();
    await seed(db);
    const base = snapshotRows(db);

    await insertForeignCard("c-foreign");
    // Ответ на опрос — самая частая «чужая» запись в проде.
    await pool.query(
      `insert into survey_responses (id, survey_id, person_id, respondent_hash, answers_json)
       values ('r-foreign', 'sv1', null, 'hash-foreign', '{}'::jsonb)`
    );

    const next = structuredClone(db);
    next.cards.find((item) => item.id === "c1").title = "первая, правка";
    await write(next, { replaceAuth: false, base });

    assert.deepEqual(await ids("cards"), ["c-foreign", "c1", "c2", "c3"]);
    assert.deepEqual(await ids("survey_responses"), ["r-foreign", "r1"]);
    assert.equal((await one("select title from cards where id = 'c1'")).title, "первая, правка");
  });

  test("без base (прежний режим) та же строка удаляется: отсутствие в снимке = удаление", async () => {
    // Документирование: именно из-за этого поведения запись разностью и
    // появилась. Оно остаётся для старых вызовов, не получающих base.
    const db = makeDb();
    await seed(db);

    await insertForeignCard("c-foreign");

    const next = structuredClone(db);
    next.cards.find((item) => item.id === "c1").title = "первая, правка";
    await write(next, { replaceAuth: false });

    assert.deepEqual(await ids("cards"), ["c1", "c2", "c3"]);
  });

  test("запись не затирает чужую правку строки, которую не меняла", async () => {
    const db = makeDb();
    await seed(db);
    const base = snapshotRows(db);

    // Сосед поправил c2 после того, как мы прочитали снимок.
    await pool.query("update cards set title = 'чужой заголовок' where id = 'c2'");
    const foreignVersion = await versionOf("cards", "c2");

    // Мы меняем только c1; c2 в нашем снимке старая, неизменённая.
    const next = structuredClone(db);
    next.cards.find((item) => item.id === "c1").title = "первая, правка";
    await write(next, { replaceAuth: false, base });

    assert.equal((await one("select title from cards where id = 'c1'")).title, "первая, правка");
    assert.equal((await one("select title from cards where id = 'c2'")).title, "чужой заголовок");
    // Строка не просто сохранила значение, а вообще не переписывалась:
    // иначе триггер сдвинул бы updated_at и чужой клиент поймал бы ложный конфликт.
    assert.equal(await versionOf("cards", "c2"), foreignVersion);
  });

  test("запись без изменений ничего не переписывает", async () => {
    const db = makeDb();
    await seed(db);
    const base = snapshotRows(db);

    const xmins = async () =>
      (
        await pool.query(
          `select 'cards' as t, id, xmin::text as x from cards
           union all select 'people', id, xmin::text from people
           union all select 'users', id, xmin::text from users
           union all select 'sessions', id, xmin::text from sessions
           order by t, id`
        )
      ).rows;
    const before = await xmins();

    await write(structuredClone(db), { replaceAuth: true, base });

    assert.deepEqual(await xmins(), before);
  });

  test("явное удаление строки, бывшей в base, выполняется", async () => {
    const db = makeDb();
    await seed(db);
    const base = snapshotRows(db);

    const next = structuredClone(db);
    next.cards = next.cards.filter((item) => item.id !== "c2");
    next.actions = next.actions.filter((item) => item.id !== "a1");
    // Составной ключ (person_id, week_start) удаляется другим запросом, чем
    // одиночный: проверяем его отдельно.
    next.oncallLoad = [];
    // Таблицы-мапы (по person_id): удаление ключа мапы — тоже удаление строки.
    delete next.notes.p2;
    await write(next, { replaceAuth: false, base });

    assert.deepEqual(await ids("cards"), ["c1", "c3"]);
    assert.deepEqual(await ids("actions"), ["a2"]);
    assert.deepEqual(await ids("oncall_load", "person_id"), []);
    assert.deepEqual(await ids("notes", "person_id"), ["p1"]);
  });

  test("replaceAuth: параллельно созданная сессия и смена пароля чужого пользователя переживают запись", async () => {
    const db = makeDb();
    await seed(db);
    const base = snapshotRows(db);

    // Параллельно: логин создал сессию, а u-2 сменил пароль. Наш снимок о них не знает.
    await pool.query(
      `insert into sessions (id, user_id, expires_at) values ('sess-foreign', 'u-2', '2099-01-01T00:00:00Z')`
    );
    await pool.query("update users set salt = 's-2-new', password_hash = 'h-2-new' where id = 'u-2'");

    // Записываем с replaceAuth=true изменение, не связанное с u-2.
    const next = structuredClone(db);
    next.cards.find((item) => item.id === "c1").title = "первая, правка";
    await write(next, { replaceAuth: true, base });

    assert.deepEqual(await ids("sessions"), ["sess-foreign", "sess-lead"]);
    const user = await one("select salt, password_hash from users where id = 'u-2'");
    assert.deepEqual(user, { salt: "s-2-new", password_hash: "h-2-new" });
  });

  test("replaceAuth: правка профиля не откатывает параллельную смену пароля; закрытая сессия удаляется", async () => {
    const db = makeDb();
    await seed(db);
    const base = snapshotRows(db);

    await pool.query("update users set salt = 's-2-new', password_hash = 'h-2-new' where id = 'u-2'");

    // Профиль u-2 мы меняем (имя), пароль — нет: в снимке он старый.
    const next = structuredClone(db);
    next.users.find((item) => item.id === "u-2").name = "Борис Переименованный";
    // Выход из системы лида: сессия, которую снимок видел, пропала.
    next.sessions = [];
    await write(next, { replaceAuth: true, base });

    const user = await one("select name, salt, password_hash from users where id = 'u-2'");
    assert.deepEqual(user, { name: "Борис Переименованный", salt: "s-2-new", password_hash: "h-2-new" });
    assert.deepEqual(await ids("sessions"), []);
  });

  describe("конфликты версий (checkVersions)", () => {
    test("изменённая строка с устаревшим updatedAt даёт VersionConflictError и ничего не пишет", async () => {
      const db = makeDb();
      await seed(db);
      const staleVersion = await versionOf("cards", "c1");
      const base = snapshotRows(db);

      // Кто-то успел сохранить c1 раньше нас: версия в базе ушла вперёд.
      await pool.query("update cards set title = 'чужой c1' where id = 'c1'");

      const next = structuredClone(db);
      const mine = next.cards.find((item) => item.id === "c1");
      mine.title = "моя правка c1";
      mine.updatedAt = staleVersion;
      // Вторая, нормальная правка в той же записи: откат должен быть целиком.
      next.cards.find((item) => item.id === "c3").title = "третья, правка";

      await assert.rejects(
        write(next, { replaceAuth: false, base, checkVersions: true }),
        (error) => {
          assert.ok(error instanceof VersionConflictError, `ждали VersionConflictError, получили ${error}`);
          assert.deepEqual(error.conflicts, [{ table: "cards", id: "c1" }]);
          return true;
        }
      );

      assert.equal((await one("select title from cards where id = 'c1'")).title, "чужой c1");
      assert.equal((await one("select title from cards where id = 'c3'")).title, "третья");
    });

    test("неизменённая строка с устаревшим updatedAt конфликта не даёт", async () => {
      const db = makeDb();
      await seed(db);
      const staleVersion = await versionOf("cards", "c2");
      const freshVersion = await versionOf("cards", "c3");
      const base = snapshotRows(db);

      // Сосед поправил c2, пока у нас была открыта форма.
      await pool.query("update cards set title = 'чужой c2' where id = 'c2'");

      const next = structuredClone(db);
      // c2 мы не трогали, но версия у неё уже устарела.
      next.cards.find((item) => item.id === "c2").updatedAt = staleVersion;
      const mine = next.cards.find((item) => item.id === "c3");
      mine.title = "третья, правка";
      mine.updatedAt = freshVersion;

      await write(next, { replaceAuth: false, base, checkVersions: true });

      assert.equal((await one("select title from cards where id = 'c2'")).title, "чужой c2");
      assert.equal((await one("select title from cards where id = 'c3'")).title, "третья, правка");
    });

    test("изменённая строка с актуальным updatedAt сохраняется", async () => {
      const db = makeDb();
      await seed(db);
      const version = await versionOf("cards", "c1");
      const base = snapshotRows(db);

      const next = structuredClone(db);
      const mine = next.cards.find((item) => item.id === "c1");
      mine.title = "первая, правка";
      mine.updatedAt = version;

      await write(next, { replaceAuth: false, base, checkVersions: true });

      assert.equal((await one("select title from cards where id = 'c1'")).title, "первая, правка");
    });
  });

  describe("удаление человека", () => {
    // Порядок важен: users.person_id ссылается на people с on delete restrict,
    // поэтому человека можно удалять только после его учётки; карточки же уходят
    // каскадом (on delete cascade) и не должны ронять запись по FK.
    test("убирает карточки, шаги, заметки, учётку и сессии человека, чужое не трогает", async () => {
      const db = makeDb();
      db.sessions.push({ id: "sess-2", userId: "u-2", createdAt: CREATED, expiresAt: "2099-01-01T00:00:00.000Z" });
      await seed(db);
      const base = snapshotRows(db);

      const next = structuredClone(db);
      next.people = next.people.filter((item) => item.id !== "p2");
      next.users = next.users.filter((item) => item.id !== "u-2");
      next.sessions = next.sessions.filter((item) => item.userId !== "u-2");
      next.cards = next.cards.filter((item) => item.personId !== "p2");
      next.actions = next.actions.filter((item) => item.personId !== "p2");
      delete next.notes.p2;

      await write(next, { replaceAuth: true, base });

      assert.deepEqual(await ids("people"), ["p1"]);
      assert.deepEqual(await ids("users"), ["u-1", "u-lead"]);
      assert.deepEqual(await ids("sessions"), ["sess-lead"]);
      assert.deepEqual(await ids("cards"), ["c1", "c2"]);
      assert.deepEqual(await ids("actions"), ["a1"]);
      assert.deepEqual(await ids("notes", "person_id"), ["p1"]);
    });

    test("не падает на FK, если зависимые строки остались в снимке неизменёнными", async () => {
      // Сервер может прислать снимок, где человека уже нет, а его строки ещё
      // числятся: каскад в базе всё равно должен их убрать, а не уронить запись.
      const db = makeDb();
      await seed(db);
      const base = snapshotRows(db);

      const next = structuredClone(db);
      next.people = next.people.filter((item) => item.id !== "p2");
      next.users = next.users.filter((item) => item.id !== "u-2");

      await write(next, { replaceAuth: true, base });

      assert.deepEqual(await ids("people"), ["p1"]);
      assert.deepEqual(await ids("cards"), ["c1", "c2"]);
      assert.deepEqual(await ids("actions"), ["a1"]);
    });
  });
});
