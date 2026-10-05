import { expect, test } from "@playwright/test";

// Каталог набора A (/#ui-kit): работает без входа и без данных, поэтому тест
// проверяет только то, что отдаёт собранное приложение.
const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";

// Устаревший src/styles.css (его вытеснит новая система) тянет шрифт с внешнего
// хоста, а CSP этого не разрешает: это не ошибка набора A.
const KNOWN_NOISE = [/fonts\.bunny\.net/];

async function openKit(page) {
  const problems = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (KNOWN_NOISE.some((pattern) => pattern.test(text))) return;
    problems.push(`console: ${text}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto(`${baseURL}/#ui-kit`);
  await expect(page.getByRole("heading", { name: "Кнопки", level: 2 })).toBeVisible();
  return problems;
}

test("каталог набора A открывается без ошибок в консоли", async ({ page }) => {
  const problems = await openKit(page);
  // Все девять разделов на месте.
  await expect(page.locator("section.kit-section")).toHaveCount(9);
  await page.waitForTimeout(500);
  expect(problems).toEqual([]);
});

test("Button loading: aria-busy, недоступна, ширина не прыгает", async ({ page }) => {
  await openKit(page);
  const loading = page.getByTestId("kit-a-btn-loading");
  await expect(loading).toHaveAttribute("aria-busy", "true");
  await expect(loading).toBeDisabled();

  // Живая кнопка «Сохранить»: нажатие включает загрузку, ширина прежняя.
  const demo = page.getByTestId("kit-a-btn-demo");
  await expect(demo).not.toHaveAttribute("aria-busy", "true");
  const before = (await demo.boundingBox()).width;
  await demo.click();
  await expect(demo).toHaveAttribute("aria-busy", "true");
  await expect(demo).toBeDisabled();
  const during = (await demo.boundingBox()).width;
  expect(Math.abs(during - before)).toBeLessThan(0.5);
  // Через полторы секунды загрузка кончается.
  await expect(demo).not.toHaveAttribute("aria-busy", "true", { timeout: 5_000 });
  await expect(demo).toBeEnabled();
});

test("IconButton: у каждой есть доступное имя и область не меньше 44px", async ({ page }) => {
  await openKit(page);
  const buttons = page.locator("button.ui-iconbtn");
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(7);
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    const name = await button.getAttribute("aria-label");
    expect((name || "").trim().length, `у кнопки-иконки №${i} нет aria-label`).toBeGreaterThan(0);
  }
  await expect(page.getByRole("button", { name: "Добавить", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Настройки" })).toBeVisible();

  // Невидимое расширение: псевдоэлемент ::after перекрывает минимум 44px.
  const small = page.getByRole("button", { name: "Ещё", exact: true });
  const hit = await small.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return { width: parseFloat(style.width), height: parseFloat(style.height) };
  });
  expect(hit.width).toBeGreaterThanOrEqual(43.5);
  expect(hit.height).toBeGreaterThanOrEqual(43.5);
});

test("ProgressBar и ProgressRing: role=progressbar с aria-valuenow и именем", async ({ page }) => {
  await openKit(page);
  const bars = page.locator(".ui-progress [role=progressbar]");
  const rings = page.locator(".ui-ring[role=progressbar]");
  expect(await bars.count()).toBeGreaterThanOrEqual(5);
  expect(await rings.count()).toBeGreaterThanOrEqual(3);

  for (const group of [bars, rings]) {
    const total = await group.count();
    for (let i = 0; i < total; i += 1) {
      const item = group.nth(i);
      await expect(item).toHaveAttribute("aria-valuenow", /^\d+(\.\d+)?$/);
      await expect(item).toHaveAttribute("aria-valuemin", "0");
      await expect(item).toHaveAttribute("aria-valuemax", /^\d+$/);
    }
  }
  const goals = page.getByRole("progressbar", { name: "Цели квартала" });
  await expect(goals).toHaveCount(2);
  await expect(goals.first()).toHaveAttribute("aria-valuenow", "72");
  await expect(page.getByRole("progressbar", { name: "Успех" })).toHaveAttribute("aria-valuenow", "86");
});

test("ListRow-кнопка достижима клавишей Tab и срабатывает по Enter и пробелу", async ({ page }) => {
  await openKit(page);
  const row = page.getByTestId("kit-a-row-button");
  await expect(row).toHaveJSProperty("tagName", "BUTTON");
  await expect(row).toContainText("Нажато: 0");

  // Идём Tab от начала страницы, пока фокус не окажется на строке.
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  let reached = false;
  for (let i = 0; i < 120 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await row.evaluate((element) => element === document.activeElement);
  }
  expect(reached, "строка-кнопка недостижима клавишей Tab").toBe(true);

  // Фокус видимый: у строки есть контур.
  const outline = await row.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");

  await page.keyboard.press("Enter");
  await expect(row).toContainText("Нажато: 1");
  await page.keyboard.press("Space");
  await expect(row).toContainText("Нажато: 2");

  // Строка без действия не кнопка.
  const plain = page.locator(".ui-row", { hasText: "Просто строка" });
  await expect(plain).toHaveJSProperty("tagName", "DIV");
  // Строка-ссылка это <a>.
  const link = page.locator(".ui-row", { hasText: "Ссылка-строка" });
  await expect(link).toHaveJSProperty("tagName", "A");
});

test("Интерактивная карточка: фокус и Enter", async ({ page }) => {
  await openKit(page);
  const card = page.getByTestId("kit-a-card-interactive");
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card).toContainText("Нажатий: 1");
  await page.keyboard.press("Space");
  await expect(card).toContainText("Нажатий: 2");
});

test("Sparkline: пустые данные и одно значение рисуются без падения", async ({ page }) => {
  const problems = await openKit(page);
  const empty = page.getByTestId("kit-a-spark-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute("role", "img");
  await expect(empty).toHaveAttribute("aria-label", "Нет данных");

  // Остальные графики описаны текстом.
  await expect(page.getByRole("img", { name: "Тренд: от 2 до 11" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Значение: 7" })).toBeVisible();
  // Кривая плавная: в пути есть кубические сегменты, а не ломаная.
  const path = await page.locator(".ui-spark__line").first().getAttribute("d");
  expect(path).toMatch(/C/);
  expect(path).not.toMatch(/NaN/);
  // Ни одна кривая не содержит NaN.
  const bad = await page.locator("svg.ui-spark path").evaluateAll((nodes) => nodes.filter((node) => /NaN/.test(node.getAttribute("d") || "")).length);
  expect(bad).toBe(0);
  expect(problems).toEqual([]);
});

test("Каталог не вылезает по горизонтали на узком экране", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openKit(page);
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
