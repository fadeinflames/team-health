import { test, expect, request as playwrightRequest } from "@playwright/test";

// B1 из аудита 2026-10-04: параллельные сохранения от разных пользователей
// стирали друг друга, потому что каждая запись писала снимок целиком и
// удаляла «отсутствующее». На прежнем коде из 48 параллельных сохранений
// терялось около 42; здесь не должно потеряться ни одно.

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) throw new Error("ADMIN_PASSWORD обязателен для запуска тестов");

const EMPLOYEES = 8;
const ROUNDS = 6;
const password = "ConcurrencyPass123";

test("параллельные сохранения сотрудников не стирают друг друга", async () => {
  const admin = await playwrightRequest.newContext({ baseURL });
  const login = await admin.post("/api/login", { data: { username: adminUsername, password: adminPassword } });
  expect(login.status()).toBe(200);

  const tag = `cc${Date.now()}`;
  const employees = [];
  try {
    for (let i = 0; i < EMPLOYEES; i += 1) {
      const created = await admin.post("/api/users", {
        data: {
          role: "employee",
          personName: `Параллель ${tag} ${i}`,
          personRole: "QA Engineer",
          personTeam: "Concurrency",
          username: `${tag}_${i}`,
          password
        }
      });
      expect(created.status()).toBe(201);
      const user = (await created.json()).user;
      const api = await playwrightRequest.newContext({ baseURL });
      expect((await api.post("/api/login", { data: { username: user.username, password } })).status()).toBe(200);
      employees.push({ api, user, personId: user.personId, saved: 0 });
    }

    await Promise.all(
      employees.map(async (employee, index) => {
        for (let round = 0; round < ROUNDS; round += 1) {
          const workspace = await (await employee.api.get("/api/workspace")).json();
          const card = {
            id: `${tag}-${index}-${round}`,
            personId: employee.personId,
            source: "employee",
            category: "checkin",
            priority: "medium",
            status: "todo",
            title: `Карточка ${index}-${round}`,
            body: ""
          };
          const response = await employee.api.post("/api/workspace", {
            data: {
              ...workspace,
              cards: [...workspace.cards, card],
              // Как настоящий клиент: сообщает, что именно он видел.
              knownIds: {
                cards: workspace.cards.map((item) => item.id),
                actions: workspace.actions.map((item) => item.id),
                goals: (workspace.goals || []).map((item) => item.id),
                lprs: (workspace.lprs || []).map((item) => item.id)
              }
            }
          });
          expect(response.status()).toBe(200);
          employee.saved += 1;
        }
      })
    );

    const all = await (await admin.get("/api/workspace")).json();
    const mine = all.cards.filter((card) => card.id.startsWith(`${tag}-`));
    expect(mine).toHaveLength(EMPLOYEES * ROUNDS);
  } finally {
    for (const employee of employees) {
      await admin.delete(`/api/users/${encodeURIComponent(employee.user.id)}`).catch(() => {});
      await admin.delete(`/api/people/${encodeURIComponent(employee.personId)}?permanent=1`).catch(() => {});
      await employee.api.dispose().catch(() => {});
    }
    await admin.dispose();
  }
});
