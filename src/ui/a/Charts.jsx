import { useId } from "react";
import { cx, cssSize } from "./util.js";

const PAD = 4; // поля внутри viewBox: чтобы линия и точка не обрезались

const fmt = (n) => Math.round(n * 100) / 100;

// Плавная монотонная кубическая кривая (Фритч-Карлсон): проходит через все точки и
// не «перелетает» между ними, поэтому на графике не появляется ложных пиков.
function monotonePath(points) {
  const n = points.length;
  if (n < 2) return "";
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = (points[i + 1].y - points[i].y) / dx[i];
  }
  const tangent = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      tangent[i] = tau * a * slope[i];
      tangent[i + 1] = tau * b * slope[i];
    }
  }
  let d = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += ` C${fmt(points[i].x + h)} ${fmt(points[i].y + tangent[i] * h)} ${fmt(points[i + 1].x - h)} ${fmt(
      points[i + 1].y - tangent[i + 1] * h
    )} ${fmt(points[i + 1].x)} ${fmt(points[i + 1].y)}`;
  }
  return d;
}

function numberText(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10).replace(".", ",");
}

// Плавный спарклайн: кривая, градиентная заливка под ней, последняя точка выделена.
// Пустые данные и одно значение рисуются без ошибок (пунктир или ровная линия).
export function Sparkline({
  data = [],
  width = 120,
  height = 36,
  tone = "accent",
  fill = true,
  min,
  max,
  label,
  className,
  style,
  ...rest
}) {
  const gradientId = `ui-spark-${useId().replace(/\W/g, "")}`;
  const values = (Array.isArray(data) ? data : []).map(Number).filter(Number.isFinite);
  const w = Number(width) > 0 ? Number(width) : 120;
  const h = Number(height) > 0 ? Number(height) : 36;
  const box = { width: cssSize(w), height: cssSize(h), ...style };
  const classes = cx("ui-spark", `ui-tone--${tone}`, className);

  if (!values.length) {
    return (
      <svg className={classes} style={box} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label || "Нет данных"} {...rest}>
        <line className="ui-spark__empty" x1={PAD} x2={w - PAD} y1={h / 2} y2={h / 2} />
      </svg>
    );
  }

  const lo = Number.isFinite(Number(min)) && min != null ? Number(min) : Math.min(...values);
  const hi = Number.isFinite(Number(max)) && max != null ? Number(max) : Math.max(...values);
  const span = hi - lo;
  const innerW = w - PAD * 2;
  const innerH = h - PAD * 2;
  const yOf = (value) => {
    if (!(span > 0)) return h / 2;
    const clamped = Math.min(Math.max(value, lo), hi);
    return PAD + (1 - (clamped - lo) / span) * innerH;
  };

  let points;
  if (values.length === 1) {
    points = [
      { x: PAD, y: yOf(values[0]) },
      { x: w - PAD, y: yOf(values[0]) }
    ];
  } else {
    points = values.map((value, i) => ({ x: PAD + (innerW * i) / (values.length - 1), y: yOf(value) }));
  }

  const line = monotonePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L${fmt(last.x)} ${h} L${fmt(first.x)} ${h} Z`;
  const text =
    label ||
    (values.length === 1
      ? `Значение: ${numberText(values[0])}`
      : `Тренд: от ${numberText(values[0])} до ${numberText(values[values.length - 1])}`);

  return (
    <svg className={classes} style={box} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={text} {...rest}>
      {fill ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="ui-spark__area" d={area} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path className="ui-spark__line" d={line} pathLength="1" fill="none" />
      <circle className="ui-spark__dot" cx={fmt(last.x)} cy={fmt(last.y)} r="3" />
    </svg>
  );
}

// Мини-столбики со скруглением. data: [{ label, value }]. showLabels: подписи ≥12px.
export function BarMini({ data = [], height = 64, tone = "accent", max, showLabels = false, label, className, style, ...rest }) {
  const items = (Array.isArray(data) ? data : []).map((item) => ({
    label: item?.label ?? "",
    value: Number.isFinite(Number(item?.value)) ? Number(item.value) : 0
  }));
  const top = Number(max) > 0 ? Number(max) : Math.max(1, ...items.map((item) => item.value));
  const text =
    label || (items.length ? `Столбики: ${items.map((item) => `${item.label ? `${item.label} ` : ""}${numberText(item.value)}`).join(", ")}` : "Нет данных");

  return (
    <div
      className={cx("ui-bars", `ui-tone--${tone}`, className)}
      style={{ "--ui-bars-h": cssSize(height), ...style }}
      role="img"
      aria-label={text}
      {...rest}
    >
      {items.map((item, index) => (
        <div className="ui-bars__col" key={`${item.label}-${index}`} title={`${item.label ? `${item.label}: ` : ""}${numberText(item.value)}`}>
          <div className="ui-bars__track">
            <span
              className={cx("ui-bars__bar", item.value <= 0 && "ui-bars__bar--zero")}
              style={{ height: `${Math.min(100, (item.value / top) * 100)}%` }}
            />
          </div>
          {showLabels ? <span className="ui-bars__label">{item.label}</span> : null}
        </div>
      ))}
    </div>
  );
}
