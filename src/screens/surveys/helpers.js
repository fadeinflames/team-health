// Чистые помощники экрана «Опросы»: черновики конструктора, проверка и сборка
// запроса, CSV-выгрузка, подсчёт ответов. Без React и без обращений к API.
import { toCsv } from "../../csv.js";
import { ANONYMOUS_MIN_RESPONSES, clampAnonymousMin, emptyQuestionFor } from "../../lib/shared.jsx";

export function freshComposer() {
  return {
    title: "",
    description: "",
    anonymous: false,
    anonymousMinResponses: ANONYMOUS_MIN_RESPONSES,
    questions: [emptyQuestionFor("scale")]
  };
}

// Вопросам из шаблона или чужого опроса нужны новые id: иначе React и сервер
// считали бы их теми же вопросами.
export function rekey(questions) {
  return (questions || []).map((question) => ({
    ...question,
    options: Array.isArray(question.options) ? [...question.options] : [],
    id: `q-${Math.random().toString(16).slice(2, 8)}`
  }));
}

export function composerFromTemplate(template) {
  const questions = rekey(template.survey.questions);
  return {
    ...template.survey,
    anonymousMinResponses: clampAnonymousMin(template.survey.anonymousMinResponses),
    questions: questions.length ? questions : [emptyQuestionFor("scale")]
  };
}

export function composerFromUserTemplate(template) {
  const questions = rekey(template.questions);
  return {
    title: template.title || "",
    description: template.description || "",
    anonymous: Boolean(template.anonymous),
    anonymousMinResponses: clampAnonymousMin(template.anonymousMinResponses),
    questions: questions.length ? questions : [emptyQuestionFor("scale")]
  };
}

export function composerFromSurvey(survey) {
  return {
    title: `${survey.title} (копия)`,
    description: survey.description || "",
    anonymous: Boolean(survey.anonymous),
    // В старых опросах порог мог быть 2: копия создаётся уже с допустимым минимумом.
    anonymousMinResponses: clampAnonymousMin(survey.anonymousMinResponses),
    questions: rekey(survey.questions)
  };
}

// Проверка и сборка тела запроса. Тексты ошибок те же, что были в старом интерфейсе.
export function buildSurveyPayload(composer) {
  if (!composer.title.trim()) throw new Error("Укажите название опроса");
  const questions = composer.questions
    .map((question) => ({
      ...question,
      prompt: question.prompt.trim(),
      options: (question.options || []).map((option) => option.trim()).filter(Boolean)
    }))
    .filter((question) => question.prompt.length > 0);
  if (questions.length === 0) throw new Error("Добавьте хотя бы один вопрос");
  for (const question of questions) {
    if ((question.type === "single" || question.type === "multi") && question.options.length < 2) {
      throw new Error(`Для вопроса «${question.prompt}» нужно минимум 2 варианта`);
    }
  }
  return {
    title: composer.title.trim(),
    description: composer.description.trim(),
    anonymous: composer.anonymous,
    anonymousMinResponses: clampAnonymousMin(composer.anonymousMinResponses),
    questions
  };
}

export function isAnswered(question, answer) {
  if (!answer) return false;
  if (question.type === "multi") return Array.isArray(answer.values) && answer.values.length > 0;
  if (question.type === "scale") return typeof answer.value === "number";
  return typeof answer.value === "string" ? answer.value.trim().length > 0 : Boolean(answer.value);
}

export function formatAvg(value) {
  return String(value).replace(".", ",");
}

export function percentOf(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

// Доля людей, ответивших на опрос (не больше 100).
export function participationOf(survey, peopleCount) {
  return peopleCount ? Math.min(100, Math.round((survey.responseCount / peopleCount) * 100)) : 0;
}

export function exportSurveyCsv(survey, people) {
  const responses = survey.responses || [];
  const headers = ["submittedAt", "personId", ...survey.questions.map((q) => q.prompt)];
  const rows = [headers];

  if (responses.length === 0 && survey.aggregate) {
    // Анонимный режим: построчных данных нет, только сводка.
    rows.push(["# aggregate-only export (анонимный опрос)"]);
    for (const q of survey.questions) {
      const stats = survey.aggregate?.perQuestion?.[q.id];
      if (!stats) continue;
      if (stats.hidden) {
        rows.push([`${q.prompt}: недостаточно ответов для показа (нужно не меньше ${stats.minResponses}, сейчас ${stats.count})`]);
      } else if (q.type === "scale") {
        rows.push([`${q.prompt}: среднее ${stats.avg} (n=${stats.count})`]);
      } else if (q.type === "single" || q.type === "multi") {
        for (const item of stats.distribution || []) {
          rows.push([`${q.prompt} → ${item.label}`, item.value]);
        }
      } else if (q.type === "text" || q.type === "date") {
        if (stats.redacted) {
          rows.push([`${q.prompt}: ответов ${stats.count}`]);
        } else {
          for (const sample of stats.samples || []) {
            rows.push([q.prompt, sample]);
          }
        }
      }
    }
  } else {
    for (const r of responses) {
      const personName = people?.find((p) => p.id === r.personId)?.name || r.personId || "anonymous";
      const cells = [r.submittedAt, personName];
      for (const q of survey.questions) {
        const a = r.answers?.[q.id];
        if (!a) cells.push("");
        else if (Array.isArray(a.values)) cells.push(a.values.join("; "));
        else cells.push(a.value);
      }
      rows.push(cells);
    }
  }

  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${survey.title.replace(/[^\w\dа-яёА-ЯЁ-]+/gi, "_") || "survey"}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
