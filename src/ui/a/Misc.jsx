import { isValidElement } from "react";
import { ChevronLeft } from "lucide-react";
import { cx, cssSize, renderIcon } from "./util.js";
import { Button } from "./Button.jsx";

// Скелетон: мягкое мерцание вместо спиннера. lines > 1: несколько строк текста,
// последняя короче. Для читалок скрыт: статус загрузки объявляет контейнер.
export function Skeleton({ width, height, radius, lines, className, style, ...rest }) {
  const count = Number(lines) > 0 ? Math.floor(lines) : 0;
  if (count > 1) {
    return (
      <span className={cx("ui-skeleton-lines", className)} style={{ width: cssSize(width), ...style }} aria-hidden="true" {...rest}>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="ui-skeleton"
            style={{ height: cssSize(height), borderRadius: radius != null ? cssSize(radius) : undefined, width: i === count - 1 ? "62%" : undefined }}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      className={cx("ui-skeleton", className)}
      style={{ width: cssSize(width), height: cssSize(height), borderRadius: radius != null ? cssSize(radius) : undefined, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}

// Пустое состояние: иконка в тонированном круге, заголовок, пояснение, действие.
export function EmptyState({ icon, title, description, action, className, ...rest }) {
  return (
    <div className={cx("ui-empty", className)} {...rest}>
      {icon ? (
        <span className="ui-empty__icon" aria-hidden="true">
          {renderIcon(icon)}
        </span>
      ) : null}
      {title ? <h3 className="ui-empty__title">{title}</h3> : null}
      {description ? <p className="ui-empty__text">{description}</p> : null}
      {action ? <div className="ui-empty__action">{action}</div> : null}
    </div>
  );
}

// Шапка страницы. back: готовый элемент или { label, href, onClick }.
export function PageHeader({ title, subtitle, eyebrow, actions, back, className, ...rest }) {
  const backNode = !back ? null : isValidElement(back) ? (
    back
  ) : (
    <Button variant="plain" size="sm" icon={ChevronLeft} href={back.href} onClick={back.onClick} className="ui-pageheader__back">
      {back.label || "Назад"}
    </Button>
  );
  return (
    <header className={cx("ui-pageheader", className)} {...rest}>
      {backNode}
      <div className="ui-pageheader__row">
        <div className="ui-pageheader__text">
          {eyebrow ? <p className="ui-pageheader__eyebrow">{eyebrow}</p> : null}
          <h1 className="ui-pageheader__title">{title}</h1>
          {subtitle ? <p className="ui-pageheader__sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ui-pageheader__actions">{actions}</div> : null}
      </div>
    </header>
  );
}

// Разделитель. inset: с отступом слева (как у строк списка).
export function Divider({ inset = false, className, ...rest }) {
  return <hr className={cx("ui-divider", inset && "ui-divider--inset", className)} {...rest} />;
}

// Клавиша для подсказок: <Kbd>⌘</Kbd> <Kbd>K</Kbd>.
export function Kbd({ children, className, ...rest }) {
  return (
    <kbd className={cx("ui-kbd", className)} {...rest}>
      {children}
    </kbd>
  );
}
