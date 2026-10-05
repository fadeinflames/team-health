// Общие константы, чистые помощники и небольшие компоненты, которые раньше
// лежали на верхнем уровне App.jsx. Вынесены, чтобы экраны могли жить в своих
// файлах (src/screens) и брать отсюда всё общее, не таща за собой весь App.
//
// Модуль переходный: по мере переписывания экранов то, что нужно только
// одному экрану, уезжает в его файл, а общее раскладывается по src/lib/*.

import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  HeartPulse,
  Home,
  MessageSquarePlus,
  Settings,
  ShieldCheck,
  ArrowUp,
  Target
} from "lucide-react";

export const emptyWorkspace = {
  people: [],
  lprs: [],
  cards: [],
  actions: [],
  goals: [],
  competencyAssessments: [],
  prep: {},
  pulse: {},
  meetingDrafts: {},
  notes: {},
  managerNotes: [],
  archivedPeople: [],
  users: [],
  surveyTemplates: []
};

export const goalStatusLabel = {
  active: "В работе",
  achieved: "Достигнута",
  abandoned: "Снята"
};

export const goalStatusOrder = { active: 0, achieved: 1, abandoned: 2 };

export const lprStatusLabel = {
  active: "В работе",
  paused: "Пауза",
  done: "Завершён"
};

export const lprStatusOrder = { active: 0, paused: 1, done: 2 };

export const competencyGradeLabel = {
  junior: "Junior",
  middle: "Middle",
  senior: "Senior",
  "lead-ready": "Lead-ready"
};

export const competencySourceLabel = {
  "case-ai": "AI case interview",
  manual: "Ручная оценка",
  review: "Review"
};

export function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}


export function formatDateRu(iso) {
  if (!iso) return "";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export function duplicateTitleKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.,;:]+$/u, "")
    .toLowerCase()
    .replace(/ё/g, "е");
}

export function clampRangeValue(value, min, max, fallback) {
  const number = Number(value);
  const safeNumber = Number.isFinite(number) ? number : fallback;
  return Math.max(min, Math.min(max, Math.round(safeNumber)));
}

export function parseScoreValue(value, fallback = 0) {
  const number = Number(String(value ?? "").replace(",", ".").trim());
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(5, Math.round(number * 10) / 10));
}

export function formatScoreValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

export function competencyGradeFromScores(scores) {
  const validScores = scores.map(Number).filter(Number.isFinite);
  if (!validScores.length) return { averageScore: 0, minScore: 0, grade: "junior" };
  const averageScore = Math.round((validScores.reduce((sum, score) => sum + score, 0) / validScores.length) * 10) / 10;
  const minScore = Math.round(Math.min(...validScores) * 10) / 10;
  const byAverage =
    averageScore >= 4.5 ? "lead-ready" :
    averageScore >= 3.5 ? "senior" :
    averageScore >= 2.5 ? "middle" :
    "junior";
  const byThreshold =
    minScore >= 4 ? "lead-ready" :
    minScore >= 3 ? "senior" :
    minScore >= 2 ? "middle" :
    "junior";
  const order = { junior: 0, middle: 1, senior: 2, "lead-ready": 3 };
  return {
    averageScore,
    minScore,
    grade: order[byAverage] <= order[byThreshold] ? byAverage : byThreshold
  };
}

export function competencyKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/ё/g, "е");
}

export function competencyTone(score, targetScore = 3) {
  if (!Number.isFinite(Number(score))) return "empty";
  if (score >= Math.max(targetScore, 4)) return "good";
  if (score >= Math.max(2.5, targetScore - 0.5)) return "watch";
  return "risk";
}

