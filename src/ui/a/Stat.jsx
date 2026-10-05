import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cx } from "./util.js";
import { Card } from "./Card.jsx";
import { Badge, IconTile } from "./Badge.jsx";
import { Sparkline } from "./Charts.jsx";

// Стрелка по знаку дельты: смысл не держится на одном цвете.
function deltaIcon(delta) {
  const sign = String(delta).trim().charAt(0);
  if (sign === "+") return ArrowUp;
  if (sign === "-" || sign === "−" || sign === "–") return ArrowDown;
  return Minus;
}

const SPARK_TONES = new Set(["success", "warning", "danger"]);

// Плитка метрики: подпись, крупное число, дельта, подсказка, спарклайн.
// delta: строка («+4%»); deltaTone: success | danger | neutral; trend: number[].
export function Stat({
  label,
  value,
  delta,
  deltaTone = "neutral",
  hint,
  icon,
  iconTone = "accent",
  trend,
  tone = "default",
  className,
  ...rest
}) {
  const hasDelta = delta != null && delta !== "";
  const hasTrend = Array.isArray(trend) && trend.length > 0;
  return (
    <Card as="div" tone={tone} className={cx("ui-stat", className)} {...rest}>
      <div className="ui-stat__head">
        {icon ? <IconTile icon={icon} tone={iconTone} size="sm" /> : null}
        <span className="ui-stat__label">{label}</span>
      </div>
      <div className="ui-stat__main">
        <span className="ui-stat__value num">{value}</span>
        {hasTrend ? (
          <Sparkline
            className="ui-stat__trend"
            data={trend}
            width={96}
            height={40}
            tone={SPARK_TONES.has(tone) ? tone : "accent"}
            label={`${label}: тренд от ${trend[0]} до ${trend[trend.length - 1]}`}
          />
        ) : null}
      </div>
      {hasDelta || hint ? (
        <div className="ui-stat__foot">
          {hasDelta ? (
            <Badge size="sm" tone={deltaTone} icon={deltaIcon(delta)} className="num">
              {delta}
            </Badge>
          ) : null}
          {hint ? <span className="ui-stat__hint">{hint}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}
