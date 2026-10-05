import { cx, renderIcon } from "./util.js";

// Кнопка. icon / iconRight: элемент (<Plus />) или компонент (Plus).
// loading: спиннер занимает место иконки, ширина кнопки не меняется;
// если иконки нет, спиннер встаёт по центру поверх невидимой подписи.
// href: кнопка-ссылка (<a>) с тем же видом.
export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  type = "button",
  href,
  disabled = false,
  className,
  children,
  ...rest
}) {
  const busy = Boolean(loading);
  const inactive = Boolean(disabled) || busy;
  const spinner = <span className="ui-spinner" aria-hidden="true" />;
  const spinnerAt = !busy ? null : icon ? "left" : iconRight ? "right" : "center";

  const left = spinnerAt === "left" ? spinner : renderIcon(icon);
  const right = spinnerAt === "right" ? spinner : renderIcon(iconRight);

  const classes = cx(
    "ui-btn",
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    fullWidth && "ui-btn--block",
    busy && "ui-btn--busy",
    spinnerAt === "center" && "ui-btn--busy-center",
    className
  );

  const content = (
    <>
      {left ? <span className="ui-btn__icon">{left}</span> : null}
      {children != null && children !== false ? <span className="ui-btn__label">{children}</span> : null}
      {right ? <span className="ui-btn__icon">{right}</span> : null}
      {spinnerAt === "center" ? <span className="ui-btn__spinner">{spinner}</span> : null}
    </>
  );

  if (href) {
    return (
      <a
        className={classes}
        href={inactive ? undefined : href}
        role={inactive ? "link" : undefined}
        aria-disabled={inactive || undefined}
        aria-busy={busy || undefined}
        {...rest}
      >
        {content}
      </a>
    );
  }

  return (
    <button className={classes} type={type} disabled={inactive} aria-busy={busy || undefined} {...rest}>
      {content}
    </button>
  );
}

// Круглая кнопка с иконкой. label обязателен: это и aria-label, и подсказка.
// Область нажатия не меньше 44px даже у маленькой (невидимое расширение).
export function IconButton({ label, icon, variant = "plain", size = "md", className, type = "button", ...rest }) {
  return (
    <button
      className={cx("ui-iconbtn", `ui-iconbtn--${variant}`, `ui-iconbtn--${size}`, className)}
      type={type}
      aria-label={label}
      title={label}
      {...rest}
    >
      {renderIcon(icon)}
    </button>
  );
}
