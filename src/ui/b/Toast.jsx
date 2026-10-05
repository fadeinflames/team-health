import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cx, motionReduced } from "./util.js";

const ToastContext = createContext(null);

const MAX_VISIBLE = 3;
const LEAVE_MS = 220;
const ICONS = { default: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

let warned = false;
const fallback = {
  toast: () => {
    if (!warned) {
      warned = true;
      console.warn("useToast вызван вне ToastProvider: уведомление не показано.");
    }
    return null;
  },
  dismiss: () => {}
};

// toast({ title, description, tone, duration, action: { label, onClick } }) → id
// dismiss(id). Ошибки (tone="danger") по умолчанию не исчезают сами.
export function useToast() {
  return useContext(ToastContext) || fallback;
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const counter = useRef(0);

  const remove = useCallback((id) => setItems((prev) => prev.filter((item) => item.id !== id)), []);

  const dismiss = useCallback(
    (id) => {
      if (motionReduced()) {
        remove(id);
        return;
      }
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
      setTimeout(() => remove(id), LEAVE_MS);
    },
    [remove]
  );

  const toast = useCallback((options) => {
    const opts = typeof options === "string" ? { title: options } : options || {};
    counter.current += 1;
    const id = `toast-${counter.current}`;
    const tone = opts.tone || "default";
    const item = {
      id,
      title: opts.title,
      description: opts.description,
      tone,
      duration: opts.duration ?? (tone === "danger" ? 0 : 4000),
      action: opts.action
    };
    setItems((prev) => {
      const next = [...prev, item];
      while (next.length > MAX_VISIBLE) {
        const index = next.findIndex((entry) => entry.tone !== "danger");
        next.splice(index === -1 ? 0 : index, 1);
      }
      return next;
    });
    return id;
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  const alerts = items.filter((item) => item.tone === "danger");
  const statuses = items.filter((item) => item.tone !== "danger");

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div className="ui-toasts" data-ui-keep="">
              <div className="ui-toasts__region" role="alert" aria-live="assertive" aria-atomic="false">
                {alerts.map((item) => (
                  <ToastItem key={item.id} item={item} onDismiss={dismiss} />
                ))}
              </div>
              <div className="ui-toasts__region" role="status" aria-live="polite" aria-atomic="false">
                {statuses.map((item) => (
                  <ToastItem key={item.id} item={item} onDismiss={dismiss} />
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  );
}

function ToastItem({ item, onDismiss }) {
  const Icon = ICONS[item.tone] || Info;
  const remaining = useRef(item.duration);
  const startedAt = useRef(0);
  const timer = useRef(0);
  const held = useRef({ hover: false, focus: false });

  const start = useCallback(() => {
    if (!item.duration) return;
    clearTimeout(timer.current);
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(item.id), Math.max(remaining.current, 600));
  }, [item.duration, item.id, onDismiss]);

  const pause = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = 0;
    remaining.current -= Date.now() - startedAt.current;
  }, []);

  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
  }, [start]);

  const hold = (kind, value) => {
    held.current[kind] = value;
    if (held.current.hover || held.current.focus) pause();
    else start();
  };

  return (
    <div
      className={cx("ui-toast")}
      data-tone={item.tone}
      data-state={item.leaving ? "leaving" : "open"}
      onPointerEnter={() => hold("hover", true)}
      onPointerLeave={() => hold("hover", false)}
      onFocus={() => hold("focus", true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) hold("focus", false);
      }}
    >
      <span className="ui-toast__icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <div className="ui-toast__body">
        {item.title ? <p className="ui-toast__title">{item.title}</p> : null}
        {item.description ? <p className="ui-toast__desc">{item.description}</p> : null}
      </div>
      {item.action ? (
        <button
          type="button"
          className="ui-toast__action"
          onClick={() => {
            item.action.onClick?.();
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      ) : null}
      <button type="button" className="ui-toast__close" aria-label="Закрыть уведомление" onClick={() => onDismiss(item.id)}>
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
