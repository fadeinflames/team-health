import { useEffect, useId, useRef, useState } from "react";
import { Check, Minus } from "lucide-react";
import { cx, joinIds, mergeRefs } from "./util.js";

/* ----------------------------------------------------------------- Checkbox */

// Настоящий <input type="checkbox"> с собственным видом. className уходит на
// корневую <label>, остальные свойства (checked, onChange(event), name…) и ref: на <input>.
export function Checkbox({ label, description, indeterminate = false, className, disabled, ref, ...input }) {
  const inputRef = useRef(null);
  const descId = useId();

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate, input.checked]);

  return (
    <label className={cx("ui-check", disabled && "ui-check--disabled", className)}>
      <input
        {...input}
        ref={mergeRefs(ref, inputRef)}
        type="checkbox"
        className="ui-check__input"
        disabled={disabled}
        aria-describedby={joinIds(input["aria-describedby"], description ? descId : undefined)}
      />
      <span className="ui-check__box" aria-hidden="true">
        <Check className="ui-check__mark ui-check__mark--check" size={16} strokeWidth={3} />
        <Minus className="ui-check__mark ui-check__mark--mixed" size={16} strokeWidth={3} />
      </span>
      {label || description ? (
        <span className="ui-check__text">
          {label ? <span className="ui-check__label">{label}</span> : null}
          {description ? (
            <span className="ui-check__desc" id={descId}>
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}

/* ------------------------------------------------------------------- Switch */

// Переключатель как в iOS. Это <input type="checkbox" role="switch">: пробел
// переключает, состояние читается как «включено/выключено».
// onChange(checked: boolean, event). Остальные свойства и ref: на <input>.
export function Switch({
  label,
  description,
  checked,
  defaultChecked = false,
  onChange,
  className,
  disabled,
  ref,
  ...input
}) {
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const on = checked !== undefined ? Boolean(checked) : inner;
  const descId = useId();
  const hasText = Boolean(label || description);

  return (
    <label className={cx("ui-switch", hasText && "ui-switch--text", disabled && "ui-switch--disabled", className)}>
      {hasText ? (
        <span className="ui-switch__text">
          {label ? <span className="ui-switch__label">{label}</span> : null}
          {description ? (
            <span className="ui-switch__desc" id={descId}>
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
      <input
        {...input}
        ref={ref}
        type="checkbox"
        role="switch"
        className="ui-switch__input"
        checked={on}
        disabled={disabled}
        aria-checked={on}
        aria-describedby={joinIds(input["aria-describedby"], description ? descId : undefined)}
        onChange={(event) => {
          setInner(event.target.checked);
          onChange?.(event.target.checked, event);
        }}
      />
      <span className="ui-switch__track" aria-hidden="true">
        <span className="ui-switch__thumb" />
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------- Slider */

// Ползунок на нативном <input type="range">. Заливка трека идёт через --ui-fill (0…1).
// onChange(value: number, event). Остальные свойства и ref: на <input>.
export function Slider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  showValue = false,
  unit = "",
  id,
  className,
  style,
  disabled,
  ref,
  ...input
}) {
  const auto = useId();
  const inputId = id || `ui-slider-${auto}`;
  const [inner, setInner] = useState(defaultValue ?? min);
  const current = Number(value !== undefined ? value : inner);
  const span = Number(max) - Number(min);
  const fill = span > 0 ? Math.min(1, Math.max(0, (current - Number(min)) / span)) : 0;
  const text = `${current}${unit ? (/^[%°]/.test(unit) ? "" : " ") + unit : ""}`;

  return (
    <div
      className={cx("ui-slider", !label && "ui-slider--bare", disabled && "ui-slider--disabled", className)}
      style={{ "--ui-fill": fill, ...style }}
    >
      {label ? (
        <label className="ui-slider__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      {showValue ? (
        <output className="ui-slider__value num" htmlFor={inputId}>
          {text}
        </output>
      ) : null}
      <input
        {...input}
        ref={ref}
        id={inputId}
        type="range"
        className="ui-slider__input"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={disabled}
        aria-valuetext={showValue || unit ? text : undefined}
        onChange={(event) => {
          const next = Number(event.target.value);
          setInner(next);
          onChange?.(next, event);
        }}
      />
    </div>
  );
}