export function parseCompetencyRows(rawText) {
  return String(rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.includes("|")
        ? line.split("|").map((part) => part.trim())
        : line.split("\t").map((part) => part.trim());
      if (parts.length < 3 || /компетенц|балл/i.test(parts.join(" "))) return null;
      const hasCategory = parts.length >= 5;
      const category = hasCategory ? parts[0] : "";
      const name = hasCategory ? parts[1] : parts[0];
      const score = parseScoreValue(hasCategory ? parts[2] : parts[1], 0);
      const targetScore = parseScoreValue(hasCategory ? parts[3] : parts[2], Math.max(score, 3));
      const evidence = hasCategory ? parts[4] || "" : parts[3] || "";
      const recommendation = hasCategory ? parts.slice(5).join(" | ") : parts.slice(4).join(" | ");
      if (!name) return null;
      return {
        id: `competency-${Date.now().toString(16)}-${index}`,
        name,
        category,
        score,
        targetScore,
        evidence,
        recommendation
      };
    })
    .filter(Boolean);
}

export const categories = {
  checkin: { label: "Самочувствие", tone: "teal" },
  blocker: { label: "Блокер", tone: "amber" },
  growth: { label: "Рост", tone: "green" },
  feedback: { label: "Обратная связь", tone: "blue" },
  decision: { label: "Решение", tone: "slate" },
  thanks: { label: "Признание", tone: "rose" }
};

export const checklist = [
  { id: "employeeAgenda", label: "Участник добавил вопросы", owner: "employee" },
  { id: "managerAgenda", label: "Лид добавил наблюдения", owner: "manager" },
  { id: "pulse", label: "Пульс обновлен до встречи", owner: "shared" },
  { id: "lastActions", label: "Прошлые действия проверены", owner: "shared" },
  { id: "growth", label: "Есть тема роста или мотивации", owner: "shared" },
  { id: "commitments", label: "Следующие шаги сформулированы", owner: "shared" }
];

export const meetingTypeLabel = {
  regular: "Обычный 1:1",
  career: "Карьера и рост",
  performance: "Performance",
  "post-incident": "Разбор события",
  "first-1on1": "Первый 1:1",
  "skip-level": "Skip-level"
};

export const mentorshipModeLabel = {
  mentor: "Менторинг",
  coach: "Коучинг",
  sponsor: "Спонсорство"
};

export const mentorshipModeHint = {
  mentor: "Делюсь опытом, объясняю, передаю практики",
  coach: "Задаю вопросы, помогаю самим найти ответ",
  sponsor: "Открываю двери, рекомендую на видимые задачи"
};

export const baseQuestionSeeds = [
  {
    title: "Что сейчас повышает нагрузку?",
    body: "Зафиксировать источник нагрузки, влияние на работу и требуемое решение.",
    category: "checkin",
    source: "manager"
  },
  {
    title: "Какие риски требуют решения?",
    body: "Отдельная тема для рисков, зависимостей, процессов и блокеров.",
    category: "blocker",
    source: "manager"
  },
  {
    title: "Какая зона ответственности меняется?",
    body: "Зафиксировать зону ответственности, ожидаемый результат и необходимые условия.",
    category: "growth",
    source: "employee"
  },
  {
    title: "Что нужно изменить в процессе?",
    body: "Записать конкретное изменение, владельца и срок проверки.",
    category: "feedback",
    source: "manager"
  }
];

