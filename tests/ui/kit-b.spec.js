import { expect, test } from "@playwright/test";

// Поведение набора B из каталога /#ui-kit: сегменты, вкладки, переключатель,
// диалог, меню, поле с ошибкой, уведомления. Каталог открывается без входа.

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";

test.describe("Набор B: каталог /#ui-kit", () => {
  let problems;

  test.beforeEach(async ({ page }) => {
    problems = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      problems.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    await page.goto(`${baseURL}/#ui-kit`);
    await page.waitForSelector(".kit-section");
  });

  test.afterEach(() => {
    expect(problems, "в консоли не должно быть ошибок").toEqual([]);
  });

  test("Segmented: клик, стрелки, Home и End", async ({ page }) => {
    const group = page.getByRole("radiogroup", { name: "Период" });
    const week = group.getByRole("radio", { name: "Неделя" });
    const month = group.getByRole("radio", { name: "Месяц" });
    const quarter = group.getByRole("radio", { name: "Квартал" });

    await expect(week).toBeChecked();
    await month.click({ force: true });
    await expect(month).toBeChecked();
    await expect(week).not.toBeChecked();

    await month.focus();
    await page.keyboard.press("ArrowRight");
    await expect(quarter).toBeChecked();
    await expect(quarter).toBeFocused();
    await page.keyboard.press("Home");
    await expect(week).toBeChecked();
    await page.keyboard.press("End");
    await expect(quarter).toBeChecked();
    await page.keyboard.press("ArrowLeft");
    await expect(month).toBeChecked();
  });

  test("Segmented: недоступный вариант пропускается, индикатор переезжает", async ({ page }) => {
    const group = page.getByRole("radiogroup", { name: "Раздел" });
    await group.getByRole("radio", { name: /Команда/ }).click({ force: true });
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "Черновики" })).toBeChecked();
    await expect(group.getByRole("radio", { name: "Архив" })).toBeDisabled();

    const x = await group.evaluate((el) => el.style.getPropertyValue("--ui-ind-x"));
    await group.getByRole("radio", { name: "Все" }).click({ force: true });
    await expect.poll(() => group.evaluate((el) => el.style.getPropertyValue("--ui-ind-x"))).not.toBe(x);
  });

  test("Tabs: роли, клик, стрелки, Home/End, связь с панелью", async ({ page }) => {
    const list = page.getByRole("tablist", { name: "Профиль участника" });
    const overview = list.getByRole("tab", { name: "Обзор" });
    const meetings = list.getByRole("tab", { name: /Встречи/ });
    const goals = list.getByRole("tab", { name: /Цели/ });
    const notes = list.getByRole("tab", { name: "Заметки" });

    await expect(overview).toHaveAttribute("aria-selected", "true");
    await expect(overview).toHaveAttribute("tabindex", "0");
    await expect(meetings).toHaveAttribute("tabindex", "-1");
    const panelId = await overview.getAttribute("aria-controls");
    const panel = page.locator(`[id="${panelId}"]`);
    await expect(panel).toHaveAttribute("role", "tabpanel");
    await expect(panel).toHaveAttribute("aria-labelledby", await overview.getAttribute("id"));
    await expect(panel).toBeVisible();

    await meetings.click();
    await expect(meetings).toHaveAttribute("aria-selected", "true");
    await expect(overview).toHaveAttribute("aria-selected", "false");
    await expect(panel).toBeHidden();

    await page.keyboard.press("ArrowRight");
    await expect(goals).toHaveAttribute("aria-selected", "true");
    await expect(goals).toBeFocused();
    await page.keyboard.press("End");
    // «Архив» недоступен, поэтому последняя доступная вкладка: «Заметки»
    await expect(notes).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(overview).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(notes).toHaveAttribute("aria-selected", "true");

    const pills = page.getByRole("tablist", { name: "Развитие" });
    await pills.getByRole("tab", { name: /Навыки/ }).click();
    await expect(pills.getByRole("tab", { name: /Навыки/ })).toHaveAttribute("aria-selected", "true");
  });

  test("Switch: role=switch, пробел переключает", async ({ page }) => {
    const sw = page.getByRole("switch", { name: /Недельная сводка/ });
    await expect(sw).toHaveAttribute("role", "switch");
    await expect(sw).not.toBeChecked();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await sw.focus();
    await page.keyboard.press("Space");
    await expect(sw).toBeChecked();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Space");
    await expect(sw).not.toBeChecked();
  });

  test("Checkbox: индетерминантное состояние и выбор", async ({ page }) => {
    const all = page.getByRole("checkbox", { name: "Все каналы" });
    await expect.poll(() => all.evaluate((el) => el.indeterminate)).toBe(true);
    await all.focus();
    await page.keyboard.press("Space");
    await expect(all).toBeChecked();
    await expect.poll(() => all.evaluate((el) => el.indeterminate)).toBe(false);
    await expect(page.getByRole("checkbox", { name: /Чат/ })).toBeChecked();
  });

  test("Slider: стрелки меняют значение и подпись", async ({ page }) => {
    const slider = page.getByRole("slider", { name: "Настроение за неделю" });
    await expect(slider).toHaveValue("70");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue("71");
    await expect(slider).toHaveAttribute("aria-valuetext", /71/);
    await page.keyboard.press("End");
    await expect(slider).toHaveValue("100");
  });

  test("Dialog: фокус внутрь, ловушка Tab, Escape, возврат фокуса, блокировка прокрутки", async ({ page }) => {
    const opener = page.getByRole("button", { name: "Открыть диалог" });
    await opener.scrollIntoViewIfNeeded();
    await opener.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Новая встреча 1:1" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-describedby", /.+/);
    // initialFocusRef указывает на поле «Участник»
    await expect(page.getByRole("textbox", { name: /Участник/ })).toBeFocused();

    // Прокрутка страницы заблокирована
    const locked = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflow,
      body: getComputedStyle(document.body).overflow
    }));
    expect([locked.html, locked.body]).toContain("hidden");
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(5, 5);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);

    // Tab и Shift+Tab ходят по кругу и не покидают диалог
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    const unlocked = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflow,
      body: getComputedStyle(document.body).overflow
    }));
    expect(unlocked.body).not.toBe("hidden");
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-ui-scroll-lock"))).toBe(false);
  });

  test("Dialog: клик по фону закрывает, клик внутри нет, крестик закрывает", async ({ page }) => {
    const opener = page.getByRole("button", { name: "Открыть диалог" });
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Новая встреча 1:1" });
    await expect(dialog).toBeVisible();

    await dialog.getByText("Повестка").click();
    await expect(dialog).toBeVisible();

    await page.mouse.click(8, 8);
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await opener.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Закрыть" }).click();
    await expect(dialog).toBeHidden();
  });

  test("ConfirmDialog (danger): фокус на «Отмена», Escape закрывает", async ({ page }) => {
    const opener = page.getByRole("button", { name: "Удалить участника" });
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    const dialog = page.getByRole("alertdialog", { name: "Удалить участника?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Отмена" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("Sheet: открывается справа, Escape закрывает", async ({ page }) => {
    const opener = page.getByRole("button", { name: "Шторка справа" });
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    const sheet = page.getByRole("dialog", { name: "Фильтры" });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(600); // выезд справа закончился
    const box = await sheet.boundingBox();
    const viewport = page.viewportSize();
    expect(Math.round(box.x + box.width)).toBe(viewport.width);
    expect(Math.round(box.width)).toBe(420);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("Menu: открытие с клавиатуры, стрелки, Home/End, Escape, выбор", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Действия" });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = menu.getByRole("menuitem");
    await expect(items.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
    // «Поделиться» недоступен: пропускается
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "В архив" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Удалить" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("menuitem", { name: "Удалить" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    // ArrowUp открывает с последнего пункта
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("menuitem", { name: "Удалить" })).toBeFocused();
    await page.keyboard.press("Escape");

    // Enter выбирает пункт и возвращает фокус
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Изменить" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('[role="status"]').getByText("Открыли редактор")).toBeVisible();
  });

  test("Menu: клик снаружи закрывает, меню не выходит за экран", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Выравнивание по правому краю" });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    await page.mouse.click(viewport.width - 4, viewport.height - 4);
    await expect(menu).toBeHidden();
  });

  test("Menu: при нехватке места снизу открывается вверх", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    const trigger = page.getByRole("button", { name: "Выравнивание по правому краю" });
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((el) => el.textContent.includes("Выравнивание"));
      window.scrollBy(0, button.getBoundingClientRect().top - (window.innerHeight - 70));
    });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("data-placement", /^top-/);
    const menuBox = await menu.boundingBox();
    const triggerBox = await trigger.boundingBox();
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(triggerBox.y);
    expect(menuBox.y).toBeGreaterThanOrEqual(0);
  });

  test("Popover: открывается, Escape закрывает и возвращает фокус", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Поповер" });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const popover = page.getByRole("dialog", { name: "Быстрая оценка" });
    await expect(popover).toBeVisible();
    await expect(popover).not.toHaveAttribute("aria-modal", "true");
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Field: ошибка связана с полем через aria-describedby и aria-invalid", async ({ page }) => {
    const input = page.getByRole("textbox", { name: /Ошибка/ });
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAttribute("required", "");
    const describedBy = await input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("Укажите имя участника");
    // подпись видима и привязана к полю
    await expect(page.locator("label", { hasText: "Ошибка" }).first()).toBeVisible();
    await expect(page.locator("label", { hasText: "Ошибка" }).first()).toHaveAttribute("for", await input.getAttribute("id"));

    // подсказка связана так же, а появившаяся ошибка заменяет её
    const email = page.getByRole("textbox", { name: /Рабочая почта/ });
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    const hintId = await email.getAttribute("aria-describedby");
    await expect(page.locator(`[id="${hintId}"]`)).toHaveText("Мы пришлём на неё приглашение");
    await email.fill("без-собаки");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    const errorId = await email.getAttribute("aria-describedby");
    await expect(page.locator(`[id="${errorId}"]`)).toContainText("не хватает знака");
    await email.fill("a@b.ru");
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
  });

  test("Пароль: кнопка показа переключает тип поля", async ({ page }) => {
    const password = page.getByLabel("Пароль", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Показать пароль" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Скрыть пароль" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("TextArea: счётчик и автоматический рост", async ({ page }) => {
    const area = page.getByRole("textbox", { name: /О чём поговорить/ });
    await expect(page.getByText("57 / 280")).toBeVisible();
    const h0 = (await area.boundingBox()).height;
    await area.fill(Array.from({ length: 12 }, (_, i) => `Строка ${i + 1}`).join("\n"));
    await expect.poll(async () => (await area.boundingBox()).height).toBeGreaterThan(h0 + 60);
  });

  test("Select и поиск: нативный select, очистка поиска", async ({ page }) => {
    const select = page.getByLabel("Команда", { exact: true }).first();
    await expect(select).toHaveJSProperty("tagName", "SELECT");
    await select.selectOption("mobile");
    await expect(select).toHaveValue("mobile");

    const search = page.getByRole("searchbox", { name: "Найти участника" });
    await search.fill("Анна");
    await page.getByRole("button", { name: "Очистить поиск" }).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(page.getByRole("search").first()).toBeVisible();
  });

  test("Toast: success в role=status, danger в role=alert и не исчезает сам", async ({ page }) => {
    await page.getByRole("button", { name: "Успех", exact: true }).click();
    const status = page.locator('[role="status"]').filter({ hasText: "Встреча сохранена" });
    await expect(status).toBeVisible();

    await page.getByRole("button", { name: "Ошибка", exact: true }).click();
    const alert = page.locator('[role="alert"]').filter({ hasText: "Не удалось сохранить" });
    await expect(alert).toBeVisible();

    // успех исчезает сам (4 секунды), ошибка остаётся
    await expect(status).toBeHidden({ timeout: 8000 });
    await expect(alert).toBeVisible();

    await alert.getByRole("button", { name: "Закрыть уведомление" }).click();
    await expect(alert).toBeHidden();
  });

  test("Toast: не больше трёх сразу, таймер стоит при наведении", async ({ page }) => {
    await page.getByRole("button", { name: "Стопка из четырёх" }).click();
    await expect(page.locator(".ui-toast")).toHaveCount(3);
    await expect(page.getByText("Первое уведомление")).toHaveCount(0);

    const toast = page.locator(".ui-toast").first();
    await toast.hover();
    await page.waitForTimeout(5200);
    await expect(toast).toBeVisible();
    await page.mouse.move(2, 400);
    await expect(page.locator(".ui-toast")).toHaveCount(0, { timeout: 9000 });
  });

  test("Движение выключается настройкой data-motion", async ({ page }) => {
    await page.evaluate(() => document.documentElement.setAttribute("data-motion", "reduced"));
    const opener = page.getByRole("button", { name: "Открыть диалог" });
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Новая встреча 1:1" });
    await expect(dialog).toBeVisible();
    const duration = await dialog.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(duration)).toBeLessThan(0.01);
  });

  test("Тёмная тема и узкий экран: диалог превращается в нижнюю шторку", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const opener = page.getByRole("button", { name: "Открыть диалог" });
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Новая встреча 1:1" });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(500);
    const box = await dialog.boundingBox();
    expect(Math.round(box.width)).toBe(390);
    expect(Math.round(box.y + box.height)).toBe(844);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});
