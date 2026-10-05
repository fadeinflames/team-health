import { useId, useLayoutEffect, useRef } from "react";
import { cx, mergeRefs, renderIcon } from "./util.js";
import { useSlidingIndicator } from "./useSlidingIndicator.js";

// Сегментированный контроль как в iOS: дорожка, «поднятый» активный сегмент,
// который переезжает под выбранный вариант. Внутри настоящие radio с общим name:
// стрелки меняют выбор (нативно), Home/End добавлены.
//
//   <Segmented ariaLabel="Период" value={v} onChange={setV} options={[{ value: "week", label: "Неделя" }]} />
//
// onChange(value: string, event). Остальные свойства и ref: на корневой radiogroup.
export function Segmented({
  options = [],
  value,
  onChange,
  size = "md",
  fullWidth = false,
  ariaLabel,
  name,
  className,
  ref,
  onKeyDown,
  ...rest
}) {
  const auto = useId();
  const groupName = name || `ui-seg-${auto}`;
  const rootRef = useRef(null);
  const activeIndex = options.findIndex((option) => option.value === value);

  useSlidingIndicator(rootRef, ".ui-seg__item[data-active='true']", `${value}|${options.length}`);

  // Выбранный сегмент всегда виден, если контрол прокручивается по горизонтали.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const active = root?.querySelector(".ui-seg__item[data-active='true']");
    if (!root || !active || root.scrollWidth <= root.clientWidth) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < root.scrollLeft) root.scrollLeft = left - 4;
    else if (right > root.scrollLeft + root.clientWidth) root.scrollLeft = right - root.clientWidth + 4;
  }, [value]);

  const handleKeyDown = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || (event.key !== "Home" && event.key !== "End")) return;
    const enabled = options.filter((option) => !option.disabled);
    if (!enabled.length) return;
    const target = event.key === "Home" ? enabled[0] : enabled[enabled.length - 1];
    event.preventDefault();
    if (target.value !== value) onChange?.(target.value, event);
    const inputs = rootRef.current?.querySelectorAll("input[type='radio']");
    const index = options.indexOf(target);
    inputs?.[index]?.focus();
  };

  return (
    <div
      {...rest}
      ref={mergeRefs(ref, rootRef)}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx("ui-seg", size === "sm" && "ui-seg--sm", fullWidth && "ui-seg--full", className)}
      data-active-index={activeIndex}
      onKeyDown={handleKeyDown}
    >
      <span className="ui-seg__thumb" aria-hidden="true" />
      {options.map((option) => (
        <label
          key={option.value}
          className={cx("ui-seg__item", option.disabled && "is-disabled")}
          data-active={option.value === value ? "true" : "false"}
        >
          <input
            className="ui-seg__input"
            type="radio"
            name={groupName}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={(event) => {
              if (option.value !== value) onChange?.(option.value, event);
            }}
          />
          <span className="ui-seg__label">
            {option.icon ? <span className="ui-seg__icon">{renderIcon(option.icon, { size: 18, strokeWidth: 1.75, "aria-hidden": true })}</span> : null}
            <span className="ui-seg__text">{option.label}</span>
            {option.badge !== undefined && option.badge !== null && option.badge !== "" ? (
              <span className="ui-seg__badge num">{option.badge}</span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}