export const questionSeedsByMeetingType = {
  regular: baseQuestionSeeds,
  career: [
    {
      title: "Где сейчас твой фокус роста?",
      body: "Какие skills ты целенаправленно развиваешь в этом квартале и на каком этапе.",
      category: "growth",
      source: "employee"
    },
    {
      title: "Какая stretch-задача на ближайший квартал?",
      body: "Зона, чуть выше текущего уровня — чтобы расти, а не выгорать.",
      category: "growth",
      source: "manager"
    },
    {
      title: "Какие навыки нужны для следующего грейда?",
      body: "Сравнить с матрицей роли. Зафиксировать пробелы и следующий шаг.",
      category: "growth",
      source: "manager"
    },
    {
      title: "Где нужна поддержка sponsor'а?",
      body: "Видимые задачи, рекомендации, представления.",
      category: "growth",
      source: "employee"
    }
  ],
  performance: [
    {
      title: "Что у тебя получилось за последний цикл?",
      body: "3-5 конкретных фактов с измеримым impact.",
      category: "feedback",
      source: "employee"
    },
    {
      title: "Что не получилось и почему?",
      body: "Без обвинений: смотрим как процесс/среда/решения повлияли.",
      category: "feedback",
      source: "manager"
    },
    {
      title: "Observation + Impact + Request",
      body: "Конкретное наблюдение → влияние на команду/работу → конкретная просьба.",
      category: "feedback",
      source: "manager"
    }
  ],
  "post-incident": [
    {
      title: "Как ты сейчас? (после сложной ситуации)",
      body: "Эмоциональное состояние и восстановление важнее аналитики.",
      category: "checkin",
      source: "manager"
    },
    {
      title: "Что в процессе должно поменяться?",
      body: "Не про конкретного человека — про систему, договоренности и процесс.",
      category: "feedback",
      source: "manager"
    },
    {
      title: "Какие follow-up из разбора на тебе?",
      body: "С чёткими сроками и владельцем — иначе они умрут.",
      category: "blocker",
      source: "employee"
    }
  ],
  "skip-level": [
    {
      title: "Где сейчас самое большое узкое место в твоей работе?",
      body: "Уровень выше менеджера: вижу ли я процессы, которые мешают тебе на ground-level.",
      category: "blocker",
      source: "manager"
    },
    {
      title: "Как ты понимаешь стратегию команды на этот квартал?",
      body: "Проверить alignment: что ты слышишь и как это коррелирует с моим видением.",
      category: "decision",
      source: "manager"
    },
    {
      title: "С какими командами или людьми возникает трение?",
      body: "Cross-team friction — то, что обычно не доходит до 1:1 с прямым менеджером.",
      category: "feedback",
      source: "manager"
    }
  ],
  "first-1on1": [
    {
      title: "Что делает тебя ворчливым на работе?",
      body: "Lara Hogan — ранний разговор о триггерах. Лучше узнать сейчас.",
      category: "checkin",
      source: "manager"
    },
    {
      title: "Как ты обычно обрабатываешь обратную связь?",
      body: "Сразу/через паузу, в письме/разговоре, прямо/мягко.",
      category: "feedback",
      source: "manager"
    },
    {
      title: "Что для тебя «хорошее 1:1»?",
      body: "Договариваемся про формат, темп, повестку и приватность.",
      category: "decision",
      source: "manager"
    },
    {
      title: "Где сейчас твой максимальный фокус?",
      body: "Текущая зона ответственности и что в ней критично сейчас.",
      category: "growth",
      source: "employee"
    }
  ]
};

export const questionSeedsByMode = {
  mentor: [
    {
      title: "Где тебе нужен пример «как делают другие»?",
      body: "Лид делится конкретным опытом или artifact'ом.",
      category: "growth",
      source: "manager"
    }
  ],
  coach: [
    {
      title: "Что ты сам(а) уже пробовал(а)?",
      body: "Лид не предлагает решение — задаёт уточняющие вопросы.",
      category: "growth",
      source: "manager"
    }
  ],
  sponsor: [
    {
      title: "Какая видимая задача укрепит твою репутацию?",
      body: "Лид готов рекомендовать в нужный момент и контекст.",
      category: "growth",
      source: "manager"
    }
  ]
};

export function getQuestionSeeds(meetingType, mentorshipMode) {
  const base = questionSeedsByMeetingType[meetingType] || baseQuestionSeeds;
  const modeAddon = questionSeedsByMode[mentorshipMode] || [];
  return [...base, ...modeAddon];
}

export const managerNoteTagLabel = {
  feedback: "обратная связь",
  concern: "тревожный сигнал",
  career: "карьера",
  wellbeing: "благополучие",
  incident: "инцидент",
  decision: "решение"
};
export const managerNoteTagOrder = Object.keys(managerNoteTagLabel);

export function formatRuDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

