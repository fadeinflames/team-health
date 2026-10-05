import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx, getFocusable, motionReduced } from "./util.js";

/* ---------------------------------------------------------------------------
   Общее поведение модальных окон: стек (Escape закрывает верхнее), блокировка
   прокрутки страницы, inert для остальной страницы, ловушка фокуса и возврат
   фокуса. Диалог и шторка отличаются только видом.
   ------------------------------------------------------------------------- */

const stack = [];
let lockCount = 0;

function lockScroll() {
  const root = document.documentElement;
  if (lockCount === 0) {
    const gap = Math.max(0, window.innerWidth - root.clientWidth);
    root.style.setProperty("--ui-scrollbar-w", `${gap}px`);
    root.setAttribute("data-ui-scroll-lock", "");
  }
  lockCount += 1;
  return () => {
    lockCount -= 1;
    if (lockCount === 0) {
      root.removeAttribute("data-ui-scroll-lock");
      root.style.removeProperty("--ui-scrollbar-w");
    }
  };
}

// Всё остальное в body становится inert: ни фокуса, ни кликов, ни читалки.
// Область уведомлений (data-ui-keep) остаётся живой.
function inertOthers(overlay) {
  const changed = [];
  Array.from(document.body.children).forEach((el) => {
    if (el === overlay || el.hasAttribute("data-ui-keep")) return;
    if (["SCRIPT", "STYLE", "LINK"].includes(el.tagName)) return;
    if (!el.inert) {
      el.inert = true;
      changed.push(el);
    }
  });
  return () => changed.forEach((el) => (el.inert = false));
}

// Держит окно в DOM на время анимации закрытия.
function usePresence(open, ms) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    if (!mounted) return undefined;
    const timer = setTimeout(() => setMounted(false), motionReduced() ? 0 : ms);
    return () => clearTimeout(timer);
  }, [open, mounted, ms]);
  return { visible: open || mounted, closing: !open };
}

function Modal({
  variant,
  side,
  size,
  role = "dialog",
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  initialFocusRef,
  className,
  ...rest
}) {
  const { visible, closing } = usePresence(open, 240);
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const footerRef = useRef(null);
  const pressedBackdrop = useRef(false);
  const live = useRef({});
  live.current = { onClose, dismissible, initialFocusRef };
  const auto = useId();
  const titleId = `ui-modal-title-${auto}`;
  const descId = `ui-modal-desc-${auto}`;

  useEffect(() => {
    if (!open) return undefined;
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return undefined;

    const opener = document.activeElement;
    const entry = {};
    stack.push(entry);
    const unlock = lockScroll();
    const restoreInert = inertOthers(overlay);

    const target =
      live.current.initialFocusRef?.current ||
      panel.querySelector("[data-autofocus]") ||
      getFocusable(bodyRef.current)[0] ||
      getFocusable(footerRef.current)[0] ||
      panel.querySelector(".ui-dialog__close") ||
      panel;
    target.focus({ preventScroll: true });

    const onKey = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (stack[stack.length - 1] !== entry) return;
      if (live.current.dismissible) {
        event.preventDefault();
        live.current.onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(entry), 1);
      unlock();
      restoreInert();
      if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!visible || typeof document === "undefined") return null;

  const handleKeyDown = (event) => {
    rest.onKeyDown?.(event);
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const panel = panelRef.current;
    if (!panel || !panel.contains(event.target)) return;
    const items = getFocusable(panel);
    if (!items.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const isSheet = variant === "sheet";
  const hasHeader = Boolean(title || description || dismissible);

  return createPortal(
    <div
      ref={overlayRef}
      className={cx("ui-overlay", isSheet && `ui-overlay--sheet-${side}`)}
      data-state={closing ? "closing" : "open"}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedBackdrop.current && live.current.dismissible) {
          live.current.onClose?.();
        }
        pressedBackdrop.current = false;
      }}
    >
      <div
        {...rest}
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          "ui-dialog",
          isSheet ? `ui-sheet ui-sheet--${side}` : `ui-dialog--${size}`,
          className
        )}
        onKeyDown={handleKeyDown}
      >
        <div className="ui-dialog__grab" aria-hidden="true" />
        {hasHeader ? (
          <header className="ui-dialog__header">
            <div className="ui-dialog__heading">
              {title ? (
                <h2 className="ui-dialog__title" id={titleId}>
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="ui-dialog__desc" id={descId}>
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <button type="button" className="ui-dialog__close" aria-label="Закрыть" onClick={() => onClose?.()}>
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            ) : null}
          </header>
        ) : null}
        {children ? (
          <div className="ui-dialog__body" ref={bodyRef}>
            {children}
          </div>
        ) : null}
        {footer ? (
          <footer className="ui-dialog__footer" ref={footerRef}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

// Центрированное модальное окно; на экранах уже 760px превращается в нижнюю шторку.
export function Dialog({ size = "sm", ...props }) {
  return <Modal variant="dialog" size={size} {...props} />;
}

// Шторка: снизу (по умолчанию) или справа (панель 420px).
export function Sheet({ side = "bottom", ...props }) {
  return <Modal variant="sheet" side={side} {...props} />;
}

// Готовое подтверждение. Для tone="danger" фокус по умолчанию на «Отмена».
// Закрытие (Escape, scrim, крестик) вызывает onCancel; закрывать окно после
// onConfirm должен вызывающий код.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  tone = "default",
  onConfirm,
  onCancel,
  children,
  ...rest
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  return (
    <Dialog
      {...rest}
      role="alertdialog"
      size="sm"
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      initialFocusRef={tone === "danger" ? cancelRef : confirmRef}
      footer={
        <>
          <button ref={cancelRef} type="button" className="ui-b-btn ui-b-btn--neutral" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={cx("ui-b-btn", tone === "danger" ? "ui-b-btn--danger" : "ui-b-btn--primary")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
