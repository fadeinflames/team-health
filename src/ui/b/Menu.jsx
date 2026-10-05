import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx, getFocusable, mergeRefs, renderIcon } from "./util.js";

const GAP = 6;
const EDGE = 8;

/* ---------------------------------------------------------------------------
   Плавающая панель: портал в body, позиция по триггеру (fixed), переворот
   вверх при нехватке места снизу, зажим по краям окна, закрытие по клику снаружи
   и по Escape. Меню и поповер собираются поверх неё.
   ------------------------------------------------------------------------- */
function FloatingPanel({ open, onDismiss, triggerRef, panelRef, align, className, children, ...props }) {
  useLayoutEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      panel.style.maxHeight = "none";
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const below = vh - rect.bottom - GAP - EDGE;
      const above = rect.top - GAP - EDGE;
      const flip = height > below && above > below;
      const room = Math.max(flip ? above : below, 120);
      const shown = Math.min(height, room);
      const top = flip ? rect.top - GAP - shown : rect.bottom + GAP;
      let left = align === "end" ? rect.right - width : rect.left;
      left = Math.max(EDGE, Math.min(left, vw - width - EDGE));
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.style.maxHeight = `${Math.floor(room)}px`;
      panel.setAttribute("data-placement", `${flip ? "top" : "bottom"}-${align}`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open, align, triggerRef, panelRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      onDismiss({ restore: false });
    };
    // Capture: меню внутри диалога должно перехватить Escape раньше диалога.
    const onKey = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onDismiss({ restore: true });
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onDismiss, triggerRef, panelRef]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div {...props} ref={panelRef} className={cx("ui-float", className)} data-placement={`bottom-${align}`}>
      {children}
    </div>,
    document.body
  );
}

// Склеивает свойства триггера с собственными обработчиками элемента.
function chain(own, ours) {
  return (event) => {
    own?.(event);
    if (!event.defaultPrevented) ours(event);
  };
}

function renderTrigger(trigger, { ref, props, open }) {
  if (typeof trigger === "function") return trigger({ ref, props, open });
  if (!isValidElement(trigger)) return trigger;
  const own = trigger.props;
  return cloneElement(trigger, {
    ...props,
    id: own.id ?? props.id,
    onClick: chain(own.onClick, props.onClick),
    onKeyDown: chain(own.onKeyDown, props.onKeyDown),
    ref: mergeRefs(ref, own.ref)
  });
}

/* --------------------------------------------------------------------- Menu */

