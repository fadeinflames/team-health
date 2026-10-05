import { cx } from "./util.js";
import { IconTile } from "./Badge.jsx";

const NATIVE = new Set(["button", "a"]);

// Карточка: поверхность, большой радиус, мягкая тень, без рамки.
// Внутри карточки карточек не бывает: для списков берите ListGroup (inset={false}).
export function Card({
  as: Tag = "section",
  padded = true,
  interactive = false,
  tone = "default",
  className,
  children,
  onKeyDown,
  ...rest
}) {
  const native = typeof Tag === "string" && NATIVE.has(Tag);
  const clickable = interactive && !native && typeof rest.onClick === "function";

  const handleKeyDown = (event) => {
    onKeyDown?.(event);
    if (!clickable || event.defaultPrevented || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  const extra = {};
  if (Tag === "button" && !rest.type) extra.type = "button";
  if (clickable) {
    extra.tabIndex = 0;
    extra.role = "button";
  }

  return (
    <Tag
      className={cx(
        "ui-card",
        padded && "ui-card--padded",
        interactive && "ui-card--interactive",
        tone !== "default" && `ui-card--${tone}`,
        className
      )}
      onKeyDown={handleKeyDown}
      {...extra}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Шапка карточки: иконка в тонированном квадрате, заголовок, подзаголовок, действие справа.
export function CardHeader({ title, subtitle, icon, iconTone = "accent", action, headingAs: Heading = "h3", className, ...rest }) {
  return (
    <div className={cx("ui-cardhead", className)} {...rest}>
      {icon ? <IconTile icon={icon} tone={iconTone} /> : null}
      <div className="ui-cardhead__text">
        <Heading className="ui-cardhead__title">{title}</Heading>
        {subtitle ? <p className="ui-cardhead__sub">{subtitle}</p> : null}
      </div>
      {action ? <div className="ui-cardhead__action">{action}</div> : null}
    </div>
  );
}
