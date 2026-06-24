import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  ClipboardList,
  Flag,
  HeartPulse,
  Home,
  KeyRound,
  LockKeyhole,
  LogOut,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  ArrowUp,
  ArrowDown,
  Pencil,
  SlidersHorizontal,
  Target,
  Trash2,
  UserCog,
  UserPlus,
  UserRoundCheck,
  UsersRound,
  X
} from "lucide-react";

const emptyWorkspace = {
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

const goalStatusLabel = {
  active: "В работе",
  achieved: "Достигнута",
  abandoned: "Снята"
};

const goalStatusOrder = { active: 0, achieved: 1, abandoned: 2 };

const lprStatusLabel = {
  active: "В работе",
  paused: "Пауза",
  done: "Завершён"
};

const lprStatusOrder = { active: 0, paused: 1, done: 2 };

const competencyGradeLabel = {
  junior: "Junior",
  middle: "Middle",
  senior: "Senior",
  "lead-ready": "Lead-ready"
};

const competencySourceLabel = {
  "case-ai": "AI case interview",
  manual: "Ручная оценка",
  review: "Review"
};

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

const ruMonthsFull = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];
const ruWeekdaysShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatDateRu(iso) {
  if (!iso) return "";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function duplicateTitleKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.,;:]+$/u, "")
    .toLowerCase()
    .replace(/ё/g, "е");
}

function clampRangeValue(value, min, max, fallback) {
  const number = Number(value);
  const safeNumber = Number.isFinite(number) ? number : fallback;
  return Math.max(min, Math.min(max, Math.round(safeNumber)));
}

function parseScoreValue(value, fallback = 0) {
  const number = Number(String(value ?? "").replace(",", ".").trim());
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(5, Math.round(number * 10) / 10));
}

function formatScoreValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function competencyGradeFromScores(scores) {
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

function competencyKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/ё/g, "е");
}

function competencyTone(score, targetScore = 3) {
  if (!Number.isFinite(Number(score))) return "empty";
  if (score >= Math.max(targetScore, 4)) return "good";
  if (score >= Math.max(2.5, targetScore - 0.5)) return "watch";
  return "risk";
}

function parseCompetencyRows(rawText) {
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

function buildMonthGrid(year, month /* 0-11 */) {
  const firstDay = new Date(Date.UTC(year, month, 1));
  // JS getUTCDay() returns 0=Sun..6=Sat. Convert to Mon-first: 0=Mon..6=Sun.
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [];
  // Lead with prev-month days
  if (offset > 0) {
    const prevMonth = new Date(Date.UTC(year, month, 0));
    const prevDays = prevMonth.getUTCDate();
    for (let i = offset - 1; i >= 0; i--) {
      cells.push({ day: prevDays - i, inMonth: false, iso: null });
    }
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push({ day: d, inMonth: true, iso: `${year}-${mm}-${dd}` });
  }
  // Trailing next-month days so the grid is a 6×7 rectangle
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const next = cells.length - offset - daysInMonth + 1;
    cells.push({ day: next, inMonth: false, iso: null });
    if (cells.length >= 42) break;
  }
  return cells;
}

