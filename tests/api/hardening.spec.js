import http from "node:http";
import https from "node:https";
import { expect, request as playwrightRequest, test } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
// Без фолбэка: пароля по умолчанию не существует (как в smoke.spec.js).
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) throw new Error("ADMIN_PASSWORD обязателен для запуска тестов");

const memberPassword = "TeamPass121";

async function loginAdmin() {
  const api = await playwrightRequest.newContext({ baseURL });
  const login = await api.post("/api/login", { data: { username: adminUsername, password: adminPassword } });
  expect(login.status()).toBe(200);
  return api;
}

// Участник создаётся через админский API; seed-учётку demo не трогаем.
async function createEmployee(adminApi, label) {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const response = await adminApi.post("/api/users", {
    data: {
      role: "employee",
      personName: `Тест ${label} ${suffix}`,
      personRole: "QA Engineer",
      personTeam: "Hardening",
      username: `hard_${label}_${suffix}`,
      password: memberPassword
    }
  });
  expect(response.status()).toBe(201);
  const user = (await response.json()).user;
  return { user, username: user.username, personId: user.personId };
}

// Логин удаляем, участника стираем насовсем вместе с карточками и шагами.
// Ошибки уборки не должны прятать настоящий провал теста.
async function removeEmployee(adminApi, employee) {
  if (!employee) return;
  await adminApi.delete(`/api/users/${encodeURIComponent(employee.user.id)}`).catch(() => {});
  await adminApi
    .delete(`/api/people/${encodeURIComponent(employee.personId)}?permanent=1`)
    .catch(() => {});
}

// Сырой запрос через node:http: Playwright и fetch отдают тело целиком,
// а нам нужно резать его на два write() с паузой посреди многобайтного символа.
function rawPostInChunks(path, cookieHeader, first, second) {
  const url = new URL(path, baseURL);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": first.length + second.length,
          Cookie: cookieHeader
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    request.on("error", reject);
    request.setNoDelay(true);
    request.write(first);
    setTimeout(() => request.end(second), 50);
  });
}

