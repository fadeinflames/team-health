import { expect, request as playwrightRequest, test } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";

test("auth, admin workflow, and employee data isolation work", async ({ page, request }) => {
  const unauthenticated = await request.get(`${baseURL}/api/workspace`);
  expect(unauthenticated.status()).toBe(401);

  const resetContext = await playwrightRequest.newContext({ baseURL });
  await resetContext.post("/api/login", {
    data: { username: "mgusev", password: "passwb121" }
  });
  await resetContext.post("/api/reset");
  await resetContext.dispose();

  await page.goto("http://127.0.0.1:4173");
  await expect(page.getByRole("heading", { name: "Войти в Team Health 1:1" })).toBeVisible();

  await page.getByLabel("Логин").fill("mgusev");
  await page.getByLabel("Пароль").fill("passwb121");
  await page.getByRole("button", { name: "Войти", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Дашборд команды" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Срочные вопросы" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Состояние участников" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ближайшие 1:1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Добавить участника" })).toBeVisible();
  await expect(page.getByText("Как этим пользоваться")).not.toBeVisible();
  await expect(page.getByText("Демо SRE-инженер")).not.toBeVisible();
  await expect(page.getByText("Анна Морозова")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Сбросить демо-данные" })).not.toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Сбросить демо-данные" }).click();
  await expect(page.getByText("Демо-данные сброшены. Вы остались в аккаунте лида")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Команда", exact: true })).toBeVisible();
  await expect(page.getByText("Демо SRE-инженер")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Войти в Team Health 1:1" })).not.toBeVisible();

  await expect(page.getByRole("button", { name: "Люди", exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Пользователи", exact: true })).not.toBeVisible();
  await expect(page.locator(".context-sidebar")).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Команда" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Участники 1:1" })).toBeVisible();
  await expect(page.getByText("В рабочей команде пока нет участников 1:1")).toBeVisible();
  await expect(page.getByText("seed")).not.toBeVisible();

  const leaderForm = page.locator(".admin-form").filter({ hasText: "Как вас видит команда" });
  await leaderForm.getByLabel("Имя").fill("Максим Гусев QA");
  await leaderForm.getByRole("button", { name: "Сохранить имя" }).click();
  await expect(page.getByText("Вы вошли как Максим Гусев QA · лид команды")).toBeVisible();

  const employeeName = "Игорь Сидоров";
  const employeeUsername = `igor_${Date.now()}`;
  const employeePassword = "TeamPass121";
  const updatedEmployeePassword = "TeamPass122";
  await expect(page.getByRole("heading", { name: "Доступы команды" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Демо-логины" })).not.toBeVisible();
  await expect(page.locator(".access-row", { hasText: "demo" })).not.toBeVisible();

  const accessForm = page.locator(".admin-form").filter({ hasText: "Добавить участника" });
  await expect(accessForm.getByLabel("Имя участника")).toBeVisible();
  await expect(accessForm.getByText("Уже есть профиль")).not.toBeVisible();
  await accessForm.getByLabel("Имя участника").fill(employeeName);
  await accessForm.getByLabel("Роль", { exact: true }).fill("Platform SRE");
  await accessForm.getByLabel("Команда").fill("Core Infrastructure");
  await accessForm.getByLabel("Логин", { exact: true }).fill(employeeUsername);
  await accessForm.getByLabel("Пароль").fill(employeePassword);
  await accessForm.getByRole("button", { name: "Создать логин" }).click();
  await expect(page.getByText(`Логин ${employeeUsername} создан`)).toBeVisible();
  await expect(page.locator(".team-member-card", { hasText: employeeName })).toBeVisible();
  await expect(page.locator(".access-row", { hasText: employeeUsername })).toBeVisible();
  await expect(page.getByText("Демо SRE-инженер")).not.toBeVisible();

  await page.locator(".team-member-card", { hasText: employeeName }).locator(".team-member-main").click();
  await expect(page.getByRole("heading", { name: `1:1 с ${employeeName}` })).toBeVisible();
  await expect(page.getByText("Чек-лист подготовки")).toBeVisible();

  await page.getByPlaceholder("Например: шумят алерты после деплоя").fill("Проверить баланс on-call фокуса");
  await page.getByPlaceholder("Что важно не забыть обсудить?").fill("Сколько deep work блоков реально остается после incident review?");
  await page.getByTitle("Добавить тему").click();
  await expect(page.getByRole("heading", { name: "Проверить баланс on-call фокуса" })).toBeVisible();

  await page.getByRole("tab", { name: /Встреча/ }).click();
  await expect(page.getByRole("heading", { name: "Сигналы между встречами" })).toBeVisible();
  await page.locator(".signal-control").filter({ hasText: "Нагрузка" }).locator("input").fill("8");

  await page.getByRole("tab", { name: /Итоги/ }).click();
  await page.getByPlaceholder("Что нужно сделать?").fill("Забронировать два окна фокуса после on-call смены");
  await page.getByRole("button", { name: "Добавить шаг" }).click();
  await expect(page.locator(".action-row strong", { hasText: "Забронировать два окна фокуса после on-call смены" })).toBeVisible();

  await page.getByRole("tab", { name: /Подготовка/ }).click();
  await page.getByRole("button", { name: "Итоги встречи" }).click();
  await expect(page.getByRole("tab", { name: /Итоги/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(`Итоги 1:1 с ${employeeName}`)).toBeVisible();

  await page.getByRole("button", { name: "Команда", exact: true }).click();

  await page.locator(".access-row", { hasText: employeeUsername }).getByRole("button", { name: "Пароль" }).click();
  const resetPasswordForm = page.locator(".admin-form").filter({ hasText: "Обновить пароль" });
  await resetPasswordForm.locator("input").fill(updatedEmployeePassword);
  await resetPasswordForm.getByRole("button", { name: "Обновить пароль" }).click();
  await expect(page.getByText("Пароль обновлен, активные сессии пользователя закрыты")).toBeVisible();

  const employeeApi = await playwrightRequest.newContext({ baseURL });
  const employeeLogin = await employeeApi.post("/api/login", {
    data: { username: employeeUsername, password: updatedEmployeePassword }
  });
  expect(employeeLogin.status()).toBe(200);

  const employeeWorkspace = await employeeApi.get("/api/workspace");
  expect(employeeWorkspace.status()).toBe(200);
  const scoped = await employeeWorkspace.json();
  expect(scoped.people).toHaveLength(1);
  expect(scoped.people[0].name).toBe(employeeName);
  expect(scoped.cards.every((card) => card.personId === scoped.people[0].id)).toBeTruthy();
  expect(scoped.users).toEqual([]);
  expect(scoped.notes).toEqual({});
  await employeeApi.dispose();

  const demoApi = await playwrightRequest.newContext({ baseURL });
  const demoLogin = await demoApi.post("/api/login", {
    data: { username: "demo", password: "demo" }
  });
  expect(demoLogin.status()).toBe(200);
  const demoWorkspace = await demoApi.get("/api/workspace");
  const demoScoped = await demoWorkspace.json();
  expect(demoScoped.people).toHaveLength(1);
  expect(demoScoped.people[0].id).toBe("demo-sre");
  expect(demoScoped.cards.every((card) => card.personId === "demo-sre")).toBeTruthy();
  const tamperedDemoWorkspace = await demoApi.post("/api/workspace", {
    data: {
      ...demoScoped,
      prep: {
        "demo-sre": {
          managerAgenda: false,
          employeeAgenda: false
        }
      },
      pulse: {
        "demo-sre": {
          energy: 99,
          load: -4,
          clarity: "bad",
          trust: 0
        }
      }
    }
  });
  expect(tamperedDemoWorkspace.status()).toBe(200);
  const sanitizedDemoScoped = await tamperedDemoWorkspace.json();
  expect(sanitizedDemoScoped.prep["demo-sre"].managerAgenda).toBe(true);
  expect(sanitizedDemoScoped.prep["demo-sre"].employeeAgenda).toBe(false);
  expect(sanitizedDemoScoped.pulse["demo-sre"]).toEqual({
    energy: 10,
    load: 1,
    clarity: 7,
    trust: 1
  });
  await demoApi.dispose();

  await expect(page.locator(".access-row", { hasText: "demo" })).not.toBeVisible();

  const createdAccessRow = page.locator(".access-row", { hasText: employeeUsername });
  await createdAccessRow.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText(`Логин ${employeeUsername} удален`)).toBeVisible();
  await expect(createdAccessRow).not.toBeVisible();

  await page.locator(".team-member-card", { hasText: employeeName }).getByRole("button", { name: "Удалить участника" }).click();
  await expect(page.getByText(`Подтвердите удаление ${employeeName}`)).toBeVisible();
  await page.locator(".team-member-card", { hasText: employeeName }).getByRole("button", { name: "Подтвердить удаление" }).click();
  await expect(page.getByText(`Участник ${employeeName} удален`)).toBeVisible();
  await expect(page.locator(".team-member-card", { hasText: employeeName })).not.toBeVisible();

  const deletedEmployeeApi = await playwrightRequest.newContext({ baseURL });
  const deletedEmployeeLogin = await deletedEmployeeApi.post("/api/login", {
    data: { username: employeeUsername, password: updatedEmployeePassword }
  });
  expect(deletedEmployeeLogin.status()).toBe(401);
  await deletedEmployeeApi.dispose();
});
