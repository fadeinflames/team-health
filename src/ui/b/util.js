// Общие помощники набора B: классы, ссылки, иконки, фокус, движение.
import { createElement, isValidElement } from "react";

export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function setRef(ref, node) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

export function mergeRefs(...refs) {
  return (node) => refs.forEach((ref) => setRef(ref, node));
}

// Иконку можно передать и элементом (<Search />), и самим компонентом (Search).
export function renderIcon(icon, props) {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  if (typeof icon === "function" || (typeof icon === "object" && icon.$$typeof)) return createElement(icon, props);
  return icon;
}

export function joinIds(...ids) {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

export const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export function getFocusable(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.closest("[inert],[hidden]") && el.getClientRects().length > 0
  );
}

// Движение выключено системной настройкой или своей настройкой «Уменьшить движение».
export function motionReduced() {
  if (typeof window === "undefined") return true;
  return (
    document.documentElement.getAttribute("data-motion") === "reduced" ||
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}
