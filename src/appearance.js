// Внешний вид интерфейса: тема, акцент, плотность, размер текста, движение и
// свёрнутость боковой панели.
//
// Состояние одно на всё приложение и живёт в localStorage (не на сервере: это
// настройка устройства, а не профиля). Применяется атрибутами на <html>, которые
// читает src/styles/tokens.css; до старта React то же самое делает
// public/theme-init.js, поэтому при загрузке ничего не мигает.
//
// Подписчики (оболочка, настройки, палитра команд) читают состояние через
// useAppearance и остаются согласованными, в том числе между вкладками.
import { useCallback, useSyncExternalStore } from "react";

export const THEMES = ["system", "light", "dark"];
export const ACCENTS = ["teal", "blue", "indigo", "violet", "rose", "orange", "graphite"];
export const DENSITIES = ["comfortable", "compact"];
export const TEXT_SIZES = ["normal", "large"];
export const MOTIONS = ["system", "reduced"];

const KEYS = {
  theme: "th_theme",
  accent: "th_accent",
  density: "th_density",
  text: "th_text",
  motion: "th_motion",
  sidebarCollapsed: "th_sidebar"
};

export const DEFAULT_APPEARANCE = Object.freeze({
  theme: "system",
  accent: "teal",
  density: "comfortable",
  text: "normal",
  motion: "system",
  sidebarCollapsed: false
});

const VALID = {
  theme: THEMES,
  accent: ACCENTS,
  density: DENSITIES,
  text: TEXT_SIZES,
  motion: MOTIONS
};

function readKey(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // localStorage недоступен (приватный режим): работаем со значениями по умолчанию
    return null;
  }
}

function writeKey(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // настройка действует до конца сессии, сохранить не удалось
  }
}

export function readAppearance() {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  const next = { ...DEFAULT_APPEARANCE };
  for (const name of Object.keys(VALID)) {
    const stored = readKey(KEYS[name]);
    if (VALID[name].includes(stored)) next[name] = stored;
  }
  next.sidebarCollapsed = readKey(KEYS.sidebarCollapsed) === "1";
  return next;
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Тема, которая реально применена: «системная» превращается в светлую или тёмную.
export function resolveTheme(theme) {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

function setAttr(root, name, value, defaultValue) {
  if (value === defaultValue) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

export function applyAppearance(state) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  setAttr(root, "data-theme", resolveTheme(state.theme), "light");
  setAttr(root, "data-accent", state.accent, "teal");
  setAttr(root, "data-density", state.density, "comfortable");
  setAttr(root, "data-text", state.text, "normal");
  setAttr(root, "data-motion", state.motion, "system");
}

// --- Хранилище для useSyncExternalStore ---

let current = typeof window === "undefined" ? DEFAULT_APPEARANCE : readAppearance();
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

export function setAppearance(patch) {
  const next = { ...current, ...patch };
  for (const name of Object.keys(VALID)) {
    if (!VALID[name].includes(next[name])) next[name] = DEFAULT_APPEARANCE[name];
    writeKey(KEYS[name], next[name] === DEFAULT_APPEARANCE[name] ? null : next[name]);
  }
  next.sidebarCollapsed = Boolean(next.sidebarCollapsed);
  writeKey(KEYS.sidebarCollapsed, next.sidebarCollapsed ? "1" : null);
  // «Системная» тема хранится явно, чтобы человек видел, что выбрал её сам.
  if (next.theme === "system") writeKey(KEYS.theme, "system");
  current = next;
  applyAppearance(current);
  emit();
}

export function resetAppearance() {
  setAppearance({ ...DEFAULT_APPEARANCE });
}

if (typeof window !== "undefined") {
  applyAppearance(current);

  // Системная тема меняется на лету, пока выбрана «как в системе».
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (current.theme === "system") applyAppearance(current);
    });

  // Другая вкладка поменяла настройку: подхватываем.
  window.addEventListener("storage", (event) => {
    if (event.key && !Object.values(KEYS).includes(event.key)) return;
    current = readAppearance();
    applyAppearance(current);
    emit();
  });
}

export function useAppearance() {
  const appearance = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_APPEARANCE);
  const update = useCallback((patch) => setAppearance(patch), []);
  const reset = useCallback(() => resetAppearance(), []);
  return { appearance, setAppearance: update, resetAppearance: reset };
}