function DatePicker({ value, onChange, placeholder = "Выбрать дату", id }) {
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState(null);
  const initial = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date();
  const [view, setView] = useState({ year: initial.getUTCFullYear(), month: initial.getUTCMonth() });
  const ref = useRef(null);
  const triggerRef = useRef(null);

  function positionPopup() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportPadding = 16;
    const width = Math.min(280, Math.max(240, window.innerWidth - viewportPadding * 2));
    const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      maxLeft
    );
    const estimatedHeight = 342;
    const belowTop = rect.bottom + 6;
    const aboveTop = rect.top - estimatedHeight - 6;
    const top =
      belowTop + estimatedHeight > window.innerHeight - viewportPadding && aboveTop > viewportPadding
        ? aboveTop
        : Math.min(belowTop, window.innerHeight - viewportPadding - estimatedHeight);

    setPopupStyle({
      position: "fixed",
      top: Math.max(viewportPadding, top),
      left,
      width
    });
  }

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    positionPopup();
    const reposition = () => positionPopup();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const cells = buildMonthGrid(view.year, view.month);
  const todayIso = todayISODate();

  function shift(delta) {
    setView((current) => {
      const m = current.month + delta;
      const year = current.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  }

  return (
    <div className="date-picker" ref={ref}>
      <button
        type="button"
        className="date-picker-trigger"
        ref={triggerRef}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          positionPopup();
          setOpen(true);
        }}
        id={id}
      >
        <CalendarDays size={14} />
        <span className={value ? "" : "placeholder"}>
          {value ? formatDateRu(value) : placeholder}
        </span>
      </button>
      {open && (
        <div className="date-picker-popup" style={popupStyle || undefined}>
          <div className="date-picker-head">
            <button type="button" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
              <ArrowUp size={14} style={{ transform: "rotate(-90deg)" }} />
            </button>
            <span>
              {ruMonthsFull[view.month]} {view.year}
            </span>
            <button type="button" onClick={() => shift(1)} aria-label="Следующий месяц">
              <ArrowUp size={14} style={{ transform: "rotate(90deg)" }} />
            </button>
          </div>
          <div className="date-picker-weekdays">
            {ruWeekdaysShort.map((d) => (
              <span key={d} className={d === "Сб" || d === "Вс" ? "weekend" : ""}>{d}</span>
            ))}
          </div>
          <div className="date-picker-grid">
            {cells.map((cell, i) => {
              const dayOfWeek = i % 7; // 0=Mon..6=Sun in our grid
              const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
              const isSelected = cell.iso && cell.iso === value;
              const isToday = cell.iso === todayIso;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!cell.inMonth}
                  className={`date-picker-day ${!cell.inMonth ? "out" : ""} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""} ${isWeekend ? "weekend" : ""}`}
                  onClick={() => {
                    if (!cell.iso) return;
                    onChange(cell.iso);
                    setOpen(false);
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="date-picker-actions">
            <button
              type="button"
              className="soft-button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Очистить
            </button>
            <button
              type="button"
              className="soft-button"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
            >
              Сегодня
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const themeStorageKey = "th_theme";
const themeExplicitStorageKey = "th_theme_explicit";
const themeOptions = ["system", "light", "dark"];

function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(themeStorageKey);
    return themeOptions.includes(value) ? value : "system";
  } catch {
    return "system";
  }
}

function applyThemeAttr(theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.setAttribute("data-theme", "dark");
    }
  } else {
    root.setAttribute("data-theme", theme);
  }
}

const categories = {
  checkin: { label: "Самочувствие", tone: "teal" },
  blocker: { label: "Блокер", tone: "amber" },
  growth: { label: "Рост", tone: "green" },
  feedback: { label: "Обратная связь", tone: "blue" },
  decision: { label: "Решение", tone: "slate" },
  thanks: { label: "Признание", tone: "rose" }
};

const checklist = [
  { id: "employeeAgenda", label: "Участник добавил вопросы", owner: "employee" },
  { id: "managerAgenda", label: "Лид добавил наблюдения", owner: "manager" },
  { id: "pulse", label: "Пульс обновлен до встречи", owner: "shared" },
  { id: "lastActions", label: "Прошлые действия проверены", owner: "shared" },
  { id: "growth", label: "Есть тема роста или мотивации", owner: "shared" },
  { id: "commitments", label: "Следующие шаги сформулированы", owner: "shared" }
];

const meetingTypeLabel = {
  regular: "Обычный 1:1",
  career: "Карьера и рост",
  performance: "Performance",
  "post-incident": "Разбор события",
  "first-1on1": "Первый 1:1",
  "skip-level": "Skip-level"
};

const mentorshipModeLabel = {
  mentor: "Менторинг",
  coach: "Коучинг",
  sponsor: "Спонсорство"
};

const mentorshipModeHint = {
  mentor: "Делюсь опытом, объясняю, передаю практики",
  coach: "Задаю вопросы, помогаю самим найти ответ",
  sponsor: "Открываю двери, рекомендую на видимые задачи"
};

const baseQuestionSeeds = [
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

const questionSeedsByMeetingType = {
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

const questionSeedsByMode = {
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

function getQuestionSeeds(meetingType, mentorshipMode) {
  const base = questionSeedsByMeetingType[meetingType] || baseQuestionSeeds;
  const modeAddon = questionSeedsByMode[mentorshipMode] || [];
  return [...base, ...modeAddon];
}

const managerNoteTagLabel = {
  feedback: "обратная связь",
  concern: "тревожный сигнал",
  career: "карьера",
  wellbeing: "благополучие",
  incident: "инцидент",
  decision: "решение"
};
const managerNoteTagOrder = Object.keys(managerNoteTagLabel);

function formatRuDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

const sectionRegistry = {
  home: { label: "Главная", eyebrow: "Сводка команды", title: "Дашборд команды", icon: Home },
  meetings: { label: "1:1 встречи", eyebrow: "Повестка и шаги", title: "1:1", icon: MessageSquarePlus },
  lprs: { label: "ЛПР", eyebrow: "1:1 -> ЛПР -> цели", title: "ЛПР", icon: ClipboardCheck },
  goals: { label: "Цели", eyebrow: "Развитие и фокус", title: "Цели", icon: Target },
  surveys: { label: "Опросы", eyebrow: "Регулярная обратная связь", title: "Опросы", icon: ClipboardList },
  reports: { label: "Отчёты", eyebrow: "Аналитика и тренды", title: "Отчёты", icon: BarChart3 },
  team: { label: "Команда", eyebrow: "Состав команды", title: "Команда", icon: HeartPulse },
  admin: { label: "Админка", eyebrow: "Управление платформой", title: "Админка", icon: ShieldCheck, platformAdminOnly: true },
  settings: { label: "Настройки", eyebrow: "Профиль, пароль, тема", title: "Настройки", icon: Settings }
};

const primarySections = ["home", "meetings", "lprs", "goals", "surveys", "reports", "team", "admin", "settings"];

function sectionDescriptionFor(sectionId, { isAdmin, selectedPerson }) {
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

const roleLabel = {
  platform_admin: "Админ платформы",
  admin: "Админ платформы",
  lead: "Лид команды",
  employee: "Участник 1:1"
};

const surveyQuestionTypeLabel = {
  scale: "Шкала 1–10",
  single: "Один вариант",
  multi: "Несколько вариантов",
  text: "Свободный ответ",
  date: "Дата"
};

function emptyQuestionFor(type) {
  return {
    id: `q-${Math.random().toString(16).slice(2, 8)}`,
    type,
    prompt: "",
    required: type === "scale" || type === "single",
    options: type === "single" || type === "multi" ? ["", ""] : []
  };
}

function templateQuestion(type, prompt, options = [], required = true) {
  return {
    ...emptyQuestionFor(type),
    prompt,
    options: (type === "single" || type === "multi") && options.length === 0 ? ["", ""] : options,
    required
  };
}

const surveyTemplates = [
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

const pulseSeries = [
  { id: "energy", label: "Энергия", color: "#6c8f55" },
  { id: "load", label: "Нагрузка", color: "#b36b68" },
  { id: "clarity", label: "Ясность", color: "#597c90" },
  { id: "trust", label: "Доверие", color: "#4f8879" }
];

function LineChart({ series, labels, height = 200, width = 540 }) {
  if (!series.length || !labels.length) {
    return <div className="empty-state compact-empty"><span>Данных пока нет.</span></div>;
  }
  const padL = 32;
  const padR = 14;
  const padT = 12;
  const padB = 30;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const yMax = 10;
  const dx = labels.length === 1 ? 0 : w / (labels.length - 1);
  const yTicks = [0, 2, 4, 6, 8, 10];
  // Show every label if there are ≤ 8 weeks, otherwise pick ~6 evenly spaced
  const labelStep = labels.length <= 8 ? 1 : Math.ceil(labels.length / 6);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="report-chart" preserveAspectRatio="none">
      {yTicks.map((v) => {
        const y = padT + h - (v / yMax) * h;
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} className="chart-grid" />
            <text x={padL - 6} y={y + 3} textAnchor="end" className="chart-axis">{v}</text>
          </g>
        );
      })}
      {series.map((s) => {
        const pts = s.points
          .map((v, i) => `${padL + i * dx},${padT + h - (Math.max(0, Math.min(yMax, v)) / yMax) * h}`)
          .join(" ");
        return (
          <g key={s.id}>
            <polyline
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.points.map((v, i) => (
              <circle
                key={i}
                cx={padL + i * dx}
                cy={padT + h - (Math.max(0, Math.min(yMax, v)) / yMax) * h}
                r={3.5}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth="1.5"
              />
            ))}
          </g>
        );
      })}
      {labels.map((label, i) =>
        i % labelStep === 0 || i === labels.length - 1 ? (
          <text key={i} x={padL + i * dx} y={height - 10} textAnchor="middle" className="chart-axis">
            {label}
          </text>
        ) : null
      )}
    </svg>
  );
}

function ScoreLineChart({ points, labels, height = 200, width = 540, color = "#4f8879" }) {
  if (!points.length || !labels.length) {
    return <div className="empty-state compact-empty"><span>Данных пока нет.</span></div>;
  }
  const padL = 36;
  const padR = 14;
  const padT = 12;
  const padB = 30;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const yMax = 100;
  const dx = points.length === 1 ? 0 : w / (points.length - 1);
  const yTicks = [0, 25, 50, 75, 100];
  const labelStep = labels.length <= 8 ? 1 : Math.ceil(labels.length / 6);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="report-chart" preserveAspectRatio="none">
      {yTicks.map((v) => {
        const y = padT + h - (v / yMax) * h;
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} className="chart-grid" />
            <text x={padL - 6} y={y + 3} textAnchor="end" className="chart-axis">{v}</text>
          </g>
        );
      })}
      <polyline
        points={points.map((v, i) => `${padL + i * dx},${padT + h - (Math.max(0, Math.min(yMax, v)) / yMax) * h}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((v, i) => (
        <circle
          key={i}
          cx={padL + i * dx}
          cy={padT + h - (Math.max(0, Math.min(yMax, v)) / yMax) * h}
          r={4}
          fill={color}
          stroke="var(--surface)"
          strokeWidth="2"
        />
      ))}
      {labels.map((label, i) =>
        i % labelStep === 0 || i === labels.length - 1 ? (
          <text key={i} x={padL + i * dx} y={height - 10} textAnchor="middle" className="chart-axis">
            {label}
          </text>
        ) : null
      )}
    </svg>
  );
}

function BarChart({ data, height = 160, defaultColor = "#4f8879", width = 540 }) {
  if (!data.length) {
    return <div className="empty-state compact-empty"><span>Данных пока нет.</span></div>;
  }
  const padL = 28;
  const padR = 12;
  const padT = 16;
  const padB = 30;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = w / data.length;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="report-chart" preserveAspectRatio="none">
      {data.map((d, i) => {
        const bh = (d.value / max) * h;
        const x = padL + i * barW + barW * 0.15;
        const y = padT + h - bh;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW * 0.7} height={bh} rx={4} fill={d.color || defaultColor} />
            <text x={x + (barW * 0.7) / 2} y={y - 4} textAnchor="middle" className="chart-axis chart-bar-value">
              {d.value}
            </text>
            <text x={padL + i * barW + barW / 2} y={height - 8} textAnchor="middle" className="chart-axis">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function scorePulse(pulse = {}) {
  const energy = Number(pulse.energy) || 0;
  const loadRelief = 11 - (Number(pulse.load) || 0);
  const clarity = Number(pulse.clarity) || 0;
  const trust = Number(pulse.trust) || 0;
  return Math.max(0, Math.min(100, Math.round((energy * 0.28 + loadRelief * 0.24 + clarity * 0.24 + trust * 0.24) * 10)));
}

function heatmapTone(metric, value) {
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

function priorityLabel(priority) {
  return {
    high: "Срочный",
    medium: "Важный",
    low: "Низкий"
  }[priority];
}

function sourceLabel(source) {
  return source === "employee" ? "Участник" : "Лид";
}

function sourceTone(source) {
  return source === "employee" ? "participant" : "lead";
}

function ownerLabel(owner) {
  return owner === "manager" ? "Лид команды" : "Участник 1:1";
}

function pluralizeRu(count, forms) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function countLabel(count, forms) {
  return `${count} ${pluralizeRu(count, forms)}`;
}

function meetingSortValue(value = "") {
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

function isDemoAccess(user) {
  return user?.username === "demo" || user?.personId === "demo-sre";
}

function isPlatformAdminRole(user) {
  return user?.role === "platform_admin" || user?.role === "admin";
}

function isLeadRole(user) {
  return user?.role === "lead" || isPlatformAdminRole(user);
}

function isProtectedAccess(user) {
  return isPlatformAdminRole(user);
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Ошибка запроса");
  }

  return payload;
}

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [activeSection, setActiveSection] = useState("home");
  const [activeView, setActiveView] = useState("agenda");
  const [activeFilter, setActiveFilter] = useState("all");
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveRetryTick, setSaveRetryTick] = useState(0);
  const [newCard, setNewCard] = useState({
    source: "employee",
    category: "checkin",
    priority: "medium",
    lprId: "",
    title: "",
    body: ""
  });
  const [newAction, setNewAction] = useState({
    owner: "manager",
    title: "",
    due: "к следующему 1:1"
  });
  const [summaryText, setSummaryText] = useState("");
  const [newUser, setNewUser] = useState({
    role: "employee",
    leadUserId: "",
    personName: "",
    personRole: "Team Member",
    personTeam: "Product",
    username: "",
    password: ""
  });
  const [passwordUpdate, setPasswordUpdate] = useState({ userId: "", password: "" });
  const [newPerson, setNewPerson] = useState({
    name: "",
    meetingName: "",
    role: "Team Member",
    team: "Product",
    cadence: "каждую неделю",
    nextMeeting: "нужно запланировать",
    managerFocus: ""
  });
  const [userMessage, setUserMessage] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [profileName, setProfileName] = useState("");
  const [showCreateLoginForm, setShowCreateLoginForm] = useState(false);

  const setFormError = (formId, message) =>
    setFormErrors((current) => ({ ...current, [formId]: message }));
  const clearFormError = (formId) =>
    setFormErrors((current) => {
      if (!(formId in current)) return current;
      const next = { ...current };
      delete next[formId];
      return next;
    });
  const [peopleSearch, setPeopleSearch] = useState("");
  const [pendingDeletePersonId, setPendingDeletePersonId] = useState("");
  const [newGoal, setNewGoal] = useState({
    personId: "",
    lprId: "",
    title: "",
    description: "",
    horizon: "",
    dueDate: ""
  });
  const [goalsFilter, setGoalsFilter] = useState({ personId: "all", status: "active" });
  const [newLpr, setNewLpr] = useState({
    personId: "",
    title: "",
    focus: ""
  });
  const [competencyDraft, setCompetencyDraft] = useState({
    personId: "",
    title: "Кейс-интервью по компетенциям",
    roleContext: "",
    rows: ""
  });
  const [lprFilter, setLprFilter] = useState({ personId: "all", status: "active" });
  const [surveyDrafts, setSurveyDrafts] = useState({});
  const [expandedSurveyId, setExpandedSurveyId] = useState("");
  const [showSurveyComposer, setShowSurveyComposer] = useState(false);
  const [surveyComposer, setSurveyComposer] = useState({
    title: "",
    description: "",
    anonymous: false,
    questions: [emptyQuestionFor("scale")]
  });
  const [theme, setTheme] = useState(() => (typeof window !== "undefined" ? readStoredTheme() : "system"));
  const [editingCardId, setEditingCardId] = useState("");
  const [cardEditDraft, setCardEditDraft] = useState({ title: "", body: "" });
  const [editingActionId, setEditingActionId] = useState("");
  const [actionEditDraft, setActionEditDraft] = useState({ title: "", due: "", dueDate: "" });
  const [expandedMeetingId, setExpandedMeetingId] = useState("");
  const [myPassword, setMyPassword] = useState("");
  const [newManagerNote, setNewManagerNote] = useState({ body: "", tags: [] });
  const [pulseDrafts, setPulseDrafts] = useState({});
  const [goalProgressDrafts, setGoalProgressDrafts] = useState({});
  const [editingPersonId, setEditingPersonId] = useState("");
  const createLoginPanelRef = useRef(null);
  const [personEditDraft, setPersonEditDraft] = useState({
    name: "",
    role: "",
    team: "",
    cadence: "",
    nextMeeting: "",
    managerFocus: "",
    meetingType: "regular",
    mentorshipMode: "coach",
    growthNarrative: "",
    performanceNarrative: ""
  });
  const seenSectionsRef = useRef(new Set());
  const sectionStaggerClass = (sectionId) =>
    seenSectionsRef.current.has(sectionId) ? "" : "stagger-once";

  useEffect(() => {
    if (!activeSection) return;
    // Mark as "seen" after first mount, so when the user comes back the
    // staggered entry does not re-play.
    const id = window.setTimeout(() => seenSectionsRef.current.add(activeSection), 600);
    return () => window.clearTimeout(id);
  }, [activeSection]);

  useEffect(() => {
    applyThemeAttr(theme);
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // localStorage may be unavailable (private mode); apply anyway
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyThemeAttr("system");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);
  const [revealSummary, setRevealSummary] = useState(false);
  const summaryPanelRef = useRef(null);
  const dirtyRef = useRef(false);
  const retrySaveTimerRef = useRef(null);
  const meetingStateSaveTimerRef = useRef(null);
  const meetingStateSaveQueueRef = useRef({});
  const pendingCardTitleKeysRef = useRef(new Set());
  const pendingActionTitleKeysRef = useRef(new Set());

  // "isAdmin" is the legacy UI flag for "can manage the visible team workspace";
  // platform admin sections still check the exact role.
  const isPlatformAdmin = isPlatformAdminRole(user);
  const isAdmin = isLeadRole(user);
  const canCreateLeadLogin = isPlatformAdminRole(user);
  const canResetDemo = Boolean(user?.canResetDemo);
  const displayName = user?.name || user?.username || "";

  useEffect(() => {
    bootstrap();
  }, []);

  // Coalesce rapid edits (slider drags, typing) into a single trailing save.
  useEffect(() => {
    if (!workspace || !dirtyRef.current) return undefined;
    const snapshot = workspace;
    const timeoutId = window.setTimeout(() => {
      dirtyRef.current = false;
      void saveWorkspace(snapshot);
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [workspace, saveRetryTick]);

  useEffect(() => {
    return () => {
      if (retrySaveTimerRef.current) {
        window.clearTimeout(retrySaveTimerRef.current);
      }
      if (meetingStateSaveTimerRef.current) {
        window.clearTimeout(meetingStateSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!userMessage) return undefined;
    const timeoutId = window.setTimeout(() => setUserMessage(""), 3600);
    return () => window.clearTimeout(timeoutId);
  }, [userMessage]);

  useEffect(() => {
    setProfileName(user?.name || "");
  }, [user?.id, user?.name]);

  useEffect(() => {
    if (!user) return;
    setGoalsFilter((current) => ({
      ...current,
      personId: isAdmin ? "all" : user?.personId || "all"
    }));
    setNewGoal((current) => ({
      ...current,
      personId: isAdmin ? "" : user?.personId || "",
      lprId: ""
    }));
    setLprFilter((current) => ({
      ...current,
      personId: isAdmin ? "all" : user?.personId || "all"
    }));
    setNewLpr((current) => ({
      ...current,
      personId: isAdmin ? "" : user?.personId || ""
    }));
    setCompetencyDraft((current) => ({
      ...current,
      personId: isAdmin ? current.personId : user?.personId || ""
    }));
  }, [isAdmin, user?.personId]);

  useEffect(() => {
    function handleSpotlight(event) {
      const target = event.target.closest(".goal-card, .survey-card");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      target.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }
    document.addEventListener("pointermove", handleSpotlight);
    return () => document.removeEventListener("pointermove", handleSpotlight);
  }, []);

  useEffect(() => {
    if (!revealSummary || activeView !== "outcomes") return undefined;
    const timeoutId = window.setTimeout(() => {
      summaryPanelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      setRevealSummary(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeView, revealSummary, summaryText]);

  async function bootstrap() {
    try {
      const me = await apiFetch("/api/me");
      setUser(me.user);
      await loadWorkspace(me.user);
      setAuthState("ready");
    } catch {
      setUser(null);
      setWorkspace(null);
      setAuthState("ready");
    }
  }

  async function loadWorkspace(nextUser = user) {
    const data = await apiFetch("/api/workspace");
    const nextWorkspace = { ...emptyWorkspace, ...data };
    const defaultPersonId = nextWorkspace.people.find((person) => person.id !== "demo-sre")?.id || nextWorkspace.people[0]?.id || "";
    setWorkspace(nextWorkspace);
    const firstPersonId = nextUser?.personId || defaultPersonId;
    setSelectedPersonId((current) => (nextWorkspace.people.some((person) => person.id === current) ? current : firstPersonId));
    setPasswordUpdate((current) => ({
      ...current,
      userId: current.userId || nextWorkspace.users.find((item) => !isProtectedAccess(item))?.id || ""
    }));
  }

  async function handleLogin(event) {
    event.preventDefault();
    await performLogin(credentials);
  }

  async function performLogin(nextCredentials) {
    setLoginError("");

    try {
      const response = await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify(nextCredentials)
      });
      setUser(response.user);
      setActiveSection("home");
      setShowCreateLoginForm(false);
      const responseCanManageTeam = isLeadRole(response.user);
      setNewCard((current) => ({ ...current, source: responseCanManageTeam ? current.source : "employee" }));
      setNewAction((current) => ({ ...current, owner: responseCanManageTeam ? current.owner : "employee" }));
      await loadWorkspace(response.user);
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function logout() {
    await apiFetch("/api/logout", { method: "POST", body: "{}" }).catch(() => {});
    setUser(null);
    setWorkspace(null);
    setSummaryText("");
    setActiveSection("home");
    setShowCreateLoginForm(false);
  }

  function commitWorkspace(updater) {
    dirtyRef.current = true;
    setWorkspace((current) => {
      if (!current) return current;
      return typeof updater === "function" ? updater(current) : updater;
    });
  }

  function patchWorkspaceLocally(updater) {
    setWorkspace((current) => {
      if (!current) return current;
      return typeof updater === "function" ? updater(current) : updater;
    });
  }

  async function saveWorkspace(nextWorkspace) {
    try {
      setSaveError("");
      if (retrySaveTimerRef.current) {
        window.clearTimeout(retrySaveTimerRef.current);
        retrySaveTimerRef.current = null;
      }
      const saved = await apiFetch("/api/workspace", {
        method: "POST",
        body: JSON.stringify(nextWorkspace)
      });
      // Apply server-sanitized state only when no further edits are pending —
      // otherwise we'd overwrite in-flight changes with a stale snapshot.
      if (!dirtyRef.current) {
        setWorkspace({ ...emptyWorkspace, ...saved });
      } else {
        setWorkspace((current) => (current ? { ...current, users: saved.users || current.users } : current));
      }
    } catch (error) {
      setSaveError(error.message);
      if (error.message.includes("авторизация")) {
        setUser(null);
        setWorkspace(null);
        return;
      }
      dirtyRef.current = true;
      if (!retrySaveTimerRef.current) {
        retrySaveTimerRef.current = window.setTimeout(() => {
          retrySaveTimerRef.current = null;
          setSaveRetryTick((tick) => tick + 1);
        }, 1600);
      }
    }
  }

  function mergeMeetingStatePatch(existing = {}, patch = {}) {
    const next = { ...existing };
    if (patch.prep) {
      next.prep = { ...(existing.prep || {}), ...patch.prep };
    }
    if (patch.pulse) {
      next.pulse = { ...(existing.pulse || {}), ...patch.pulse };
    }
    if (Object.prototype.hasOwnProperty.call(patch, "meetingDraft")) {
      next.meetingDraft = patch.meetingDraft;
    }
    return next;
  }

  function queueMeetingStateSave(personId, patch) {
    meetingStateSaveQueueRef.current = {
      ...meetingStateSaveQueueRef.current,
      [personId]: mergeMeetingStatePatch(meetingStateSaveQueueRef.current[personId], patch)
    };
    if (meetingStateSaveTimerRef.current) {
      window.clearTimeout(meetingStateSaveTimerRef.current);
    }
    meetingStateSaveTimerRef.current = window.setTimeout(() => {
      void flushMeetingStateSaves();
    }, 350);
  }

  async function flushMeetingStateSaves() {
    const queued = meetingStateSaveQueueRef.current;
    meetingStateSaveQueueRef.current = {};
    meetingStateSaveTimerRef.current = null;
    const entries = Object.entries(queued);
    if (!entries.length) return;

    try {
      setSaveError("");
      let latestWorkspace = null;
      for (const [personId, patch] of entries) {
        const response = await apiFetch(`/api/people/${encodeURIComponent(personId)}/meeting-state`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
        latestWorkspace = response.workspace || latestWorkspace;
      }
      if (latestWorkspace) {
        setWorkspace((current) =>
          current
            ? {
                ...current,
                prep: latestWorkspace.prep || current.prep,
                pulse: latestWorkspace.pulse || current.pulse,
                pulseHistory: latestWorkspace.pulseHistory || current.pulseHistory,
                meetingDrafts: latestWorkspace.meetingDrafts || current.meetingDrafts
              }
            : current
        );
      }
    } catch (error) {
      setSaveError(error.message);
      if (error.message.includes("авторизация")) {
        setUser(null);
        setWorkspace(null);
        return;
      }
      for (const [personId, patch] of entries) {
        meetingStateSaveQueueRef.current[personId] = mergeMeetingStatePatch(
          patch,
          meetingStateSaveQueueRef.current[personId]
        );
      }
      if (!meetingStateSaveTimerRef.current) {
        meetingStateSaveTimerRef.current = window.setTimeout(() => {
          void flushMeetingStateSaves();
        }, 1600);
      }
    }
  }

  const selectedPerson =
    workspace?.people.find((person) => person.id === selectedPersonId) ||
    workspace?.people[0] ||
    null;
  const selectedPulse = selectedPerson ? workspace?.pulse[selectedPerson.id] || {} : {};
  const selectedPulseDraft = selectedPerson ? pulseDrafts[selectedPerson.id] || {} : {};
  const selectedMeetingDraft = selectedPerson ? workspace?.meetingDrafts?.[selectedPerson.id] || "" : "";
  const selectedScore = selectedPerson ? scorePulse(selectedPulse) : 0;
  const personPrep = selectedPerson ? workspace?.prep[selectedPerson.id] || {} : {};
  const personActions = selectedPerson ? workspace?.actions.filter((action) => action.personId === selectedPerson.id) || [] : [];
  const unresolvedActions = personActions.filter((action) => !action.done);
  const personCards = selectedPerson ? workspace?.cards.filter((card) => card.personId === selectedPerson.id) || [] : [];
  const openCardTitleKeys = useMemo(
    () =>
      new Set(
        personCards
          .filter((card) => card.status !== "done")
          .map((card) => duplicateTitleKey(card.title))
          .filter(Boolean)
      ),
    [personCards]
  );
  const openActionTitleKeys = useMemo(
    () => new Set(unresolvedActions.map((action) => duplicateTitleKey(action.title)).filter(Boolean)),
    [unresolvedActions]
  );
  const newCardTitleKey = duplicateTitleKey(newCard.title);
  const newCardAlreadyOpen = Boolean(newCardTitleKey && openCardTitleKeys.has(newCardTitleKey));
  const newActionTitleKey = duplicateTitleKey(newAction.title);
  const newActionAlreadyOpen = Boolean(newActionTitleKey && openActionTitleKeys.has(newActionTitleKey));

  useEffect(() => {
    pendingCardTitleKeysRef.current = new Set(openCardTitleKeys);
  }, [openCardTitleKeys]);

  useEffect(() => {
    pendingActionTitleKeysRef.current = new Set(openActionTitleKeys);
  }, [openActionTitleKeys]);

  const riskCards = workspace?.cards.filter((card) => card.category === "blocker" && card.status !== "done") || [];
  const realPeople = workspace?.people.filter((person) => person.id !== "demo-sre") || [];
  const realUsers = workspace?.users.filter((item) => !isDemoAccess(item)) || [];
  const teamLeadUsers = realUsers.filter((item) => item.role === "lead");
  const editableUsers = workspace?.users.filter((item) => !isProtectedAccess(item)) || [];
  const dashboardPeople = isAdmin && realPeople.length ? realPeople : workspace?.people || [];
  const hasDashboardPeople = dashboardPeople.length > 0;
  const dashboardPersonIds = new Set(dashboardPeople.map((person) => person.id));
  const dashboardCards = workspace?.cards.filter((card) => dashboardPersonIds.has(card.personId)) || [];
  const openDashboardCards = dashboardCards.filter((card) => card.status !== "done");
  const openDashboardActions = workspace?.actions.filter((action) => dashboardPersonIds.has(action.personId) && !action.done) || [];
  const urgentDashboardCards = openDashboardCards
    .filter((card) => card.priority === "high" || card.category === "blocker")
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
    });
  const dashboardSnapshots = dashboardPeople.map((person) => {
    const score = scorePulse(workspace?.pulse[person.id]);
    const prep = workspace?.prep[person.id] || {};
    const readinessScore = Math.round((checklist.filter((item) => prep[item.id]).length / checklist.length) * 100);
    const personOpenCards = openDashboardCards.filter((card) => card.personId === person.id);
    return {
      person,
      score,
      readiness: readinessScore,
      openCards: personOpenCards.length,
      urgentCards: personOpenCards.filter((card) => card.priority === "high" || card.category === "blocker").length,
      openActions: openDashboardActions.filter((action) => action.personId === person.id).length
    };
  });
  const dashboardScore = dashboardSnapshots.length
    ? Math.round(dashboardSnapshots.reduce((sum, item) => sum + item.score, 0) / dashboardSnapshots.length)
    : 0;
  const attentionPeople = [...dashboardSnapshots]
    .sort((a, b) => {
      const weightA = (a.score < 64 ? 80 : 0) + a.urgentCards * 18 + a.openActions * 4 + (100 - a.readiness) / 10;
      const weightB = (b.score < 64 ? 80 : 0) + b.urgentCards * 18 + b.openActions * 4 + (100 - b.readiness) / 10;
      return weightB - weightA || a.score - b.score;
    })
    .slice(0, 5);
  const upcomingMeetings = [...dashboardSnapshots]
    .sort((a, b) => meetingSortValue(a.person.nextMeeting) - meetingSortValue(b.person.nextMeeting))
    .slice(0, 5);
  const peopleInRiskZone = dashboardSnapshots.filter((item) => item.score < 64 || item.urgentCards > 0).length;
  const selectedSection = sectionRegistry[activeSection] || sectionRegistry.home;
  const pageTitle = activeSection === "meetings" && selectedPerson ? `1:1 с ${selectedPerson.meetingName}` : selectedSection.title;
  const pageEyebrow = activeSection === "meetings" ? "Повестка и шаги" : selectedSection.eyebrow;
  const pageDescription = sectionDescriptionFor(activeSection, { isAdmin, selectedPerson });
  const normalizedPeopleSearch = peopleSearch.trim().toLowerCase();
  const filteredMeetingPeople = normalizedPeopleSearch
    ? (workspace?.people || []).filter((person) =>
        [person.name, person.role, person.team].some((value) => String(value || "").toLowerCase().includes(normalizedPeopleSearch))
      )
    : workspace?.people || [];
  const dashboardIntroText = isAdmin
    ? "Сводка по участникам 1:1: пульс, срочные темы, открытые шаги и ближайшие встречи."
    : "Ваши открытые темы, пульс, подготовка и следующие шаги до ближайшего 1:1.";
  const dashboardKpis = [
    [HeartPulse, "Пульс", dashboardScore, isAdmin ? "среднее по участникам" : "по вашему профилю", "teal"],
    [UsersRound, isAdmin ? "Участники" : "Профиль", dashboardPeople.length, isAdmin ? "в процессе 1:1" : "доступен вам", "slate"],
    [AlertTriangle, "Срочные темы", urgentDashboardCards.length, "риски и блокеры", "amber"],
    [CheckCircle2, "Открытые шаги", openDashboardActions.length, "требуют выполнения", "green"]
  ];

  const teamScore = useMemo(() => {
    if (!workspace?.people.length) return 0;
    const scores = workspace.people.map((person) => scorePulse(workspace.pulse[person.id]));
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }, [workspace]);

  const readiness = useMemo(() => {
    const done = checklist.filter((item) => personPrep[item.id]).length;
    return Math.round((done / checklist.length) * 100);
  }, [personPrep]);

  const allGoals = workspace?.goals || [];
  const allLprs = workspace?.lprs || [];
  const lprById = useMemo(() => new Map(allLprs.map((lpr) => [lpr.id, lpr])), [allLprs]);
  const personGoals = selectedPerson ? allGoals.filter((goal) => goal.personId === selectedPerson.id) : [];
  const activePersonGoals = personGoals.filter((goal) => goal.status === "active");
  const personLprs = selectedPerson ? allLprs.filter((lpr) => lpr.personId === selectedPerson.id) : [];
  const activePersonLprs = personLprs.filter((lpr) => lpr.status === "active");
  const lprTargetPersonId = newLpr.personId || selectedPersonId;
  const goalTargetPersonId = newGoal.personId || selectedPersonId;
  const goalAvailableLprs = allLprs.filter((lpr) => lpr.personId === goalTargetPersonId && lpr.status !== "done");

  const filteredLprs = useMemo(() => {
    return allLprs
      .filter((lpr) => {
        if (lprFilter.personId !== "all" && lpr.personId !== lprFilter.personId) return false;
        if (lprFilter.status !== "all" && lpr.status !== lprFilter.status) return false;
        return true;
      })
      .sort((a, b) => {
        const statusDelta = (lprStatusOrder[a.status] ?? 9) - (lprStatusOrder[b.status] ?? 9);
        if (statusDelta !== 0) return statusDelta;
        return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "");
      });
  }, [allLprs, lprFilter]);

  const lprAggregate = useMemo(() => {
    const active = allLprs.filter((lpr) => lpr.status === "active");
    const linkedGoals = allGoals.filter((goal) => goal.lprId).length;
    const linkedCards = (workspace?.cards || []).filter((card) => card.lprId).length;
    const activeGoalProgress = allGoals.filter((goal) => goal.lprId && goal.status === "active");
    const avgProgress = activeGoalProgress.length
      ? Math.round(activeGoalProgress.reduce((sum, goal) => sum + (goal.progress || 0), 0) / activeGoalProgress.length)
      : 0;
    return { active: active.length, linkedGoals, linkedCards, avgProgress };
  }, [allLprs, allGoals, workspace?.cards]);

  const briefing = useMemo(() => {
    if (!selectedPerson) return null;
    const history = (workspace?.pulseHistory || []).filter((entry) => entry.personId === selectedPerson.id);
    const sorted = [...history].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const score = (p) =>
      p ? Math.round(((p.energy + (11 - p.load) + p.clarity + p.trust) / 4) * 10) : 0;
    const currentScore = score(selectedPulse);
    const fourWeeksAgo = sorted.length >= 5 ? sorted[Math.max(0, sorted.length - 5)] : sorted[0];
    const baseScore = score(fourWeeksAgo);
    const delta = sorted.length >= 2 ? currentScore - baseScore : 0;
    const openTopics = personCards.filter((c) => c.status !== "done").length;
    const urgentTopics = personCards.filter(
      (c) => c.status !== "done" && (c.priority === "high" || c.category === "blocker")
    ).length;
    const openActionsCount = unresolvedActions.length;
    const employeeRatio = personCards.length
      ? Math.round((personCards.filter((c) => c.source === "employee").length / personCards.length) * 100)
      : 0;

    // On-call load aggregate over last 4 weeks
    const oncall = (workspace?.oncallLoad || []).filter((e) => e.personId === selectedPerson.id);
    const sortedOncall = [...oncall].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, 4);
    const totalPages = sortedOncall.reduce((s, e) => s + e.pagesTotal, 0);
    const totalAfterHours = sortedOncall.reduce((s, e) => s + e.afterHoursPages, 0);
    const totalSleepNights = sortedOncall.reduce((s, e) => s + e.sleepDisruptedNights, 0);
    const avgPagesPerWeek = sortedOncall.length ? Math.round(totalPages / sortedOncall.length) : 0;

    return {
      currentScore,
      delta,
      openTopics,
      urgentTopics,
      openActionsCount,
      employeeRatio,
      oncallWeeks: sortedOncall.length,
      avgPagesPerWeek,
      totalAfterHours,
      totalSleepNights
    };
  }, [selectedPerson, selectedPulse, workspace, personCards, unresolvedActions]);

  const filteredGoals = useMemo(() => {
    return allGoals
      .filter((goal) => {
        if (goalsFilter.personId !== "all" && goal.personId !== goalsFilter.personId) return false;
        if (goalsFilter.status !== "all" && goal.status !== goalsFilter.status) return false;
        return true;
      })
      .sort((a, b) => {
        const statusDelta = (goalStatusOrder[a.status] ?? 9) - (goalStatusOrder[b.status] ?? 9);
        if (statusDelta !== 0) return statusDelta;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
  }, [allGoals, goalsFilter]);

  const alertsData = useMemo(() => {
    const peopleScope = workspace?.people || [];
    const history = workspace?.pulseHistory || [];
    const cards = workspace?.cards || [];
    const actions = workspace?.actions || [];
    const today = todayISODate();
    const alerts = [];

    for (const person of peopleScope) {
      const personHistory = history
        .filter((entry) => entry.personId === person.id)
        .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
      const personPulse = workspace?.pulse?.[person.id];
      const personCards = cards.filter((c) => c.personId === person.id && c.status !== "done");
      const personActions = actions.filter((a) => a.personId === person.id && !a.done);

      // Energy dropped ≥3 over last 4 weeks
      if (personHistory.length >= 5) {
        const latest = personHistory[personHistory.length - 1];
        const baseline = personHistory[Math.max(0, personHistory.length - 5)];
        const energyDelta = latest.energy - baseline.energy;
        if (energyDelta <= -3) {
          alerts.push({
            personId: person.id,
            severity: "high",
            kind: "energy-drop",
            label: `Энергия ${person.name} упала на ${Math.abs(energyDelta)} за 4 недели`
          });
        }
      }

      // Load ≥9 for 2 weeks running
      if (personHistory.length >= 3) {
        const recent = personHistory.slice(-3);
        if (recent.every((e) => e.load >= 9)) {
          alerts.push({
            personId: person.id,
            severity: "high",
            kind: "load-sustained",
            label: `Нагрузка у ${person.name} держится на 9+ три недели подряд`
          });
        }
      }

      // Trust dropped ≥2 over 4 weeks
      if (personHistory.length >= 5) {
        const latest = personHistory[personHistory.length - 1];
        const baseline = personHistory[Math.max(0, personHistory.length - 5)];
        if (latest.trust - baseline.trust <= -2) {
          alerts.push({
            personId: person.id,
            severity: "medium",
            kind: "trust-drop",
            label: `Доверие у ${person.name} проседает за месяц`
          });
        }
      }

      // Current pulse: load high + clarity low
      if (personPulse && personPulse.load >= 8 && personPulse.clarity <= 5) {
        alerts.push({
          personId: person.id,
          severity: "medium",
          kind: "load-no-clarity",
          label: `${person.name}: высокая нагрузка без ясности приоритетов`
        });
      }

      // Many overdue actions
      const overdue = personActions.filter((a) => a.dueDate && a.dueDate < today);
      if (overdue.length >= 3) {
        alerts.push({
          personId: person.id,
          severity: "medium",
          kind: "overdue-actions",
          label: `У ${person.name} ${overdue.length} просроченных шагов`
        });
      }

      // Many urgent open topics
      const urgent = personCards.filter(
        (c) => c.priority === "high" || c.category === "blocker"
      );
      if (urgent.length >= 3) {
        alerts.push({
          personId: person.id,
          severity: "medium",
          kind: "urgent-stack",
          label: `${person.name}: ${urgent.length} срочных открытых тем`
        });
      }

      // On-call burnout signals
      const personOncall = (workspace?.oncallLoad || [])
        .filter((e) => e.personId === person.id)
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
        .slice(0, 4);
      if (personOncall.length >= 2) {
        const totalPages = personOncall.reduce((s, e) => s + e.pagesTotal, 0);
        const totalAfterHours = personOncall.reduce((s, e) => s + e.afterHoursPages, 0);
        const totalSleep = personOncall.reduce((s, e) => s + e.sleepDisruptedNights, 0);
        const avgPerWeek = totalPages / personOncall.length;
        if (avgPerWeek > 8) {
          alerts.push({
            personId: person.id,
            severity: "high",
            kind: "oncall-noise",
            label: `${person.name}: высокий on-call шум, нужен разбор нагрузки`
          });
        } else if (totalAfterHours >= 6) {
          alerts.push({
            personId: person.id,
            severity: "medium",
            kind: "after-hours",
            label: `${person.name}: ${totalAfterHours} внерабочих срабатываний за месяц`
          });
        }
        if (totalSleep >= 4) {
          alerts.push({
            personId: person.id,
            severity: "high",
            kind: "sleep-disrupted",
            label: `${person.name}: ${totalSleep} ночей с прерванным сном за месяц`
          });
        }
      }
    }
    // Stable sort by severity: high first
    alerts.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.severity] || 9) - (order[b.severity] || 9);
    });
    return alerts;
  }, [workspace]);

  const reportsData = useMemo(() => {
    const history = workspace?.pulseHistory || [];
    const cards = workspace?.cards || [];
    const actions = workspace?.actions || [];
    const goals = workspace?.goals || [];
    const assessments = workspace?.competencyAssessments || [];
    const peopleScope = workspace?.people || [];

    const grouped = new Map();
    for (const entry of history) {
      let bucket = grouped.get(entry.capturedAt);
      if (!bucket) {
        bucket = { energy: 0, load: 0, clarity: 0, trust: 0, count: 0 };
        grouped.set(entry.capturedAt, bucket);
      }
      bucket.energy += entry.energy;
      bucket.load += entry.load;
      bucket.clarity += entry.clarity;
      bucket.trust += entry.trust;
      bucket.count += 1;
    }
    const sortedDates = Array.from(grouped.keys()).sort();
    const monthsRu = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    const trendLabels = sortedDates.map((d) => {
      const parts = d.split("-");
      const month = monthsRu[Number(parts[1]) - 1] || "";
      return `${Number(parts[2])} ${month}`;
    });
    const trendSeries = pulseSeries.map((s) => ({
      ...s,
      points: sortedDates.map((d) => {
        const b = grouped.get(d);
        return b.count ? +(b[s.id] / b.count).toFixed(1) : 0;
      })
    }));

    // Composite team pulse score per week (0-100). This matches the big number
    // on the dashboard so the tester does not see a mismatch between "Мой пульс 39"
    // and the 4-line breakdown chart that lives in 1-10 units.
    const compositeScorePoints = sortedDates.map((d) => {
      const b = grouped.get(d);
      if (!b.count) return 0;
      const energy = b.energy / b.count;
      const loadRelief = 11 - b.load / b.count;
      const clarity = b.clarity / b.count;
      const trust = b.trust / b.count;
      return Math.round(((energy * 0.28 + loadRelief * 0.24 + clarity * 0.24 + trust * 0.24)) * 10);
    });

    const activeCards = cards.filter((c) => c.status !== "done");
    const categoriesData = Object.entries(categories)
      .map(([id, meta]) => ({ label: meta.label, value: activeCards.filter((c) => c.category === id).length }))
      .filter((row) => row.value > 0);

    const priorityData = [
      { label: "Срочно", value: activeCards.filter((c) => c.priority === "high").length, color: "#b36b68" },
      { label: "Важно", value: activeCards.filter((c) => c.priority === "medium").length, color: "#b98145" },
      { label: "Низкий", value: activeCards.filter((c) => c.priority === "low").length, color: "#6c8f55" }
    ];

    const sourceData = [
      { label: "От участника", value: activeCards.filter((c) => c.source === "employee").length, color: "#597c90" },
      { label: "От лида", value: activeCards.filter((c) => c.source === "manager").length, color: "#4f8879" }
    ];

    // Per-person author ratio: for each person with cards, % of cards from
    // employee. Below 50% the manager is dominating the agenda — that is a
    // canonical warning sign in the GitLab/Atlassian playbooks.
    const authorRatioByPerson = peopleScope.map((person) => {
      const personCards = cards.filter((c) => c.personId === person.id);
      const total = personCards.length;
      const fromEmployee = personCards.filter((c) => c.source === "employee").length;
      const ratio = total ? Math.round((fromEmployee / total) * 100) : null;
      return { person, total, ratio };
    });
    const authorRatioWarn = authorRatioByPerson.filter(
      (item) => item.total >= 3 && item.ratio !== null && item.ratio < 50
    );

    const actionsOpen = actions.filter((a) => !a.done).length;
    const actionsDone = actions.filter((a) => a.done).length;
    const actionsTotal = actions.length;
    const completionPct = actionsTotal ? Math.round((actionsDone / actionsTotal) * 100) : 0;

    const activeGoals = goals.filter((g) => g.status === "active");
    const goalBuckets = [
      { label: "0–25%", value: activeGoals.filter((g) => g.progress < 25).length, color: "#b36b68" },
      { label: "25–50%", value: activeGoals.filter((g) => g.progress >= 25 && g.progress < 50).length, color: "#b98145" },
      { label: "50–75%", value: activeGoals.filter((g) => g.progress >= 50 && g.progress < 75).length, color: "#597c90" },
      { label: "75–100%", value: activeGoals.filter((g) => g.progress >= 75).length, color: "#6c8f55" }
    ];

    const latestCompetencyAssessments = peopleScope
      .map((person) => {
        const latest = assessments
          .filter((assessment) => assessment.personId === person.id)
          .sort((a, b) => (b.validatedAt || b.createdAt || "").localeCompare(a.validatedAt || a.createdAt || ""))[0];
        return latest ? { person, assessment: latest } : null;
      })
      .filter(Boolean);
    const competencyNames = [];
    const competencyNameByKey = new Map();
    for (const { assessment } of latestCompetencyAssessments) {
      for (const competency of assessment.competencies || []) {
        const key = competencyKey(competency.name);
        if (!key || competencyNameByKey.has(key)) continue;
        competencyNameByKey.set(key, competency.name);
        competencyNames.push(key);
      }
    }
    const competencyMatrixRows = competencyNames.map((key) => {
      const cells = latestCompetencyAssessments.map(({ person, assessment }) => {
        const competency = (assessment.competencies || []).find((item) => competencyKey(item.name) === key);
        return {
          person,
          assessmentId: assessment.id,
          score: competency ? Number(competency.score) : null,
          targetScore: competency ? Number(competency.targetScore || 3) : null,
          recommendation: competency?.recommendation || "",
          evidence: competency?.evidence || ""
        };
      });
      const scored = cells.filter((cell) => Number.isFinite(cell.score));
      const avg = scored.length ? Math.round((scored.reduce((sum, cell) => sum + cell.score, 0) / scored.length) * 10) / 10 : 0;
      const belowTarget = scored.filter((cell) => cell.score < (cell.targetScore || 3)).length;
      const busFactor = scored.filter((cell) => cell.score >= 4).length;
      return {
        key,
        name: competencyNameByKey.get(key),
        cells,
        avg,
        coverage: scored.length,
        belowTarget,
        busFactor
      };
    }).sort((a, b) => b.belowTarget - a.belowTarget || a.avg - b.avg || a.name.localeCompare(b.name));
    const competencyWeaknesses = competencyMatrixRows.filter((row) => row.coverage > 0 && (row.avg < 3 || row.belowTarget >= Math.ceil(row.coverage / 2)));
    const competencyStrengths = competencyMatrixRows.filter((row) => row.coverage > 0 && row.avg >= 4 && row.belowTarget === 0);
    const competencyBusFactorRisks = competencyMatrixRows.filter((row) => row.coverage >= 2 && row.busFactor <= 1);

    const latestDate = sortedDates[sortedDates.length - 1];
    const latestBucket = latestDate ? grouped.get(latestDate) : null;
    const latestAvg = latestBucket && latestBucket.count
      ? Math.round(
          ((latestBucket.energy + (11 * latestBucket.count - latestBucket.load) + latestBucket.clarity + latestBucket.trust) /
            (4 * latestBucket.count)) *
            10
        )
      : 0;
    const fourWeeksBack = sortedDates[Math.max(0, sortedDates.length - 5)];
    const baseBucket = fourWeeksBack ? grouped.get(fourWeeksBack) : null;
    const baseAvg = baseBucket && baseBucket.count
      ? Math.round(
          ((baseBucket.energy + (11 * baseBucket.count - baseBucket.load) + baseBucket.clarity + baseBucket.trust) /
            (4 * baseBucket.count)) *
            10
        )
      : 0;
    const trendDelta = latestAvg - baseAvg;

    return {
      trendLabels,
      trendSeries,
      compositeScorePoints,
      categoriesData,
      priorityData,
      sourceData,
      actionsOpen,
      actionsDone,
      completionPct,
      goalBuckets,
      activeGoalsCount: activeGoals.length,
      assessments,
      assessmentCount: assessments.length,
      latestCompetencyAssessments,
      competencyMatrixRows,
      competencyWeaknesses,
      competencyStrengths,
      competencyBusFactorRisks,
      latestAvg,
      trendDelta,
      peopleCount: peopleScope.length,
      authorRatioByPerson,
      authorRatioWarn
    };
  }, [workspace]);

  const goalsAggregate = useMemo(() => {
    const active = allGoals.filter((goal) => goal.status === "active");
    const achieved = allGoals.filter((goal) => goal.status === "achieved").length;
    const totalProgress = active.reduce((sum, goal) => sum + (goal.progress || 0), 0);
    const avgProgress = active.length ? Math.round(totalProgress / active.length) : 0;
    const atRisk = active.filter((goal) => goal.progress < 30).length;
    return { active: active.length, achieved, avgProgress, atRisk };
  }, [allGoals]);

  const peopleById = useMemo(
    () => new Map((workspace?.people || []).map((person) => [person.id, person])),
    [workspace?.people]
  );
  const firstUpcomingMeeting = upcomingMeetings[0] || null;
  const actionInboxItems = [
    ...urgentDashboardCards.slice(0, 4).map((card) => {
      const person = peopleById.get(card.personId);
      return {
        id: `card-${card.id}`,
        label: "Тема",
        tone: card.priority === "high" ? "risk" : "watch",
        title: card.title,
        meta: `${person?.name || "Участник"} · ${priorityLabel(card.priority)}`,
        personId: card.personId
      };
    }),
    ...openDashboardActions.slice(0, 4).map((action) => {
      const person = peopleById.get(action.personId);
      const isOverdue = action.dueDate && action.dueDate < todayISODate();
      return {
        id: `action-${action.id}`,
        label: "Шаг",
        tone: isOverdue ? "risk" : "neutral",
        title: action.title,
        meta: `${person?.name || "Участник"} · ${action.due || action.dueDate || "без срока"}`,
        personId: action.personId
      };
    }),
    ...alertsData.slice(0, 4).map((alert) => ({
      id: `alert-${alert.personId}-${alert.kind}`,
      label: "Сигнал",
      tone: alert.severity === "high" ? "risk" : "watch",
      title: alert.label,
      meta: "проверить на ближайшем 1:1",
      personId: alert.personId
    }))
  ].slice(0, 6);
  const prepQueue = [...dashboardSnapshots]
    .filter((item) => item.readiness < 85 || item.openActions > 0 || item.urgentCards > 0)
    .sort((a, b) => {
      const weightA = a.urgentCards * 30 + a.openActions * 8 + (100 - a.readiness);
      const weightB = b.urgentCards * 30 + b.openActions * 8 + (100 - b.readiness);
      return weightB - weightA;
    })
    .slice(0, 4);
  const person360Metrics = selectedPerson
    ? [
        {
          label: "Темы",
          value: briefing?.openTopics ?? personCards.filter((card) => card.status !== "done").length,
          detail: briefing?.urgentTopics ? `${briefing.urgentTopics} срочных` : "в повестке"
        },
        {
          label: "Шаги",
          value: briefing?.openActionsCount ?? unresolvedActions.length,
          detail: "открытые"
        },
        {
          label: "ЛПР",
          value: activePersonLprs.length,
          detail: "активных"
        },
        {
          label: "Цели",
          value: activePersonGoals.length,
          detail: "активных"
        },
        {
          label: "Пульс",
          value: selectedScore,
          detail: selectedPerson.trend || "сейчас"
        }
      ]
    : [];
  const teamHeatmapRows = [...dashboardSnapshots]
    .map((item) => {
      const pulse = workspace?.pulse?.[item.person.id] || {};
      return {
        ...item,
        energy: Number(pulse.energy) || 0,
        load: Number(pulse.load) || 0,
        clarity: Number(pulse.clarity) || 0,
        trust: Number(pulse.trust) || 0
      };
    })
    .sort((a, b) => a.score - b.score || b.urgentCards - a.urgentCards)
    .slice(0, 8);
  const reportRecommendations = [
    ...alertsData.slice(0, 3).map((alert) => ({
      id: `alert-${alert.personId}-${alert.kind}`,
      tone: alert.severity === "high" ? "risk" : "watch",
      title: alert.label,
      action: "разобрать на ближайшем 1:1",
      personId: alert.personId
    })),
    reportsData.authorRatioWarn.length > 0 && {
      id: "author-ratio",
      tone: "watch",
      title: `${reportsData.authorRatioWarn.length} ${pluralizeRu(reportsData.authorRatioWarn.length, ["повестка", "повестки", "повесток"])} ведёт лид`,
      action: "вернуть участнику ownership тем",
      section: "reports"
    },
    reportsData.completionPct < 65 && {
      id: "actions-completion",
      tone: "risk",
      title: "Следующие шаги закрываются медленно",
      action: "сузить WIP и назначить владельцев",
      section: "reports"
    },
    goalsAggregate.atRisk > 0 && {
      id: "goals-risk",
      tone: "watch",
      title: `${goalsAggregate.atRisk} ${pluralizeRu(goalsAggregate.atRisk, ["цель", "цели", "целей"])} под риском`,
      action: "привязать к ЛПР и ближайшим шагам",
      section: "goals"
    },
    reportsData.competencyWeaknesses.length > 0 && {
      id: "competency-weaknesses",
      tone: "watch",
      title: `${reportsData.competencyWeaknesses.length} ${pluralizeRu(reportsData.competencyWeaknesses.length, ["компетенция проседает", "компетенции проседают", "компетенций проседают"])}`,
      action: "импортировать зоны роста в ЛПР",
      section: "reports"
    },
    reportsData.competencyBusFactorRisks.length > 0 && {
      id: "competency-bus-factor",
      tone: "risk",
      title: `${reportsData.competencyBusFactorRisks.length} ${pluralizeRu(reportsData.competencyBusFactorRisks.length, ["риск bus factor", "риска bus factor", "рисков bus factor"])}`,
      action: "распределить критичные навыки в команде",
      section: "reports"
    }
  ].filter(Boolean).slice(0, 6);
  const peopleWithoutAccess = (workspace?.people || []).filter(
    (person) => !(workspace?.users || []).some((item) => item.personId === person.id)
  ).length;
  const peopleWithoutMeetings = (workspace?.people || []).filter((person) => !person.nextMeeting).length;
  const teamOverviewStats = [
    [UsersRound, "Участники", workspace?.people?.length || 0, "в рабочей команде", "slate"],
    [HeartPulse, "В зоне внимания", peopleInRiskZone, "по пульсу и темам", "amber"],
    [KeyRound, "Без доступа", peopleWithoutAccess, "логин не выдан", "teal"],
    [CalendarDays, "Без 1:1", peopleWithoutMeetings, "нужно назначить", "green"]
  ];

  const filteredCards = useMemo(() => {
    const statusOrder = { todo: 0, discussing: 1, done: 2 };
    const priorityOrder = { high: 0, medium: 1, low: 2 };

    return personCards
      .filter((card) => {
        if (activeFilter === "all") return true;
        if (activeFilter === "open") return card.status !== "done";
        if (activeFilter === "employee") return card.source === "employee";
        if (activeFilter === "manager") return card.source === "manager";
        if (activeFilter === "health") return card.category === "checkin" || card.category === "blocker";
        return card.category === activeFilter;
      })
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || priorityOrder[a.priority] - priorityOrder[b.priority]);
  }, [personCards, activeFilter]);

  function selectPerson(personId) {
    setUserMessage("");
    setSelectedPersonId(personId);
    setActiveSection("meetings");
    setActiveView("agenda");
    setActiveFilter("all");
    setSummaryText("");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function openSection(sectionId) {
    const meta = sectionRegistry[sectionId];
    if (!meta) return;
    if (meta.adminOnly && !isAdmin) return;
    if (meta.platformAdminOnly && !isPlatformAdminRole(user)) return;
    setUserMessage("");
    setPendingDeletePersonId("");
    setActiveSection(sectionId);
    if (sectionId === "meetings") {
      setActiveView((current) => (["agenda", "health", "outcomes"].includes(current) ? current : "agenda"));
    }
    if (sectionId !== "meetings") {
      setSummaryText("");
    }
  }

  function openCreateLoginForm() {
    setUserMessage("");
    clearFormError("createUser");
    setShowCreateLoginForm(true);
    setNewUser((current) => ({
      ...current,
      role: canCreateLeadLogin ? current.role : "employee",
      leadUserId: canCreateLeadLogin ? current.leadUserId : "",
      personTeam: !canCreateLeadLogin && user?.teamLabel ? user.teamLabel : current.personTeam || "Product"
    }));
    window.requestAnimationFrame(() => {
      createLoginPanelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function closeCreateLoginForm() {
    setShowCreateLoginForm(false);
    clearFormError("createUser");
  }

  function pulseValue(metric) {
    return selectedPulseDraft[metric] ?? selectedPulse[metric] ?? 5;
  }

  function updatePulseDraft(metric, value) {
    if (!selectedPerson) return;
    const next = clampRangeValue(value, 1, 10, 5);
    setPulseDrafts((current) => ({
      ...current,
      [selectedPerson.id]: {
        ...(current[selectedPerson.id] || {}),
        [metric]: next
      }
    }));
  }

  function clearPulseDraft(metric) {
    if (!selectedPerson) return;
    setPulseDrafts((current) => {
      const personDraft = { ...(current[selectedPerson.id] || {}) };
      delete personDraft[metric];
      if (Object.keys(personDraft).length === 0) {
        const next = { ...current };
        delete next[selectedPerson.id];
        return next;
      }
      return { ...current, [selectedPerson.id]: personDraft };
    });
  }

  function commitPulseValue(metric, value) {
    if (!selectedPerson) return;
    const next = clampRangeValue(value, 1, 10, 5);
    if ((selectedPulse[metric] ?? 5) === next) {
      clearPulseDraft(metric);
      return;
    }
    patchWorkspaceLocally((current) => ({
      ...current,
      pulse: {
        ...current.pulse,
        [selectedPerson.id]: {
          ...(current.pulse[selectedPerson.id] || selectedPulse),
          [metric]: next
        }
      }
    }));
    queueMeetingStateSave(selectedPerson.id, { pulse: { [metric]: next } });
    clearPulseDraft(metric);
  }

  function togglePrep(itemId) {
    if (!selectedPerson) return;
    const item = checklist.find((entry) => entry.id === itemId);
    if (!isAdmin && item?.owner === "manager") return;
    const nextValue = !personPrep[itemId];
    patchWorkspaceLocally((current) => ({
      ...current,
      prep: {
        ...current.prep,
        [selectedPerson.id]: {
          ...(current.prep[selectedPerson.id] || {}),
          [itemId]: nextValue
        }
      }
    }));
    queueMeetingStateSave(selectedPerson.id, { prep: { [itemId]: nextValue } });
  }

  function addAgendaCard(event) {
    event.preventDefault();
    const title = newCard.title.trim();
    const titleKey = duplicateTitleKey(title);
    if (!selectedPerson || !titleKey) return;
    if (pendingCardTitleKeysRef.current.has(titleKey)) {
      setUserMessage("Такая тема уже есть в открытой повестке");
      return;
    }
    pendingCardTitleKeysRef.current.add(titleKey);

    const source = isAdmin ? newCard.source : "employee";
    const card = {
      id: makeId("card"),
      personId: selectedPerson.id,
      lprId: activePersonLprs.some((lpr) => lpr.id === newCard.lprId) ? newCard.lprId : "",
      source,
      category: newCard.category,
      priority: newCard.priority,
      status: "todo",
      title,
      body: newCard.body.trim()
    };

    commitWorkspace((current) => ({
      ...current,
      cards: [card, ...current.cards],
      prep: {
        ...current.prep,
        [selectedPerson.id]: {
          ...(current.prep[selectedPerson.id] || {}),
          [source === "employee" ? "employeeAgenda" : "managerAgenda"]: true
        }
      }
    }));
    setNewCard((current) => ({ ...current, title: "", body: "", lprId: "" }));
  }

  function addSeedCard(seed) {
    if (!selectedPerson) return;
    const titleKey = duplicateTitleKey(seed.title);
    if (!titleKey) return;
    if (pendingCardTitleKeysRef.current.has(titleKey)) {
      setUserMessage("Такая тема уже есть в открытой повестке");
      return;
    }
    pendingCardTitleKeysRef.current.add(titleKey);

    const source = isAdmin ? seed.source : "employee";
    const card = {
      id: makeId("card"),
      personId: selectedPerson.id,
      source,
      category: seed.category,
      priority: "medium",
      status: "todo",
      title: seed.title,
      body: seed.body
    };

    commitWorkspace((current) => ({
      ...current,
      cards: [card, ...current.cards],
      prep: {
        ...current.prep,
        [selectedPerson.id]: {
          ...(current.prep[selectedPerson.id] || {}),
          [source === "employee" ? "employeeAgenda" : "managerAgenda"]: true
        }
      }
    }));
  }

  function updateCardStatus(cardId, status) {
    commitWorkspace((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.id === cardId ? { ...card, status } : card))
    }));
  }

  function updateCardFields(cardId, patch) {
    commitWorkspace((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card))
    }));
  }

  function deleteCard(cardId) {
    commitWorkspace((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== cardId)
    }));
    setUserMessage("Тема удалена");
  }

  function updateActionFields(actionId, patch) {
    commitWorkspace((current) => ({
      ...current,
      actions: current.actions.map((action) =>
        action.id === actionId ? { ...action, ...patch } : action
      )
    }));
  }

  function deleteAction(actionId) {
    commitWorkspace((current) => ({
      ...current,
      actions: current.actions.filter((action) => action.id !== actionId)
    }));
    setUserMessage("Шаг удалён");
  }

  function promoteCardToAction(card) {
    if (!selectedPerson) return;
    const titleKey = duplicateTitleKey(card.title);
    if (!titleKey) return;
    if (pendingActionTitleKeysRef.current.has(titleKey)) {
      setUserMessage("Такой шаг уже есть в открытых действиях");
      return;
    }
    pendingActionTitleKeysRef.current.add(titleKey);

    const owner = isAdmin && card.source === "manager" ? "manager" : "employee";
    const action = {
      id: makeId("action"),
      personId: selectedPerson.id,
      owner,
      title: card.title,
      due: "к следующему 1:1",
      done: false
    };

    // Note: we do not auto-mark the card as "done" here. Promoting a topic to a
    // follow-up step does not mean the topic has been fully discussed — the user
    // still controls the «Обсудили» toggle independently.
    commitWorkspace((current) => ({
      ...current,
      actions: [action, ...current.actions],
      prep: {
        ...current.prep,
        [selectedPerson.id]: {
          ...(current.prep[selectedPerson.id] || {}),
          commitments: true
        }
      }
    }));
    setUserMessage(`Шаг «${card.title}» добавлен`);
  }

  function addAction(event) {
    event.preventDefault();
    const title = newAction.title.trim();
    const titleKey = duplicateTitleKey(title);
    if (!selectedPerson || !titleKey) return;
    if (pendingActionTitleKeysRef.current.has(titleKey)) {
      setUserMessage("Такой шаг уже есть в открытых действиях");
      return;
    }
    pendingActionTitleKeysRef.current.add(titleKey);

    const action = {
      id: makeId("action"),
      personId: selectedPerson.id,
      owner: isAdmin ? newAction.owner : "employee",
      title,
      due: newAction.due.trim() || "к следующему 1:1",
      done: false
    };

    commitWorkspace((current) => ({
      ...current,
      actions: [action, ...current.actions],
      prep: {
        ...current.prep,
        [selectedPerson.id]: {
          ...(current.prep[selectedPerson.id] || {}),
          commitments: true
        }
      }
    }));
    setNewAction({ owner: isAdmin ? "manager" : "employee", title: "", due: "к следующему 1:1" });
  }

  function toggleAction(actionId) {
    commitWorkspace((current) => ({
      ...current,
      actions: current.actions.map((action) => (action.id === actionId ? { ...action, done: !action.done } : action))
    }));
  }

  function addGoal(event) {
    event.preventDefault();
    const targetPersonId = isAdmin ? newGoal.personId || selectedPersonId : user?.personId;
    if (!targetPersonId || !newGoal.title.trim()) return;
    const targetLpr = allLprs.find((lpr) => lpr.id === newGoal.lprId && lpr.personId === targetPersonId);

    const goal = {
      id: makeId("goal"),
      personId: targetPersonId,
      lprId: targetLpr?.id || "",
      title: newGoal.title.trim(),
      description: newGoal.description.trim(),
      horizon: newGoal.horizon.trim(),
      dueDate: newGoal.dueDate.trim(),
      progress: 0,
      status: "active",
      createdAt: new Date().toISOString()
    };

    commitWorkspace((current) => ({
      ...current,
      goals: [goal, ...(current.goals || [])]
    }));
    setNewGoal({
      personId: isAdmin ? targetPersonId : "",
      lprId: targetLpr?.id || "",
      title: "",
      description: "",
      horizon: "",
      dueDate: ""
    });
    setUserMessage("Цель добавлена");
  }

  function updateGoalProgress(goalId, value) {
    const next = clampRangeValue(value, 0, 100, 0);
    commitWorkspace((current) => ({
      ...current,
      goals: (current.goals || []).map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              progress: next,
              status: next >= 100 ? "achieved" : ["abandoned", "achieved"].includes(goal.status) ? "active" : goal.status
            }
          : goal
      )
    }));
  }

  function goalProgressValue(goal) {
    return goalProgressDrafts[goal.id] ?? goal.progress;
  }

  function updateGoalProgressDraft(goalId, value) {
    setGoalProgressDrafts((current) => ({
      ...current,
      [goalId]: clampRangeValue(value, 0, 100, 0)
    }));
  }

  function clearGoalProgressDraft(goalId) {
    setGoalProgressDrafts((current) => {
      if (!(goalId in current)) return current;
      const next = { ...current };
      delete next[goalId];
      return next;
    });
  }

  function commitGoalProgressValue(goalId, value) {
    const next = clampRangeValue(value, 0, 100, 0);
    const goal = allGoals.find((item) => item.id === goalId);
    if ((goal?.progress ?? 0) === next) {
      clearGoalProgressDraft(goalId);
      return;
    }
    updateGoalProgress(goalId, next);
    clearGoalProgressDraft(goalId);
  }

  function setGoalStatus(goalId, status) {
    commitWorkspace((current) => ({
      ...current,
      goals: (current.goals || []).map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              status,
              progress: status === "achieved" ? 100 : goal.progress
            }
          : goal
      )
    }));
    // Switch the filter so the goal does not silently disappear from view.
    setGoalsFilter((current) => {
      if (current.status === "all" || current.status === status) return current;
      return { ...current, status };
    });
    setUserMessage(
      status === "achieved"
        ? "Цель отмечена как достигнутая"
        : status === "abandoned"
          ? "Цель снята"
          : "Цель снова активна"
    );
  }

  function deleteGoal(goalId) {
    commitWorkspace((current) => ({
      ...current,
      goals: (current.goals || []).filter((goal) => goal.id !== goalId)
    }));
    setUserMessage("Цель удалена");
  }

  function addLpr(event) {
    event.preventDefault();
    const targetPersonId = isAdmin ? newLpr.personId || selectedPersonId : user?.personId;
    if (!targetPersonId || !newLpr.title.trim()) return;
    const now = new Date().toISOString();
    const lpr = {
      id: makeId("lpr"),
      personId: targetPersonId,
      title: newLpr.title.trim(),
      focus: newLpr.focus.trim(),
      status: "active",
      createdAt: now,
      updatedAt: now
    };

    commitWorkspace((current) => ({
      ...current,
      lprs: [lpr, ...(current.lprs || [])]
    }));
    setNewLpr({
      personId: isAdmin ? targetPersonId : "",
      title: "",
      focus: ""
    });
    setUserMessage("ЛПР добавлен");
  }

  function setLprStatus(lprId, status) {
    commitWorkspace((current) => ({
      ...current,
      lprs: (current.lprs || []).map((lpr) =>
        lpr.id === lprId ? { ...lpr, status, updatedAt: new Date().toISOString() } : lpr
      )
    }));
    setLprFilter((current) => (current.status === "all" || current.status === status ? current : { ...current, status }));
    setUserMessage(status === "done" ? "ЛПР завершён" : status === "paused" ? "ЛПР поставлен на паузу" : "ЛПР снова в работе");
  }

  function deleteLpr(lprId) {
    commitWorkspace((current) => ({
      ...current,
      lprs: (current.lprs || []).filter((lpr) => lpr.id !== lprId),
      cards: current.cards.map((card) => (card.lprId === lprId ? { ...card, lprId: "" } : card)),
      goals: (current.goals || []).map((goal) => (goal.lprId === lprId ? { ...goal, lprId: "" } : goal))
    }));
    setUserMessage("ЛПР удалён, связанные темы и цели сохранены");
  }

  function submitCompetencyAssessment(event) {
    event.preventDefault();
    clearFormError("competency-report");
    if (!isAdmin) return;
    try {
      const personId = competencyDraft.personId || selectedPersonId;
      const person = workspace?.people.find((item) => item.id === personId);
      if (!person) throw new Error("Выберите участника");
      const competencies = parseCompetencyRows(competencyDraft.rows);
      if (competencies.length === 0) {
        throw new Error("Добавьте хотя бы одну строку компетенции");
      }
      const now = new Date().toISOString();
      const grade = competencyGradeFromScores(competencies.map((competency) => competency.score));
      const recommendations = competencies
        .filter((competency) => competency.recommendation && competency.score < competency.targetScore)
        .map((competency) => ({
          id: makeId("competency-action"),
          competencyName: competency.name,
          action: competency.recommendation,
          dueDate: ""
        }));
      const assessment = {
        id: makeId("assessment"),
        personId: person.id,
        title: competencyDraft.title.trim() || "Кейс-интервью по компетенциям",
        roleContext: competencyDraft.roleContext.trim() || `${person.role} · ${person.team}`,
        source: "case-ai",
        status: "validated",
        scaleMax: 5,
        ...grade,
        competencies,
        cases: [],
        recommendations,
        createdAt: now,
        validatedAt: now
      };
      commitWorkspace((current) => ({
        ...current,
        competencyAssessments: [assessment, ...(current.competencyAssessments || [])]
      }));
      setCompetencyDraft({
        personId: person.id,
        title: "Кейс-интервью по компетенциям",
        roleContext: "",
        rows: ""
      });
      setUserMessage("Отчёт по компетенциям сохранён");
    } catch (error) {
      setFormError("competency-report", error.message);
    }
  }

  function deleteCompetencyAssessment(assessmentId) {
    if (!isAdmin) return;
    commitWorkspace((current) => ({
      ...current,
      competencyAssessments: (current.competencyAssessments || []).filter((assessment) => assessment.id !== assessmentId)
    }));
    setUserMessage("Отчёт по компетенциям удалён");
  }

  function importAssessmentToLpr(assessment) {
    if (!isAdmin || !assessment) return;
    const person = workspace?.people.find((item) => item.id === assessment.personId);
    if (!person) return;
    const gaps = [...(assessment.competencies || [])]
      .filter((competency) => Number(competency.score) < Number(competency.targetScore || 3))
      .sort((a, b) => (b.targetScore - b.score) - (a.targetScore - a.score));
    const selectedGaps = (gaps.length ? gaps : [...(assessment.competencies || [])].sort((a, b) => a.score - b.score)).slice(0, 4);
    if (selectedGaps.length === 0) {
      setUserMessage("В отчёте нет компетенций для ЛПР");
      return;
    }
    const now = new Date().toISOString();
    const lpr = {
      id: makeId("lpr"),
      personId: person.id,
      title: `ЛПР: ${assessment.title}`,
      focus: [
        `${person.name}: ${competencyGradeLabel[assessment.grade] || assessment.grade}, средний балл ${formatScoreValue(assessment.averageScore)}, минимум ${formatScoreValue(assessment.minScore)}.`,
        `Зоны роста: ${selectedGaps.map((competency) => `${competency.name} ${formatScoreValue(competency.score)}→${formatScoreValue(competency.targetScore)}`).join("; ")}.`,
        "Источник: структурированный отчёт кейс-интервью по компетенциям."
      ].join("\n"),
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    const goals = selectedGaps.slice(0, 3).map((competency) => {
      const matchingAction = (assessment.recommendations || []).find(
        (item) => competencyKey(item.competencyName) === competencyKey(competency.name)
      );
      return {
        id: makeId("goal"),
        personId: person.id,
        lprId: lpr.id,
        title: `${competency.name}: ${formatScoreValue(competency.score)} → ${formatScoreValue(competency.targetScore)}`,
        description: matchingAction?.action || competency.recommendation || competency.evidence || "Уточнить практический шаг на ближайшем 1:1.",
        horizon: "3 месяца",
        progress: 0,
        status: "active",
        createdAt: now,
        dueDate: matchingAction?.dueDate || ""
      };
    });
    commitWorkspace((current) => ({
      ...current,
      lprs: [lpr, ...(current.lprs || [])],
      goals: [...goals, ...(current.goals || [])]
    }));
    setLprFilter({ personId: isAdmin ? person.id : "all", status: "active" });
    setUserMessage("Зоны роста импортированы в ЛПР");
  }

  function exportCompetencyCsv() {
    const peopleMap = new Map((workspace?.people || []).map((person) => [person.id, person]));
    const headers = [
      "personName",
      "personRole",
      "team",
      "assessmentTitle",
      "reportDate",
      "grade",
      "averageScore",
      "minScore",
      "competency",
      "category",
      "score",
      "targetScore",
      "gap",
      "evidence",
      "recommendation"
    ];
    const escape = (value) => {
      const s = String(value ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [headers.map(escape).join(",")];
    for (const assessment of workspace?.competencyAssessments || []) {
      const person = peopleMap.get(assessment.personId);
      for (const competency of assessment.competencies || []) {
        const gap = Math.round((Number(competency.targetScore || 0) - Number(competency.score || 0)) * 10) / 10;
        rows.push([
          person?.name || assessment.personId,
          person?.role || "",
          person?.team || "",
          assessment.title,
          String(assessment.validatedAt || assessment.createdAt || "").slice(0, 10),
          competencyGradeLabel[assessment.grade] || assessment.grade,
          assessment.averageScore,
          assessment.minScore,
          competency.name,
          competency.category,
          competency.score,
          competency.targetScore,
          gap,
          competency.evidence,
          competency.recommendation
        ].map(escape).join(","));
      }
    }
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `team-competency-matrix-${todayISODate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setUserMessage("CSV по компетенциям скачан");
  }

  function promoteCardToLpr(card) {
    if (!selectedPerson) return;
    const now = new Date().toISOString();
    const lpr = {
      id: makeId("lpr"),
      personId: selectedPerson.id,
      title: `ЛПР: ${card.title}`,
      focus: card.body || "План создан из темы 1:1. Уточните фокус и привяжите цели.",
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    commitWorkspace((current) => ({
      ...current,
      lprs: [lpr, ...(current.lprs || [])],
      cards: current.cards.map((item) => (item.id === card.id ? { ...item, lprId: lpr.id } : item))
    }));
    setUserMessage("Тема 1:1 перенесена в ЛПР");
  }

  function openGoalForLpr(lpr) {
    setSelectedPersonId(lpr.personId);
    setNewGoal((current) => ({
      ...current,
      personId: lpr.personId,
      lprId: lpr.id
    }));
    setGoalsFilter((current) => ({ ...current, personId: isAdmin ? lpr.personId : current.personId, status: "active" }));
    setActiveSection("goals");
  }

  function addSurveyQuestion(type = "scale") {
    setSurveyComposer((current) => ({
      ...current,
      questions: [...current.questions, emptyQuestionFor(type)]
    }));
  }

  function patchSurveyQuestion(index, patch) {
    setSurveyComposer((current) => ({
      ...current,
      questions: current.questions.map((question, i) => {
        if (i !== index) return question;
        const next = { ...question, ...patch };
        if (patch.type && patch.type !== question.type) {
          next.options = next.type === "single" || next.type === "multi" ? ["", ""] : [];
        }
        return next;
      })
    }));
  }

  function removeSurveyQuestion(index) {
    setSurveyComposer((current) => ({
      ...current,
      questions: current.questions.filter((_, i) => i !== index)
    }));
  }

  function moveSurveyQuestion(index, delta) {
    setSurveyComposer((current) => {
      const next = [...current.questions];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return { ...current, questions: next };
    });
  }

  function patchQuestionOption(qIndex, oIndex, value) {
    setSurveyComposer((current) => ({
      ...current,
      questions: current.questions.map((question, i) => {
        if (i !== qIndex) return question;
        const options = [...question.options];
        options[oIndex] = value;
        return { ...question, options };
      })
    }));
  }

  function addQuestionOption(qIndex) {
    setSurveyComposer((current) => ({
      ...current,
      questions: current.questions.map((question, i) =>
        i !== qIndex ? question : { ...question, options: [...question.options, ""] }
      )
    }));
  }

  function removeQuestionOption(qIndex, oIndex) {
    setSurveyComposer((current) => ({
      ...current,
      questions: current.questions.map((question, i) => {
        if (i !== qIndex) return question;
        return { ...question, options: question.options.filter((_, idx) => idx !== oIndex) };
      })
    }));
  }

  function resetSurveyComposer() {
    setSurveyComposer({
      title: "",
      description: "",
      anonymous: false,
      questions: [emptyQuestionFor("scale")]
    });
    setShowSurveyComposer(false);
  }

  function openComposerWithTemplate(templateId) {
    const template = surveyTemplates.find((t) => t.id === templateId);
    if (!template) return;
    // Re-key questions so React identity matches a fresh draft
    const reKeyed = template.survey.questions.map((q) => ({
      ...q,
      id: `q-${Math.random().toString(16).slice(2, 8)}`
    }));
    setSurveyComposer({
      ...template.survey,
      questions: reKeyed.length ? reKeyed : [emptyQuestionFor("scale")]
    });
    setShowSurveyComposer(true);
    // Scroll the composer into view next tick
    window.requestAnimationFrame(() => {
      document.querySelector(".survey-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function duplicateSurvey(survey) {
    if (!isAdmin) return;
    const reKeyed = survey.questions.map((q) => ({
      ...q,
      id: `q-${Math.random().toString(16).slice(2, 8)}`
    }));
    setSurveyComposer({
      title: `${survey.title} (копия)`,
      description: survey.description,
      anonymous: survey.anonymous,
      questions: reKeyed
    });
    setShowSurveyComposer(true);
    window.requestAnimationFrame(() => {
      document.querySelector(".survey-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function submitNewSurvey(event) {
    event.preventDefault();
    setUserMessage("");
    try {
      if (!surveyComposer.title.trim()) throw new Error("Укажите название опроса");
      const cleanedQuestions = surveyComposer.questions
        .map((question) => ({
          ...question,
          prompt: question.prompt.trim(),
          options: (question.options || []).map((option) => option.trim()).filter(Boolean)
        }))
        .filter((question) => question.prompt.length > 0);
      if (cleanedQuestions.length === 0) throw new Error("Добавьте хотя бы один вопрос");
      for (const question of cleanedQuestions) {
        if ((question.type === "single" || question.type === "multi") && question.options.length < 2) {
          throw new Error(`Для вопроса «${question.prompt}» нужно минимум 2 варианта`);
        }
      }
      const response = await apiFetch("/api/surveys", {
        method: "POST",
        body: JSON.stringify({
          title: surveyComposer.title.trim(),
          description: surveyComposer.description.trim(),
          anonymous: surveyComposer.anonymous,
          anonymousMinResponses: 3,
          questions: cleanedQuestions
        })
      });
      setWorkspace((current) =>
        response.workspace ? { ...emptyWorkspace, ...response.workspace } : current
      );
      resetSurveyComposer();
      setUserMessage("Опрос создан");
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  function exportSurveyCsv(survey) {
    const responses = survey.responses || [];
    const headers = ["submittedAt", "personId", ...survey.questions.map((q) => q.prompt)];
    const escape = (value) => {
      const s = String(value ?? "");
      if (/[",\n;]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const rows = [headers.map(escape).join(",")];

    if (responses.length === 0 && survey.aggregate) {
      // Anonymous mode — no per-row data, only aggregate summary
      rows.push(`# aggregate-only export (анонимный опрос)`);
      for (const q of survey.questions) {
        const stats = survey.aggregate?.perQuestion?.[q.id];
        if (!stats) continue;
        if (q.type === "scale") {
          rows.push(escape(`${q.prompt}: среднее ${stats.avg} (n=${stats.count})`));
        } else if (q.type === "single" || q.type === "multi") {
          for (const item of stats.distribution || []) {
            rows.push(escape(`${q.prompt} → ${item.label}`) + "," + item.value);
          }
        } else if (q.type === "text" || q.type === "date") {
          if (stats.redacted) {
            rows.push(escape(`${q.prompt}: ответов ${stats.count}`));
          } else {
            for (const sample of stats.samples || []) {
              rows.push(escape(`${q.prompt}`) + "," + escape(sample));
            }
          }
        }
      }
    } else {
      for (const r of responses) {
        const personName = workspace?.people?.find((p) => p.id === r.personId)?.name || r.personId || "anonymous";
        const cells = [r.submittedAt, personName];
        for (const q of survey.questions) {
          const a = r.answers?.[q.id];
          if (!a) cells.push("");
          else if (Array.isArray(a.values)) cells.push(a.values.join("; "));
          else cells.push(a.value);
        }
        rows.push(cells.map(escape).join(","));
      }
    }

    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${survey.title.replace(/[^\w\dа-яёА-ЯЁ-]+/gi, "_") || "survey"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setUserMessage("CSV скачан");
  }

  async function saveSurveyAsTemplate(surveyId) {
    setUserMessage("");
    try {
      const response = await apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}/template`, {
        method: "POST",
        body: "{}"
      });
      if (response.workspace) {
        setWorkspace({ ...emptyWorkspace, ...response.workspace });
      }
      setUserMessage("Сохранено как шаблон");
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  async function deleteSurvey(surveyId) {
    setUserMessage("");
    try {
      const response = await apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}`, { method: "DELETE" });
      setWorkspace((current) =>
        response.workspace ? { ...emptyWorkspace, ...response.workspace } : current
      );
      if (expandedSurveyId === surveyId) setExpandedSurveyId("");
      setUserMessage("Опрос удалён");
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  function patchSurveyDraft(surveyId, questionId, patch) {
    setSurveyDrafts((current) => ({
      ...current,
      [surveyId]: { ...(current[surveyId] || {}), [questionId]: patch }
    }));
  }

  async function submitSurveyResponse(surveyId) {
    setUserMessage("");
    clearFormError(`survey-${surveyId}`);
    try {
      const draft = surveyDrafts[surveyId] || {};
      // When the user re-submits an existing response, the draft only contains
      // the fields they touched in this session. Merge with the previously saved
      // answers so unchanged questions don't disappear and trip required-field
      // validation on the server.
      const survey = (workspace?.surveys || []).find((s) => s.id === surveyId);
      const existing = survey?.myResponse?.answers || {};
      const merged = { ...existing, ...draft };
      const response = await apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}/respond`, {
        method: "POST",
        body: JSON.stringify({ answers: merged })
      });
      setWorkspace((current) =>
        response.workspace ? { ...emptyWorkspace, ...response.workspace } : current
      );
      setSurveyDrafts((current) => ({ ...current, [surveyId]: {} }));
      setExpandedSurveyId((current) => (current === surveyId ? "" : current));
      setUserMessage("Ответы сохранены");
    } catch (error) {
      setFormError(`survey-${surveyId}`, error.message);
    }
  }

  function updateNotes(value) {
    if (!selectedPerson || !isAdmin) return;
    commitWorkspace((current) => ({
      ...current,
      notes: {
        ...current.notes,
        [selectedPerson.id]: value
      }
    }));
  }

  function updateMeetingDraft(value) {
    if (!selectedPerson) return;
    patchWorkspaceLocally((current) => ({
      ...current,
      meetingDrafts: {
        ...(current.meetingDrafts || {}),
        [selectedPerson.id]: value
      }
    }));
    queueMeetingStateSave(selectedPerson.id, { meetingDraft: value });
  }

  function clearMeetingDraft() {
    if (!selectedPerson) return;
    updateMeetingDraft("");
    setUserMessage("Протокол очищен");
  }

  function buildSummary() {
    if (!selectedPerson) return;
    const discussed = personCards.filter((card) => card.status === "done").map((card) => `- ${card.title}`);
    const open = personCards.filter((card) => card.status !== "done").map((card) => `- ${card.title}`);
    const actions = personActions.map((action) => `- ${ownerLabel(action.owner)}: ${action.title} (${action.due})`);
    const transcript = selectedMeetingDraft.trim();

    const text = [
      `Итоги 1:1 с ${selectedPerson.meetingName}`,
      `Пульс: ${selectedScore}/100. Энергия ${selectedPulse.energy}/10, нагрузка ${selectedPulse.load}/10, ясность ${selectedPulse.clarity}/10, доверие ${selectedPulse.trust}/10.`,
      "",
      "Протокол встречи:",
      transcript || "- Протокол не велся",
      "",
      "Обсудили:",
      discussed.length ? discussed.join("\n") : "- Пока нет закрытых тем",
      "",
      "Остается в повестке:",
      open.length ? open.join("\n") : "- Нет открытых тем",
      "",
      "Следующие шаги:",
      actions.length ? actions.join("\n") : "- Добавить следующие шаги"
    ].join("\n");

    setSummaryText(text);
    const clipboardWrite = navigator.clipboard?.writeText(text);
    if (clipboardWrite) {
      clipboardWrite
        .then(() => setUserMessage("Итоги сформированы и скопированы"))
        .catch(() => setUserMessage("Итоги сформированы. Текст доступен в блоке итогов"));
    } else {
      setUserMessage("Итоги сформированы. Текст доступен в блоке итогов");
    }
    return text;
  }

  function showMeetingSummary() {
    if (!selectedPerson) return;
    setActiveView("outcomes");
    setRevealSummary(true);
    const text = buildSummary();
    // Record the meeting into history with the actual summary text so the admin
    // can come back and read it later from the right rail.
    if (isAdmin && text) {
      void logMeetingHeld(
        selectedPerson.id,
        selectedPerson.meetingType || "regular",
        text
      );
    }
  }

  async function resetDemo() {
    if (!canResetDemo) return;
    try {
      setSaveError("");
      setUserMessage("");
      const response = await apiFetch("/api/reset", { method: "POST", body: "{}" });
      const nextWorkspace = { ...emptyWorkspace, ...response.workspace };
      setUser(response.user);
      setWorkspace(nextWorkspace);
      setSelectedPersonId(nextWorkspace.people?.[0]?.id || "");
      setNewUser({
        role: "employee",
        leadUserId: "",
        personName: "",
        personRole: "Team Member",
        personTeam: "Product",
        username: "",
        password: ""
      });
      setPasswordUpdate({ userId: "", password: "" });
      setActiveSection(nextWorkspace.people?.length ? "meetings" : "team");
      setShowCreateLoginForm(false);
      setActiveView("agenda");
      setActiveFilter("all");
      setSummaryText("");
      setUserMessage("Демо-данные сброшены. Вы остались в аккаунте админа");
    } catch (error) {
      setSaveError(error.message);
    }
  }

  async function createEmployeeUser(event) {
    event.preventDefault();
    setUserMessage("");
    clearFormError("createUser");

    try {
      const username = newUser.username.trim();
      const password = newUser.password;
      const effectiveRole = canCreateLeadLogin ? newUser.role : "employee";

      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
        throw new Error("Логин: 3-32 символа, латиница, цифры, точка, дефис или подчеркивание");
      }

      if (password.length < 8) {
        throw new Error("Пароль должен быть не короче 8 символов");
      }

      const isLeadLogin = effectiveRole === "lead";
      if (newUser.personName.trim().length < 2) {
        throw new Error(isLeadLogin ? "Укажите имя тимлида" : "Укажите имя участника");
      }

      if (newUser.personTeam.trim().length < 2) {
        throw new Error("Укажите команду");
      }

      if (workspace.users.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
        throw new Error("Такой логин уже существует");
      }

      const userResponse = await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          role: effectiveRole,
          username,
          password,
          name: newUser.personName,
          personName: newUser.personName,
          personRole: newUser.personRole,
          personTeam: newUser.personTeam,
          teamLabel: newUser.personTeam,
          leadUserId: effectiveRole === "employee" ? newUser.leadUserId : ""
        })
      });
      const nextWorkspace = userResponse.workspace ? { ...emptyWorkspace, ...userResponse.workspace } : null;
      setWorkspace((current) => (nextWorkspace ? nextWorkspace : current));
      if (userResponse.user.personId) setSelectedPersonId(userResponse.user.personId);
      setUserMessage(`Логин ${userResponse.user.username} создан`);
      setShowCreateLoginForm(false);
      setNewUser((current) => ({
        ...current,
        role: "employee",
        leadUserId: "",
        personName: "",
        personRole: "Team Member",
        personTeam: !canCreateLeadLogin && user?.teamLabel ? user.teamLabel : "Product",
        username: "",
        password: ""
      }));
    } catch (error) {
      setFormError("createUser", error.message);
    }
  }

  async function updateAccountName(event) {
    event.preventDefault();
    setUserMessage("");
    clearFormError("profile");

    try {
      const name = profileName.trim();
      if (name.length < 2) {
        throw new Error("Укажите имя");
      }

      const response = await apiFetch("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
      setUser(response.user);
      if (response.workspace) {
        setWorkspace({ ...emptyWorkspace, ...response.workspace });
      }
      setUserMessage("Имя сохранено");
    } catch (error) {
      setFormError("profile", error.message);
    }
  }

  async function updateMyPassword(event) {
    event.preventDefault();
    setUserMessage("");
    clearFormError("myPassword");
    try {
      if (myPassword.length < 8) {
        throw new Error("Пароль должен быть не короче 8 символов");
      }
      await apiFetch("/api/me/password", {
        method: "POST",
        body: JSON.stringify({ password: myPassword })
      });
      setMyPassword("");
      setUserMessage("Пароль обновлён. Старые сессии закрыты");
    } catch (error) {
      setFormError("myPassword", error.message);
    }
  }

  async function updateEmployeePassword(event) {
    event.preventDefault();
    setUserMessage("");
    clearFormError("password");

    try {
      const response = await apiFetch(`/api/users/${encodeURIComponent(passwordUpdate.userId)}/password`, {
        method: "POST",
        body: JSON.stringify({ password: passwordUpdate.password })
      });
      setWorkspace((current) => (current ? { ...current, users: response.users } : current));
      setPasswordUpdate((current) => ({ ...current, password: "" }));
      setUserMessage("Пароль обновлен, активные сессии пользователя закрыты");
    } catch (error) {
      setFormError("password", error.message);
    }
  }

  async function deleteEmployeeUser(targetUser) {
    setUserMessage("");

    try {
      const response = await apiFetch(`/api/users/${encodeURIComponent(targetUser.id)}`, {
        method: "DELETE"
      });
      setWorkspace((current) => (current ? { ...current, users: response.users } : current));
      setPasswordUpdate((current) => ({
        ...current,
        userId: response.users.find((item) => !isProtectedAccess(item))?.id || ""
      }));
      setUserMessage(`Логин ${targetUser.username} удален`);
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  async function deleteEmployeePerson(person) {
    setUserMessage("");

    const linkedUsers = workspace.users.filter((item) => item.personId === person.id);
    if (pendingDeletePersonId !== person.id) {
      setPendingDeletePersonId(person.id);
      setUserMessage(
        linkedUsers.length
          ? `Подтвердите удаление ${person.name}: логин и история 1:1 будут удалены`
          : `Подтвердите удаление ${person.name}: история 1:1 будет удалена`
      );
      return;
    }

    try {
      const response = await apiFetch(`/api/people/${encodeURIComponent(person.id)}`, {
        method: "DELETE"
      });
      const nextWorkspace = { ...emptyWorkspace, ...response.workspace };
      setWorkspace(nextWorkspace);
      setSelectedPersonId(nextWorkspace.people[0]?.id || "");
      setPasswordUpdate((current) => ({
        ...current,
        userId: nextWorkspace.users.find((item) => !isProtectedAccess(item))?.id || ""
      }));
      setPendingDeletePersonId("");
      setUserMessage(`Участник ${person.name} удален`);
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  async function addManagerNote() {
    if (!selectedPerson || !isAdmin) return;
    const body = newManagerNote.body.trim();
    if (!body) return;
    setUserMessage("");
    try {
      const response = await apiFetch("/api/manager-notes", {
        method: "POST",
        body: JSON.stringify({
          personId: selectedPerson.id,
          body,
          tags: newManagerNote.tags
        })
      });
      if (response.workspace) {
        setWorkspace({ ...emptyWorkspace, ...response.workspace });
      }
      setNewManagerNote({ body: "", tags: [] });
      setUserMessage("Заметка сохранена");
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  async function logMeetingHeld(personId, meetingType, summary) {
    if (!isAdmin || !personId) return;
    try {
      const response = await apiFetch("/api/meetings/log", {
        method: "POST",
        body: JSON.stringify({
          personId,
          heldAt: new Date().toISOString(),
          meetingType: meetingType || "regular",
          summary: summary || "",
          attended: true
        })
      });
      if (response.workspace) {
        setWorkspace({ ...emptyWorkspace, ...response.workspace });
      }
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  async function deleteManagerNote(noteId) {
    try {
      const response = await apiFetch(`/api/manager-notes/${encodeURIComponent(noteId)}`, {
        method: "DELETE"
      });
      if (response.workspace) {
        setWorkspace({ ...emptyWorkspace, ...response.workspace });
      }
      setUserMessage("Заметка удалена");
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  function toggleNewNoteTag(tag) {
    setNewManagerNote((current) => {
      const has = current.tags.includes(tag);
      return {
        ...current,
        tags: has ? current.tags.filter((t) => t !== tag) : [...current.tags, tag]
      };
    });
  }

  async function restoreArchivedPerson(personId) {
    setUserMessage("");
    try {
      const response = await apiFetch(`/api/people/${encodeURIComponent(personId)}/restore`, {
        method: "POST",
        body: "{}"
      });
      if (response.workspace) {
        setWorkspace({ ...emptyWorkspace, ...response.workspace });
      }
      setUserMessage("Участник восстановлен");
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  async function savePersonEdit(personId) {
    setUserMessage("");
    clearFormError("editPerson");
    try {
      if (personEditDraft.name.trim().length < 2) {
        throw new Error("Имя не короче 2 символов");
      }
      const response = await apiFetch(`/api/people/${encodeURIComponent(personId)}`, {
        method: "PATCH",
        body: JSON.stringify(personEditDraft)
      });
      const nextWorkspace = response.workspace ? { ...emptyWorkspace, ...response.workspace } : null;
      if (nextWorkspace) setWorkspace(nextWorkspace);
      setEditingPersonId("");
      setUserMessage(`Профиль ${response.person?.name || "участника"} обновлён`);
    } catch (error) {
      setFormError("editPerson", error.message);
    }
  }

  async function createPerson(event) {
    event.preventDefault();
    setUserMessage("");

    try {
      const response = await apiFetch("/api/people", {
        method: "POST",
        body: JSON.stringify(newPerson)
      });
      const nextWorkspace = { ...emptyWorkspace, ...response.workspace };
      setWorkspace(nextWorkspace);
      setSelectedPersonId(response.person.id);
      setNewUser((current) => ({ ...current, personId: response.person.id }));
      setNewPerson({
        name: "",
        meetingName: "",
        role: "Team Member",
        team: "Product",
        cadence: "каждую неделю",
        nextMeeting: "нужно запланировать",
        managerFocus: ""
      });
      setUserMessage(`Участник ${response.person.name} добавлен`);
    } catch (error) {
      setUserMessage(error.message);
    }
  }

  function renderCreateLoginCard({
    id = "create-login-panel",
    description = "Тимлид получает доступ к своей команде, участник — только к своему 1:1.",
    allowLeadCreation = canCreateLeadLogin,
    showCancel = false
  } = {}) {
    const formRole = allowLeadCreation ? newUser.role : "employee";

    return (
      <article className="settings-card create-login-card" id={id} ref={createLoginPanelRef}>
        <div className="settings-card-head">
          <div>
            <p className="eyebrow">Пользователи</p>
            <h3>Создать логин</h3>
            <p>{description}</p>
          </div>
          {showCancel && (
            <button className="icon-button" type="button" onClick={closeCreateLoginForm} aria-label="Закрыть форму">
              <X size={16} />
            </button>
          )}
        </div>
        <form className="settings-inline-form admin-inline" onSubmit={createEmployeeUser}>
          {allowLeadCreation && (
            <label>
              Тип доступа
              <select
                value={newUser.role}
                onChange={(event) =>
                  setNewUser((current) => ({
                    ...current,
                    role: event.target.value,
                    leadUserId: event.target.value === "lead" ? "" : current.leadUserId
                  }))
                }
              >
                <option value="employee">Участник команды</option>
                <option value="lead">Тимлид</option>
              </select>
            </label>
          )}
          <label>
            {formRole === "lead" ? "Имя тимлида" : "Имя участника"}
            <input
              value={newUser.personName}
              onChange={(event) => setNewUser((current) => ({ ...current, personName: event.target.value }))}
              placeholder={formRole === "lead" ? "Например: Мария Лидова" : "Например: Иван Петров"}
              autoComplete="name"
            />
          </label>
          <div className="two-field-grid">
            {formRole === "employee" ? (
              <label>
                Роль в команде
                <input
                  value={newUser.personRole}
                  onChange={(event) => setNewUser((current) => ({ ...current, personRole: event.target.value }))}
                  placeholder="Product Manager"
                />
              </label>
            ) : (
              <label>
                Роль в системе
                <input value="Тимлид" readOnly />
              </label>
            )}
            <label>
              Команда
              <input
                value={newUser.personTeam}
                onChange={(event) => setNewUser((current) => ({ ...current, personTeam: event.target.value }))}
                placeholder="Product Growth"
                readOnly={!allowLeadCreation && Boolean(user?.teamLabel)}
              />
            </label>
          </div>
          {formRole === "employee" && allowLeadCreation && teamLeadUsers.length > 0 && (
            <label>
              Тимлид
              <select
                value={newUser.leadUserId}
                onChange={(event) => {
                  const lead = teamLeadUsers.find((item) => item.id === event.target.value);
                  setNewUser((current) => ({
                    ...current,
                    leadUserId: event.target.value,
                    personTeam: lead?.teamLabel || current.personTeam
                  }));
                }}
              >
                <option value="">По названию команды</option>
                {teamLeadUsers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.teamLabel || "команда не задана"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="two-field-grid">
            <label>
              Логин
              <input
                value={newUser.username}
                onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))}
                placeholder="ivan.sre"
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={newUser.password}
                onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))}
                placeholder="минимум 8 символов"
              />
            </label>
          </div>
          {formErrors.createUser && <div className="form-error inline-form-error">{formErrors.createUser}</div>}
          <button className="primary-button" type="submit">
            <UserPlus size={16} />
            Создать логин
          </button>
        </form>
      </article>
    );
  }

  if (authState === "loading") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-mark">
            <HeartPulse size={22} />
          </div>
          <h1>Team Health 1:1</h1>
          <p>Загружаем данные.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-screen">
        <form className="auth-card login-card" onSubmit={handleLogin}>
          <div className="brand-mark">
            <HeartPulse size={22} />
          </div>
          <p className="eyebrow">Доступ только для команды</p>
          <h1>Войти в Team Health 1:1</h1>
          <p>Данные встреч, пульса и заметок не загружаются в браузер до авторизации.</p>
          <label>
            Логин
            <input
              autoComplete="username"
              value={credentials.username}
              onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
              placeholder="Логин"
            />
          </label>
          <label>
            Пароль
            <input
              autoComplete="current-password"
              type="password"
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              placeholder="Введите пароль"
            />
          </label>
          {loginError && <div className="form-error">{loginError}</div>}
          <button className="primary-button" type="submit">
            <ShieldCheck size={17} />
            Войти
          </button>
          <button className="ghost-button" type="button" onClick={() => performLogin({ username: "demo", password: "demo" })}>
            Войти в демо
          </button>
        </form>
      </div>
    );
  }

  if (!workspace || (!selectedPerson && !isAdmin)) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-mark">
            <HeartPulse size={22} />
          </div>
          <h1>Нет доступного профиля</h1>
          <p>Администратор должен привязать ваш логин к профилю участника 1:1.</p>
          <button className="ghost-button" type="button" onClick={logout}>
            Выйти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell section-${activeSection} ${activeSection !== "meetings" || !selectedPerson ? "wide-main" : ""}`}>
      <nav className="global-sidebar" aria-label="Разделы платформы">
        <div className="global-brand">
          <div className="brand-mark compact-mark">
            <HeartPulse size={20} />
          </div>
          <span>Team Health</span>
        </div>

        <div className="global-nav-list">
          {primarySections
            .filter((sectionId) => {
              const meta = sectionRegistry[sectionId];
              if (meta.adminOnly && !isAdmin) return false;
              if (meta.platformAdminOnly && !isPlatformAdminRole(user)) return false;
              return true;
            })
            .map((sectionId) => {
              const item = sectionRegistry[sectionId];
              const Icon = item.icon;
              return (
                <button
                  key={sectionId}
                  className={activeSection === sectionId ? "active" : ""}
                  type="button"
                  aria-current={activeSection === sectionId ? "page" : undefined}
                  onClick={() => openSection(sectionId)}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </button>
              );
            })}
        </div>

        <div className="global-sidebar-footer">
          <button type="button" onClick={logout}>
            <LogOut size={16} />
            <span>Выйти</span>
          </button>
        </div>
      </nav>

      {activeSection === "meetings" && selectedPerson && (
        <aside className="sidebar context-sidebar" aria-label="Контекст встречи">
          <div className="context-header">
            <p className="eyebrow">Встречи</p>
            <h1>{isAdmin ? "Участники 1:1" : "Мой 1:1"}</h1>
          </div>

          <label className="search-field">
            <Search size={16} />
            <span className="sr-only">Поиск</span>
            <input
              type="search"
              value={peopleSearch}
              onChange={(event) => setPeopleSearch(event.target.value)}
              placeholder={isAdmin ? "Найти участника" : "Ваш профиль"}
              disabled={!isAdmin && workspace.people.length < 2}
            />
          </label>

          <div className="team-score-panel">
            <div>
              <span className="metric-label">{isAdmin ? "Пульс команды" : "Мой пульс"}</span>
              <strong>{teamScore}</strong>
            </div>
            <div className="team-score-line" aria-hidden="true">
              <span style={{ width: `${teamScore}%` }} />
            </div>
            <p>
              {countLabel(riskCards.length, ["открытый риск", "открытых риска", "открытых рисков"])},
              {" "}
              {countLabel(workspace.cards.filter((card) => card.status !== "done").length, ["тема в работе", "темы в работе", "тем в работе"])}
            </p>
          </div>

          <nav className="people-list" aria-label="Участники 1:1">
            {filteredMeetingPeople.map((person) => {
              const score = scorePulse(workspace.pulse[person.id]);
              const isActive = person.id === selectedPerson.id;
              return (
                <button
                  key={person.id}
                  className={`person-row ${isActive ? "active" : ""}`}
                  onClick={() => selectPerson(person.id)}
                  type="button"
                >
                  <span className="avatar">{person.initials}</span>
                  <span className="person-main">
                    <strong>{person.name}</strong>
                    <small>{person.role}</small>
                  </span>
                  <span className={`health-dot ${score < 64 ? "risk" : score < 76 ? "watch" : "good"}`}>{score}</span>
                </button>
              );
            })}
            {filteredMeetingPeople.length === 0 && (
              <div className="empty-state compact-empty">
                <Search size={20} />
                <span>По этому поиску участников нет.</span>
              </div>
            )}
          </nav>

        </aside>
      )}

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{pageEyebrow}</p>
            <h2>{pageTitle}</h2>
            <span className="session-user">Вы вошли как {displayName} · {roleLabel[user?.role] || "участник"}</span>
          </div>
          {activeSection === "meetings" && selectedPerson && (
            <div className="topbar-actions">
              <button className="primary-button" type="button" onClick={showMeetingSummary}>
                <ClipboardCheck size={17} />
                Итоги встречи
              </button>
            </div>
          )}
        </header>

        {saveError && <div className="form-error inline-error">{saveError}</div>}
        {userMessage && <div className="form-hint inline-message">{userMessage}</div>}

        {activeSection === "meetings" && selectedPerson && filteredMeetingPeople.length > 1 && (
          <label className="meeting-person-switcher">
            <span>
              <UsersRound size={16} />
              Участник 1:1
            </span>
            <select value={selectedPerson.id} onChange={(event) => selectPerson(event.target.value)}>
              {filteredMeetingPeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.role}
                </option>
              ))}
            </select>
          </label>
        )}

        {pageDescription && activeSection !== "home" && (
          <div className="section-intro">
            <p>{pageDescription}</p>
            {activeSection === "surveys" && isAdmin && (
              <button
                className="primary-button"
                type="button"
                onClick={() => setShowSurveyComposer((v) => !v)}
              >
                <Plus size={16} />
                {showSurveyComposer ? "Скрыть форму" : "Создать опрос"}
              </button>
            )}
          </div>
        )}

        {activeSection === "home" && (
          <section className="dashboard-view">
            {!hasDashboardPeople ? (
              <>
                <section className="dashboard-empty-panel" aria-label="Пустая команда">
                  <div className="dashboard-empty-copy">
                    <p className="eyebrow">{isAdmin ? "Старт" : "Мой профиль"}</p>
                    <h3>{isAdmin ? "Команда пока пустая" : "Профиль 1:1 пока не настроен"}</h3>
                    <p>
                      {isAdmin
                        ? "Добавьте участников и логины, после этого здесь появятся ближайшие 1:1, пульс, срочные темы и следующие шаги."
                        : "Когда лидер добавит ваш профиль, здесь появятся темы, пульс, цели и договорённости."}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="dashboard-empty-actions">
                      <button className="primary-button" type="button" onClick={openCreateLoginForm}>
                        <UserPlus size={16} />
                        Создать логин
                      </button>
                      <button className="soft-button" type="button" onClick={() => openSection("team")}>
                        <UsersRound size={16} />
                        Открыть команду
                      </button>
                    </div>
                  )}
                </section>
                {isAdmin && showCreateLoginForm && renderCreateLoginCard({
                  id: "home-create-login-panel",
                  description: canCreateLeadLogin
                    ? "Создайте участника или тимлида, не уходя с главной."
                    : "Добавьте участника в свою команду и сразу выдайте ему доступ.",
                  allowLeadCreation: canCreateLeadLogin,
                  showCancel: true
                })}
              </>
            ) : (
              <>
                <section className="dashboard-hero" aria-label="Сводка команды">
                  <div className="dashboard-hero-main">
                    <p className="eyebrow">{isAdmin ? "Сегодня" : "Мой профиль"}</p>
                    <h3>{isAdmin ? "Операционная сводка" : "Сводка по 1:1"}</h3>
                    <p>{dashboardIntroText}</p>
                  </div>
                  <div className={`dashboard-score-card ${dashboardScore < 64 ? "score-risk" : dashboardScore < 76 ? "score-watch" : "score-good"}`}>
                    <span className="metric-label">{isAdmin ? "Пульс команды" : "Мой пульс"}</span>
                    <strong>{dashboardScore}</strong>
                    <div className="team-score-line" aria-hidden="true">
                      <span style={{ width: `${dashboardScore}%` }} />
                    </div>
                    <small>{peopleInRiskZone} в зоне внимания из {dashboardPeople.length}</small>
                  </div>
                </section>

                <section className="manager-command" aria-label="Рабочий цикл менеджера">
                  <div className="section-heading compact">
                    <div>
                      <p className="eyebrow">Рабочий цикл</p>
                      <h3>{isAdmin ? "Что закрыть сегодня" : "Что подготовить к 1:1"}</h3>
                    </div>
                    <span className="count-pill">{actionInboxItems.length}</span>
                  </div>

                  <div className="command-grid">
                    <article className="command-card command-card-main">
                      <span className="command-label">Календарь</span>
                      <h3 className="command-card-title">Ближайшие 1:1</h3>
                      {firstUpcomingMeeting ? (
                        <>
                          <div className="command-person">
                            <span className="avatar">{firstUpcomingMeeting.person.initials}</span>
                            <span>
                              <strong>{firstUpcomingMeeting.person.name}</strong>
                              <small>{firstUpcomingMeeting.person.nextMeeting} · {firstUpcomingMeeting.person.cadence}</small>
                            </span>
                          </div>
                          <div className="command-metrics">
                            <span>{firstUpcomingMeeting.readiness}% готовность</span>
                            <span>{countLabel(firstUpcomingMeeting.openActions, ["шаг", "шага", "шагов"])}</span>
                            <span>{countLabel(firstUpcomingMeeting.urgentCards, ["срочная тема", "срочные темы", "срочных тем"])}</span>
                          </div>
                          <button className="primary-button" type="button" onClick={() => selectPerson(firstUpcomingMeeting.person.id)}>
                            <ClipboardCheck size={16} />
                            Подготовить
                          </button>
                        </>
                      ) : (
                        <div className="empty-state compact-empty">
                          <CalendarDays size={20} />
                          <span>Ближайших 1:1 пока нет.</span>
                        </div>
                      )}
                    </article>

                    <article className="command-card">
                      <span className="command-label">Фокус</span>
                      <h3 className="command-card-title">Что требует решения</h3>
                      <div className="command-list">
                        {actionInboxItems.map((item) => (
                          <button className={`command-row tone-${item.tone}`} key={item.id} type="button" onClick={() => selectPerson(item.personId)}>
                            <span className="command-row-type">{item.label}</span>
                            <span className="command-row-main">
                              <strong>{item.title}</strong>
                              <small>{item.meta}</small>
                            </span>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                        {actionInboxItems.length === 0 && (
                          <div className="empty-state compact-empty">
                            <CheckCircle2 size={20} />
                            <span>Критичных действий сейчас нет.</span>
                          </div>
                        )}
                      </div>
                    </article>

                    <article className="command-card command-card-actions">
                      <span className="command-label">Навигация</span>
                      <h3 className="command-card-title">Петля улучшений</h3>
                      <div className="command-quick-actions">
                        {isAdmin && (
                          <button className="soft-button" type="button" onClick={() => openSection("surveys")}>
                            <ClipboardList size={15} />
                            Запустить опрос
                          </button>
                        )}
                        <button className="soft-button" type="button" onClick={() => openSection("reports")}>
                          <BarChart3 size={15} />
                          Открыть отчёты
                        </button>
                        <button className="soft-button" type="button" onClick={() => openSection("lprs")}>
                          <ClipboardCheck size={15} />
                          Открыть ЛПР
                        </button>
                        <button className="soft-button" type="button" onClick={() => openSection("goals")}>
                          <Target size={15} />
                          Открыть цели
                        </button>
                      </div>
                    </article>
                  </div>
                </section>

                {isAdmin && alertsData.length > 0 && (
                  <section className="alerts-strip" aria-label="Сигналы по команде">
                    <div className="alerts-head">
                      <AlertTriangle size={18} />
                      <strong>Сигналы по команде</strong>
                      <span className="count-pill">{alertsData.length}</span>
                    </div>
                    <div className="alerts-list">
                      {alertsData.slice(0, 6).map((alert) => (
                        <button
                          className={`alert-row severity-${alert.severity}`}
                          key={`${alert.personId}-${alert.kind}`}
                          type="button"
                          onClick={() => selectPerson(alert.personId)}
                        >
                          <span className={`alert-dot severity-${alert.severity}`} />
                          <span>{alert.label}</span>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <div className="dashboard-kpis" aria-label="Ключевые показатели">
                  {dashboardKpis.map(([Icon, label, value, detail, tone]) => (
                    <article className={`kpi-card ${tone}`} key={label}>
                      <span className="kpi-icon">
                        <Icon size={18} />
                      </span>
                      <div>
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>{detail}</small>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="dashboard-grid dashboard-grid-main-only">
                  <div className="dashboard-main-stack">
                    <section className="dashboard-panel urgent-panel">
                      <div className="section-heading compact">
                        <div>
                          <p className="eyebrow">Из 1:1</p>
                          <h3>Срочные вопросы</h3>
                        </div>
                        <span className="count-pill">{urgentDashboardCards.length}</span>
                      </div>
                      <div className={`urgent-list ${sectionStaggerClass("home-urgent")}`}>
                        {urgentDashboardCards.slice(0, 5).map((card) => {
                          const person = workspace.people.find((item) => item.id === card.personId);
                          return (
                            <button className="urgent-row" key={card.id} type="button" onClick={() => selectPerson(card.personId)}>
                              <span className={`urgent-marker priority-${card.priority}`} />
                              <span className="urgent-main">
                                <strong>{card.title}</strong>
                                {card.body && <small>{card.body}</small>}
                              </span>
                              <span className="urgent-meta">
                                <span>{person?.name || "участник"}</span>
                                <em>{priorityLabel(card.priority)}</em>
                              </span>
                              <ChevronRight size={16} />
                            </button>
                          );
                        })}
                        {urgentDashboardCards.length === 0 && (
                          <div className="empty-state">
                            <CheckCircle2 size={22} />
                            <span>Срочных открытых тем нет.</span>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="dashboard-panel">
                      <div className="section-heading compact">
                        <div>
                          <p className="eyebrow">{isAdmin ? "Команда" : "Личный контур"}</p>
                          <h3>{isAdmin ? "Состояние участников" : "Мой профиль 1:1"}</h3>
                        </div>
                        <Activity size={18} />
                      </div>
                      <div className={`employee-health-list ${sectionStaggerClass("home-health")}`}>
                        {attentionPeople.map(({ person, score, readiness: personReadiness, openCards, openActions, urgentCards }) => (
                          <button className="employee-health-row" key={person.id} type="button" onClick={() => selectPerson(person.id)}>
                            <span className="avatar">{person.initials}</span>
                            <span className="employee-health-main">
                              <strong>{person.name}</strong>
                              <small>{isAdmin ? `${person.role} · ${person.team}` : `${person.role} · персональный режим`}</small>
                            </span>
                            <span className="employee-health-metrics">
                              <span>{countLabel(openCards, ["тема", "темы", "тем"])}</span>
                              <span>{countLabel(openActions, ["шаг", "шага", "шагов"])}</span>
                              {urgentCards > 0 && <span>{countLabel(urgentCards, ["срочная тема", "срочные темы", "срочных тем"])}</span>}
                            </span>
                            <span className="readiness-mini">
                              <span style={{ width: `${personReadiness}%` }} />
                            </span>
                            <span className={`health-dot ${score < 64 ? "risk" : score < 76 ? "watch" : "good"}`}>{score}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {activeSection === "meetings" && !selectedPerson && (
          <section className="placeholder-view">
            <div className="placeholder-panel">
              <MessageSquarePlus size={22} />
              <div>
                <p className="eyebrow">1:1</p>
                <h3>Нет участников 1:1</h3>
                <p>Добавьте участника, чтобы создать профиль 1:1.</p>
              </div>
              {isAdmin && (
                <button className="primary-button" type="button" onClick={() => openSection("team")}>
                  Открыть команду
                </button>
              )}
            </div>
          </section>
        )}

        {activeSection === "meetings" && selectedPerson && (
          <>
            <section className="meeting-hero" aria-label="Текущая встреча">
              <div className="meeting-context">
                <div className="meeting-date">
                  <CalendarDays size={18} />
                  <span>{selectedPerson.nextMeeting}</span>
                  <span className="divider-dot" />
                  <span>{selectedPerson.cadence}</span>
                  {selectedPerson.meetingType && selectedPerson.meetingType !== "regular" && (
                    <>
                      <span className="divider-dot" />
                      <span className="meeting-type-pill">{meetingTypeLabel[selectedPerson.meetingType]}</span>
                    </>
                  )}
                </div>
                <h3>{selectedPerson.managerFocus}</h3>
                <p>{selectedPerson.lastSummary}</p>
              </div>

              <div className="health-card">
                <span className="metric-label">Пульс участника</span>
                <strong>{selectedScore}</strong>
                <span className={`trend ${selectedPerson.trend?.startsWith("-") ? "down" : "up"}`}>{selectedPerson.trend}</span>
              </div>

              <div className="readiness-card">
                <span className="metric-label">Готовность к 1:1</span>
                <strong>{readiness}%</strong>
                <div className="readiness-line" aria-hidden="true">
                  <span style={{ width: `${readiness}%` }} />
                </div>
              </div>
            </section>

            <section className="person-360-panel" aria-label="Person 360">
              <div className="person-360-head">
                <div>
                  <p className="eyebrow">Person 360</p>
                  <h3>{selectedPerson.name}</h3>
                </div>
                <div className="privacy-pills" aria-label="Приватность контекста">
                  <span className="visibility-chip shared">Общее</span>
                  {isAdmin && (
                    <span className="visibility-chip private">
                      <LockKeyhole size={12} />
                      Только лид
                    </span>
                  )}
                  <span className="visibility-chip muted">Опросы агрегируются</span>
                </div>
              </div>
              <div className="person-360-grid">
                {person360Metrics.map((metric) => (
                  <article className="person-360-metric" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <small>{metric.detail}</small>
                  </article>
                ))}
              </div>
              <div className="workflow-trace" aria-label="Связь работы">
                <span>1:1</span>
                <ChevronRight size={14} />
                <span>ЛПР</span>
                <ChevronRight size={14} />
                <span>Цели</span>
                <ChevronRight size={14} />
                <span>Шаги</span>
              </div>
            </section>

            {briefing && (
              <section className="briefing-card" aria-label="Брифинг к встрече">
                <header className="briefing-head">
                  <div>
                    <p className="eyebrow">Брифинг</p>
                    <h3>Что важно знать перед встречей</h3>
                  </div>
                </header>
                <div className="briefing-grid">
                  <article className={`briefing-tile ${briefing.delta < -5 ? "warn" : briefing.delta > 5 ? "good" : ""}`}>
                    <span className="briefing-label">Пульс за 4 недели</span>
                    <strong>
                      {briefing.delta > 0 ? "+" : ""}
                      {briefing.delta}
                    </strong>
                    <small>
                      {briefing.delta < -5
                        ? "заметное падение"
                        : briefing.delta < 0
                          ? "ниже"
                          : briefing.delta > 5
                            ? "стабильный рост"
                            : briefing.delta > 0
                              ? "выше"
                              : "без изменений"}
                    </small>
                  </article>
                  <article className={`briefing-tile ${briefing.urgentTopics > 0 ? "warn" : ""}`}>
                    <span className="briefing-label">Открытые темы</span>
                    <strong>{briefing.openTopics}</strong>
                    <small>
                      {briefing.urgentTopics > 0
                        ? `${briefing.urgentTopics} ${pluralizeRu(briefing.urgentTopics, ["срочная", "срочные", "срочных"])}`
                        : "ничего срочного"}
                    </small>
                  </article>
                  <article className={`briefing-tile ${briefing.openActionsCount > 5 ? "warn" : ""}`}>
                    <span className="briefing-label">Открытые шаги</span>
                    <strong>{briefing.openActionsCount}</strong>
                    <small>
                      {briefing.openActionsCount === 0
                        ? "нет хвостов"
                        : briefing.openActionsCount > 5
                          ? "хвост накапливается"
                          : "в работе"}
                    </small>
                  </article>
                  <article
                    className={`briefing-tile ${
                      briefing.employeeRatio < 40 && personCards.length > 2 ? "warn" : ""
                    }`}
                  >
                    <span className="briefing-label">Темы от участника</span>
                    <strong>{briefing.employeeRatio}%</strong>
                    <small>
                      {personCards.length === 0
                        ? "нет данных"
                        : briefing.employeeRatio < 40
                          ? "лид доминирует"
                          : "баланс ок"}
                    </small>
                  </article>
                  {briefing.oncallWeeks > 0 && (
                    <>
                      <article
                        className={`briefing-tile ${
                          briefing.avgPagesPerWeek > 8 ? "warn" : ""
                        }`}
                      >
                        <span className="briefing-label">On-call за 4 недели</span>
                        <strong>{briefing.avgPagesPerWeek}/нед</strong>
                        <small>
                          {briefing.avgPagesPerWeek > 8
                            ? "высокий шум, нужен разбор"
                            : briefing.avgPagesPerWeek > 4
                              ? "среднее, выше нормы"
                              : "ниже порога риска"}
                        </small>
                      </article>
                      <article
                        className={`briefing-tile ${briefing.totalSleepNights > 4 ? "warn" : ""}`}
                      >
                        <span className="briefing-label">Сон</span>
                        <strong>{briefing.totalSleepNights}</strong>
                        <small>
                          {briefing.totalSleepNights === 0
                            ? "без ночных срабатываний"
                            : `${pluralizeRu(briefing.totalSleepNights, ["ночь", "ночи", "ночей"])} прерывали`}
                        </small>
                      </article>
                    </>
                  )}
                </div>
              </section>
            )}

            <div className="view-tabs" role="tablist" aria-label="Разделы 1:1">
              {[
                ["agenda", "Подготовка", MessageSquarePlus],
                ["health", "Встреча", Activity],
                ["outcomes", "Итоги", CheckCircle2]
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={activeView === id ? "active" : ""}
                  onClick={() => setActiveView(id)}
                  type="button"
                  role="tab"
                  aria-selected={activeView === id}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>

        {activeView === "agenda" && (
          <section className="content-grid agenda-view">
            <div className="agenda-column">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Повестка</p>
                  <h3>Темы 1:1</h3>
                </div>
                <div className="filter-pills" aria-label="Фильтр тем">
                  {[
                    ["all", "Все"],
                    ["open", "Открытые"],
                    ["employee", "От участника"],
                    ["manager", "От лида"],
                    ["health", "Пульс"],
                    ["growth", "Рост"]
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={activeFilter === id ? "active" : ""}
                      onClick={() => setActiveFilter(id)}
                      type="button"
                      aria-pressed={activeFilter === id}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`agenda-list ${sectionStaggerClass("agenda")}`}>
                {filteredCards.length === 0 ? (
                  <div className="empty-state">
                    <CircleDashed size={22} />
                    <span>В этом фильтре пока нет тем.</span>
                  </div>
                ) : (
                  filteredCards.map((card) => {
                    const canEdit = isAdmin || card.source === "employee";
                    const isEditing = editingCardId === card.id;
                    const actionAlreadyOpen = openActionTitleKeys.has(duplicateTitleKey(card.title));
                    return (
                      <article className={`agenda-card priority-${card.priority}`} key={card.id}>
                        <div className="card-topline">
                          <span className={`category-chip ${categories[card.category]?.tone || "teal"}`}>
                            <small>Тема</small>
                            {categories[card.category]?.label || "Тема"}
                          </span>
                          <span className={`source-chip ${sourceTone(card.source)}`}>
                            <small>Автор</small>
                            {sourceLabel(card.source)}
                          </span>
                          <span className={`priority-chip priority-${card.priority}`}>
                            <small>Приоритет</small>
                            {priorityLabel(card.priority)}
                          </span>
                          <span className="visibility-chip shared">Видно участнику и лиду</span>
                          {card.lprId && lprById.get(card.lprId) && (
                            <span className="goal-chip muted">
                              ЛПР · {lprById.get(card.lprId).title}
                            </span>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="card-edit-fields">
                            <input
                              value={cardEditDraft.title}
                              onChange={(event) =>
                                setCardEditDraft((current) => ({ ...current, title: event.target.value }))
                              }
                              placeholder="Тема"
                            />
                            <textarea
                              rows={3}
                              value={cardEditDraft.body}
                              onChange={(event) =>
                                setCardEditDraft((current) => ({ ...current, body: event.target.value }))
                              }
                              placeholder="Контекст"
                            />
                          </div>
                        ) : (
                          <>
                            <h4>{card.title}</h4>
                            {card.body && <p>{card.body}</p>}
                          </>
                        )}
                        <div className="card-actions">
                          {isEditing ? (
                            <>
                              <button
                                className="soft-button"
                                type="button"
                                onClick={() => {
                                  if (cardEditDraft.title.trim().length < 1) return;
                                  updateCardFields(card.id, {
                                    title: cardEditDraft.title.trim(),
                                    body: cardEditDraft.body.trim()
                                  });
                                  setEditingCardId("");
                                }}
                              >
                                <Check size={15} />
                                Сохранить
                              </button>
                              <button
                                className="soft-button"
                                type="button"
                                onClick={() => setEditingCardId("")}
                              >
                                <X size={15} />
                                Отмена
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className={card.status === "discussing" ? "active soft-button" : "soft-button"}
                                type="button"
                                aria-pressed={card.status === "discussing"}
                                onClick={() =>
                                  updateCardStatus(card.id, card.status === "discussing" ? "todo" : "discussing")
                                }
                              >
                                <SlidersHorizontal size={15} />
                                В работе
                              </button>
                              <button
                                className={card.status === "done" ? "active soft-button" : "soft-button"}
                                type="button"
                                aria-pressed={card.status === "done"}
                                onClick={() => updateCardStatus(card.id, card.status === "done" ? "todo" : "done")}
                              >
                                <Check size={15} />
                                Обсудили
                              </button>
                              <button
                                className="soft-button"
                                type="button"
                                onClick={() => promoteCardToAction(card)}
                                disabled={actionAlreadyOpen}
                                title={actionAlreadyOpen ? "Такой шаг уже есть" : "Добавить в шаги"}
                              >
                                {actionAlreadyOpen ? <Check size={15} /> : <ChevronRight size={15} />}
                                {actionAlreadyOpen ? "Уже в шагах" : "Добавить в шаги"}
                              </button>
                              {!card.lprId && (
                                <button className="soft-button" type="button" onClick={() => promoteCardToLpr(card)}>
                                  <ClipboardCheck size={15} />
                                  В ЛПР
                                </button>
                              )}
                              {canEdit && (
                                <>
                                  <button
                                    className="soft-button"
                                    type="button"
                                    onClick={() => {
                                      setEditingCardId(card.id);
                                      setCardEditDraft({ title: card.title, body: card.body || "" });
                                    }}
                                    title="Редактировать"
                                  >
                                    <Pencil size={15} />
                                    Изменить
                                  </button>
                                  <button
                                    className="soft-button danger-button"
                                    type="button"
                                    onClick={() => deleteCard(card.id)}
                                    title="Удалить тему"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>

            <aside className="compose-column" aria-label="Добавление темы">
              <form className="compose-form" onSubmit={addAgendaCard}>
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Новая тема</p>
                    <h3>Добавить тему</h3>
                  </div>
                  <button
                    className="icon-button"
                    type="submit"
                    title={newCardAlreadyOpen ? "Такая тема уже есть" : "Добавить тему"}
                    disabled={!newCardTitleKey || newCardAlreadyOpen}
                  >
                    <Plus size={18} />
                  </button>
                </div>

                <div className="privacy-strip">
                  <span className="visibility-chip shared">Тема видна участнику и лиду</span>
                  <span className="visibility-chip private">
                    <LockKeyhole size={12} />
                    Приватные заметки отдельно
                  </span>
                </div>

                {isAdmin ? (
                  <label>
                    Автор темы
                    <select value={newCard.source} onChange={(event) => setNewCard((current) => ({ ...current, source: event.target.value }))}>
                      <option value="employee">Участник 1:1</option>
                      <option value="manager">Лид</option>
                    </select>
                  </label>
                ) : (
                  <div className="access-note">Тема будет добавлена от имени участника 1:1.</div>
                )}

                <label>
                  Тип темы
                  <select value={newCard.category} onChange={(event) => setNewCard((current) => ({ ...current, category: event.target.value }))}>
                    {Object.entries(categories).map(([id, category]) => (
                      <option key={id} value={id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                {activePersonLprs.length > 0 && (
                  <label>
                    Связь с ЛПР
                    <select value={newCard.lprId || ""} onChange={(event) => setNewCard((current) => ({ ...current, lprId: event.target.value }))}>
                      <option value="">Без ЛПР</option>
                      {activePersonLprs.map((lpr) => (
                        <option key={lpr.id} value={lpr.id}>
                          {lpr.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label>
                  Приоритет
                  <select value={newCard.priority} onChange={(event) => setNewCard((current) => ({ ...current, priority: event.target.value }))}>
                    <option value="high">Срочно</option>
                    <option value="medium">Важно</option>
                    <option value="low">Может подождать</option>
                  </select>
                </label>

                <label>
                  Тема
                  <input
                    value={newCard.title}
                    onChange={(event) => setNewCard((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Например: слишком много срочных запросов"
                  />
                </label>

                <label>
                  Контекст
                  <textarea
                    value={newCard.body}
                    onChange={(event) => setNewCard((current) => ({ ...current, body: event.target.value }))}
                    placeholder="Что важно не забыть обсудить?"
                    rows={4}
                  />
                </label>
              </form>

              <div className="prompt-bank">
                <p className="eyebrow">
                  Быстрые вопросы — {meetingTypeLabel[selectedPerson?.meetingType || "regular"]}
                </p>
                {getQuestionSeeds(
                  selectedPerson?.meetingType || "regular",
                  selectedPerson?.mentorshipMode || "coach"
                ).map((seed) => {
                  const seedAlreadyOpen = openCardTitleKeys.has(duplicateTitleKey(seed.title));
                  return (
                    <button
                      key={seed.title}
                      type="button"
                      onClick={() => addSeedCard(seed)}
                      disabled={seedAlreadyOpen}
                      title={seedAlreadyOpen ? "Такая тема уже есть" : undefined}
                    >
                      <span>{seed.title}</span>
                      {seedAlreadyOpen ? <Check size={15} /> : <Plus size={15} />}
                    </button>
                  );
                })}
              </div>
            </aside>
          </section>
        )}

        {activeView === "health" && (
          <section className="content-grid health-view">
            <div className="pulse-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Пульс 1:1</p>
                  <h3>Сигналы между встречами</h3>
                </div>
                <span className={`health-badge ${selectedScore < 64 ? "risk" : selectedScore < 76 ? "watch" : "good"}`}>{selectedScore}/100</span>
              </div>

              <div className="signal-grid">
                {[
                  ["energy", "Энергия", "низкая", "высокая"],
                  ["load", "Нагрузка", "низкая", "высокая"],
                  ["clarity", "Ясность", "мало ясности", "ясно"],
                  ["trust", "Доверие", "низкое", "высокое"]
                ].map(([id, label, min, max]) => {
                  const value = pulseValue(id);
                  return (
                    <label className="signal-control" key={id}>
                      <span>
                        <strong>{label}</strong>
                        <em>{value}/10</em>
                      </span>
                      <input
                        min="1"
                        max="10"
                        type="range"
                        value={value}
                        onChange={(event) => updatePulseDraft(id, event.target.value)}
                        onPointerDown={(event) => event.currentTarget.setPointerCapture?.(event.pointerId)}
                        onPointerUp={(event) => {
                          event.currentTarget.releasePointerCapture?.(event.pointerId);
                          commitPulseValue(id, event.currentTarget.value);
                        }}
                        onKeyUp={(event) => commitPulseValue(id, event.currentTarget.value)}
                        onBlur={(event) => commitPulseValue(id, event.currentTarget.value)}
                      />
                      <small>
                        <span>{min}</span>
                        <span>{max}</span>
                      </small>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="health-insights">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Риски</p>
                  <h3>Что требует внимания</h3>
                </div>
                <AlertTriangle size={18} />
              </div>
              <ul className="insight-list">
                {selectedPulse.load >= 8 && <li>Нагрузка выше нормы: стоит снять часть входящих задач.</li>}
                {selectedPulse.clarity <= 6 && <li>Проседает ясность: нужен контекст по приоритетам и критериям успеха.</li>}
                {selectedPulse.energy <= 5 && <li>Энергия низкая: лучше начать с восстановления и границ.</li>}
                {selectedPulse.trust <= 6 && <li>Доверие ниже нормы: зафиксируйте спорные решения и ожидания.</li>}
                {selectedPulse.load < 8 && selectedPulse.energy > 5 && selectedPulse.clarity > 6 && selectedPulse.trust > 6 && (
                  <li>Критичных сигналов нет: проверьте открытые действия и план развития.</li>
                )}
              </ul>
            </div>

            <div className="meeting-transcript-panel">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Стенография</p>
                  <h3>Протокол встречи</h3>
                </div>
                <span className="visibility-chip shared">Видно участнику и лиду</span>
              </div>
              <textarea
                value={selectedMeetingDraft}
                onChange={(event) => updateMeetingDraft(event.target.value)}
                placeholder="Ключевые цитаты, решения, контекст и открытые вопросы."
                rows={10}
              />
              <div className="transcript-actions">
                <span>{countLabel(selectedMeetingDraft.trim().length, ["символ", "символа", "символов"])}</span>
                <button
                  className="soft-button"
                  type="button"
                  onClick={clearMeetingDraft}
                  disabled={!selectedMeetingDraft.trim()}
                >
                  <Trash2 size={15} />
                  Очистить
                </button>
              </div>
            </div>

          </section>
        )}

        {activeView === "outcomes" && (
          <section className="content-grid outcomes-view">
            <div className="actions-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Следующие шаги</p>
                  <h3>Следующие шаги до встречи</h3>
                </div>
                <span className="count-pill">{countLabel(unresolvedActions.length, ["открытый шаг", "открытых шага", "открытых шагов"])}</span>
              </div>

              <div className="action-list">
                {personActions.map((action) => {
                  const canEdit = isAdmin || action.owner === "employee";
                  const isEditing = editingActionId === action.id;
                  const isOverdue =
                    !action.done &&
                    action.dueDate &&
                    action.dueDate < todayISODate();
                  return (
                    <div className={`action-row ${action.done ? "done" : ""} ${isOverdue ? "overdue" : ""}`} key={action.id}>
                      {isEditing ? (
                        <>
                          <input
                            type="checkbox"
                            checked={action.done}
                            onChange={() => toggleAction(action.id)}
                            aria-label="Готово"
                          />
                          <div className="action-edit-fields">
                            <input
                              value={actionEditDraft.title}
                              onChange={(event) =>
                                setActionEditDraft((current) => ({ ...current, title: event.target.value }))
                              }
                              placeholder="Что нужно сделать"
                            />
                            <div className="two-field-grid">
                              <DatePicker
                                value={actionEditDraft.dueDate}
                                onChange={(iso) =>
                                  setActionEditDraft((current) => ({ ...current, dueDate: iso }))
                                }
                              />
                              <input
                                value={actionEditDraft.due}
                                onChange={(event) =>
                                  setActionEditDraft((current) => ({ ...current, due: event.target.value }))
                                }
                                placeholder="Срок словами"
                              />
                            </div>
                          </div>
                          <div className="action-edit-buttons">
                            <button
                              className="soft-button"
                              type="button"
                              onClick={() => {
                                if (actionEditDraft.title.trim().length < 1) return;
                                updateActionFields(action.id, {
                                  title: actionEditDraft.title.trim(),
                                  due: actionEditDraft.due.trim() || "к следующему 1:1",
                                  dueDate: actionEditDraft.dueDate || ""
                                });
                                setEditingActionId("");
                              }}
                              title="Сохранить"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              className="soft-button"
                              type="button"
                              onClick={() => setEditingActionId("")}
                              title="Отмена"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <input
                            type="checkbox"
                            checked={action.done}
                            onChange={() => toggleAction(action.id)}
                            aria-label="Готово"
                          />
                          <span>
                            <strong>{action.title}</strong>
                            <small>
                              {ownerLabel(action.owner)} · {action.due}
                              {action.dueDate && ` · ${action.dueDate}`}
                              {isOverdue && <span className="overdue-tag">Просрочено</span>}
                            </small>
                          </span>
                          {canEdit && !action.done && (
                            <span className="action-row-buttons">
                              <button
                                className="icon-button"
                                type="button"
                                onClick={() => {
                                  setEditingActionId(action.id);
                                  setActionEditDraft({
                                    title: action.title,
                                    due: action.due,
                                    dueDate: action.dueDate || ""
                                  });
                                }}
                                title="Изменить"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                className="icon-button danger-button"
                                type="button"
                                onClick={() => deleteAction(action.id)}
                                title="Удалить"
                              >
                                <Trash2 size={14} />
                              </button>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {personActions.length === 0 && (
                  <div className="empty-state">
                    <CircleDashed size={22} />
                    <span>Пока нет следующих шагов.</span>
                  </div>
                )}
              </div>

              <form className="action-form" onSubmit={addAction}>
                {isAdmin && (
                  <label>
                    Ответственный
                    <select value={newAction.owner} onChange={(event) => setNewAction((current) => ({ ...current, owner: event.target.value }))}>
                      <option value="manager">Лид</option>
                      <option value="employee">Участник</option>
                    </select>
                  </label>
                )}
                <label>
                  Действие
                  <input
                    value={newAction.title}
                    onChange={(event) => setNewAction((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Что нужно сделать?"
                  />
                </label>
                <label>
                  Срок
                  <input value={newAction.due} onChange={(event) => setNewAction((current) => ({ ...current, due: event.target.value }))} />
                </label>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!newActionTitleKey || newActionAlreadyOpen}
                  title={newActionAlreadyOpen ? "Такой шаг уже есть" : "Добавить шаг"}
                >
                  <Plus size={16} />
                  Добавить шаг
                </button>
              </form>
            </div>

            <div className="summary-panel" ref={summaryPanelRef}>
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Итоги</p>
                  <h3>Краткие итоги</h3>
                </div>
                <button className="icon-button" type="button" onClick={buildSummary} title="Сформировать итоги">
                  <ClipboardCheck size={18} />
                </button>
              </div>
              <textarea readOnly value={summaryText || "Сформируйте итоги, чтобы получить краткое резюме встречи."} rows={14} />
            </div>
          </section>
        )}
          </>
        )}

        {activeSection === "lprs" && (
          <section className="goals-view lpr-view">
            <div className="goals-kpis">
              {[
                [ClipboardCheck, "ЛПР в работе", lprAggregate.active, "активных планов", "teal"],
                [Target, "Связанные цели", lprAggregate.linkedGoals, "цели с ЛПР", "green"],
                [MessageSquarePlus, "Темы из 1:1", lprAggregate.linkedCards, "привязаны к ЛПР", "slate"],
                [Activity, "Средний прогресс", `${lprAggregate.avgProgress}%`, "по активным целям", "amber"]
              ].map(([Icon, label, value, detail, tone]) => (
                <article className={`kpi-card ${tone}`} key={label}>
                  <span className="kpi-icon">
                    <Icon size={18} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{detail}</small>
                  </div>
                </article>
              ))}
            </div>

            <div className="goals-toolbar" role="toolbar" aria-label="Фильтры ЛПР">
              {isAdmin && (
                <label className="toolbar-field">
                  <span>Участник</span>
                  <select
                    value={lprFilter.personId}
                    onChange={(event) => setLprFilter((current) => ({ ...current, personId: event.target.value }))}
                  >
                    <option value="all">Все участники</option>
                    {workspace.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="toolbar-field">
                <span>Статус</span>
                <select
                  value={lprFilter.status}
                  onChange={(event) => setLprFilter((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="active">{lprStatusLabel.active}</option>
                  <option value="paused">{lprStatusLabel.paused}</option>
                  <option value="done">{lprStatusLabel.done}</option>
                  <option value="all">Все</option>
                </select>
              </label>
            </div>

            <div className="goals-grid">
              <div className={`goals-list ${sectionStaggerClass("lprs")}`}>
                {filteredLprs.length === 0 ? (
                  <div className="empty-state">
                    <ClipboardCheck size={22} />
                    <span>Пока нет ЛПР в этом фильтре.</span>
                  </div>
                ) : (
                  filteredLprs.map((lpr) => {
                    const lprPerson = workspace.people.find((person) => person.id === lpr.personId);
                    const linkedGoals = allGoals.filter((goal) => goal.lprId === lpr.id);
                    const linkedCards = (workspace.cards || []).filter((card) => card.lprId === lpr.id);
                    const activeLinkedGoals = linkedGoals.filter((goal) => goal.status === "active");
                    const avgProgress = activeLinkedGoals.length
                      ? Math.round(activeLinkedGoals.reduce((sum, goal) => sum + (goal.progress || 0), 0) / activeLinkedGoals.length)
                      : 0;
                    const canEdit = isAdmin || user?.personId === lpr.personId;
                    return (
                      <article className={`goal-card lpr-card status-${lpr.status}`} key={lpr.id}>
                        <div className="goal-topline">
                          {lprPerson && (
                            <span className="goal-person">
                              <span className="avatar mini">{lprPerson.initials}</span>
                              {lprPerson.name}
                            </span>
                          )}
                          <span className={`goal-status status-${lpr.status}`}>{lprStatusLabel[lpr.status]}</span>
                          <span className="goal-chip muted">{linkedCards.length} тем 1:1</span>
                          <span className="goal-chip muted">{linkedGoals.length} целей</span>
                        </div>
                        <h4>{lpr.title}</h4>
                        {lpr.focus && <p>{lpr.focus}</p>}

                        <div className="workflow-trace compact" aria-label="Связь ЛПР">
                          <span>{linkedCards.length} тем 1:1</span>
                          <ChevronRight size={13} />
                          <span>ЛПР</span>
                          <ChevronRight size={13} />
                          <span>{linkedGoals.length} целей</span>
                          <ChevronRight size={13} />
                          <span>{avgProgress}% прогресс</span>
                        </div>

                        <div className="goal-progress">
                          <div className="goal-progress-meta">
                            <strong>{avgProgress}%</strong>
                            <div className="goal-progress-line" aria-hidden="true">
                              <span style={{ width: `${avgProgress}%` }} />
                            </div>
                          </div>
                        </div>

                        <div className="lpr-linked-grid">
                          <div>
                            <strong>Из 1:1</strong>
                            {linkedCards.slice(0, 4).map((card) => (
                              <button key={card.id} className="lpr-link-row" type="button" onClick={() => selectPerson(card.personId)}>
                                <span>{card.title}</span>
                                <ChevronRight size={14} />
                              </button>
                            ))}
                            {linkedCards.length === 0 && <small>Свяжите тему 1:1 с ЛПР.</small>}
                          </div>
                          <div>
                            <strong>Цели</strong>
                            {linkedGoals.slice(0, 4).map((goal) => (
                              <button key={goal.id} className="lpr-link-row" type="button" onClick={() => openGoalForLpr(lpr)}>
                                <span>{goal.title}</span>
                                <em>{goal.progress}%</em>
                              </button>
                            ))}
                            {linkedGoals.length === 0 && <small>Добавьте цель из этого плана.</small>}
                          </div>
                        </div>

                        {canEdit && (
                          <div className="goal-actions">
                            <button className="soft-button" type="button" onClick={() => openGoalForLpr(lpr)}>
                              <Plus size={15} />
                              Цель
                            </button>
                            {lpr.status !== "active" && (
                              <button className="soft-button" type="button" onClick={() => setLprStatus(lpr.id, "active")}>
                                <RotateCcw size={15} />
                                В работу
                              </button>
                            )}
                            {lpr.status !== "paused" && (
                              <button className="soft-button" type="button" onClick={() => setLprStatus(lpr.id, "paused")}>
                                <CircleDashed size={15} />
                                Пауза
                              </button>
                            )}
                            {lpr.status !== "done" && (
                              <button className="soft-button" type="button" onClick={() => setLprStatus(lpr.id, "done")}>
                                <Check size={15} />
                                Завершить
                              </button>
                            )}
                            <button className="soft-button danger-button" type="button" onClick={() => deleteLpr(lpr.id)}>
                              <Trash2 size={15} />
                              Удалить
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>

              <aside className="goal-compose" aria-label="Новый ЛПР">
                <form className="compose-form" onSubmit={addLpr}>
                  <div className="section-heading compact">
                    <div>
                      <p className="eyebrow">Новый ЛПР</p>
                      <h3>Добавить план</h3>
                    </div>
                    <button className="icon-button" type="submit" title="Добавить ЛПР">
                      <Plus size={18} />
                    </button>
                  </div>

                  {isAdmin && (
                    <label>
                      Участник
                      <select
                        value={newLpr.personId}
                        onChange={(event) => setNewLpr((current) => ({ ...current, personId: event.target.value }))}
                      >
                        <option value="">Выберите участника</option>
                        {workspace.people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label>
                    Название
                    <input
                      value={newLpr.title}
                      onChange={(event) => setNewLpr((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Например: ЛПР: ownership направления"
                    />
                  </label>

                  <label>
                    Фокус
                    <textarea
                      value={newLpr.focus}
                      onChange={(event) => setNewLpr((current) => ({ ...current, focus: event.target.value }))}
                      placeholder="Какие темы из 1:1 превращаем в цели и практику"
                      rows={4}
                    />
                  </label>

                  {lprTargetPersonId && (
                    <div className="goal-side-context">
                      <p className="eyebrow">Активные ЛПР</p>
                      {allLprs
                        .filter((lpr) => lpr.personId === lprTargetPersonId && lpr.status === "active")
                        .slice(0, 3)
                        .map((lpr) => (
                          <div className="goal-side-row" key={lpr.id}>
                            <strong>{lpr.title}</strong>
                            <span>{allGoals.filter((goal) => goal.lprId === lpr.id).length}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </form>
              </aside>
            </div>
          </section>
        )}

        {activeSection === "goals" && (
          <section className="goals-view">
            <div className="goals-kpis">
              {[
                [Target, "В работе", goalsAggregate.active, "активных целей", "teal"],
                [CheckCircle2, "Достигнуто", goalsAggregate.achieved, "цели закрыты", "green"],
                [Activity, "Средний прогресс", `${goalsAggregate.avgProgress}%`, "по активным", "slate"],
                [AlertTriangle, "Под риском", goalsAggregate.atRisk, "прогресс < 30%", "amber"]
              ].map(([Icon, label, value, detail, tone]) => (
                <article className={`kpi-card ${tone}`} key={label}>
                  <span className="kpi-icon">
                    <Icon size={18} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{detail}</small>
                  </div>
                </article>
              ))}
            </div>

            <div className="goals-toolbar" role="toolbar" aria-label="Фильтры целей">
              {isAdmin && (
                <label className="toolbar-field">
                  <span>Участник</span>
                  <select
                    value={goalsFilter.personId}
                    onChange={(event) => setGoalsFilter((current) => ({ ...current, personId: event.target.value }))}
                  >
                    <option value="all">Все участники</option>
                    {workspace.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="toolbar-field">
                <span>Статус</span>
                <select
                  value={goalsFilter.status}
                  onChange={(event) => setGoalsFilter((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="active">{goalStatusLabel.active}</option>
                  <option value="achieved">{goalStatusLabel.achieved}</option>
                  <option value="abandoned">{goalStatusLabel.abandoned}</option>
                  <option value="all">Все</option>
                </select>
              </label>
            </div>

            <div className="goals-grid">
              <div className={`goals-list ${sectionStaggerClass("goals")}`}>
                {filteredGoals.length === 0 ? (
                  <div className="empty-state">
                    <Target size={22} />
                    <span>В этом фильтре пока нет целей.</span>
                  </div>
                ) : (
                  filteredGoals.map((goal) => {
                    const goalPerson = workspace.people.find((person) => person.id === goal.personId);
                    const goalLpr = goal.lprId ? lprById.get(goal.lprId) : null;
                    const dueLabel = goal.dueDate || goal.horizon;
                    const isOwner = isAdmin || user?.personId === goal.personId;
                    const progressValue = goalProgressValue(goal);
                    return (
                      <article className={`goal-card status-${goal.status}`} key={goal.id}>
                        <div className="goal-topline">
                          {goalPerson && (
                            <span className="goal-person">
                              <span className="avatar mini">{goalPerson.initials}</span>
                              {goalPerson.name}
                            </span>
                          )}
                          {goal.horizon && <span className="goal-chip">{goal.horizon}</span>}
                          {dueLabel && goal.dueDate && goal.dueDate !== goal.horizon && (
                            <span className="goal-chip muted">до {goal.dueDate}</span>
                          )}
                          {goalLpr && <span className="goal-chip muted">ЛПР · {goalLpr.title}</span>}
                          <span className={`goal-status status-${goal.status}`}>{goalStatusLabel[goal.status]}</span>
                        </div>
                        <h4>{goal.title}</h4>
                        {goal.description && <p>{goal.description}</p>}

                        <div className="workflow-trace compact" aria-label="Связь цели">
                          <span>1:1</span>
                          <ChevronRight size={13} />
                          <span className={!goalLpr ? "muted" : ""}>{goalLpr ? "ЛПР" : "без ЛПР"}</span>
                          <ChevronRight size={13} />
                          <span>Цель</span>
                          <ChevronRight size={13} />
                          <span>{progressValue}%</span>
                        </div>

                        <div className="goal-progress">
                          <div className="goal-progress-meta">
                            <strong>{progressValue}%</strong>
                            {isOwner && goal.status !== "abandoned" ? (
                              <input
                                className="goal-progress-range"
                                style={{ "--progress": `${progressValue}%` }}
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={progressValue}
                                onChange={(event) => updateGoalProgressDraft(goal.id, event.target.value)}
                                onPointerDown={(event) => event.currentTarget.setPointerCapture?.(event.pointerId)}
                                onPointerUp={(event) => {
                                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                                  commitGoalProgressValue(goal.id, event.currentTarget.value);
                                }}
                                onKeyUp={(event) => commitGoalProgressValue(goal.id, event.currentTarget.value)}
                                onBlur={(event) => commitGoalProgressValue(goal.id, event.currentTarget.value)}
                                aria-label="Прогресс цели"
                              />
                            ) : (
                              <div className="goal-progress-line" aria-hidden="true">
                                <span style={{ width: `${progressValue}%` }} />
                              </div>
                            )}
                          </div>
                        </div>

                        {isOwner && (
                          <div className="goal-actions">
                            {goal.status !== "achieved" && (
                              <button className="soft-button" type="button" onClick={() => setGoalStatus(goal.id, "achieved")}>
                                <Check size={15} />
                                Достигнута
                              </button>
                            )}
                            {goal.status !== "active" && (
                              <button className="soft-button" type="button" onClick={() => setGoalStatus(goal.id, "active")}>
                                <RotateCcw size={15} />
                                Вернуть в работу
                              </button>
                            )}
                            {goal.status !== "abandoned" && (
                              <button className="soft-button" type="button" onClick={() => setGoalStatus(goal.id, "abandoned")}>
                                <Flag size={15} />
                                Снять
                              </button>
                            )}
                            <button
                              className="soft-button danger-button"
                              type="button"
                              onClick={() => deleteGoal(goal.id)}
                            >
                              <Trash2 size={15} />
                              Удалить
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>

              <aside className="goal-compose" aria-label="Новая цель">
                <form className="compose-form" onSubmit={addGoal}>
                  <div className="section-heading compact">
                    <div>
                      <p className="eyebrow">Новая цель</p>
                      <h3>Добавить цель</h3>
                    </div>
                    <button className="icon-button" type="submit" title="Добавить цель">
                      <Plus size={18} />
                    </button>
                  </div>

                  {isAdmin && (
                    <label>
                      Участник
                      <select
                        value={newGoal.personId}
                        onChange={(event) => setNewGoal((current) => ({ ...current, personId: event.target.value, lprId: "" }))}
                      >
                        <option value="">Выберите участника</option>
                        {workspace.people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {goalAvailableLprs.length > 0 && (
                    <label>
                      ЛПР
                      <select
                        value={newGoal.lprId}
                        onChange={(event) => setNewGoal((current) => ({ ...current, lprId: event.target.value }))}
                      >
                        <option value="">Без ЛПР</option>
                        {goalAvailableLprs.map((lpr) => (
                          <option key={lpr.id} value={lpr.id}>
                            {lpr.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label>
                    Цель
                    <input
                      value={newGoal.title}
                      onChange={(event) => setNewGoal((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Например: снизить MTTR в 2 раза"
                    />
                  </label>

                  <label>
                    Контекст
                    <textarea
                      value={newGoal.description}
                      onChange={(event) => setNewGoal((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Что считаем успехом и какие ключевые шаги"
                      rows={3}
                    />
                  </label>

                  <div className="two-field-grid">
                    <label>
                      Горизонт
                      <input
                        value={newGoal.horizon}
                        onChange={(event) => setNewGoal((current) => ({ ...current, horizon: event.target.value }))}
                        placeholder="2026-Q2"
                      />
                    </label>
                    <label>
                      Дедлайн
                      <DatePicker
                        value={newGoal.dueDate}
                        onChange={(iso) => setNewGoal((current) => ({ ...current, dueDate: iso }))}
                      />
                    </label>
                  </div>
                </form>

                {selectedPerson && activePersonGoals.length > 0 && (
                  <div className="goal-side-context">
                    <p className="eyebrow">Активные цели {selectedPerson.name}</p>
                    {activePersonGoals.slice(0, 3).map((goal) => (
                      <div className="goal-side-row" key={goal.id}>
                        <strong>{goal.title}</strong>
                        <span>{goal.progress}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}

        {activeSection === "surveys" && (
          <section className="surveys-view">
            {isAdmin && showSurveyComposer && (
              <form className="survey-composer dashboard-panel" onSubmit={submitNewSurvey}>
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Новый опрос</p>
                    <h3>Конструктор</h3>
                  </div>
                </div>

                <label>
                  Название
                  <input
                    value={surveyComposer.title}
                    onChange={(event) => setSurveyComposer((c) => ({ ...c, title: event.target.value }))}
                    placeholder="Например: Пульс команды за неделю"
                  />
                </label>
                <label>
                  Описание
                  <textarea
                    value={surveyComposer.description}
                    onChange={(event) => setSurveyComposer((c) => ({ ...c, description: event.target.value }))}
                    placeholder="Зачем мы спрашиваем и как используем ответы"
                    rows={2}
                  />
                </label>
                <label className="check-row inline-check">
                  <input
                    type="checkbox"
                    checked={surveyComposer.anonymous}
                    onChange={(event) => setSurveyComposer((c) => ({ ...c, anonymous: event.target.checked }))}
                  />
                  <span>
                    <strong>Анонимный</strong>
                    <small>Агрегаты откроются после 3 ответов, авторы не раскрываются</small>
                  </span>
                </label>

                <div className="composer-questions">
                  {surveyComposer.questions.map((question, qIndex) => (
                    <article className="composer-question" key={question.id}>
                      <div className="composer-question-head">
                        <span className="composer-question-number">#{qIndex + 1}</span>
                        <select
                          value={question.type}
                          onChange={(event) => patchSurveyQuestion(qIndex, { type: event.target.value })}
                        >
                          {Object.entries(surveyQuestionTypeLabel).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <label className="check-row inline-check small">
                          <input
                            type="checkbox"
                            checked={question.required}
                            onChange={(event) => patchSurveyQuestion(qIndex, { required: event.target.checked })}
                          />
                          <span>
                            <strong>Обязательный</strong>
                          </span>
                        </label>
                        <span className="composer-spacer" />
                        <button
                          className="icon-button"
                          type="button"
                          disabled={qIndex === 0}
                          onClick={() => moveSurveyQuestion(qIndex, -1)}
                          title="Выше"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          disabled={qIndex === surveyComposer.questions.length - 1}
                          onClick={() => moveSurveyQuestion(qIndex, +1)}
                          title="Ниже"
                        >
                          <ArrowDown size={14} />
                        </button>
                        {surveyComposer.questions.length > 1 && (
                          <button
                            className="icon-button danger-button"
                            type="button"
                            onClick={() => removeSurveyQuestion(qIndex)}
                            title="Удалить вопрос"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <input
                        value={question.prompt}
                        onChange={(event) => patchSurveyQuestion(qIndex, { prompt: event.target.value })}
                        placeholder="Текст вопроса"
                      />
                      {(question.type === "single" || question.type === "multi") && (
                        <div className="composer-options">
                          {question.options.map((option, oIndex) => (
                            <div className="composer-option-row" key={oIndex}>
                              <input
                                value={option}
                                onChange={(event) => patchQuestionOption(qIndex, oIndex, event.target.value)}
                                placeholder={`Вариант ${oIndex + 1}`}
                              />
                              {question.options.length > 2 && (
                                <button
                                  className="icon-button"
                                  type="button"
                                  onClick={() => removeQuestionOption(qIndex, oIndex)}
                                  title="Убрать вариант"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button className="soft-button" type="button" onClick={() => addQuestionOption(qIndex)}>
                            <Plus size={14} />
                            Добавить вариант
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>

                <div className="composer-actions">
                  <button className="soft-button" type="button" onClick={() => addSurveyQuestion("scale")}>
                    <Plus size={15} />
                    Шкала
                  </button>
                  <button className="soft-button" type="button" onClick={() => addSurveyQuestion("single")}>
                    <Plus size={15} />
                    Один вариант
                  </button>
                  <button className="soft-button" type="button" onClick={() => addSurveyQuestion("multi")}>
                    <Plus size={15} />
                    Несколько вариантов
                  </button>
                  <button className="soft-button" type="button" onClick={() => addSurveyQuestion("text")}>
                    <Plus size={15} />
                    Свободный ответ
                  </button>
                  <button className="soft-button" type="button" onClick={() => addSurveyQuestion("date")}>
                    <Plus size={15} />
                    Дата
                  </button>
                  <span className="composer-spacer" />
                  <button className="ghost-button" type="button" onClick={resetSurveyComposer}>
                    Отмена
                  </button>
                  <button className="primary-button" type="submit">
                    <Send size={15} />
                    Опубликовать
                  </button>
                </div>
              </form>
            )}

            {isAdmin && (workspace.surveys || []).length === 0 && !showSurveyComposer && (
              <section className="survey-templates">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Шаблоны</p>
                    <h3>Начать с готового опроса</h3>
                  </div>
                </div>
                <p className="form-note" style={{ margin: 0 }}>
                  Выберите шаблон — мы откроем конструктор с уже добавленными вопросами, останется только подправить.
                </p>
                <div className="survey-templates-grid">
                  {surveyTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="survey-template-card"
                      onClick={() => openComposerWithTemplate(t.id)}
                    >
                      <strong>{t.label}</strong>
                      <small>{t.description}</small>
                      {t.id !== "blank" && (
                        <em>{t.survey.questions.length} {pluralizeRu(t.survey.questions.length, ["вопрос", "вопроса", "вопросов"])}</em>
                      )}
                    </button>
                  ))}
                  {(workspace.surveyTemplates || []).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="survey-template-card user-template"
                      onClick={() => {
                        const reKeyed = (t.questions || []).map((q) => ({
                          ...q,
                          id: `q-${Math.random().toString(16).slice(2, 8)}`
                        }));
                        setSurveyComposer({
                          title: t.title,
                          description: t.description,
                          anonymous: t.anonymous,
                          questions: reKeyed.length ? reKeyed : [emptyQuestionFor("scale")]
                        });
                        setShowSurveyComposer(true);
                        window.requestAnimationFrame(() => {
                          document.querySelector(".survey-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        });
                      }}
                    >
                      <strong>{t.title || "Без названия"}</strong>
                      <small>{t.description || "Ваш шаблон"}</small>
                      <em>
                        {t.questions.length} {pluralizeRu(t.questions.length, ["вопрос", "вопроса", "вопросов"])}
                        {" · "}
                        мой шаблон
                      </em>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className={`surveys-list ${sectionStaggerClass("surveys")}`}>
              {!isAdmin && (workspace.surveys || []).length === 0 && (
                <div className="empty-state">
                  <ClipboardList size={22} />
                  <span>Опросов пока нет.</span>
                </div>
              )}
              {(workspace.surveys || []).map((survey) => {
                const isExpanded = expandedSurveyId === survey.id;
                const draft = surveyDrafts[survey.id] || {};
                const myResponse = survey.myResponse;
                const aggregate = survey.aggregate;
                const participationPct = workspace.people.length
                  ? Math.min(100, Math.round((survey.responseCount / workspace.people.length) * 100))
                  : 0;
                return (
                  <article className={`survey-card ${isExpanded ? "expanded" : ""}`} key={survey.id}>
                    <header className="survey-head">
                      <div className="survey-head-main">
                        <h3>{survey.title}</h3>
                        <div className="survey-meta">
                          <span className={`goal-chip ${survey.anonymous ? "muted" : ""}`}>
                            {survey.anonymous ? "Анонимный" : "С указанием автора"}
                          </span>
                          <span className="goal-chip muted">
                            {survey.responseCount} {pluralizeRu(survey.responseCount, ["ответ", "ответа", "ответов"])}
                          </span>
                          {!isAdmin && myResponse && <span className="goal-chip">Вы ответили</span>}
                        </div>
                        {survey.description && <p>{survey.description}</p>}
                        {isAdmin && (
                          <div className="survey-participation" aria-label="Участие в опросе">
                            <div className="survey-participation-line" aria-hidden="true">
                              <span style={{ width: `${participationPct}%` }} />
                            </div>
                            <small>
                              {participationPct}% участия · {survey.responseCount} из {workspace.people.length}
                            </small>
                          </div>
                        )}
                      </div>
                      <div className="survey-head-actions">
                        <button
                          className="soft-button"
                          type="button"
                          onClick={() => setExpandedSurveyId(isExpanded ? "" : survey.id)}
                        >
                          {isExpanded ? "Свернуть" : isAdmin ? "Открыть результаты" : myResponse ? "Изменить ответы" : "Пройти"}
                        </button>
                        {isAdmin && (
                          <>
                            {survey.responseCount > 0 && (
                              <button
                                className="soft-button"
                                type="button"
                                onClick={() => exportSurveyCsv(survey)}
                                title="Скачать ответы CSV"
                              >
                                <Send size={15} />
                                CSV
                              </button>
                            )}
                            <button
                              className="soft-button"
                              type="button"
                              onClick={() => duplicateSurvey(survey)}
                              title="Создать копию"
                            >
                              <Pencil size={15} />
                              Копия
                            </button>
                            <button
                              className="soft-button"
                              type="button"
                              onClick={() => saveSurveyAsTemplate(survey.id)}
                              title="Сохранить как шаблон"
                            >
                              <ClipboardList size={15} />
                              В шаблоны
                            </button>
                            <button
                              className="soft-button danger-button"
                              type="button"
                              onClick={() => deleteSurvey(survey.id)}
                              title="Удалить опрос"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </header>

                    {isExpanded && isAdmin && (
                      <div className="survey-aggregate">
                        {aggregate?.hidden && (
                          <div className="empty-state compact-empty">
                            <LockKeyhole size={18} />
                            <span>
                              Анонимные результаты скрыты до {aggregate.minResponses} ответов. Сейчас: {aggregate.count}.
                            </span>
                          </div>
                        )}
                        {!aggregate?.hidden && survey.questions.map((question) => {
                          const stats = aggregate?.perQuestion?.[question.id];
                          return (
                            <section className="survey-aggregate-row" key={question.id}>
                              <header>
                                <span className="goal-chip muted">{surveyQuestionTypeLabel[question.type]}</span>
                                <h4>{question.prompt}</h4>
                              </header>
                              {!stats || stats.count === 0 ? (
                                <div className="empty-state compact-empty">
                                  <span>Ответов пока нет.</span>
                                </div>
                              ) : question.type === "scale" ? (
                                <>
                                  <p className="survey-stat">
                                    Среднее: <strong>{stats.avg}</strong> · Ответов: {stats.count}
                                  </p>
                                  <BarChart data={stats.distribution} />
                                </>
                              ) : question.type === "single" || question.type === "multi" ? (
                                <BarChart data={stats.distribution} />
                              ) : question.type === "date" ? (
                                stats.redacted ? (
                                  <p className="survey-stat">
                                    Ответов: <strong>{stats.count}</strong>. Ответы скрыты для анонимности.
                                  </p>
                                ) : (
                                  <ul className="survey-text-list">
                                    {stats.samples.map((d, i) => (
                                      <li key={i}>{formatRuDate(d)}</li>
                                    ))}
                                  </ul>
                                )
                              ) : (
                                stats.redacted ? (
                                  <p className="survey-stat">
                                    Ответов: <strong>{stats.count}</strong>. Тексты скрыты для анонимности.
                                  </p>
                                ) : (
                                  <ul className="survey-text-list">
                                    {stats.samples.map((text, i) => (
                                      <li key={i}>{text}</li>
                                    ))}
                                  </ul>
                                )
                              )}
                            </section>
                          );
                        })}
                        <section className="survey-next-actions" aria-label="Действия после опроса">
                          <div>
                            <p className="eyebrow">После опроса</p>
                            <strong>Превратите сигнал в следующий шаг</strong>
                          </div>
                          <div className="survey-next-actions-buttons">
                            <button className="soft-button" type="button" onClick={() => openSection("reports")}>
                              <BarChart3 size={15} />
                              В отчёты
                            </button>
                            <button className="soft-button" type="button" onClick={() => duplicateSurvey(survey)}>
                              <Pencil size={15} />
                              Повторить
                            </button>
                            <button className="soft-button" type="button" onClick={() => setShowSurveyComposer(true)}>
                              <Plus size={15} />
                              Новый опрос
                            </button>
                          </div>
                        </section>
                      </div>
                    )}

                    {isExpanded && !isAdmin && (
                      <form
                        className="survey-fill"
                        onSubmit={(event) => {
                          event.preventDefault();
                          submitSurveyResponse(survey.id);
                        }}
                      >
                        {survey.questions.map((question) => {
                          const draftAnswer = draft[question.id] || (myResponse?.answers?.[question.id] ?? null);
                          if (question.type === "scale") {
                            const value = draftAnswer?.value ?? "";
                            return (
                              <label className="survey-question" key={question.id}>
                                <span>
                                  {question.prompt}
                                  {question.required && <em> *</em>}
                                </span>
                                <div className="scale-row">
                                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                    <button
                                      key={n}
                                      type="button"
                                      className={`scale-button ${value === n ? "active" : ""}`}
                                      onClick={() => patchSurveyDraft(survey.id, question.id, { value: n })}
                                    >
                                      {n}
                                    </button>
                                  ))}
                                </div>
                              </label>
                            );
                          }
                          if (question.type === "single") {
                            const value = draftAnswer?.value ?? "";
                            return (
                              <fieldset className="survey-question" key={question.id}>
                                <legend>
                                  {question.prompt}
                                  {question.required && <em> *</em>}
                                </legend>
                                {question.options.map((option) => (
                                  <label className="check-row" key={option}>
                                    <input
                                      type="radio"
                                      name={`${survey.id}-${question.id}`}
                                      checked={value === option}
                                      onChange={() => patchSurveyDraft(survey.id, question.id, { value: option })}
                                    />
                                    <span>
                                      <strong>{option}</strong>
                                    </span>
                                  </label>
                                ))}
                              </fieldset>
                            );
                          }
                          if (question.type === "multi") {
                            const values = draftAnswer?.values ?? [];
                            return (
                              <fieldset className="survey-question" key={question.id}>
                                <legend>
                                  {question.prompt}
                                  {question.required && <em> *</em>}
                                </legend>
                                {question.options.map((option) => {
                                  const checked = values.includes(option);
                                  return (
                                    <label className="check-row" key={option}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => {
                                          const next = event.target.checked
                                            ? [...values, option]
                                            : values.filter((item) => item !== option);
                                          patchSurveyDraft(survey.id, question.id, { values: next });
                                        }}
                                      />
                                      <span>
                                        <strong>{option}</strong>
                                      </span>
                                    </label>
                                  );
                                })}
                              </fieldset>
                            );
                          }
                          if (question.type === "date") {
                            const value = draftAnswer?.value ?? "";
                            return (
                              <label className="survey-question" key={question.id}>
                                <span>
                                  {question.prompt}
                                  {question.required && <em> *</em>}
                                </span>
                                <DatePicker
                                  value={value}
                                  onChange={(iso) =>
                                    patchSurveyDraft(survey.id, question.id, { value: iso })
                                  }
                                />
                              </label>
                            );
                          }
                          // text
                          const value = draftAnswer?.value ?? "";
                          return (
                            <label className="survey-question" key={question.id}>
                              <span>
                                {question.prompt}
                                {question.required && <em> *</em>}
                              </span>
                              <textarea
                                rows={3}
                                value={value}
                                onChange={(event) =>
                                  patchSurveyDraft(survey.id, question.id, { value: event.target.value })
                                }
                              />
                            </label>
                          );
                        })}
                        {formErrors[`survey-${survey.id}`] && (
                          <div className="form-error inline-form-error">
                            {formErrors[`survey-${survey.id}`]}
                          </div>
                        )}
                        <div className="survey-fill-actions">
                          <button className="primary-button" type="submit">
                            <Send size={15} />
                            {myResponse ? "Сохранить изменения" : "Отправить ответы"}
                          </button>
                        </div>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeSection === "reports" && (
          <section className="reports-view">
            <div className="dashboard-kpis">
              <article className="kpi-card teal">
                <span className="kpi-icon"><HeartPulse size={18} /></span>
                <div>
                  <span>Пульс сейчас</span>
                  <strong>{reportsData.latestAvg}</strong>
                  <small>
                    {reportsData.trendDelta > 0
                      ? `+${reportsData.trendDelta} за 4 недели`
                      : reportsData.trendDelta < 0
                        ? `${reportsData.trendDelta} за 4 недели`
                        : "без изменений"}
                  </small>
                </div>
              </article>
              <article className="kpi-card slate">
                <span className="kpi-icon"><UsersRound size={18} /></span>
                <div>
                  <span>Участников</span>
                  <strong>{reportsData.peopleCount}</strong>
                  <small>в сводке</small>
                </div>
              </article>
              <article className="kpi-card amber">
                <span className="kpi-icon"><AlertTriangle size={18} /></span>
                <div>
                  <span>Открытых тем</span>
                  <strong>{reportsData.priorityData.reduce((sum, item) => sum + item.value, 0)}</strong>
                  <small>{reportsData.priorityData[0].value} срочных</small>
                </div>
              </article>
              <article className="kpi-card green">
                <span className="kpi-icon"><CheckCircle2 size={18} /></span>
                <div>
                  <span>Закрыто шагов</span>
                  <strong>{reportsData.completionPct}%</strong>
                  <small>{reportsData.actionsDone} из {reportsData.actionsDone + reportsData.actionsOpen}</small>
                </div>
              </article>
              <article className="kpi-card teal">
                <span className="kpi-icon"><Target size={18} /></span>
                <div>
                  <span>Активных целей</span>
                  <strong>{reportsData.activeGoalsCount}</strong>
                  <small>в работе</small>
                </div>
              </article>
              <article className="kpi-card slate">
                <span className="kpi-icon"><ClipboardCheck size={18} /></span>
                <div>
                  <span>Отчётов навыков</span>
                  <strong>{reportsData.assessmentCount}</strong>
                  <small>{reportsData.competencyMatrixRows.length} компетенций</small>
                </div>
              </article>
            </div>

            {(isAdmin || reportsData.competencyMatrixRows.length > 0) && (
              <section className="dashboard-panel report-panel competency-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Компетенции</p>
                    <h3>Карта навыков команды</h3>
                  </div>
                  <div className="panel-actions">
                    {isAdmin && reportsData.assessmentCount > 0 && (
                      <button className="soft-button" type="button" onClick={exportCompetencyCsv}>
                        <ArrowDown size={14} />
                        CSV
                      </button>
                    )}
                    <BarChart3 size={18} />
                  </div>
                </div>

                {reportsData.competencyMatrixRows.length > 0 ? (
                  <>
                    <div className="competency-summary-grid">
                      <div>
                        <strong>{reportsData.competencyStrengths.length}</strong>
                        <span>сильных зон</span>
                      </div>
                      <div>
                        <strong>{reportsData.competencyWeaknesses.length}</strong>
                        <span>зон роста</span>
                      </div>
                      <div>
                        <strong>{reportsData.competencyBusFactorRisks.length}</strong>
                        <span>bus factor рисков</span>
                      </div>
                    </div>
                    <div className="competency-matrix-list" aria-label="Матрица компетенций">
                      {reportsData.competencyMatrixRows.slice(0, 12).map((row) => (
                        <article className="competency-row" key={row.key}>
                          <div className="competency-row-head">
                            <strong>{row.name}</strong>
                            <small>
                              среднее {formatScoreValue(row.avg)} · bus factor {row.busFactor} · {row.coverage} {pluralizeRu(row.coverage, ["оценка", "оценки", "оценок"])}
                            </small>
                          </div>
                          <div className="competency-score-list">
                            {row.cells.map((cell) => (
                              <button
                                className={`competency-score ${competencyTone(cell.score, cell.targetScore)}`}
                                type="button"
                                key={`${row.key}-${cell.person.id}`}
                                onClick={() => selectPerson(cell.person.id)}
                                title={cell.score == null ? "Нет оценки" : `${cell.person.name}: ${formatScoreValue(cell.score)} из ${formatScoreValue(cell.targetScore || 5)}`}
                              >
                                <span>{cell.person.initials || cell.person.name.slice(0, 2)}</span>
                                <strong>{cell.score == null ? "—" : formatScoreValue(cell.score)}</strong>
                              </button>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty-state compact-empty">
                    <ClipboardCheck size={20} />
                    <span>Отчёты по компетенциям появятся после кейс-интервью.</span>
                  </div>
                )}
              </section>
            )}

            {isAdmin && (
              <section className="dashboard-panel report-panel competency-intake-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Case report</p>
                    <h3>Добавить отчёт кейс-интервью</h3>
                  </div>
                  <ClipboardList size={18} />
                </div>
                <form className="competency-form" onSubmit={submitCompetencyAssessment}>
                  <div className="two-field-grid">
                    <label>
                      <span>Участник</span>
                      <select
                        value={competencyDraft.personId}
                        onChange={(event) => setCompetencyDraft((current) => ({ ...current, personId: event.target.value }))}
                      >
                        <option value="">Выберите участника</option>
                        {workspace.people.map((person) => (
                          <option value={person.id} key={person.id}>{person.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Роль / контекст</span>
                      <input
                        value={competencyDraft.roleContext}
                        onChange={(event) => setCompetencyDraft((current) => ({ ...current, roleContext: event.target.value }))}
                        placeholder="Например: Support L2 · CRM, база знаний, эскалации"
                      />
                    </label>
                  </div>
                  <label>
                    <span>Название отчёта</span>
                    <input
                      value={competencyDraft.title}
                      onChange={(event) => setCompetencyDraft((current) => ({ ...current, title: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Компетенции</span>
                    <textarea
                      rows={6}
                      value={competencyDraft.rows}
                      onChange={(event) => setCompetencyDraft((current) => ({ ...current, rows: event.target.value }))}
                      placeholder="Категория | Компетенция | Балл | Цель | Наблюдение | Следующий шаг"
                    />
                  </label>
                  <p className="form-note">
                    Одна строка на компетенцию, шкала 0–5. Этот формат затем уходит в матрицу, CSV и импорт ЛПР.
                  </p>
                  {formErrors["competency-report"] && (
                    <p className="form-error">{formErrors["competency-report"]}</p>
                  )}
                  <div className="composer-actions">
                    <button className="primary-button" type="submit" disabled={!workspace.people.length}>
                      <Plus size={16} />
                      Сохранить отчёт
                    </button>
                  </div>
                </form>
              </section>
            )}

            {reportsData.latestCompetencyAssessments.length > 0 && (
              <section className="dashboard-panel report-panel competency-latest-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Отчёты</p>
                    <h3>Последние оценки по участникам</h3>
                  </div>
                  <UsersRound size={18} />
                </div>
                <div className="competency-report-list">
                  {reportsData.latestCompetencyAssessments.map(({ person, assessment }) => {
                    const gaps = (assessment.competencies || [])
                      .filter((competency) => Number(competency.score) < Number(competency.targetScore || 3))
                      .slice(0, 3);
                    return (
                      <article className="competency-report-row" key={assessment.id}>
                        <div className="competency-report-main">
                          <span className={`health-dot ${assessment.minScore < 2.5 ? "risk" : assessment.averageScore < 3.5 ? "watch" : "good"}`}>
                            {formatScoreValue(assessment.averageScore)}
                          </span>
                          <span>
                            <strong>{person.name}</strong>
                            <small>
                              {competencyGradeLabel[assessment.grade] || assessment.grade} · {competencySourceLabel[assessment.source] || assessment.source} · {assessment.title} · {String(assessment.validatedAt || assessment.createdAt || "").slice(0, 10)}
                            </small>
                          </span>
                        </div>
                        <div className="competency-gap-list">
                          {gaps.length > 0
                            ? gaps.map((gap) => (
                                <span className="goal-chip muted" key={`${assessment.id}-${gap.id}`}>
                                  {gap.name} {formatScoreValue(gap.score)}→{formatScoreValue(gap.targetScore)}
                                </span>
                              ))
                            : <span className="goal-chip">без явных просадок</span>}
                        </div>
                        {isAdmin && (
                          <div className="competency-report-actions">
                            <button className="soft-button" type="button" onClick={() => importAssessmentToLpr(assessment)}>
                              <ClipboardCheck size={14} />
                              В ЛПР
                            </button>
                            <button className="icon-button" type="button" title="Удалить отчёт" onClick={() => deleteCompetencyAssessment(assessment.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="report-insights-grid">
              <section className="dashboard-panel report-panel heatmap-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Heatmap</p>
                    <h3>Где проседает команда</h3>
                  </div>
                  <BarChart3 size={18} />
                </div>
                <div className="heatmap-table" role="table" aria-label="Heatmap команды">
                  <div className="heatmap-row heatmap-head" role="row">
                    <span>Участник</span>
                    <span>Эн.</span>
                    <span>Нагр.</span>
                    <span>Ясн.</span>
                    <span>Довер.</span>
                    <span>Шаги</span>
                  </div>
                  {teamHeatmapRows.map((row) => (
                    <button className="heatmap-row" type="button" key={row.person.id} onClick={() => selectPerson(row.person.id)}>
                      <span className="heatmap-person">
                        <span className={`health-dot ${row.score < 64 ? "risk" : row.score < 76 ? "watch" : "good"}`}>{row.score}</span>
                        <strong>{row.person.name}</strong>
                      </span>
                      {["energy", "load", "clarity", "trust"].map((metric) => (
                        <span className={`heatmap-cell ${heatmapTone(metric, row[metric])}`} key={metric}>
                          {row[metric] || "—"}
                        </span>
                      ))}
                      <span className="heatmap-actions">{row.openActions}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="dashboard-panel report-panel recommendations-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Рекомендации</p>
                    <h3>Куда вложить усилие</h3>
                  </div>
                  <ClipboardCheck size={18} />
                </div>
                <div className="recommendation-list">
                  {reportRecommendations.map((item) => (
                    <button
                      className={`recommendation-row tone-${item.tone}`}
                      key={item.id}
                      type="button"
                      onClick={() => (item.personId ? selectPerson(item.personId) : openSection(item.section || "reports"))}
                    >
                      <span className={`alert-dot severity-${item.tone === "risk" ? "high" : "medium"}`} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.action}</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                  {reportRecommendations.length === 0 && (
                    <div className="empty-state compact-empty">
                      <CheckCircle2 size={20} />
                      <span>Критичных рекомендаций сейчас нет.</span>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <section className="dashboard-panel report-panel">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Тренд</p>
                  <h3>Пульс команды (0–100) по неделям</h3>
                </div>
                <Activity size={18} />
              </div>
              <ScoreLineChart
                points={reportsData.compositeScorePoints}
                labels={reportsData.trendLabels}
              />
            </section>

            <section className="dashboard-panel report-panel">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Компоненты пульса</p>
                  <h3>Энергия / нагрузка / ясность / доверие (1–10)</h3>
                </div>
                <Activity size={18} />
              </div>
              <LineChart series={reportsData.trendSeries} labels={reportsData.trendLabels} />
              <div className="chart-legend">
                {pulseSeries.map((s) => (
                  <span key={s.id} className="chart-legend-item">
                    <span className="chart-legend-dot" style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
              </div>
            </section>

            <div className="reports-grid">
              <section className="dashboard-panel report-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Темы</p>
                    <h3>По категориям</h3>
                  </div>
                  <MessageSquarePlus size={18} />
                </div>
                <BarChart data={reportsData.categoriesData} />
              </section>

              <section className="dashboard-panel report-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Темы</p>
                    <h3>По приоритетам</h3>
                  </div>
                  <AlertTriangle size={18} />
                </div>
                <BarChart data={reportsData.priorityData} />
              </section>

              <section className="dashboard-panel report-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Темы</p>
                    <h3>По автору</h3>
                  </div>
                  <UsersRound size={18} />
                </div>
                <BarChart data={reportsData.sourceData} />
              </section>

              <section className="dashboard-panel report-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Цели</p>
                    <h3>Прогресс активных</h3>
                  </div>
                  <Target size={18} />
                </div>
                <BarChart data={reportsData.goalBuckets} />
              </section>
            </div>

            {isAdmin && reportsData.authorRatioByPerson.length > 0 && (
              <section className="dashboard-panel report-panel">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Здоровье повестки</p>
                    <h3>Кто наполняет 1:1 темами</h3>
                  </div>
                  <UsersRound size={18} />
                </div>
                <p className="form-note" style={{ margin: 0 }}>
                  Если на 1:1 более половины тем приходит от лида — это ранний
                  сигнал, что встреча превращается в статус-апдейт.
                </p>
                <div className="author-ratio-list">
                  {reportsData.authorRatioByPerson
                    .filter((row) => row.total > 0)
                    .map((row) => {
                      const isWarn = row.total >= 3 && row.ratio !== null && row.ratio < 50;
                      return (
                        <div className={`author-ratio-row ${isWarn ? "warn" : ""}`} key={row.person.id}>
                          <span className="author-ratio-name">
                            <strong>{row.person.name}</strong>
                            <small>{row.total} {pluralizeRu(row.total, ["тема", "темы", "тем"])}</small>
                          </span>
                          <div className="author-ratio-bar" aria-hidden="true">
                            <span style={{ width: `${row.ratio || 0}%` }} />
                          </div>
                          <span className="author-ratio-value">{row.ratio === null ? "—" : `${row.ratio}%`}</span>
                        </div>
                      );
                    })}
                  {reportsData.authorRatioByPerson.every((row) => row.total === 0) && (
                    <div className="empty-state compact-empty">
                      <span>Темы появятся, когда участники начнут их добавлять.</span>
                    </div>
                  )}
                </div>
              </section>
            )}
          </section>
        )}

        {activeSection === "team" && isAdmin && (
          <section className="team-admin-view">
            <div className="team-admin-header">
              <div>
                <p className="eyebrow">Команда</p>
                <h3>Участники 1:1</h3>
              </div>
              <div className="team-admin-header-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => (showCreateLoginForm ? closeCreateLoginForm() : openCreateLoginForm())}
                >
                  <UserPlus size={16} />
                  {showCreateLoginForm ? "Скрыть форму" : "Создать логин"}
                </button>
                <span className="count-pill">{countLabel(workspace.people.length, ["участник", "участника", "участников"])}</span>
              </div>
            </div>

            {showCreateLoginForm && renderCreateLoginCard({
              id: "team-create-login-panel",
              description: canCreateLeadLogin
                ? "Создайте логин участника и при необходимости привяжите его к тимлиду."
                : "Добавьте участника в свою команду и сразу выдайте ему доступ.",
              allowLeadCreation: canCreateLeadLogin,
              showCancel: true
            })}

            <div className="team-overview-grid" aria-label="Состояние команды">
              {teamOverviewStats.map(([Icon, label, value, detail, tone]) => (
                <article className={`kpi-card ${tone}`} key={label}>
                  <span className="kpi-icon">
                    <Icon size={18} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{detail}</small>
                  </div>
                </article>
              ))}
            </div>

            <div className="team-admin-grid">
              <div className={`team-directory ${sectionStaggerClass("team")}`}>
                {workspace.people.length === 0 && (
                  <div className="empty-state">
                    <UsersRound size={22} />
                    <span>В рабочей команде пока нет участников 1:1.</span>
                  </div>
                )}
                {workspace.people.map((person) => {
                  const score = scorePulse(workspace.pulse[person.id]);
                  const linkedUsers = workspace.users.filter((item) => item.personId === person.id);
                  const openCards = workspace.cards.filter((card) => card.personId === person.id && card.status !== "done").length;
                  const isEditing = isPlatformAdmin && editingPersonId === person.id;
                  return (
                    <article className={`team-member-card ${person.id === selectedPerson?.id ? "active" : ""} ${isEditing ? "editing" : ""}`} key={person.id}>
                      {isEditing ? (
                        <div className="team-member-edit">
                          <div className="two-field-grid">
                            <label>
                              Имя
                              <input
                                value={personEditDraft.name}
                                onChange={(event) =>
                                  setPersonEditDraft((current) => ({ ...current, name: event.target.value }))
                                }
                              />
                            </label>
                            <label>
                              Роль
                              <input
                                value={personEditDraft.role}
                                onChange={(event) =>
                                  setPersonEditDraft((current) => ({ ...current, role: event.target.value }))
                                }
                              />
                            </label>
                          </div>
                          <div className="two-field-grid">
                            <label>
                              Команда
                              <input
                                value={personEditDraft.team}
                                onChange={(event) =>
                                  setPersonEditDraft((current) => ({ ...current, team: event.target.value }))
                                }
                              />
                            </label>
                            <label>
                              Cadence
                              <input
                                value={personEditDraft.cadence}
                                onChange={(event) =>
                                  setPersonEditDraft((current) => ({ ...current, cadence: event.target.value }))
                                }
                                placeholder="каждую неделю"
                              />
                            </label>
                          </div>
                          <label>
                            Ближайший 1:1
                            <input
                              value={personEditDraft.nextMeeting}
                              onChange={(event) =>
                                setPersonEditDraft((current) => ({ ...current, nextMeeting: event.target.value }))
                              }
                              placeholder="10 мая, 14:00"
                            />
                          </label>
                          <label>
                            Фокус лида
                            <textarea
                              rows={2}
                              value={personEditDraft.managerFocus}
                              onChange={(event) =>
                                setPersonEditDraft((current) => ({ ...current, managerFocus: event.target.value }))
                              }
                            />
                          </label>
                          <div className="two-field-grid">
                            <label>
                              Тип встречи
                              <select
                                value={personEditDraft.meetingType}
                                onChange={(event) =>
                                  setPersonEditDraft((current) => ({ ...current, meetingType: event.target.value }))
                                }
                              >
                                {Object.entries(meetingTypeLabel).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Режим лида
                              <select
                                value={personEditDraft.mentorshipMode}
                                onChange={(event) =>
                                  setPersonEditDraft((current) => ({ ...current, mentorshipMode: event.target.value }))
                                }
                              >
                                {Object.entries(mentorshipModeLabel).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <p className="form-note" style={{ margin: "-4px 0 0" }}>
                            {mentorshipModeHint[personEditDraft.mentorshipMode]}
                          </p>
                          <label>
                            Career narrative (рост)
                            <textarea
                              rows={3}
                              value={personEditDraft.growthNarrative}
                              onChange={(event) =>
                                setPersonEditDraft((current) => ({
                                  ...current,
                                  growthNarrative: event.target.value
                                }))
                              }
                              placeholder="Долгоиграющая история роста: цели на год, stretch-проекты, sponsorship-возможности"
                            />
                          </label>
                          <label>
                            Performance log
                            <textarea
                              rows={3}
                              value={personEditDraft.performanceNarrative}
                              onChange={(event) =>
                                setPersonEditDraft((current) => ({
                                  ...current,
                                  performanceNarrative: event.target.value
                                }))
                              }
                              placeholder="Конкретные факты для будущего review: что получилось, что не получилось, обратная связь"
                            />
                          </label>
                          {formErrors.editPerson && (
                            <div className="form-error inline-form-error">{formErrors.editPerson}</div>
                          )}
                          <div className="team-member-edit-actions">
                            <button
                              className="primary-button"
                              type="button"
                              onClick={() => savePersonEdit(person.id)}
                            >
                              <Check size={16} />
                              Сохранить
                            </button>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => {
                                setEditingPersonId("");
                                clearFormError("editPerson");
                              }}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button type="button" onClick={() => selectPerson(person.id)} className="team-member-main">
                            <span className="avatar">{person.initials}</span>
                            <span>
                              <strong>{person.name}</strong>
                              <small>{person.role} · {person.team}</small>
                            </span>
                          </button>
                          <div className="team-member-meta">
                            <span className={`health-dot ${score < 64 ? "risk" : score < 76 ? "watch" : "good"}`}>{score}</span>
                            <span>{openCards} открытых тем</span>
                            <span>{linkedUsers.length ? `доступ: ${linkedUsers.map((item) => item.username).join(", ")}` : "доступ не выдан"}</span>
                            {isPlatformAdmin && (
                              <>
                                <button
                                  className="soft-button"
                                  type="button"
                                  onClick={() => {
                                    setEditingPersonId(person.id);
                                    setPersonEditDraft({
                                      name: person.name,
                                      role: person.role,
                                      team: person.team,
                                      cadence: person.cadence,
                                      nextMeeting: person.nextMeeting,
                                      managerFocus: person.managerFocus,
                                      meetingType: person.meetingType || "regular",
                                      mentorshipMode: person.mentorshipMode || "coach",
                                      growthNarrative: person.growthNarrative || "",
                                      performanceNarrative: person.performanceNarrative || ""
                                    });
                                  }}
                                >
                                  <Pencil size={15} />
                                  Изменить
                                </button>
                                {pendingDeletePersonId === person.id ? (
                                  <span className="confirm-actions">
                                    <button className="soft-button danger-button" type="button" onClick={() => deleteEmployeePerson(person)}>
                                      <Trash2 size={15} />
                                      Подтвердить удаление
                                    </button>
                                    <button
                                      className="soft-button"
                                      type="button"
                                      onClick={() => {
                                        setPendingDeletePersonId("");
                                        setUserMessage("");
                                      }}
                                    >
                                      <X size={15} />
                                      Отмена
                                    </button>
                                  </span>
                                ) : (
                                  <button className="soft-button danger-button" type="button" onClick={() => deleteEmployeePerson(person)}>
                                    <Trash2 size={15} />
                                    Удалить участника
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>

            {isPlatformAdmin && (workspace.archivedPeople || []).length > 0 && (
              <section className="team-archive">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Архив</p>
                    <h3>Удалённые участники</h3>
                  </div>
                  <span className="count-pill">{workspace.archivedPeople.length}</span>
                </div>
                <p className="form-note" style={{ margin: 0 }}>
                  История 1:1 и заметки сохранены — можно восстановить.
                </p>
                <div className="archive-list">
                  {workspace.archivedPeople.map((person) => (
                    <div className="archive-row" key={person.id}>
                      <span className="avatar mini">{person.initials}</span>
                      <span className="archive-main">
                        <strong>{person.name}</strong>
                        <small>{person.role} · {person.team} · удалён {formatRuDate(person.archivedAt)}</small>
                      </span>
                      <button
                        className="soft-button"
                        type="button"
                        onClick={() => restoreArchivedPerson(person.id)}
                      >
                        <RotateCcw size={15} />
                        Вернуть
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isPlatformAdminRole(user) && (
              <div className="team-admin-hint">
                <ShieldCheck size={18} />
                <span>
                  Сброс паролей и полный список логинов —{" "}
                  <button className="text-link" type="button" onClick={() => openSection("admin")}>
                    в Админке
                  </button>
                  .
                </span>
              </div>
            )}
          </section>
        )}

        {activeSection === "admin" && isPlatformAdminRole(user) && (
          <section className="admin-view">
            {renderCreateLoginCard({ id: "admin-create-login-panel", allowLeadCreation: true })}

            <article className="settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="eyebrow">Безопасность</p>
                  <h3>Сбросить пароль пользователю</h3>
                  <p>После сброса все активные сессии этого пользователя закроются.</p>
                </div>
              </div>
              <form className="settings-inline-form admin-inline" data-form="password" onSubmit={updateEmployeePassword}>
                <label>
                  Логин
                  <select
                    value={passwordUpdate.userId}
                    onChange={(event) => setPasswordUpdate((current) => ({ ...current, userId: event.target.value }))}
                  >
                    <option value="">Выберите логин</option>
                    {editableUsers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.username} — {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Новый пароль
                  <input
                    type="password"
                    value={passwordUpdate.password}
                    onChange={(event) => setPasswordUpdate((current) => ({ ...current, password: event.target.value }))}
                    placeholder="минимум 8 символов"
                  />
                </label>
                {formErrors.password && <div className="form-error inline-form-error">{formErrors.password}</div>}
                <button className="primary-button" type="submit" disabled={!passwordUpdate.userId}>
                  <KeyRound size={16} />
                  Сбросить пароль
                </button>
              </form>
            </article>

            <article className="settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="eyebrow">Доступы</p>
                  <h3>Все логины</h3>
                  <p>Список всех аккаунтов платформы. Удаление логина закрывает все его сессии.</p>
                </div>
              </div>
              <div className="access-table">
                {realUsers.map((item) => {
                  const person = workspace.people.find((candidate) => candidate.id === item.personId);
                  return (
                    <article key={item.id} className="access-row">
                      <div>
                        <strong>{isPlatformAdminRole(item) ? item.name : person?.name || item.name || "Без имени"}</strong>
                        <span className="login-secondary">
                          {item.username}
                          {item.teamLabel ? ` · ${item.teamLabel}` : ""}
                        </span>
                      </div>
                      <span>{roleLabel[item.role] || item.role}</span>
                      <div className="access-actions">
                        {!isProtectedAccess(item) && (
                          <button className="soft-button danger-button" type="button" onClick={() => deleteEmployeeUser(item)}>
                            <Trash2 size={15} />
                            Удалить
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>
          </section>
        )}

        {activeSection === "settings" && (
          <section className="settings-view">
            <article className="settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="eyebrow">Профиль</p>
                  <h3>Как вас зовут</h3>
                  <p>Имя видно в шапке и в списке доступов. Логин (<code>{user?.username}</code>) изменить нельзя.</p>
                </div>
              </div>
              <form
                className="settings-inline-form"
                onSubmit={updateAccountName}
              >
                <label>
                  Имя
                  <input
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    autoComplete="name"
                  />
                </label>
                {formErrors.profile && <div className="form-error inline-form-error">{formErrors.profile}</div>}
                <button className="primary-button" type="submit">
                  <Check size={16} />
                  Сохранить
                </button>
              </form>
            </article>

            <article className="settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="eyebrow">Безопасность</p>
                  <h3>Сменить пароль</h3>
                  <p>Все активные сессии этого аккаунта на других устройствах будут закрыты.</p>
                </div>
              </div>
              <form className="settings-inline-form" onSubmit={updateMyPassword}>
                <label>
                  Новый пароль
                  <input
                    type="password"
                    value={myPassword}
                    onChange={(event) => setMyPassword(event.target.value)}
                    placeholder="минимум 8 символов"
                    autoComplete="new-password"
                  />
                </label>
                {formErrors.myPassword && <div className="form-error inline-form-error">{formErrors.myPassword}</div>}
                <button className="primary-button" type="submit" disabled={!myPassword}>
                  <KeyRound size={16} />
                  Сменить пароль
                </button>
              </form>
            </article>

            <article className="settings-card">
              <div className="settings-card-head">
                <div>
                  <p className="eyebrow">Внешний вид</p>
                  <h3>Тема интерфейса</h3>
                  <p>Светлая, тёмная или автоматическая (под настройки системы).</p>
                </div>
              </div>
              <div className="theme-toggle" role="radiogroup" aria-label="Тема интерфейса">
                {[
                  ["system", Monitor, "Авто"],
                  ["light", Sun, "Светлая"],
                  ["dark", Moon, "Тёмная"]
                ].map(([value, Icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={theme === value}
                    className={theme === value ? "active" : ""}
                    onClick={() => {
                      try {
                        window.localStorage.setItem(themeExplicitStorageKey, "1");
                      } catch {
                        // Theme still applies for this session.
                      }
                      setTheme(value);
                    }}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </article>

            {canResetDemo && (
              <article className="settings-card">
                <div className="settings-card-head">
                  <div>
                    <p className="eyebrow">Служебные действия</p>
                    <h3>Сбросить демо-данные</h3>
                    <p>Удаляет рабочую команду и возвращает seed-аккаунты. Сессия не закрывается.</p>
                  </div>
                </div>
                <div className="settings-card-actions">
                  <button className="ghost-button" type="button" onClick={resetDemo}>
                    <RotateCcw size={16} />
                    Сбросить демо-данные
                  </button>
                </div>
              </article>
            )}
          </section>
        )}
      </main>

      {activeSection === "meetings" && selectedPerson && <aside className="right-rail" aria-label="Подготовка">
        <section className="rail-section">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">24 часа до встречи</p>
              <h3>Чек-лист подготовки</h3>
            </div>
            <span className="count-pill">{readiness}%</span>
          </div>

          <div className="checklist">
            {checklist.map((item) => (
              <label className={`check-row ${!isAdmin && item.owner === "manager" ? "readonly" : ""}`} key={item.id}>
                <input
                  type="checkbox"
                  checked={Boolean(personPrep[item.id])}
                  disabled={!isAdmin && item.owner === "manager"}
                  onChange={() => togglePrep(item.id)}
                />
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    {item.owner === "employee"
                      ? "зона участника"
                      : item.owner === "manager"
                        ? isAdmin ? "зона лида" : "зона лида · только для чтения"
                        : "общая зона"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </section>

        {isAdmin ? (
          <section className="rail-section">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Приватно</p>
                <h3>Заметки лида</h3>
              </div>
              <LockKeyhole size={18} />
            </div>
            <div className="privacy-strip compact">
              <span className="visibility-chip private">
                <LockKeyhole size={12} />
                Не видно участнику
              </span>
              <span className="visibility-chip muted">Для подготовки и review</span>
            </div>
            <textarea
              className="private-notes"
              value={workspace.notes[selectedPerson.id] || ""}
              onChange={(event) => updateNotes(event.target.value)}
              placeholder="Наблюдения, которые не идут в общую повестку."
              rows={5}
            />

            <div className="notes-timeline">
              <div className="notes-compose">
                <textarea
                  placeholder="Новая заметка с тегом — сохраняется в журнале"
                  value={newManagerNote.body}
                  onChange={(event) =>
                    setNewManagerNote((current) => ({ ...current, body: event.target.value }))
                  }
                  rows={2}
                />
                <div className="notes-tags">
                  {managerNoteTagOrder.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`tag-chip ${newManagerNote.tags.includes(tag) ? "active" : ""}`}
                      onClick={() => toggleNewNoteTag(tag)}
                    >
                      #{managerNoteTagLabel[tag]}
                    </button>
                  ))}
                </div>
                <div className="notes-compose-actions">
                  <button
                    className="soft-button"
                    type="button"
                    onClick={addManagerNote}
                    disabled={!newManagerNote.body.trim()}
                  >
                    <Plus size={15} />
                    Записать
                  </button>
                </div>
              </div>

              {(workspace.managerNotes || [])
                .filter((note) => note.personId === selectedPerson.id)
                .map((note) => (
                  <article className="note-entry" key={note.id}>
                    <header>
                      <time>{formatRuDate(note.createdAt)}</time>
                      <button
                        className="icon-button danger-button"
                        type="button"
                        title="Удалить заметку"
                        onClick={() => deleteManagerNote(note.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </header>
                    <p>{note.body}</p>
                    {note.tags.length > 0 && (
                      <div className="note-tags">
                        {note.tags.map((tag) => (
                          <span className="tag-chip muted" key={tag}>
                            #{managerNoteTagLabel[tag] || tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ) : (
          <section className="rail-section access-panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Приватность</p>
                <h3>Доступ только к вашему 1:1</h3>
              </div>
              <LockKeyhole size={18} />
            </div>
            <p>В этом аккаунте доступны только ваши темы, пульс, чек-лист и следующие шаги.</p>
          </section>
        )}


        <section className="rail-section">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">История</p>
              <h3>Контекст 1:1</h3>
            </div>
            <UserRoundCheck size={18} />
          </div>
          <div className="history-list">
            <div>
              <strong>Прошлый 1:1</strong>
              <span>{selectedPerson.lastSummary}</span>
            </div>
            <div>
              <strong>Фокус лида</strong>
              <span>{selectedPerson.managerFocus}</span>
            </div>
            <div>
              <strong>Открытые действия</strong>
              <span>{unresolvedActions.length ? unresolvedActions.map((action) => action.title).join("; ") : "нет открытых шагов"}</span>
            </div>
          </div>

          {isAdmin && (
            <>
              <p className="eyebrow" style={{ marginTop: 12 }}>Записи встреч</p>
              <div className="meeting-history-list">
                {(workspace.meetingLog || [])
                  .filter((m) => m.personId === selectedPerson.id)
                  .slice(0, 10)
                  .map((m) => {
                    const expanded = expandedMeetingId === m.id;
                    return (
                      <article className={`meeting-history-row ${expanded ? "expanded" : ""}`} key={m.id}>
                        <button
                          type="button"
                          className="meeting-history-toggle"
                          onClick={() => setExpandedMeetingId(expanded ? "" : m.id)}
                        >
                          <time>{formatRuDate(m.heldAt)}</time>
                          <span>{meetingTypeLabel[m.meetingType] || "1:1"}</span>
                          <ChevronRight size={14} className={expanded ? "rotated" : ""} />
                        </button>
                        {expanded && m.summary && (
                          <pre className="meeting-history-summary">{m.summary}</pre>
                        )}
                        {expanded && !m.summary && (
                          <p className="meeting-history-empty">Итоги для этой встречи не были сформированы.</p>
                        )}
                      </article>
                    );
                  })}
                {(workspace.meetingLog || []).filter((m) => m.personId === selectedPerson.id).length === 0 && (
                  <div className="empty-state compact-empty">
                    <span>Истории встреч пока нет. Нажмите «Итоги встречи», чтобы записать.</span>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </aside>}
    </div>
  );
}