// Меню-поповер (APG «Menu Button»). Пункт: { id, label, icon, onSelect, tone, disabled, shortcut }
// или строка "separator". trigger: элемент-кнопка или ({ ref, props, open }) => элемент.
export function Menu({ trigger, items = [], align = "start", label, className }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const focusTarget = useRef("first");
  const typeahead = useRef({ text: "", timer: 0 });
  const auto = useId();
  const menuId = `ui-menu-${auto}`;
  const triggerId = `ui-menu-trigger-${auto}`;

  const enabledItems = () => Array.from(panelRef.current?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') || []);

  const close = useCallback(({ restore = true } = {}) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    const list = enabledItems();
    const target = focusTarget.current === "last" ? list[list.length - 1] : list[0];
    (target || panelRef.current)?.focus({ preventScroll: true });
  }, [open]);

  const openWith = (where) => {
    focusTarget.current = where;
    setOpen(true);
  };

  const triggerProps = {
    id: triggerId,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => {
      if (open) close({ restore: false });
      else openWith("first");
    },
    onKeyDown: (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        openWith("first");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        openWith("last");
      }
    }
  };

  const move = (event, list, index) => {
    event.preventDefault();
    list[(index + list.length) % list.length]?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event) => {
    const list = enabledItems();
    const index = list.indexOf(document.activeElement);
    switch (event.key) {
      case "ArrowDown":
        move(event, list, index + 1);
        break;
      case "ArrowUp":
        move(event, list, index < 0 ? list.length - 1 : index - 1);
        break;
      case "Home":
        move(event, list, 0);
        break;
      case "End":
        move(event, list, list.length - 1);
        break;
      case "Tab":
        close({ restore: true });
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== " ") {
          const state = typeahead.current;
          clearTimeout(state.timer);
          state.text += event.key.toLowerCase();
          state.timer = setTimeout(() => (state.text = ""), 600);
          const ordered = [...list.slice(index + 1), ...list.slice(0, index + 1)];
          const match = ordered.find((el) => el.textContent.trim().toLowerCase().startsWith(state.text));
          if (match) match.focus({ preventScroll: true });
        }
    }
  };

  useEffect(() => () => clearTimeout(typeahead.current.timer), []);

  return (
    <>
      {renderTrigger(trigger, { ref: triggerRef, props: triggerProps, open })}
      <FloatingPanel
        open={open}
        onDismiss={close}
        triggerRef={triggerRef}
        panelRef={panelRef}
        align={align}
        className={cx("ui-menu", className)}
        id={menuId}
        role="menu"
        aria-labelledby={label ? undefined : triggerRef.current?.id || triggerId}
        aria-label={label}
        aria-orientation="vertical"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {items.map((item, index) => {
          if (item === "separator") return <div key={`sep-${index}`} role="separator" className="ui-menu__sep" />;
          return (
            <button
              key={item.id ?? index}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={cx("ui-menu__item", item.tone === "danger" && "ui-menu__item--danger")}
              aria-disabled={item.disabled ? "true" : undefined}
              onClick={() => {
                if (item.disabled) return;
                close({ restore: true });
                item.onSelect?.();
              }}
            >
              <span className="ui-menu__icon">{renderIcon(item.icon, { size: 18, strokeWidth: 1.75, "aria-hidden": true })}</span>
              <span className="ui-menu__label">{item.label}</span>
              {item.shortcut ? <kbd className="ui-menu__shortcut">{item.shortcut}</kbd> : null}
            </button>
          );
        })}
      </FloatingPanel>
    </>
  );
}

/* ------------------------------------------------------------------ Popover */

// Не модальный поповер с произвольным содержимым (role="dialog"). children
// можно передать функцией ({ close }) => узел. Escape и клик снаружи закрывают.
export function Popover({ trigger, children, align = "start", label, className }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const auto = useId();
  const panelId = `ui-popover-${auto}`;
  const triggerId = `ui-popover-trigger-${auto}`;

  const close = useCallback(({ restore = true } = {}) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (getFocusable(panel)[0] || panel)?.focus({ preventScroll: true });
  }, [open]);

  const triggerProps = {
    id: triggerId,
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": open ? panelId : undefined,
    onClick: () => (open ? close({ restore: false }) : setOpen(true)),
    onKeyDown: (event) => {
      // Панель лежит в конце body: Tab с триггера переводим в неё вручную.
      if (open && event.key === "Tab" && !event.shiftKey) {
        const panel = panelRef.current;
        if (!panel) return;
        event.preventDefault();
        (getFocusable(panel)[0] || panel).focus({ preventScroll: true });
      }
    }
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const items = getFocusable(panelRef.current);
    const active = document.activeElement;
    const atStart = !items.length || active === items[0] || active === panelRef.current;
    const atEnd = !items.length || active === items[items.length - 1];
    if (event.shiftKey && atStart) {
      event.preventDefault();
      close({ restore: true });
    } else if (!event.shiftKey && atEnd) {
      close({ restore: true });
    }
  };

  return (
    <>
      {renderTrigger(trigger, { ref: triggerRef, props: triggerProps, open })}
      <FloatingPanel
        open={open}
        onDismiss={close}
        triggerRef={triggerRef}
        panelRef={panelRef}
        align={align}
        className={cx("ui-popover", className)}
        id={panelId}
        role="dialog"
        aria-label={label}
        aria-labelledby={label ? undefined : triggerRef.current?.id || triggerId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {typeof children === "function" ? children({ close }) : children}
      </FloatingPanel>
    </>
  );
}