export const sectionRegistry = {
  home: { label: "Главная", eyebrow: "Сводка команды", title: "Главная", icon: Home },
  meetings: { label: "1:1 встречи", eyebrow: "Повестка и шаги", title: "1:1", icon: MessageSquarePlus },
  // Аббревиатуру нигде больше не расшифровывали: новый человек не понимал, что за раздел.
  lprs: {
    label: "ЛПР",
    hint: "ЛПР — личный план развития",
    eyebrow: "Личный план развития: 1:1 -> ЛПР -> цели",
    title: "ЛПР",
    icon: ClipboardCheck
  },
  goals: { label: "Цели", eyebrow: "Развитие и фокус", title: "Цели", icon: Target },
  surveys: { label: "Опросы", eyebrow: "Регулярная обратная связь", title: "Опросы", icon: ClipboardList },
  reports: { label: "Отчёты", eyebrow: "Аналитика и тренды", title: "Отчёты", icon: BarChart3 },
  team: { label: "Команда", eyebrow: "Состав команды", title: "Команда", icon: HeartPulse },
  admin: { label: "Админка", eyebrow: "Управление платформой", title: "Админка", icon: ShieldCheck, platformAdminOnly: true },
  settings: { label: "Настройки", eyebrow: "Профиль, пароль, тема", title: "Настройки", icon: Settings }
};

export const primarySections = ["home", "meetings", "lprs", "goals", "surveys", "reports", "team", "admin", "settings"];

export function sectionDescriptionFor(sectionId, { isAdmin, selectedPerson }) {
  const descriptions = {
    meetings: selectedPerson
      ? isAdmin
        ? "Ведите общую повестку 1:1, фиксируйте сигналы, договорённости и следующие шаги до следующей встречи."
        : "Добавляйте свои темы, обновляйте пульс и держите договорённости с лидом в одном месте."
      : "Выберите участника, чтобы открыть его рабочее пространство 1:1: повестку, пульс, подготовку и итоги.",
    lprs: isAdmin
      ? "Превращайте повторяющиеся темы из 1:1 в планы развития и связывайте их с целями."
      : "Смотрите свои планы развития и темы из 1:1, которые превращаются в практические шаги.",
    goals: isAdmin
      ? "Держите цели команды в фокусе: прогресс, сроки, статус и связь с ЛПР видны в одном разделе."
      : "Обновляйте прогресс по своим целям и связывайте работу с планом развития.",
    surveys: isAdmin
      ? "Создавайте опросы для команды и смотрите агрегированные ответы. Анонимные опросы не показывают, кто ответил."
      : "Заполните доступные опросы — это поможет лиду подготовиться к встрече и увидеть командный контекст.",
    reports: isAdmin
      ? "Смотрите тренды по пульсу, темам, целям, действиям, авторству повестки и карте компетенций."
      : "Смотрите свои тренды по пульсу, темам, целям, компетенциям и договорённостям между встречами.",
    team: "Ведите состав команды, профили участников, роли, фокус менеджера и статус рабочих 1:1.",
    admin: "Управляйте доступами, ролями, логинами и паролями без смешивания демо и рабочей команды.",
    settings: "Настройте имя профиля, пароль, тему интерфейса и безопасные действия с демо-данными."
  };
  return descriptions[sectionId] || "";
}

export const roleLabel = {
  platform_admin: "Админ платформы",
  admin: "Админ платформы",
  lead: "Лид команды",
  employee: "Участник 1:1"
};

export const surveyQuestionTypeLabel = {
  scale: "Шкала 1–10",
  single: "Один вариант",
  multi: "Несколько вариантов",
  text: "Свободный ответ",
  date: "Дата"
};

export function emptyQuestionFor(type) {
  return {
    id: `q-${Math.random().toString(16).slice(2, 8)}`,
    type,
    prompt: "",
    required: type === "scale" || type === "single",
    options: type === "single" || type === "multi" ? ["", ""] : []
  };
}

export function templateQuestion(type, prompt, options = [], required = true) {
  return {
    ...emptyQuestionFor(type),
    prompt,
    options: (type === "single" || type === "multi") && options.length === 0 ? ["", ""] : options,
    required
  };
}

