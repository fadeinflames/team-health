import { expect, request as playwrightRequest, test } from "@playwright/test";

// Решения по приватности D1-D6 (аудит 2026-10-04, приложение А). Тесты идут
// против живого сервера через HTTP и опираются только на контракт: что видит
// каждая роль и что пишется в журнал аудита. Деталей реализации они не знают.
//
// Не покрыто здесь (нужен прямой доступ к базе, см. integrationNotes):
//  - D5: опрос с удалённым владельцем. Через API владельца не удалить так,
//    чтобы ownerUserId остался указывать на пустое место: FK surveys.owner_user_id
//    при удалении логина обнуляет колонку, и опрос становится «без владельца».
//  - D2: чтение уже сохранённого опроса с порогом 2 (эффективный порог 3):
//    через API такой опрос больше не создать, нужна прямая вставка в базу.
//  - D3: старые заметки без автора (author_user_id is null), по той же причине.

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
// Без фолбэка: пароля по умолчанию не существует (как в smoke.spec.js).
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) throw new Error("ADMIN_PASSWORD обязателен для запуска тестов");
const demoUsername = process.env.DEMO_USERNAME || "demo";
const demoPassword = process.env.DEMO_PASSWORD || "demo";

const memberPassword = "TeamPass121";

async function login(username, password) {
  const api = await playwrightRequest.newContext({ baseURL });
  const response = await api.post("/api/login", { data: { username, password } });
  expect(response.status(), `вход ${username}`).toBe(200);
  return api;
}

async function workspaceOf(api) {
  const response = await api.get("/api/workspace");
  expect(response.status()).toBe(200);
  return response.json();
}

const idTables = ["cards", "actions", "goals", "lprs", "competencyAssessments"];
// То, что клиент отправляет в knownIds: id строк из полученного снимка. Без него
// устаревший снимок стёр бы чужие карточки в скоупе (контракт K1).
function knownIdsOf(workspace) {
  return Object.fromEntries(idTables.map((table) => [table, (workspace[table] || []).map((row) => row.id)]));
}

