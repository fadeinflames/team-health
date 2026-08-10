import { expect, test } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
// Без фолбэка: пароля по умолчанию не существует, и тест, который его
// придумывает, проверяет не то приложение, которое поедет в прод.
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) throw new Error("ADMIN_PASSWORD обязателен для запуска тестов");

async function loginAsAdmin(page) {
  await page.goto(baseURL);
  await page.getByLabel("Логин").fill(adminUsername);
  await page.getByLabel("Пароль").fill(adminPassword);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Дашборд команды" })).toBeVisible();
}

async function resetWorkspace(page) {
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Сбросить демо-данные" }).click();
  await expect(page.getByText("Демо-данные сброшены. Вы остались в аккаунте админа")).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  const offenders = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const className =
          typeof element.className === "string"
            ? element.className
            : String(element.getAttribute("class") || "");
        return {
          tag: element.tagName.toLowerCase(),
          className,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          viewportWidth,
          text: String(element.textContent || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 80)
        };
      })
      .filter((entry) => entry.right > viewportWidth + 2 || entry.left < -2)
      .slice(0, 8);
  });

  expect(offenders).toEqual([]);
}

test.describe("UI audit", () => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    test(`admin screens have no console errors or horizontal overflow on ${viewport.name}`, async ({ page }) => {
      const browserMessages = [];

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAsAdmin(page);
      await resetWorkspace(page);

      page.on("console", (message) => {
        if (message.type() === "error") browserMessages.push(message.text());
      });
      page.on("pageerror", (error) => browserMessages.push(error.message));

      for (const section of ["Главная", "ЛПР", "Цели", "Опросы", "Отчёты", "Команда", "Админка", "Настройки"]) {
        await page.getByRole("button", { name: section, exact: true }).click();
        await page.waitForTimeout(100);
        await expectNoHorizontalOverflow(page);
      }

      expect(browserMessages).toEqual([]);
    });
  }
});