export const surveyTemplates = [
  {
    id: "blank",
    label: "С нуля",
    description: "Пустой конструктор, добавь свои вопросы.",
    survey: { title: "", description: "", anonymous: false, questions: [emptyQuestionFor("scale")] }
  },
  {
    id: "weekly-pulse",
    label: "Недельный пульс",
    description: "4 базовых вопроса для регулярного check-in.",
    survey: {
      title: "Пульс команды на этой неделе",
      description: "Помоги лиду быстро понять состояние команды.",
      anonymous: false,
      questions: [
        templateQuestion("scale", "Как ты в целом за неделю? (1 — плохо, 10 — отлично)"),
        templateQuestion("scale", "Насколько перегружен(а) сейчас? (1 — спокойно, 10 — горит всё)"),
        templateQuestion("single", "Сколько deep-work блоков получилось?", ["0", "1-2", "3-5", "Больше 5"]),
        templateQuestion("text", "Что хочешь обсудить на ближайшем 1:1?", [], false)
      ]
    }
  },
  {
    id: "on-call-review",
    label: "Ops-домена",
    description: "Опционально для команд с дежурствами, сигналами и инцидентами.",
    survey: {
      title: "Дежурство — разбор недели",
      description: "Доменный шаблон для команд, у которых есть дежурства, сигналы или инциденты.",
      anonymous: false,
      questions: [
        templateQuestion("scale", "Шумность дежурства (1 — спокойно, 10 — горело всё)"),
        templateQuestion("single", "Сколько ночных срабатываний было?", ["0", "1-2", "3-5", "Больше 5"]),
        templateQuestion("multi", "Что съедало фокус?", ["Шумные сигналы", "Релизы", "Инциденты", "Координация", "Документация"], false),
        templateQuestion("scale", "Как ты сейчас? (1 — выгорел, 10 — норм)"),
        templateQuestion("text", "Какой сигнал или процесс надо переработать?", [], false)
      ]
    }
  },
  {
    id: "team-retro",
    label: "Retro команды",
    description: "Анонимный retro: что хорошо, что плохо, что изменить.",
    survey: {
      title: "Retro спринта",
      description: "Анонимно: ответы видны только в агрегате.",
      anonymous: true,
      questions: [
        templateQuestion("text", "Что в этом спринте сработало хорошо?", [], false),
        templateQuestion("text", "Что мешало работе?", [], false),
        templateQuestion("text", "Что попробуем менять в следующий спринт?", [], false),
        templateQuestion("scale", "Насколько ты доволен(а) спринтом? (1-10)")
      ]
    }
  },
  {
    id: "eNPS",
    label: "eNPS",
    description: "Один вопрос: насколько порекомендуешь работу в команде.",
    survey: {
      title: "eNPS — рекомендация команды",
      description: "Анонимно. Стандартный employee-NPS.",
      anonymous: true,
      questions: [
        templateQuestion(
          "scale",
          "Насколько вероятно, что ты порекомендуешь работу в нашей команде друзьям-инженерам?"
        ),
        templateQuestion("text", "Что определило твою оценку?", [], false)
      ]
    }
  },
  {
    id: "360",
    label: "360 feedback",
    description: "Обратная связь от коллег конкретному человеку.",
    survey: {
      title: "360-feedback",
      description: "Свободные ответы про сильные стороны и зоны роста.",
      anonymous: true,
      questions: [
        templateQuestion("text", "В чём сильные стороны этого человека?", [], false),
        templateQuestion("text", "Что стоило бы делать иначе?", [], false),
        templateQuestion("text", "Какой совет ты бы дал(а) для роста?", [], false)
      ]
    }
  }
];

export const pulseSeries = [
  { id: "energy", label: "Энергия", color: "#6c8f55" },
  { id: "load", label: "Нагрузка", color: "#b36b68" },
  { id: "clarity", label: "Ясность", color: "#597c90" },
  { id: "trust", label: "Доверие", color: "#4f8879" }
];

export function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function scorePulse(pulse = {}) {
  const energy = Number(pulse.energy) || 0;
  const loadRelief = 11 - (Number(pulse.load) || 0);
  const clarity = Number(pulse.clarity) || 0;
  const trust = Number(pulse.trust) || 0;
  return Math.max(0, Math.min(100, Math.round((energy * 0.28 + loadRelief * 0.24 + clarity * 0.24 + trust * 0.24) * 10)));
}

export function heatmapTone(metric, value) {
  if (!value) return "empty";
  if (metric === "load") {
    if (value >= 8) return "risk";
    if (value >= 6) return "watch";
    return "good";
  }
  if (value <= 4) return "risk";
  if (value <= 6) return "watch";
  return "good";
}

