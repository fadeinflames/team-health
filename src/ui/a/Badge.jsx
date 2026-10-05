import { cx, renderIcon } from "./util.js";

// Иконка в тонированном квадрате (36px, радиус --r-sm): для строк списка и шапок карточек.
// tone: accent | neutral | success | warning | danger | info.
export function IconTile({ icon, tone = "accent", size = "md", className, ...rest }) {
  return (
    <span className={cx("ui-tile", `ui-tone--${tone}`, size === "sm" && "ui-tile--sm", className)} aria-hidden="true" {...rest}>
      {renderIcon(icon)}
    </span>
  );
}

// Мягкая плашка: фон -tint, текст -text. Смысл несёт текст, а не только цвет.
export function Badge({ tone = "neutral", size = "md", icon, dot = false, className, children, ...rest }) {
  return (
    <span className={cx("ui-badge", `ui-tone--${tone}`, size === "sm" && "ui-badge--sm", className)} {...rest}>
      {dot ? <span className="ui-badge__dot" aria-hidden="true" /> : null}
      {icon ? <span className="ui-badge__icon">{renderIcon(icon)}</span> : null}
      {children}
    </span>
  );
}

// Точка статуса 8px. Если задан label, это картинка с именем; без него декоративная.
export function StatusDot({ tone = "neutral", pulse = false, label, className, ...rest }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return <span className={cx("ui-dot", `ui-tone--${tone}`, pulse && "ui-dot--pulse", className)} {...a11y} {...rest} />;
}