function uniqueSuffix() {
  return `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

// Логин ограничен 32 символами (3-32, латиница/цифры/точка/дефис/подчёркивание):
// длинный uniqueSuffix в логине давал 400 уже для метки "audit".
function usernameToken() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

async function createLead(adminApi, label, teamLabel) {
  const suffix = uniqueSuffix();
  const token = usernameToken();
  const response = await adminApi.post("/api/users", {
    data: {
      role: "lead",
      name: `Лид ${label} ${suffix}`,
      teamLabel,
      username: `priv_lead_${label}_${token}`,
      password: memberPassword
    }
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).user;
}

async function createEmployee(adminApi, label, { leadUserId, team }) {
  const suffix = uniqueSuffix();
  const token = usernameToken();
  const response = await adminApi.post("/api/users", {
    data: {
      role: "employee",
      personName: `Сотрудник ${label} ${suffix}`,
      personRole: "QA Engineer",
      personTeam: team,
      leadUserId,
      username: `priv_emp_${label}_${token}`,
      password: memberPassword
    }
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).user;
}

// Уборка не должна прятать настоящий провал теста: ошибки глотаем.
async function removeUser(adminApi, user) {
  if (!user) return;
  await adminApi.delete(`/api/users/${encodeURIComponent(user.id)}`).catch(() => {});
  if (user.personId) {
    await adminApi.delete(`/api/people/${encodeURIComponent(user.personId)}?permanent=1`).catch(() => {});
  }
}

async function removeSurvey(adminApi, surveyId) {
  await adminApi.delete(`/api/surveys/${encodeURIComponent(surveyId)}`).catch(() => {});
}

// Лид создаёт опрос и получает его обратно из ответа (по уникальному названию).
async function createSurvey(leadApi, survey) {
  const response = await leadApi.post("/api/surveys", { data: survey });
  expect(response.status(), await response.text()).toBe(201);
  const created = (await response.json()).workspace.surveys.find((item) => item.title === survey.title);
  expect(created, "созданный опрос не вернулся в рабочем пространстве").toBeTruthy();
  return created;
}

async function respond(api, surveyId, answers) {
  const response = await api.post(`/api/surveys/${encodeURIComponent(surveyId)}/respond`, { data: { answers } });
  expect(response.status(), await response.text()).toBe(200);
}

const surveyOf = async (api, surveyId) => (await workspaceOf(api)).surveys.find((item) => item.id === surveyId);

// Поля записей журнала: сервер может отдавать camelCase или имена колонок.
const pick = (entry, camel, snake) => entry[camel] ?? entry[snake];

async function auditEntries(adminApi, query = "limit=500") {
  const response = await adminApi.get(`/api/audit-log?${query}`);
  expect(response.status(), await response.text()).toBe(200);
  const { entries } = await response.json();
  expect(Array.isArray(entries), "ответ журнала должен содержать entries[]").toBe(true);
  return entries;
}

// Запись относится к объекту, если id цели совпал, id упомянут в метаданных или
// объект сам был актором (смена собственного пароля).
function aboutId(entry, id) {
  if (String(pick(entry, "targetId", "target_id")) === String(id)) return true;
  if (String(pick(entry, "actorUserId", "actor_user_id")) === String(id) && entry.action === "user.password_change") return true;
  return JSON.stringify(entry.details ?? {}).includes(id);
}

const findEntry = (entries, action, id) =>
  entries.find((entry) => entry.action === action && aboutId(entry, id));

test.describe("приватность: роли, опросы, заметки лида", () => {
  // Тесты делят пользователей и идут по порядку.
  test.describe.configure({ mode: "serial" });

  const suffix = uniqueSuffix();
  // Один teamLabel у обоих лидов: общий человек без логина виден им обоим.
  const team = `Privacy Team ${suffix}`;

  let adminApi;
  let leadA;
  let leadB;
  let leadAApi;
  let leadBApi;
  let employees = [];
  let employeeApis = [];
  let sharedPerson;
  const surveyIds = [];

  test.beforeAll(async () => {
    adminApi = await login(adminUsername, adminPassword);
    leadA = await createLead(adminApi, "A", team);
    leadB = await createLead(adminApi, "B", team);
    for (const label of ["e1", "e2", "e3"]) {
      employees.push(await createEmployee(adminApi, label, { leadUserId: leadA.id, team }));
    }
    // Человек без логина в команде с тем же teamLabel: виден обоим лидам.
    const personResponse = await adminApi.post("/api/people", {
      data: { name: `Общий человек ${suffix}`, role: "QA Engineer", team }
    });
    expect(personResponse.status(), await personResponse.text()).toBe(201);
    sharedPerson = (await personResponse.json()).person;

    leadAApi = await login(leadA.username, memberPassword);
    leadBApi = await login(leadB.username, memberPassword);
    employeeApis = await Promise.all(employees.map((user) => login(user.username, memberPassword)));
  });

  test.afterAll(async () => {
    for (const id of surveyIds) await removeSurvey(adminApi, id);
    for (const user of [...employees, leadA, leadB]) await removeUser(adminApi, user);
    if (sharedPerson) {
      await adminApi.delete(`/api/people/${encodeURIComponent(sharedPerson.id)}?permanent=1`).catch(() => {});
    }
    await Promise.all(
      [...employeeApis, leadAApi, leadBApi, adminApi].map((api) => api?.dispose().catch(() => {}))
    );
  });

  test("D1: участник не получает оценочные тексты лида и черновики оценок компетенций", async () => {
    const [employee] = employees;
    const performance = `PERF-МАРКЕР-${suffix}`;
    const growth = `GROWTH-МАРКЕР-${suffix}`;
    const focus = `FOCUS-МАРКЕР-${suffix}`;

    const patch = await adminApi.patch(`/api/people/${encodeURIComponent(employee.personId)}`, {
      data: { performanceNarrative: performance, growthNarrative: growth, managerFocus: focus }
    });
    expect(patch.status(), await patch.text()).toBe(200);

    // Оценки компетенций создаёт лид через сохранение рабочего пространства:
    // один черновик и одна валидированная.
    const draftId = `assessment-draft-${suffix}`;
    const validatedId = `assessment-validated-${suffix}`;
    const assessment = (id, status) => ({
      id,
      personId: employee.personId,
      title: `Оценка ${status}`,
      status,
      scaleMax: 5,
      competencies: [{ id: `c-${id}`, name: "Коммуникация", category: "soft", score: 3, targetScore: 4 }],
      cases: [],
      recommendations: [],
      createdAt: new Date().toISOString(),
      validatedAt: status === "validated" ? new Date().toISOString() : null
    });
    const leadBefore = await workspaceOf(leadAApi);
    const save = await leadAApi.post("/api/workspace", {
      data: {
        ...leadBefore,
        competencyAssessments: [
          ...leadBefore.competencyAssessments,
          assessment(draftId, "draft"),
          assessment(validatedId, "validated")
        ],
        knownIds: knownIdsOf(leadBefore)
      }
    });
    expect(save.status(), await save.text()).toBe(200);

    const assessmentIds = (workspace) =>
      workspace.competencyAssessments.filter((item) => item.personId === employee.personId).map((item) => item.id);
    const personOf = (workspace) => workspace.people.find((item) => item.id === employee.personId);

    // Участник: GET и ответ POST /api/workspace одинаково без оценочных текстов.
    const employeeApi = employeeApis[0];
    const employeeGet = await employeeApi.get("/api/workspace");
    expect(employeeGet.status()).toBe(200);
    const employeeGetText = await employeeGet.text();
    const employeeView = JSON.parse(employeeGetText);
    const ownPerson = personOf(employeeView);
    expect(ownPerson, "участник не видит собственного person").toBeTruthy();
    expect(ownPerson.performanceNarrative).toBeUndefined();
    expect(ownPerson.growthNarrative).toBeUndefined();
    expect(employeeGetText).not.toContain(performance);
    expect(employeeGetText).not.toContain(growth);
    // managerFocus показывается в общем виде встречи и остаётся видимым.
    expect(ownPerson.managerFocus).toBe(focus);
    expect(assessmentIds(employeeView)).toContain(validatedId);
    expect(assessmentIds(employeeView)).not.toContain(draftId);

    const employeePost = await employeeApi.post("/api/workspace", {
      data: { ...employeeView, knownIds: knownIdsOf(employeeView) }
    });
    expect(employeePost.status()).toBe(200);
    const employeePostText = await employeePost.text();
    expect(employeePostText).not.toContain(performance);
    expect(employeePostText).not.toContain(growth);
    expect(assessmentIds(JSON.parse(employeePostText))).not.toContain(draftId);

    // Лид и админ получают всё как раньше.
    for (const api of [leadAApi, adminApi]) {
      const view = await workspaceOf(api);
      const person = personOf(view);
      expect(person.performanceNarrative).toBe(performance);
      expect(person.growthNarrative).toBe(growth);
      expect(assessmentIds(view)).toEqual(expect.arrayContaining([draftId, validatedId]));
    }
  });

  test("D1: демо-пользователь не получает оценочные тексты", async () => {
    const demoApi = await playwrightRequest.newContext({ baseURL });
    try {
      const response = await demoApi.post("/api/login", { data: { username: demoUsername, password: demoPassword } });
      // Демо-вход можно отключить настройками окружения: тогда проверять нечего.
      test.skip(response.status() !== 200, "демо-вход недоступен в этом окружении");
      const text = await (await demoApi.get("/api/workspace")).text();
      const view = JSON.parse(text);
      expect(view.people.length).toBeGreaterThan(0);
      for (const person of view.people) {
        expect(person.performanceNarrative, `демо: ${person.id}`).toBeUndefined();
        expect(person.growthNarrative, `демо: ${person.id}`).toBeUndefined();
      }
      for (const assessment of view.competencyAssessments || []) {
        expect(assessment.status, "демо видит только валидированные оценки").toBe("validated");
      }
    } finally {
      await demoApi.dispose();
    }
  });

  test("D2: порог анонимного опроса не ниже 3, вопрос с малым числом ответов скрыт", async () => {
    const survey = await createSurvey(leadAApi, {
      title: `Анонимный ${suffix}`,
      anonymous: true,
      // Порог 2 из тела запроса поднимается до 3.
      anonymousMinResponses: 2,
      questions: [
        { id: "q1", type: "scale", prompt: "Все отвечают", required: true },
        { id: "q2", type: "scale", prompt: "Шкала, один ответ" },
        { id: "q3", type: "text", prompt: "Текст, один ответ" },
        { id: "q4", type: "single", prompt: "Выбор, один ответ", options: ["Да", "Нет"] },
        { id: "q5", type: "scale", prompt: "Шкала, два ответа" },
        { id: "q6", type: "multi", prompt: "Мультивыбор, один ответ", options: ["a", "b"] },
        { id: "q7", type: "date", prompt: "Дата, один ответ" }
      ]
    });
    surveyIds.push(survey.id);
    expect(survey.anonymousMinResponses).toBe(3);

    await respond(employeeApis[0], survey.id, {
      q1: 7,
      q2: 5,
      q3: "один единственный комментарий",
      q4: "Да",
      q5: 4,
      q6: { values: ["a"] },
      q7: "2026-10-01"
    });
    await respond(employeeApis[1], survey.id, { q1: 6, q5: 8 });

    // Двух ответов мало даже для общего агрегата: порог был бы 2 без D2.
    const twoResponses = (await surveyOf(leadAApi, survey.id)).aggregate;
    expect(twoResponses.hidden).toBe(true);
    expect(twoResponses.minResponses).toBe(3);
    expect(twoResponses.count).toBe(2);

    await respond(employeeApis[2], survey.id, { q1: 9 });

    const { aggregate } = await surveyOf(leadAApi, survey.id);
    expect(aggregate.hidden).toBeFalsy();
    expect(aggregate.count).toBe(3);

    // На вопрос ответили все трое: показан.
    const shown = aggregate.perQuestion.q1;
    expect(shown.hidden).toBeFalsy();
    expect(shown.count).toBe(3);
    expect(Array.isArray(shown.distribution)).toBe(true);
    expect(shown.avg).toBeCloseTo(7.3, 1);

    // Остальные: ответили меньше трёх, поэтому только count и признак скрытия.
    const expectedCounts = { q2: 1, q3: 1, q4: 1, q5: 2, q6: 1, q7: 1 };
    for (const [questionId, count] of Object.entries(expectedCounts)) {
      const hidden = aggregate.perQuestion[questionId];
      expect(hidden, `perQuestion.${questionId}`).toBeTruthy();
      expect(hidden.hidden, `${questionId}: hidden`).toBe(true);
      expect(hidden.minResponses, `${questionId}: minResponses`).toBe(3);
      expect(hidden.count, `${questionId}: count`).toBe(count);
      for (const leaked of ["distribution", "avg", "samples"]) {
        expect(hidden, `${questionId}: не должно быть ${leaked}`).not.toHaveProperty(leaked);
      }
    }

    // Участнику агрегат не отдаётся вовсе.
    const employeeSurvey = await surveyOf(employeeApis[0], survey.id);
    expect(employeeSurvey.aggregate ?? null).toBeNull();
  });

  test("D3: заметка лида A не видна лиду B, админ видит обе, чужую не удалить", async () => {
    const markerA = `NOTE-A-${suffix}`;
    const markerB = `NOTE-B-${suffix}`;
    const createNote = async (api, body) => {
      const response = await api.post("/api/manager-notes", {
        data: { personId: sharedPerson.id, body, tags: ["feedback"] }
      });
      expect(response.status(), await response.text()).toBe(201);
    };
    await createNote(leadAApi, markerA);
    await createNote(leadBApi, markerB);

    const notesOf = async (api) => {
      const text = await (await api.get("/api/workspace")).text();
      return { text, notes: JSON.parse(text).managerNotes };
    };

    const viewA = await notesOf(leadAApi);
    expect(viewA.notes.map((note) => note.body)).toContain(markerA);
    expect(viewA.text).not.toContain(markerB);
    expect(viewA.notes.find((note) => note.body === markerA).authorUserId).toBe(leadA.id);

    const viewB = await notesOf(leadBApi);
    expect(viewB.notes.map((note) => note.body)).toContain(markerB);
    expect(viewB.text).not.toContain(markerA);

    const viewAdmin = await notesOf(adminApi);
    expect(viewAdmin.notes.map((note) => note.body)).toEqual(expect.arrayContaining([markerA, markerB]));

    const noteA = viewAdmin.notes.find((note) => note.body === markerA);
    const noteB = viewAdmin.notes.find((note) => note.body === markerB);

    // Чужая заметка: 404, как у несуществующей, существование не раскрывается.
    const foreignDelete = await leadBApi.delete(`/api/manager-notes/${encodeURIComponent(noteA.id)}`);
    expect(foreignDelete.status()).toBe(404);
    expect((await foreignDelete.json()).error).toBe("Заметка не найдена");
    const missingDelete = await leadBApi.delete(`/api/manager-notes/note-no-such-${suffix}`);
    expect(missingDelete.status()).toBe(404);
    expect((await notesOf(adminApi)).notes.map((note) => note.id)).toContain(noteA.id);

    // Автор удаляет свою, платформенный админ любую.
    const ownDelete = await leadAApi.delete(`/api/manager-notes/${encodeURIComponent(noteA.id)}`);
    expect(ownDelete.status(), await ownDelete.text()).toBe(200);
    const adminDelete = await adminApi.delete(`/api/manager-notes/${encodeURIComponent(noteB.id)}`);
    expect(adminDelete.status(), await adminDelete.text()).toBe(200);

    const finalAdmin = await notesOf(adminApi);
    expect(finalAdmin.text).not.toContain(markerA);
    expect(finalAdmin.text).not.toContain(markerB);
  });

  test("D4: постоянное удаление человека стирает его именные ответы на опросы", async () => {
    const survey = await createSurvey(leadAApi, {
      title: `Именной ${suffix}`,
      anonymous: false,
      questions: [{ id: "q1", type: "scale", prompt: "Как дела", required: true }]
    });
    surveyIds.push(survey.id);

    const [leaving, staying] = employees;
    await respond(employeeApis[0], survey.id, { q1: 8 });
    await respond(employeeApis[1], survey.id, { q1: 5 });

    const before = await surveyOf(adminApi, survey.id);
    expect(before.responses.map((item) => item.personId).sort()).toEqual([leaving.personId, staying.personId].sort());

    const removal = await adminApi.delete(`/api/people/${encodeURIComponent(leaving.personId)}?permanent=1`);
    expect(removal.status(), await removal.text()).toBe(200);

    const after = await surveyOf(adminApi, survey.id);
    expect(after.responses.map((item) => item.personId)).toEqual([staying.personId]);
    expect(after.responseCount).toBe(1);
  });
});

// Журнал аудита. Всё нужное для событий заводится внутри теста, чтобы он не
// зависел от порядка и состояния остальных: к записям привязываемся по id цели.
test.describe("журнал аудита (D6)", () => {
  test.describe.configure({ mode: "serial" });

  test("события пишутся, читает только platform_admin, секретов в журнале нет", async () => {
    test.setTimeout(120_000);
    const adminApi = await login(adminUsername, adminPassword);
    const suffix = uniqueSuffix();
    const team = `Audit Team ${suffix}`;
    const resetPassword = `ResetPass-${suffix}`;
    const ownPassword = `OwnPass-${suffix}`;
    const noteText = `ЗАМЕТКА-ДЛЯ-ЖУРНАЛА-${suffix}`;
    const apis = [];
    const users = [];
    const surveyIds = [];
    let lead;
    let shared;
    try {
      lead = await createLead(adminApi, "audit", team);
      users.push(lead);
      const leadApi = await login(lead.username, memberPassword);
      apis.push(leadApi);

      const worker = await createEmployee(adminApi, "w", { leadUserId: lead.id, team });
      const doomed = await createEmployee(adminApi, "d", { leadUserId: lead.id, team });
      users.push(worker);
      users.push(doomed);
      const sharedResponse = await adminApi.post("/api/people", {
        data: { name: `Аудит человек ${suffix}`, role: "QA Engineer", team }
      });
      expect(sharedResponse.status()).toBe(201);
      shared = (await sharedResponse.json()).person;

      // user.role_change: туда и обратно, чтобы не оставлять сотрудника лидом.
      for (const role of ["lead", "employee"]) {
        const change = await adminApi.patch(`/api/users/${encodeURIComponent(worker.id)}`, { data: { role } });
        expect(change.status(), await change.text()).toBe(200);
      }

      // user.password_reset админом и user.password_change самим пользователем.
      const reset = await adminApi.post(`/api/users/${encodeURIComponent(worker.id)}/password`, {
        data: { password: resetPassword }
      });
      expect(reset.status(), await reset.text()).toBe(200);
      const workerApi = await login(worker.username, resetPassword);
      apis.push(workerApi);
      const ownChange = await workerApi.post("/api/me/password", {
        data: { currentPassword: resetPassword, password: ownPassword }
      });
      expect(ownChange.status(), await ownChange.text()).toBe(200);

      // manager_note.delete: текст заметки в журнал попадать не должен.
      const noteCreate = await leadApi.post("/api/manager-notes", {
        data: { personId: shared.id, body: noteText, tags: ["concern"] }
      });
      expect(noteCreate.status(), await noteCreate.text()).toBe(201);
      const note = (await workspaceOf(leadApi)).managerNotes.find((item) => item.body === noteText);
      expect(note, "заметка не сохранилась").toBeTruthy();
      const noteDelete = await leadApi.delete(`/api/manager-notes/${encodeURIComponent(note.id)}`);
      expect(noteDelete.status(), await noteDelete.text()).toBe(200);

      // survey.delete.
      const survey = await createSurvey(leadApi, {
        title: `Аудит опрос ${suffix}`,
        anonymous: false,
        questions: [{ id: "q1", type: "scale", prompt: "Оценка" }]
      });
      surveyIds.push(survey.id);
      const surveyDelete = await leadApi.delete(`/api/surveys/${encodeURIComponent(survey.id)}`);
      expect(surveyDelete.status(), await surveyDelete.text()).toBe(200);

      // person.archive / person.restore / person.delete_permanent.
      const archive = await adminApi.delete(`/api/people/${encodeURIComponent(shared.id)}`);
      expect(archive.status(), await archive.text()).toBe(200);
      const restore = await adminApi.post(`/api/people/${encodeURIComponent(shared.id)}/restore`);
      expect(restore.status(), await restore.text()).toBe(200);
      const permanent = await adminApi.delete(`/api/people/${encodeURIComponent(shared.id)}?permanent=1`);
      expect(permanent.status(), await permanent.text()).toBe(200);

      // user.delete.
      const userDelete = await adminApi.delete(`/api/users/${encodeURIComponent(doomed.id)}`);
      expect(userDelete.status(), await userDelete.text()).toBe(200);

      const entries = await auditEntries(adminApi);
      const expectations = [
        ["user.create", lead.id],
        ["user.role_change", worker.id],
        ["user.password_reset", worker.id],
        ["user.password_change", worker.id],
        ["manager_note.delete", note.id],
        ["survey.delete", survey.id],
        ["person.archive", shared.id],
        ["person.restore", shared.id],
        ["person.delete_permanent", shared.id],
        ["user.delete", doomed.id]
      ];
      for (const [action, id] of expectations) {
        expect(findEntry(entries, action, id), `в журнале нет ${action} для ${id}`).toBeTruthy();
      }

      // Кто совершил: у user.create актор — админ, а у удаления заметки — лид.
      const createdBy = findEntry(entries, "user.create", lead.id);
      expect(pick(createdBy, "actorUsername", "actor_username")).toBe(adminUsername);
      const noteDeletedBy = findEntry(entries, "manager_note.delete", note.id);
      expect(pick(noteDeletedBy, "actorUserId", "actor_user_id")).toBe(lead.id);

      // Постраничность: before=<id> отдаёт только более старые записи.
      const firstPage = await auditEntries(adminApi, "limit=1");
      expect(firstPage).toHaveLength(1);
      const olderPage = await auditEntries(adminApi, `limit=100&before=${encodeURIComponent(firstPage[0].id)}`);
      // Событий мы создали больше десяти, поэтому более старая страница не пуста.
      expect(olderPage.length).toBeGreaterThan(0);
      for (const entry of olderPage) expect(Number(entry.id)).toBeLessThan(Number(firstPage[0].id));
      const olderIds = olderPage.map((entry) => Number(entry.id));
      expect(olderIds).toEqual([...olderIds].sort((a, b) => b - a));

      // Секретов в журнале нет: ни текста заметки, ни паролей. Смотрим весь
      // ответ целиком, а не отдельные поля, чтобы утечка в любом поле не прошла.
      const dump = JSON.stringify(entries);
      for (const secret of [noteText, memberPassword, resetPassword, ownPassword, adminPassword]) {
        expect(dump, "в журнале найдено секретное значение").not.toContain(secret);
      }

      // Читать журнал могут только platform_admin: лид и сотрудник получают 403, аноним 401.
      const anonymousApi = await playwrightRequest.newContext({ baseURL });
      apis.push(anonymousApi);
      expect((await leadApi.get("/api/audit-log?limit=100")).status()).toBe(403);
      expect((await workerApi.get("/api/audit-log?limit=100")).status()).toBe(403);
      expect((await anonymousApi.get("/api/audit-log?limit=100")).status()).toBe(401);
    } finally {
      for (const id of surveyIds) await removeSurvey(adminApi, id);
      for (const user of users) await removeUser(adminApi, user);
      // Человек удаляется в теле теста; если тест упал раньше, убираем здесь.
      if (shared) {
        await adminApi.delete(`/api/people/${encodeURIComponent(shared.id)}?permanent=1`).catch(() => {});
      }
      await Promise.all([...apis, adminApi].map((api) => api.dispose().catch(() => {})));
    }
  });
});
