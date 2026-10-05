import { useId } from "react";
import { cx, rem } from "./util.js";

function clampValue(value, max) {
  const m = Number(max) > 0 ? Number(max) : 100;
  const v = Number.isFinite(Number(value)) ? Number(value) : 0;
  const clamped = Math.min(Math.max(v, 0), m);
  return { v: clamped, m, pct: (clamped / m) * 100 };
}

// Линейный индикатор. role="progressbar" с именем: label (видимая подпись) или aria-label.
export function ProgressBar({
  value = 0,
  max = 100,
  tone = "accent",
  label,
  showValue = false,
  size = "md",
  className,
  "aria-label": ariaLabel,
  ...rest
}) {
  const id = useId();
  const { v, m, pct } = clampValue(value, max);
  const percent = Math.round(pct);

  return (
    <div className={cx("ui-progress", `ui-tone--${tone}`, size === "sm" && "ui-progress--sm", className)} {...rest}>
      {label || showValue ? (
        <div className="ui-progress__head">
          {label ? (
            <span id={id} className="ui-progress__label">
              {label}
            </span>
          ) : (
            <span />
          )}
          {showValue ? <span className="ui-progress__value num">{percent}%</span> : null}
        </div>
      ) : null}
      <div
        className="ui-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={m}
        aria-valuenow={v}
        aria-valuetext={`${percent}%`}
        aria-labelledby={label ? id : undefined}
        aria-label={label ? undefined : ariaLabel || "Прогресс"}
      >
        <span className="ui-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Кольцо прогресса со скруглёнными концами; children стоят в центре (обычно число).
// size и stroke в px (в rem), геометрия кольца масштабируется вместе.
export function ProgressRing({
  value = 0,
  max = 100,
  size = 96,
  stroke = 10,
  tone = "accent",
  label,
  className,
  style,
  children,
  "aria-label": ariaLabel,
  ...rest
}) {
  const { v, m, pct } = clampValue(value, max);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const percent = Math.round(pct);

  return (
    <div
      className={cx("ui-ring", `ui-tone--${tone}`, className)}
      style={{ "--ui-ring-size": rem(size), ...style }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={m}
      aria-valuenow={v}
      aria-valuetext={`${percent}%`}
      aria-label={label || ariaLabel || "Прогресс"}
      {...rest}
    >
      <svg className="ui-ring__svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle className="ui-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="ui-ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ opacity: pct > 0 ? 1 : 0 }}
        />
      </svg>
      {children != null ? <div className="ui-ring__center">{children}</div> : null}
    </div>
  );
}
