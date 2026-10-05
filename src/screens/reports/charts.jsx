// Графики экрана «Отчёты». Рисуем сами (SVG в пикселях контейнера, а не растянутый
// viewBox), чтобы подписи осей всегда были читаемого размера и не сплющивались на телефоне.
// Цвета только через токены (--cat-*, --accent, статусные); значения всегда есть
// числом: в подсказке, в легенде и в скрытой таблице для читалок.
import { useId, useLayoutEffect, useRef, useState } from "react";

const fmt = (n) => Math.round(n * 100) / 100;

export function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return (Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10)).replace(".", ",");
}

// Плавная монотонная кривая (Фритч-Карлсон): без ложных пиков между точками.
export function monotonePath(points) {
  const n = points.length;
  if (n < 2) return "";
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1].x - points[i].x || 1;
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

// Ширина контейнера в px; до первого замера отдаём запасное значение.
function useWidth(fallback = 560) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(Math.round(el.getBoundingClientRect().width) || fallback);
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width];
}

// Размер 1rem в px: «Крупный текст» меняет rem на <html>, поля графика растут вместе с ним.
function remPx() {
  if (typeof window === "undefined") return 16;
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

// Линейный график с плавными кривыми, мягкой заливкой под первой серией и
// подсказкой по наведению и касанию.
// series: [{ id, label, tone, points: number[] }]; tone: имя цвета из rep-tone--*.
export function TrendChart({ series, labels, min = 0, max = 100, ticks, height = 220, fill = false, unit = "", caption }) {
  const [ref, width] = useWidth();
  const gradientId = `rep-grad-${useId().replace(/\W/g, "")}`;
  const [hover, setHover] = useState(null);
  const rem = remPx();

  const visible = series.filter((s) => s.points.length);
  if (!visible.length || !labels.length) {
    return <p className="rep-empty-text">Данных пока нет.</p>;
  }

  const padL = Math.round(rem * (String(max).length > 2 ? 2.5 : 2));
  const padR = Math.round(rem * 1);
  const padT = Math.round(rem * 0.9);
  const padB = Math.round(rem * 2.2);
  const w = Math.max(160, width);
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const count = labels.length;
  const xOf = (i) => padL + (count === 1 ? innerW / 2 : (innerW * i) / (count - 1));
  const yOf = (v) => padT + innerH - ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) * innerH;
  const tickList = ticks || [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(min + (max - min) * p));

  // Подписи по оси X: столько, сколько влезает (около 4,6rem на подпись), последняя всегда есть.
  const maxLabels = Math.max(2, Math.floor(innerW / (rem * 4.6)));
  const step = Math.max(1, Math.ceil(count / maxLabels));
  const shownLabel = (i) => count === 1 || i === count - 1 || (i % step === 0 && count - 1 - i >= step * 0.6);

  const handleMove = (event) => {
    if (count === 1) {
      setHover(0);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.round(((event.clientX - rect.left - padL) / innerW) * (count - 1));
    setHover(Math.max(0, Math.min(count - 1, index)));
  };

  const summary = visible
    .map((s) => `${s.label}: от ${formatNumber(s.points[0])} до ${formatNumber(s.points[s.points.length - 1])}${unit}`)
    .join("; ");
  const hoverX = hover == null ? null : xOf(hover);

  return (
    <figure className="rep-chart" ref={ref}>
      <div className="rep-chart__plot" onPointerMove={handleMove} onPointerDown={handleMove} onPointerLeave={() => setHover(null)}>
        <svg
          className="rep-chart__svg"
          width={w}
          height={height}
          viewBox={`0 0 ${w} ${height}`}
          role="img"
          aria-label={`${caption || "График"}. ${summary}`}
        >
          {tickList.map((v) => (
            <g key={v}>
              <line className="rep-chart__grid" x1={padL} x2={w - padR} y1={yOf(v)} y2={yOf(v)} />
              <text className="rep-chart__axis" x={padL - 8} y={yOf(v)} textAnchor="end" dominantBaseline="middle">
                {v}
              </text>
            </g>
          ))}
          {hover != null ? <line className="rep-chart__cursor" x1={hoverX} x2={hoverX} y1={padT} y2={padT + innerH} /> : null}
          {visible.map((s, si) => {
            const pts = s.points.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
            const line = count === 1 ? "" : monotonePath(pts);
            const area = line ? `${line} L${fmt(pts[pts.length - 1].x)} ${padT + innerH} L${fmt(pts[0].x)} ${padT + innerH} Z` : "";
            return (
              <g key={s.id} className={`rep-chart__series rep-tone--${s.tone}`}>
                {fill && si === 0 && area ? (
                  <>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--rep-c)" stopOpacity="0.28" />
                        <stop offset="1" stopColor="var(--rep-c)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={area} fill={`url(#${gradientId})`} />
                  </>
                ) : null}
                {line ? <path className="rep-chart__line" d={line} fill="none" /> : null}
                {pts.map((p, i) => {
                  const last = i === pts.length - 1;
                  const active = hover === i;
                  if (!last && !active && count > 12) return null;
                  return <circle key={i} className="rep-chart__dot" cx={p.x} cy={p.y} r={last || active ? 4.5 : 3} />;
                })}
              </g>
            );
          })}
          {labels.map((label, i) =>
            shownLabel(i) ? (
              <text
                key={i}
                className="rep-chart__axis"
                x={xOf(i)}
                y={height - padB + rem * 1.5}
                textAnchor={count > 1 && i === 0 ? "start" : count > 1 && i === count - 1 ? "end" : "middle"}
              >
                {label}
              </text>
            ) : null
          )}
        </svg>
        {hover != null ? (
          <div className={`rep-chart__tip ${hoverX > w * 0.6 ? "is-left" : ""}`} style={{ left: hoverX }} aria-hidden="true">
            <span className="rep-chart__tip-title">{labels[hover]}</span>
            {visible.map((s) => (
              <span key={s.id} className={`rep-chart__tip-row rep-tone--${s.tone}`}>
                <i className="rep-dot" />
                {visible.length > 1 ? <span>{s.label}</span> : null}
                <b className="num">
                  {formatNumber(s.points[hover])}
                  {unit}
                </b>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {/* Те же значения таблицей: график не единственный способ их получить. */}
      <div className="sr-only">
      <table>
        <caption>{caption || "Значения графика"}</caption>
        <thead>
          <tr>
            <th scope="col">Дата</th>
            {visible.map((s) => (
              <th scope="col" key={s.id}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={`${label}-${i}`}>
              <th scope="row">{label}</th>
              {visible.map((s) => (
                <td key={s.id}>{formatNumber(s.points[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

// Горизонтальные скруглённые столбики со значением числом. data: [{ label, value, tone }].
// Подпись и столбик тянутся по контейнеру: на телефоне ничего не обрезается.
export function BarList({ data, caption }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!data.length || total === 0) return <p className="rep-empty-text">Данных пока нет.</p>;
  const top = Math.max(1, ...data.map((item) => item.value));
  return (
    <ul className="rep-bars" aria-label={caption}>
      {data.map((item) => (
        <li key={item.label} className={`rep-bars__row rep-tone--${item.tone || "accent"}`}>
          <span className="rep-bars__label">{item.label}</span>
          <span className="rep-bars__track" aria-hidden="true">
            <span className="rep-bars__fill" style={{ width: `${(item.value / top) * 100}%` }} />
          </span>
          <span className="rep-bars__value num">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
