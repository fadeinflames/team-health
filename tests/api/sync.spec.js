import { expect, request as playwrightRequest, test } from "@playwright/test";

// Контракт K1: POST /api/workspace принимает knownIds — идентификаторы строк,
// которые клиент видел. Строка из базы, которой нет в теле, удаляется только
// если клиент о ней знал; чужая новая строка переживает сохранение устаревшего
// снимка. Без knownIds остаётся прежняя семантика «нет в теле — удалено».

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
// Без фолбэка: пароля по умолчанию не существует (как в smoke.spec.js).
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) throw new Error("ADMIN_PASSWORD обязателен для запуска тестов");

const memberPassword = "TeamPass121";
const idTables = ["cards", "actions", "goals", "lprs", "competencyAssessments"];

async function login(username, password) {
  const api = await playwrightRequest.newContext({ baseURL });
  const response = await api.post("/api/login", { data: { username, password } });
  expect(response.status(), `вход ${username}`).toBe(200);
  return api;
}

// То, что клиент отправляет в knownIds: id всех строк из снимка, который он
// получил с сервера.
function knownIdsOf(workspace) {
  return Object.fromEntries(idTables.map((table) => [table, (workspace[table] || []).map((row) => row.id)]));
}

async function workspaceOf(api) {
  const response = await api.get("/api/workspace");
  expect(response.status()).toBe(200);
  return response.json();
}

