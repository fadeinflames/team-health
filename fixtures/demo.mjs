// Демо-фикстуры: пять человек, их карточки, договорённости, планы развития,
// цели, оценка компетенций и один опрос.
//
// Данные лежат в demo.json, здесь только производные структуры — те, что
// раньше собирались прямо в server.js из массива people.
//
// Это данные разработчика, а не приложения. В production они не попадают:
// сидинг вынесен из пути старта и живёт в scripts/seed.mjs.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const fixturesDir = dirname(fileURLToPath(import.meta.url));

const demo = JSON.parse(readFileSync(join(fixturesDir, "demo.json"), "utf8"));

export const people = demo.people;
export const initialCards = demo.cards;
export const initialActions = demo.actions;
export const initialLprs = demo.lprs;
export const initialGoals = demo.goals;
export const initialCompetencyAssessments = demo.competencyAssessments;
export const initialSurveys = demo.surveys;
export const initialNotes = demo.notes;

// Идентификаторы демо-персон. Приложение по ним понимает, что учётка
// привязана к человеку, которого создал сидинг, а не завёл пользователь.
export const demoOnlyPersonIds = new Set(people.map((person) => person.id));
export const demoSeedSurveyIds = new Set(initialSurveys.map((survey) => survey.id));

export const initialPrep = Object.fromEntries(
  people.map((person) => [
    person.id,
    {
      employeeAgenda: person.id !== "danila",
      managerAgenda: true,
      pulse: person.id !== "timur",
      lastActions: person.id !== "timur",
      growth: person.id === "demo-sre" || person.id === "anna" || person.id === "mila",
      commitments: person.id === "demo-sre"
    }
  ])
);

export const initialPulse = Object.fromEntries(
  people.map((person) => [
    person.id,
    {
      energy: person.energy,
      load: person.load,
      clarity: person.clarity,
      trust: person.trust
    }
  ])
);

const pulseHistoryDemoSpanDays = 56;

// Восемь недельных точек назад от сегодня, слегка «дышащих» вокруг текущего
// значения. Синус, а не случайные числа: график должен выглядеть как
// динамика, а не как шум, и повторяться от запуска к запуску.
//
// Сегодняшняя точка «дыханию» не подлежит. С миграции 0026 текущий пульс —
// это и есть последняя точка истории, и разойтись они не могут по
// построению: фикстура, где заявленный пульс отличается от последней точки
// графика, описывает состояние, которого в базе не бывает.
function seedPulseHistoryFor(personId, currentPulse) {
  const out = [];
  const today = new Date();
  for (let dayOffset = pulseHistoryDemoSpanDays; dayOffset >= 0; dayOffset -= 7) {
    const ts = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const wobble = (seed) =>
      dayOffset === 0 ? seed : Math.max(1, Math.min(10, seed + Math.round(Math.sin(dayOffset / 4 + seed) * 1.4)));
    out.push({
      personId,
      capturedAt: ts.toISOString().slice(0, 10),
      energy: wobble(currentPulse.energy),
      load: wobble(currentPulse.load),
      clarity: wobble(currentPulse.clarity),
      trust: wobble(currentPulse.trust)
    });
  }
  return out;
}

export function buildSeedPulseHistory() {
  const rows = [];
  for (const person of people) {
    rows.push(...seedPulseHistoryFor(person.id, initialPulse[person.id]));
  }
  return rows;
}

// Дежурная нагрузка демо-персон намеренно пуста: цифры выгорания, взятые с
// потолка, читаются как настоящие и вводят в заблуждение на демо.
export function buildSeedOncallLoad() {
  return [];
}
