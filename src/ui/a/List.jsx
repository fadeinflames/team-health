import { createContext, useContext } from "react";
import { ChevronRight } from "lucide-react";
import { cx, renderIcon } from "./util.js";
import { IconTile } from "./Badge.jsx";

const GroupContext = createContext(false);

// Подпись секции над содержимым (13px, 600, серый, обычный регистр), справа действие.
// hint: короткое пояснение под подписью.
export function Section({ title, hint, action, headingAs: Heading = "h2", className, children, ...rest }) {
  return (
    <section className={cx("ui-section", className)} {...rest}>
      {title || action ? (
        <div className="ui-section__head">
          {title ? <Heading className="ui-section__title">{title}</Heading> : <span />}
          {action ? <div className="ui-section__action">{action}</div> : null}
        </div>
      ) : null}
      {hint ? <p className="ui-section__hint">{hint}</p> : null}
      {children}
    </section>
  );
}

// Сгруппированный список. inset=true: поверхность с радиусом и тенью; false: во всю
// ширину, без радиуса и тени (например, внутри карточки или на узком экране).
export function ListGroup({ inset = true, className, children, ...rest }) {
  return (
    <GroupContext.Provider value={true}>
      <div role="list" className={cx("ui-list", !inset && "ui-list--flush", className)} {...rest}>
        {children}
      </div>
    </GroupContext.Provider>
  );
}

// Строка списка. Есть onClick или href: это <button> / <a> с hover, press и фокусом,
// иначе обычный <div>. leading: свой элемент слева (например, <Avatar size={36} decorative />),
// слот шириной 36px; icon: иконка в тонированном квадрате.
export function ListRow({
  icon,
  iconTone = "accent",
  leading,
  title,
  subtitle,
  meta,
  trailing,
  chevron = false,
  active = false,
  onClick,
  href,
  as,
  className,
  children,
  ...rest
}) {
  const inGroup = useContext(GroupContext);
  const interactive = Boolean(onClick || href);
  const Tag = as || (href ? "a" : onClick ? "button" : "div");
  const hasLead = Boolean(icon || leading);

  const extra = {};
  if (Tag === "button" && !rest.type) extra.type = "button";
  if (href) extra.href = href;
  if (onClick) extra.onClick = onClick;
  if (active) extra["aria-current"] = "true";

  const row = (
    <Tag
      className={cx("ui-row", interactive && "ui-row--interactive", active && "ui-row--active", className)}
      {...extra}
      {...rest}
    >
      {hasLead ? (
        <span className="ui-row__lead">{icon ? <IconTile icon={icon} tone={iconTone} /> : leading}</span>
      ) : null}
      <span className="ui-row__body">
        {title != null ? <span className="ui-row__title">{title}</span> : null}
        {subtitle != null ? <span className="ui-row__sub">{subtitle}</span> : null}
        {children}
      </span>
      {meta != null ? <span className="ui-row__meta">{meta}</span> : null}
      {trailing != null ? <span className="ui-row__trailing">{trailing}</span> : null}
      {chevron ? <span className="ui-row__chevron">{renderIcon(ChevronRight)}</span> : null}
    </Tag>
  );

  if (!inGroup) return row;
  return (
    <div role="listitem" className={cx("ui-list__item", hasLead && "ui-list__item--lead")}>
      {row}
    </div>
  );
}