function employeeCard(personId, label) {
  return {
    id: `card-sync-${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    personId,
    source: "employee",
    category: "checkin",
    priority: "medium",
    status: "todo",
    title: `Карточка сотрудника ${label}`,
    body: ""
  };
}

test.describe("сохранение устаревшего снимка (knownIds)", () => {
  // Тесты делят пользователей и идут по порядку: каждый сам заводит свои
  // карточки, но «документирующие» тесты стирают всё в скоупе лида.
  test.describe.configure({ mode: "serial" });

  let adminApi;
  let leadApi;
  let employeeApi;
  let lead;
  let employee;

  test.beforeAll(async () => {
    adminApi = await login(adminUsername, adminPassword);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const leadResponse = await adminApi.post("/api/users", {
      data: {
        role: "lead",
        name: `Лид Sync ${suffix}`,
        teamLabel: "Sync Team",
        username: `sync_lead_${suffix}`,
        password: memberPassword
      }
    });
    expect(leadResponse.status()).toBe(201);
    lead = (await leadResponse.json()).user;

    const employeeResponse = await adminApi.post("/api/users", {
      data: {
        role: "employee",
        personName: `Сотрудник Sync ${suffix}`,
        personRole: "QA Engineer",
        personTeam: "Sync Team",
        leadUserId: lead.id,
        username: `sync_emp_${suffix}`,
        password: memberPassword
      }
    });
    expect(employeeResponse.status()).toBe(201);
    employee = (await employeeResponse.json()).user;

    leadApi = await login(lead.username, memberPassword);
    employeeApi = await login(employee.username, memberPassword);
  });

  // Логины удаляем, сотрудника стираем насовсем вместе с карточками. Ошибки
  // уборки не должны прятать настоящий провал теста.
  test.afterAll(async () => {
    for (const user of [employee, lead]) {
      if (user) await adminApi.delete(`/api/users/${encodeURIComponent(user.id)}`).catch(() => {});
    }
    if (employee?.personId) {
      await adminApi.delete(`/api/people/${encodeURIComponent(employee.personId)}?permanent=1`).catch(() => {});
    }
    await Promise.all([leadApi, employeeApi, adminApi].map((api) => api?.dispose().catch(() => {})));
  });

  // Сотрудник создаёт карточку через POST /api/workspace и проверяет, что она
  // сохранилась. Возвращает карточку как её видит сервер.
  async function employeeCreatesCard(label) {
    const before = await workspaceOf(employeeApi);
    const card = employeeCard(employee.personId, label);
    const save = await employeeApi.post("/api/workspace", { data: { ...before, cards: [...before.cards, card] } });
    expect(save.status()).toBe(200);
    const saved = (await save.json()).cards.find((item) => item.id === card.id);
    expect(saved, "карточка сотрудника не сохранилась").toBeTruthy();
    return saved;
  }

  const cardIdsFor = async (api) => (await workspaceOf(api)).cards.map((item) => item.id);

  test("карточка сотрудника переживает сохранение устаревшего снимка лида с knownIds", async () => {
    // Лид прочитал снимок, пока карточки сотрудника ещё не было.
    const staleSnapshot = await workspaceOf(leadApi);
    const card = await employeeCreatesCard("stale-known");
    expect(staleSnapshot.cards.map((item) => item.id)).not.toContain(card.id);

    const save = await leadApi.post("/api/workspace", {
      data: { ...staleSnapshot, knownIds: knownIdsOf(staleSnapshot) }
    });
    expect(save.status()).toBe(200);
    // Ответ — свежее состояние, в нём карточка уже есть.
    expect((await save.json()).cards.map((item) => item.id)).toContain(card.id);

    expect(await cardIdsFor(employeeApi)).toContain(card.id);
    expect(await cardIdsFor(adminApi)).toContain(card.id);
  });

  test("тот же устаревший снимок без knownIds стирает карточку (прежняя семантика)", async () => {
    // Документирование: старые клиенты и API-тесты не присылают knownIds, и для
    // них «нет в теле» по-прежнему означает «удалено».
    const staleSnapshot = await workspaceOf(leadApi);
    const card = await employeeCreatesCard("stale-legacy");
    expect(staleSnapshot.cards.map((item) => item.id)).not.toContain(card.id);

    const save = await leadApi.post("/api/workspace", { data: staleSnapshot });
    expect(save.status()).toBe(200);

    expect(await cardIdsFor(employeeApi)).not.toContain(card.id);
    expect(await cardIdsFor(adminApi)).not.toContain(card.id);
  });

  test("явное удаление известной карточки с её id в knownIds выполняется, чужая новая остаётся", async () => {
    // Лид создаёт собственную карточку и получает её обратно уже с сервера.
    const before = await workspaceOf(leadApi);
    const own = {
      id: `card-sync-lead-${Date.now()}`,
      personId: employee.personId,
      source: "manager",
      category: "feedback",
      priority: "low",
      status: "todo",
      title: "Карточка лида на удаление",
      body: ""
    };
    const create = await leadApi.post("/api/workspace", {
      data: { ...before, cards: [...before.cards, own], knownIds: knownIdsOf(before) }
    });
    expect(create.status()).toBe(200);
    const withOwn = await workspaceOf(leadApi);
    expect(withOwn.cards.map((item) => item.id)).toContain(own.id);

    // Пока у лида открыт этот снимок, сотрудник заводит новую карточку.
    const foreign = await employeeCreatesCard("foreign-during-delete");
    expect(withOwn.cards.map((item) => item.id)).not.toContain(foreign.id);

    // Лид убирает свою карточку: id остаётся в knownIds, а в cards его нет.
    const remove = await leadApi.post("/api/workspace", {
      data: {
        ...withOwn,
        cards: withOwn.cards.filter((item) => item.id !== own.id),
        knownIds: knownIdsOf(withOwn)
      }
    });
    expect(remove.status()).toBe(200);

    for (const api of [leadApi, employeeApi, adminApi]) {
      const ids = await cardIdsFor(api);
      expect(ids).not.toContain(own.id);
      expect(ids).toContain(foreign.id);
    }
  });

  // Невалидный knownIds целиком или по таблице не ломает запрос и не включает
  // защиту: для такой таблицы действует прежнее «нет в теле — удалено».
  const invalidKnownIds = [
    ["строка", () => "cards"],
    ["число", () => 42],
    ["массив чисел", () => [1, 2, 3]],
    ["cards — строка", () => ({ cards: "card-1" })],
    ["cards — число", () => ({ cards: 7 })],
    ["cards — объект", () => ({ cards: { id: "x" } })]
  ];

  for (const [label, makeKnownIds] of invalidKnownIds) {
    test(`невалидный knownIds (${label}): 200 и прежняя семантика для таблицы`, async () => {
      const staleSnapshot = await workspaceOf(leadApi);
      const card = await employeeCreatesCard("invalid-known");

      const save = await leadApi.post("/api/workspace", {
        data: { ...staleSnapshot, knownIds: makeKnownIds() }
      });
      expect(save.status(), await save.text()).toBe(200);

      expect(await cardIdsFor(employeeApi)).not.toContain(card.id);
    });
  }
});
