import { cloneElement, createElement, isValidElement } from "react";

// Склейка имён классов без внешних зависимостей.
export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Иконку можно передать и готовым элементом (<Plus />), и самим компонентом (Plus).
// Штрих везде 1.75, размер задаёт CSS слота (в rem, поэтому «Крупный текст»
// масштабирует и иконки).
export function renderIcon(icon, props = {}) {
  if (!icon) return null;
  const base = { strokeWidth: 1.75, "aria-hidden": true, focusable: "false", ...props };
  if (isValidElement(icon)) return cloneElement(icon, { ...base, ...icon.props });
  if (typeof icon === "function" || (typeof icon === "object" && icon.$$typeof)) return createElement(icon, base);
  return null;
}

// px из API (size=40) превращаем в rem: аватары и графики растут вместе с текстом.
export function rem(px) {
  return `${Number(px) / 16}rem`;
}

// Размер из пропса: число = px (в rem), строка берётся как есть (например, "100%").
export function cssSize(value) {
  if (value == null) return undefined;
  return typeof value === "number" ? rem(value) : value;
}
