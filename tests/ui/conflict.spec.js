import { expect, request as playwrightRequest, test } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
// Без фолбэка: пароля по умолчанию не существует (как в smoke.spec.js).
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) throw new Error("ADMIN_PASSWORD обязателен для запуска тестов");

const CONFLICT_MESSAGE = "Данные изменились в другом месте. Обновите страницу и повторите";

test("409 при сохранении показывает баннер, а не бесконечный повтор", async ({ page }) => {
  test.setTimeout(120_000);

  // Участника заводим через API до входа в браузер: к моменту открытия
  // приложения он уже в списке, и тест не зависит от состояния базы.
  const adminApi = await playwrightRequest.newContext({ baseURL });
  expect((await adminApi.post("/api/login", { data: { username: adminUsername, password: adminPassword } })).status()).toBe(200);
  const suffix = Date.now();
  const personName = `Конфликт ${suffix}`;
  const created = await adminApi.post("/api/users", {
    data: {
      role: "employee",
      personName,
      personRole: "QA Engineer",
      personTeam: "Conflict",
      username: `conflict_${suffix}`,
      password: "TeamPass121"
    }
  });
  expect(created.status()).toBe(201);
  const createdUser = (await created.json()).user;

  try {
    await page.goto(baseURL);
    await page.getByLabel("Логин").fill(adminUsername);
    await page.getByLabel("Пароль").fill(adminPassword);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Дашборд команды" })).toBeVisible();

    // Последнее успешное состояние сервера: его мы подсовываем в ответ 409,
    // как это делает настоящий сервер.
    const latestWorkspace = await (await adminApi.get("/api/workspace")).json();

    let postCount = 0;
    await page.route("**/api/workspace", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      postCount += 1;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: CONFLICT_MESSAGE,
          conflicts: [{ table: "cards", id: "x" }],
          workspace: latestWorkspace
        })
      });
    });

    await page.getByRole("button", { name: "Команда", exact: true }).click();
    await page.locator(".team-member-card", { hasText: personName }).locator(".team-member-main").click();
    await expect(page.getByRole("heading", { name: `1:1 с ${personName}` })).toBeVisible();

    // Добавление темы повестки — обычная правка, уходящая в автосохранение.
    await page.getByPlaceholder("Например: слишком много срочных запросов").fill(`Тема конфликта ${suffix}`);
    await page.getByTitle("Добавить тему").click();

    const banner = page.locator('[data-testid="conflict-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("role", "alert");
    await expect(banner).toContainText("Данные изменились в другом месте");

    // Автоповтор при 409 запрещён: тот же снимок снова получил бы 409, а
    // повтор в обход затёр бы чужие правки. Даём время на возможный цикл.
    await page.waitForTimeout(6_000);
    expect(postCount).toBeGreaterThanOrEqual(1);
    expect(postCount).toBeLessThanOrEqual(2);
    await expect(banner).toBeVisible();

    await page.locator('[data-testid="conflict-reload"]').click();
    await expect(banner).toBeHidden();

    // После «Загрузить актуальные данные» несохранённой правки не осталось,
    // поэтому новых сохранений не уходит.
    const afterReload = postCount;
    await page.waitForTimeout(1_500);
    expect(postCount).toBe(afterReload);
  } finally {
    await page.unroute("**/api/workspace").catch(() => {});
    await adminApi.delete(`/api/users/${encodeURIComponent(createdUser.id)}`).catch(() => {});
    await adminApi
      .delete(`/api/people/${encodeURIComponent(createdUser.personId)}?permanent=1`)
      .catch(() => {});
    await adminApi.dispose();
  }
});
