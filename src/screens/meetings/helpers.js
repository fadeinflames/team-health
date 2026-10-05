// Общие мелочи экрана «1:1 встречи»: тона и подписи, которые нужны нескольким частям.
import { scorePulse } from "../../lib/shared.jsx";

// Те же пороги, что на главной и в отчётах: ниже 64 риск, ниже 76 внимание.
export function scoreTone(score) {
  if (score < 64) return "danger";
  if (score < 76) return "warning";
  return "success";
}

export function scoreWord(score) {
  if (score < 64) return "зона риска";
  if (score < 76) return "нужно внимание";
  return "в порядке";
}

export function pulseOf(workspace, personId) {
  return scorePulse(workspace?.pulse?.[personId]);
}

// Тон плашки по типу темы. Красный не используем для «Признания»: красный значит «плохо».
export const categoryTone = {
  checkin: "accent",
  blocker: "warning",
  growth: "success",
  feedback: "info",
  decision: "neutral",
  thanks: "accent"
};

export const priorityTone = { high: "danger", medium: "info", low: "neutral" };

export const topicFilters = [
  ["all", "Все"],
  ["open", "Открытые"],
  ["employee", "От участника"],
  ["manager", "От лида"],
  ["health", "Пульс"],
  ["growth", "Рост"]
];

export const signalDefs = [
  ["energy", "Энергия", "низкая", "высокая"],
  ["load", "Нагрузка", "низкая", "высокая"],
  ["clarity", "Ясность", "мало ясности", "ясно"],
  ["trust", "Доверие", "низкое", "высокое"]
];

export function trendTone(trend) {
  return String(trend || "").trim().startsWith("-") || String(trend || "").trim().startsWith("−") ? "danger" : "success";
}