async function cookieHeaderOf(api) {
  const state = await api.storageState();
  return state.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

test("данные не фильтруются по словам: «продажи» и «биллинг» сохраняются", async () => {
  const adminApi = await loginAdmin();
  let employee;
  try {
    employee = await createEmployee(adminApi, "words");
    const text = "Sales sync, продажи, биллинг";
    const stamp = Date.now();

    const before = await (await adminApi.get("/api/workspace")).json();
    const card = {
      id: `card-words-${stamp}`,
      personId: employee.personId,
      source: "manager",
      category: "checkin",
      priority: "medium",
      status: "todo",
      title: text,
      body: `${text}: обсудить на встрече`
    };
    const action = {
      id: `action-words-${stamp}`,
      personId: employee.personId,
      owner: "manager",
      title: text,
      due: "к следующему 1:1",
      done: false
    };
    const save = await adminApi.post("/api/workspace", {
      data: {
        ...before,
        cards: [card, ...before.cards],
        actions: [action, ...before.actions],
        notes: { ...(before.notes || {}), [employee.personId]: text }
      }
    });
    expect(save.status()).toBe(200);

    const after = await (await adminApi.get("/api/workspace")).json();
    const savedCard = after.cards.find((item) => item.id === card.id);
    const savedAction = after.actions.find((item) => item.id === action.id);
    expect(savedCard, "карточка пропала после сохранения").toBeTruthy();
    expect(savedCard.title).toBe(text);
    expect(savedCard.body).toBe(card.body);
    expect(savedAction, "договорённость пропала после сохранения").toBeTruthy();
    expect(savedAction.title).toBe(text);
    expect((after.notes || {})[employee.personId], "заметка пропала после сохранения").toBe(text);
  } finally {
    await removeEmployee(adminApi, employee);
    await adminApi.dispose();
  }
});

test("UTF-8 переживает разрез тела запроса посреди символа", async () => {
  const adminApi = await loginAdmin();
  let employee;
  try {
    employee = await createEmployee(adminApi, "utf8");
    const cookie = await cookieHeaderOf(adminApi);

    // Буква режется на 1-м байте из 2, эмодзи на 2-м байте из 4.
    const cases = [
      { tag: "cyr", marker: "Ж", cutInsideMarker: 1 },
      { tag: "emoji", marker: "😀", cutInsideMarker: 2 }
    ];

    for (const { tag, marker, cutInsideMarker } of cases) {
      const stamp = Date.now();
      const prefix = `utf8-${tag}-${stamp}:`;
      const title = `${prefix}${marker}${marker} конец`;
      const workspace = await (await adminApi.get("/api/workspace")).json();
      const card = {
        id: `card-utf8-${tag}-${stamp}`,
        personId: employee.personId,
        source: "manager",
        category: "checkin",
        priority: "medium",
        status: "todo",
        title,
        body: ""
      };
      const body = Buffer.from(JSON.stringify({ ...workspace, cards: [card, ...workspace.cards] }), "utf8");
      // Уникальный префикс: в чужих данных такой же буквы может быть сколько угодно.
      const at = body.indexOf(Buffer.from(prefix, "utf8"));
      expect(at).toBeGreaterThanOrEqual(0);
      const cut = at + Buffer.byteLength(prefix, "utf8") + cutInsideMarker;

      const result = await rawPostInChunks("/api/workspace", cookie, body.subarray(0, cut), body.subarray(cut));
      expect(result.status, result.body.slice(0, 300)).toBe(200);

      const after = await (await adminApi.get("/api/workspace")).json();
      const saved = after.cards.find((item) => item.id === card.id);
      expect(saved, "карточка не сохранилась").toBeTruthy();
      expect(saved.title).not.toContain("�");
      expect(saved.title).toBe(title);
    }
  } finally {
    await removeEmployee(adminApi, employee);
    await adminApi.dispose();
  }
});

test("анонимные запросы не ходят в базу", async () => {
  const adminApi = await loginAdmin();
  const anonymous = await playwrightRequest.newContext({ baseURL });
  try {
    const readQueries = async () => {
      const response = await adminApi.get("/metrics");
      expect(response.status()).toBe(200);
      const { readQueries } = await response.json();
      // Без поля сравнение before/after было бы пустым (undefined === undefined).
      expect(typeof readQueries, "в /metrics нет числового readQueries").toBe("number");
      return readQueries;
    };

    const before = await readQueries();
    for (let i = 0; i < 5; i += 1) {
      expect((await anonymous.get("/api/workspace")).status()).toBe(401);
      expect((await anonymous.post("/api/workspace", { data: {} })).status()).toBe(401);
    }
    const after = await readQueries();
    expect(after).toBe(before);
  } finally {
    await anonymous.dispose();
    await adminApi.dispose();
  }
});

test("смена пароля требует верный текущий пароль", async () => {
  const adminApi = await loginAdmin();
  let employee;
  try {
    employee = await createEmployee(adminApi, "pwd");
    const newPassword = "FreshPass456";
    const wrongMessage = "Неверный текущий пароль";

    const memberApi = await playwrightRequest.newContext({ baseURL });
    const memberLogin = await memberApi.post("/api/login", {
      data: { username: employee.username, password: memberPassword }
    });
    expect(memberLogin.status()).toBe(200);
    // Без текущего пароля. Статус именно 400: клиент разлогинивает по 401.
    const missing = await memberApi.post("/api/me/password", { data: { password: newPassword } });
    expect(missing.status()).toBe(400);
    expect((await missing.json()).error).toBe(wrongMessage);

    const wrong = await memberApi.post("/api/me/password", {
      data: { currentPassword: "NotMyPassword1", password: newPassword }
    });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error).toBe(wrongMessage);

    // Отказ не должен был ни сменить пароль, ни закрыть сессию.
    expect((await memberApi.get("/api/workspace")).status()).toBe(200);

    // Верный текущий пароль, но короткий новый: 400, пароль не меняется.
    const tooShort = await memberApi.post("/api/me/password", {
      data: { currentPassword: memberPassword, password: "short" }
    });
    expect(tooShort.status()).toBe(400);

    const changed = await memberApi.post("/api/me/password", {
      data: { currentPassword: memberPassword, password: newPassword }
    });
    expect(changed.status()).toBe(200);
    // Текущая сессия жива. Остальные сессии пользователя закрываются на сервере,
    // но проверить это здесь нельзя: вход и так оставляет одну сессию на
    // пользователя (db/repositories/auth.js, createSession).
    expect((await memberApi.get("/api/workspace")).status()).toBe(200);
    await memberApi.dispose();

    const oldLogin = await playwrightRequest.newContext({ baseURL });
    const oldResponse = await oldLogin.post("/api/login", {
      data: { username: employee.username, password: memberPassword }
    });
    expect(oldResponse.status()).toBe(401);
    await oldLogin.dispose();

    const newLogin = await playwrightRequest.newContext({ baseURL });
    const newResponse = await newLogin.post("/api/login", {
      data: { username: employee.username, password: newPassword }
    });
    expect(newResponse.status()).toBe(200);
    await newLogin.dispose();
  } finally {
    await removeEmployee(adminApi, employee);
    await adminApi.dispose();
  }
});