export function priorityLabel(priority) {
  return {
    high: "Срочный",
    medium: "Важный",
    low: "Низкий"
  }[priority];
}

export function sourceLabel(source) {
  return source === "employee" ? "Участник" : "Лид";
}

export function ownerLabel(owner) {
  return owner === "manager" ? "Лид команды" : "Участник 1:1";
}

export function pluralizeRu(count, forms) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function countLabel(count, forms) {
  return `${count} ${pluralizeRu(count, forms)}`;
}

export function meetingSortValue(value = "") {
  const lowerValue = value.toLowerCase();
  if (lowerValue.includes("сегодня")) return 0;
  if (lowerValue.includes("завтра")) return 1;
  if (lowerValue.includes("нужно")) return 999;

  const monthOrder = {
    янв: 1,
    фев: 2,
    мар: 3,
    апр: 4,
    мая: 5,
    май: 5,
    июн: 6,
    июл: 7,
    авг: 8,
    сен: 9,
    окт: 10,
    ноя: 11,
    дек: 12
  };
  const match = lowerValue.match(/(\d{1,2})\s+([а-я]+)/);
  if (!match) return 500;

  const day = Number(match[1]);
  const monthKey = match[2].slice(0, 3);
  return (monthOrder[monthKey] || 12) * 40 + day;
}

export function isDemoAccess(user) {
  return user?.username === "demo" || user?.personId === "demo-sre";
}

export function isPlatformAdminRole(user) {
  return user?.role === "platform_admin" || user?.role === "admin";
}

export function isLeadRole(user) {
  return user?.role === "lead" || isPlatformAdminRole(user);
}

export function isProtectedAccess(user) {
  return isPlatformAdminRole(user);
}

// Клиент решает, что делать с ошибкой (разлогин, конфликт, повтор), по коду
// ответа, а не по тексту: тексты меняются, а «авторизация» в чужом сообщении
// уже один раз разлогинила человека. status 0 — до сервера запрос не дошёл.
export class ApiError extends Error {
  constructor(status, payload, message) {
    super(message || payload?.error || "Ошибка запроса");
    this.name = "ApiError";
    this.status = status;
    this.payload = payload || {};
  }
}

// Порог анонимности: ниже 3 ответов по одному вопросу личность респондента вычисляется
// почти напрямую, поэтому сервер режет значение до 3..10, а UI не даёт выбрать меньше.
export const ANONYMOUS_MIN_RESPONSES = 3;
export const ANONYMOUS_MAX_RESPONSES = 10;

export function clampAnonymousMin(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return ANONYMOUS_MIN_RESPONSES;
  return Math.min(ANONYMOUS_MAX_RESPONSES, Math.max(ANONYMOUS_MIN_RESPONSES, number));
}

export async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
  } catch {
    throw new ApiError(0, {}, "Нет связи с сервером");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }

  return payload;
}

// Явный behavior в scrollIntoView/scrollTo перебивает CSS scroll-behavior, поэтому
// prefers-reduced-motion из таблицы стилей на них не действует: уважаем настройку здесь.
export function scrollBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

// Таблицы, строки которых сервер удаляет по отсутствию в теле POST /api/workspace.
// Клиент сообщает, какие id он видел (knownIds): чужая строка, появившаяся на
// сервере после нашей загрузки, не должна исчезнуть от нашего снимка.
export const KNOWN_ID_TABLES = ["cards", "actions", "goals", "lprs", "competencyAssessments"];

export function collectRowIds(ws) {
  const ids = {};
  for (const table of KNOWN_ID_TABLES) {
    ids[table] = new Set((ws?.[table] || []).map((row) => row.id));
  }
  return ids;
}

// Пауза между повторами сохранения: 1.6 с, затем вдвое дольше, но не более 30 с.
export const SAVE_RETRY_FIRST_MS = 1600;
export const SAVE_RETRY_MAX_MS = 30000;

// Повторять имеет смысл только то, что может пройти само: сеть и 5xx. 4xx
// означает, что сервер отказался именно от этого запроса, и тот же снимок
// будет отвергнут снова.
export function isRetryableError(error) {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}

