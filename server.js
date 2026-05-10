import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(__dirname, "dist");
const dataDir = process.env.DATA_DIR || join(__dirname, ".data");
const dataFile = join(dataDir, "workspace.json");
const port = Number(process.env.PORT) || 4173;
const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;
const storageMode = process.env.DATABASE_URL ? "postgres" : "file";
const failedLoginWindowMs = 1000 * 60 * 15;
const maxFailedLoginAttempts = 8;
const maxFailedLoginAttemptsPerIp = 30;
const trustProxy = Boolean(process.env.RAILWAY_ENVIRONMENT) || process.env.TRUST_PROXY === "1";

const defaultAdminUsername = "mgusev";
const defaultAdminPassword = "passwb121";
const adminUsername = process.env.ADMIN_USERNAME || defaultAdminUsername;
const adminPassword = process.env.ADMIN_PASSWORD || defaultAdminPassword;
const demoUsername = process.env.DEMO_USERNAME || "demo";
const demoPassword = process.env.DEMO_PASSWORD || "demo";

let pgPool = null;
const failedLogins = new Map();
const failedLoginsByIp = new Map();

// Pre-computed dummy hash so the login handler always runs scrypt, even when the
// username does not exist. Without this, response time leaks whether a username
// is registered (see /api/login).
const dummyPasswordRecord = (() => {
  const salt = randomBytes(16).toString("hex");
  return {
    salt,
    passwordHash: scryptSync("dummy-password-for-constant-time", salt, 64).toString("hex")
  };
})();

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; font-src 'self' https://fonts.bunny.net data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const people = [
  {
    id: "demo-sre",
    name: "Демо SRE-инженер",
    meetingName: "демо SRE-инженером",
    role: "SRE Engineer",
    team: "Reliability",
    initials: "DE",
    nextMeeting: "10 мая, 11:30",
    cadence: "каждую неделю",
    managerFocus: "снизить alert fatigue и вернуть предсказуемость on-call",
    lastSummary: "Договорились убрать шумные алерты по latency p95 и обновить runbook для incident commander.",
    trend: "+4",
    energy: 6,
    load: 8,
    clarity: 7,
    trust: 8
  },
  {
    id: "anna",
    name: "Анна Морозова",
    meetingName: "Анной Морозовой",
    role: "Senior SRE",
    team: "Platform Reliability",
    initials: "АМ",
    nextMeeting: "10 мая, 14:00",
    cadence: "каждую неделю",
    managerFocus: "разгрузить on-call после серии ночных инцидентов",
    lastSummary: "Договорились сократить ручные проверки Kubernetes rollout и вынести повторяющиеся действия в runbook.",
    trend: "+5",
    energy: 7,
    load: 7,
    clarity: 8,
    trust: 8
  },
  {
    id: "danila",
    name: "Данила Ким",
    meetingName: "Данилой Кимом",
    role: "DevOps Engineer",
    team: "Infrastructure",
    initials: "ДК",
    nextMeeting: "11 мая, 15:00",
    cadence: "раз в 2 недели",
    managerFocus: "поддержать рост в Terraform и ownership за CI/CD",
    lastSummary: "Нужно больше раннего контекста по миграции stateful workloads и rollback-плану.",
    trend: "-3",
    energy: 6,
    load: 8,
    clarity: 5,
    trust: 7
  },
  {
    id: "mila",
    name: "Мила Варламова",
    meetingName: "Милой Варламовой",
    role: "Observability Engineer",
    team: "Telemetry",
    initials: "МВ",
    nextMeeting: "12 мая, 12:00",
    cadence: "каждую неделю",
    managerFocus: "сохранить темп внедрения tracing без перегруза команды",
    lastSummary: "Хочет больше обратной связи по качеству dashboards и SLO burn-rate алертов.",
    trend: "+2",
    energy: 8,
    load: 5,
    clarity: 8,
    trust: 9
  },
  {
    id: "timur",
    name: "Тимур Абашев",
    meetingName: "Тимуром Абашевым",
    role: "Incident Manager",
    team: "Operations",
    initials: "ТА",
    nextMeeting: "13 мая, 17:00",
    cadence: "каждую неделю",
    managerFocus: "вернуть ощущение контроля над incident review циклом",
    lastSummary: "Поднял риск поздних postmortem action items и ручной координации дежурств.",
    trend: "-7",
    energy: 5,
    load: 9,
    clarity: 6,
    trust: 6
  }
];

const demoOnlyPersonIds = new Set(people.map((person) => person.id));

const initialCards = [
  {
    id: "c-demo-1",
    personId: "demo-sre",
    source: "employee",
    category: "blocker",
    priority: "high",
    status: "todo",
    title: "Слишком много шумных алертов в on-call",
    body: "Требуется определить алерты для page, ticket или удаления и обновить threshold."
  },
  {
    id: "c-demo-2",
    personId: "demo-sre",
    source: "manager",
    category: "growth",
    priority: "medium",
    status: "todo",
    title: "Следующий шаг в роли incident commander",
    body: "Определить типы инцидентов для самостоятельного ведения в следующем месяце."
  },
  {
    id: "c-demo-3",
    personId: "demo-sre",
    source: "employee",
    category: "checkin",
    priority: "medium",
    status: "discussing",
    title: "Энергия проседает после ночных pages",
    body: "Требуется окно восстановления после on-call и ограничение переключений после инцидента."
  },
  {
    id: "c-1",
    personId: "anna",
    source: "employee",
    category: "blocker",
    priority: "high",
    status: "todo",
    title: "Много ручных шагов в Kubernetes rollout",
    body: "Требуется определить первый этап автоматизации и перечень ручных проверок."
  },
  {
    id: "c-2",
    personId: "anna",
    source: "manager",
    category: "growth",
    priority: "medium",
    status: "todo",
    title: "Следующий шаг в роли reliability lead",
    body: "Определить SLO-решения, которые можно передать Анне в следующем спринте."
  },
  {
    id: "c-3",
    personId: "anna",
    source: "employee",
    category: "checkin",
    priority: "medium",
    status: "discussing",
    title: "Энергия держится, но фокус проседает",
    body: "Много переключений между incident review, Terraform и срочными runbook-правками."
  },
  {
    id: "c-4",
    personId: "danila",
    source: "employee",
    category: "feedback",
    priority: "high",
    status: "todo",
    title: "Не хватает раннего контекста по миграции stateful workloads",
    body: "Нужен список обязательных требований для rollback и отложенных задач."
  },
  {
    id: "c-5",
    personId: "mila",
    source: "manager",
    category: "thanks",
    priority: "low",
    status: "todo",
    title: "Отметить вклад в burn-rate dashboards",
    body: "Новые панели помогли дежурным быстрее отличать реальный риск от шума."
  },
  {
    id: "c-6",
    personId: "timur",
    source: "employee",
    category: "blocker",
    priority: "high",
    status: "todo",
    title: "Postmortem action items закрываются слишком поздно",
    body: "Нужен явный владелец каждого follow-up и короткий контрольный цикл."
  }
];

const initialActions = [
  {
    id: "a-demo-1",
    personId: "demo-sre",
    owner: "manager",
    title: "Выбрать 5 самых шумных алертов и решить: page, ticket или удалить",
    due: "до пятницы",
    done: false
  },
  {
    id: "a-demo-2",
    personId: "demo-sre",
    owner: "employee",
    title: "Обновить runbook для incident commander по latency p95",
    due: "к следующему 1:1",
    done: false
  },
  {
    id: "a-1",
    personId: "anna",
    owner: "manager",
    title: "Согласовать правило triage для noisy alerts",
    due: "до пятницы",
    done: false
  },
  {
    id: "a-2",
    personId: "anna",
    owner: "employee",
    title: "Выбрать одну reliability-тему для самостоятельного решения",
    due: "к следующему 1:1",
    done: false
  },
  {
    id: "a-3",
    personId: "timur",
    owner: "manager",
    title: "Зафиксировать SLA для postmortem follow-up в календаре дежурств",
    due: "сегодня",
    done: false
  }
];

const initialGoals = [
  {
    id: "g-demo-1",
    personId: "demo-sre",
    title: "Снизить alert fatigue в on-call rotation на 30%",
    description: "Через ревизию шумных алертов и обновление SLO definitions",
    horizon: "2026-Q2",
    progress: 25,
    status: "active",
    createdAt: "2026-04-01T00:00:00.000Z",
    dueDate: "2026-06-30"
  },
  {
    id: "g-demo-2",
    personId: "demo-sre",
    title: "Стать самостоятельным incident commander",
    description: "Провести 5 incidents без эскалации к senior",
    horizon: "2026-Q2",
    progress: 40,
    status: "active",
    createdAt: "2026-04-01T00:00:00.000Z",
    dueDate: ""
  },
  {
    id: "g-anna-1",
    personId: "anna",
    title: "Запустить автоматизацию Kubernetes rollouts",
    description: "Покрыть 80% staging-окружений автоматическим rollback по SLO burn-rate",
    horizon: "2026-Q2",
    progress: 55,
    status: "active",
    createdAt: "2026-03-15T00:00:00.000Z",
    dueDate: "2026-06-30"
  }
];

const goalStatuses = ["active", "achieved", "abandoned"];

const meetingTypes = ["regular", "career", "performance", "post-incident", "first-1on1", "skip-level"];
const mentorshipModes = ["mentor", "coach", "sponsor"];

const pulseHistoryRetentionDays = 365;
const pulseHistoryDemoSpanDays = 56;

function seedPulseHistoryFor(personId, currentPulse) {
  const out = [];
  const today = new Date();
  for (let dayOffset = pulseHistoryDemoSpanDays; dayOffset >= 0; dayOffset -= 7) {
    const ts = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const wobble = (seed) => Math.max(1, Math.min(10, seed + Math.round(Math.sin(dayOffset / 4 + seed) * 1.4)));
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

function buildSeedPulseHistory() {
  const rows = [];
  for (const person of people) {
    rows.push(...seedPulseHistoryFor(person.id, initialPulse[person.id]));
  }
  return rows;
}

function buildSeedOncallLoad() {
  // 4 last weeks; rotated so different people look different
  const rows = [];
  const today = new Date();
  for (let weeksBack = 0; weeksBack < 4; weeksBack++) {
    const monday = new Date(today.getTime() - (weeksBack * 7 + today.getUTCDay()) * 24 * 60 * 60 * 1000);
    const weekStart = monday.toISOString().slice(0, 10);
    rows.push(
      { personId: "demo-sre", weekStart, pagesTotal: 9 - weeksBack, afterHoursPages: 4 - weeksBack, incidentsLed: 1, sleepDisruptedNights: 2 - Math.floor(weeksBack / 2) },
      { personId: "anna", weekStart, pagesTotal: 6, afterHoursPages: 2, incidentsLed: 2, sleepDisruptedNights: 1 },
      { personId: "timur", weekStart, pagesTotal: 12, afterHoursPages: 7, incidentsLed: 3, sleepDisruptedNights: 3 }
    );
  }
  return rows;
}

const surveyQuestionTypes = ["scale", "single", "multi", "text", "date"];

const initialSurveys = [
  {
    id: "s-demo-weekly",
    title: "Еженедельный пульс on-call",
    description: "Помоги лиду понять, как ты прожил эту неделю в дежурстве.",
    anonymous: false,
    status: "active",
    isDemoSeed: true,
    createdAt: "2026-05-08T00:00:00.000Z",
    questions: [
      {
        id: "q1",
        type: "scale",
        prompt: "Насколько шумным был on-call на этой неделе? (1 — тишина, 10 — горело всё)",
        required: true,
        options: []
      },
      {
        id: "q2",
        type: "single",
        prompt: "Сколько ночных pages было?",
        required: true,
        options: ["0", "1–2", "3–5", "Больше 5"]
      },
      {
        id: "q3",
        type: "multi",
        prompt: "Что съедало фокус?",
        required: false,
        options: ["Шумные алерты", "Релизы", "Инциденты", "Постмортемы", "Координация"]
      },
      {
        id: "q4",
        type: "text",
        prompt: "Что хочешь поднять на ближайшем 1:1?",
        required: false,
        options: []
      }
    ]
  }
];

const initialPrep = Object.fromEntries(
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

const initialPulse = Object.fromEntries(
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

const initialNotes = {
  "demo-sre": "Проверить, не накопилась ли усталость после on-call. Спросить про восстановление и качество handoff.",
  anna: "Проверить объем координации между noisy alerts и платформенной командой.",
  timur: "Риск выгорания: спросить про восстановление после ночного incident bridge."
};

const prepKeys = ["employeeAgenda", "managerAgenda", "pulse", "lastActions", "growth", "commitments"];
const adminWritablePrepKeys = new Set(prepKeys);
const employeeWritablePrepKeys = new Set(["employeeAgenda", "pulse", "lastActions", "growth", "commitments"]);
const pulseKeys = ["energy", "load", "clarity", "trust"];

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    passwordHash: scryptSync(password, salt, 64).toString("hex")
  };
}

function verifyPassword(password, user) {
  const candidate = scryptSync(password, user.salt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function makeId(prefix) {
  return `${prefix}-${randomBytes(16).toString("hex")}`;
}

function seedUser({ username, password, name, role, personId = null }) {
  return {
    id: makeId("user"),
    username,
    name,
    role,
    personId,
    createdAt: new Date().toISOString(),
    ...hashPassword(password)
  };
}

function createSeedDb() {
  return normalizeDb({
    version: 4,
    people,
    cards: initialCards,
    actions: initialActions,
    goals: initialGoals,
    surveys: initialSurveys,
    surveyResponses: [],
    prep: initialPrep,
    pulse: initialPulse,
    pulseHistory: buildSeedPulseHistory(),
    oncallLoad: buildSeedOncallLoad(),
    notes: initialNotes,
    users: [
      seedUser({
        username: adminUsername,
        password: adminPassword,
        name: "Максим Гусев",
        role: "admin"
      }),
      seedUser({
        username: demoUsername,
        password: demoPassword,
        name: "Демо SRE-инженер",
        role: "employee",
        personId: "demo-sre"
      })
    ],
    sessions: []
  });
}

function normalizeDb(rawDb = {}) {
  const seedPeopleIds = new Set(people.map((person) => person.id));
  const incomingPeople = Array.isArray(rawDb.people) ? rawDb.people : [];
  const customPeople = incomingPeople.filter((person) => person.id && !seedPeopleIds.has(person.id));
  const seedPersonOverrides = new Map(
    incomingPeople
      .filter((p) => p.id && seedPeopleIds.has(p.id))
      .map((p) => [p.id, p])
  );
  const decoratedSeed = people.map((person) => {
    const incoming = seedPersonOverrides.get(person.id) || {};
    return {
      ...person,
      meetingType: meetingTypes.includes(incoming.meetingType) ? incoming.meetingType : "regular",
      mentorshipMode: mentorshipModes.includes(incoming.mentorshipMode) ? incoming.mentorshipMode : "coach",
      growthNarrative: String(incoming.growthNarrative || "").slice(0, 8000),
      performanceNarrative: String(incoming.performanceNarrative || "").slice(0, 8000),
      archivedAt: typeof incoming.archivedAt === "string" ? incoming.archivedAt : null
    };
  });
  const allPeople = [
    ...decoratedSeed,
    ...customPeople.map((person) => ({
      id: String(person.id),
      name: String(person.name || "Новый участник"),
      meetingName: String(person.meetingName || person.name || "новым участником"),
      role: String(person.role || "SRE Engineer"),
      team: String(person.team || "Reliability"),
      initials: String(person.initials || makeInitials(person.name || "НС")),
      nextMeeting: String(person.nextMeeting || "нужно запланировать"),
      cadence: String(person.cadence || "каждую неделю"),
      managerFocus: String(person.managerFocus || "понять нагрузку, риски и ближайшие блокеры"),
      lastSummary: String(person.lastSummary || "История встреч пока пустая."),
      trend: String(person.trend || "+0"),
      meetingType: meetingTypes.includes(person.meetingType) ? person.meetingType : "regular",
      mentorshipMode: mentorshipModes.includes(person.mentorshipMode) ? person.mentorshipMode : "coach",
      growthNarrative: String(person.growthNarrative || "").slice(0, 8000),
      performanceNarrative: String(person.performanceNarrative || "").slice(0, 8000),
      archivedAt: typeof person.archivedAt === "string" ? person.archivedAt : null
    }))
  ];
  const personIds = new Set(allPeople.map((person) => person.id));
  const removedUserIds = new Set();
  const users = Array.isArray(rawDb.users)
    ? rawDb.users.filter((user) => {
        if (!user.username) return false;
        if (isStaleDemoLinkedAccess(user)) {
          if (user.id) removedUserIds.add(String(user.id));
          return false;
        }
        return true;
      })
    : [];
  const cards = Array.isArray(rawDb.cards) ? rawDb.cards.filter((card) => personIds.has(card.personId)) : [];
  const actions = Array.isArray(rawDb.actions) ? rawDb.actions.filter((action) => personIds.has(action.personId)) : [];
  const goals = Array.isArray(rawDb.goals)
    ? rawDb.goals
        .filter((goal) => personIds.has(goal.personId))
        .map((goal) => sanitizeGoal(goal, goal.personId))
    : [];
  const seedCardIds = new Set(initialCards.map((card) => card.id));
  const seedActionIds = new Set(initialActions.map((action) => action.id));
  const seedGoalIds = new Set(initialGoals.map((goal) => goal.id));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));

  const db = {
    version: 3,
    people: allPeople,
    cards: [
      ...initialCards.map((card) => {
        const existing = cardsById.get(card.id);
        return {
          ...card,
          status: existing?.status || card.status
        };
      }),
      ...cards.filter((card) => !seedCardIds.has(card.id) && !hasLegacyBusinessText(card.title, card.body))
    ],
    actions: [
      ...initialActions.map((action) => {
        const existing = actionsById.get(action.id);
        return {
          ...action,
          done: typeof existing?.done === "boolean" ? existing.done : action.done
        };
      }),
      ...actions.filter((action) => !seedActionIds.has(action.id) && !hasLegacyBusinessText(action.title, action.due))
    ],
    goals: [
      ...initialGoals.map((goal) => goalsById.get(goal.id) || goal),
      ...goals.filter((goal) => !seedGoalIds.has(goal.id))
    ],
    prep: { ...initialPrep, ...(rawDb.prep || {}) },
    pulse: { ...initialPulse, ...(rawDb.pulse || {}) },
    pulseHistory: Array.isArray(rawDb.pulseHistory)
      ? rawDb.pulseHistory
          .filter((entry) => entry && personIds.has(entry.personId) && typeof entry.capturedAt === "string")
          .map((entry) => ({
            personId: String(entry.personId),
            capturedAt: String(entry.capturedAt).slice(0, 10),
            energy: clampInt(entry.energy, 1, 10, 6),
            load: clampInt(entry.load, 1, 10, 6),
            clarity: clampInt(entry.clarity, 1, 10, 6),
            trust: clampInt(entry.trust, 1, 10, 7)
          }))
      : [],
    surveys: Array.isArray(rawDb.surveys) ? rawDb.surveys.map((s) => sanitizeSurvey(s)) : [],
    surveyResponses: [],
    managerNotes: Array.isArray(rawDb.managerNotes)
      ? rawDb.managerNotes
          .map((note) => sanitizeManagerNote(note, personIds))
          .filter(Boolean)
      : [],
    oncallLoad: Array.isArray(rawDb.oncallLoad)
      ? rawDb.oncallLoad.map((entry) => sanitizeOncallEntry(entry, personIds)).filter(Boolean)
      : [],
    meetingLog: Array.isArray(rawDb.meetingLog)
      ? rawDb.meetingLog.map((entry) => sanitizeMeetingLog(entry, personIds)).filter(Boolean)
      : [],
    notes: mergeNotes(rawDb.notes || {}),
    users,
    sessions: Array.isArray(rawDb.sessions)
      ? rawDb.sessions.filter((session) => !removedUserIds.has(String(session.userId)))
      : []
  };

  ensureSeedLogin(db, {
    username: adminUsername,
    password: adminPassword,
    name: "Максим Гусев",
    role: "admin",
    personId: null
  });

  if (Array.isArray(rawDb.surveyResponses)) {
    db.surveyResponses = rawDb.surveyResponses
      .map((response) => sanitizeSurveyResponse(response, db.surveys))
      .filter(Boolean)
      .filter((response) => !response.personId || personIds.has(response.personId));
  }

  return db;
}

function makeInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "TH";
}

function makePersonId(name) {
  const ascii = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${ascii || "person"}-${randomBytes(4).toString("hex")}`;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function sanitizePulsePatch(current = {}, incoming = {}) {
  return Object.fromEntries(
    pulseKeys.map((key) => [key, clampInt(incoming[key], 1, 10, clampInt(current[key], 1, 10, 6))])
  );
}

function sanitizePrepPatch(current = {}, incoming = {}, writableKeys = adminWritablePrepKeys) {
  const next = { ...current };
  for (const key of prepKeys) {
    if (writableKeys.has(key) && Object.prototype.hasOwnProperty.call(incoming, key)) {
      next[key] = Boolean(incoming[key]);
    }
  }
  return next;
}

function mergePulseUpdate(currentPulse = {}, incomingPulse = {}, personIds) {
  const next = { ...currentPulse };
  for (const personId of personIds) {
    if (incomingPulse?.[personId]) {
      next[personId] = sanitizePulsePatch(currentPulse[personId] || {}, incomingPulse[personId]);
    }
  }
  return next;
}

function mergePrepUpdate(currentPrep = {}, incomingPrep = {}, personIds, writableKeys) {
  const next = { ...currentPrep };
  for (const personId of personIds) {
    if (incomingPrep?.[personId]) {
      next[personId] = sanitizePrepPatch(currentPrep[personId] || {}, incomingPrep[personId], writableKeys);
    }
  }
  return next;
}

function mergeNotesUpdate(currentNotes = {}, incomingNotes = {}, personIds) {
  const next = { ...currentNotes };
  for (const personId of personIds) {
    if (Object.prototype.hasOwnProperty.call(incomingNotes || {}, personId)) {
      next[personId] = String(incomingNotes[personId] || "").slice(0, 6000);
    }
  }
  return next;
}

function hasLegacyBusinessText(...parts) {
  const legacyWords = ["прод" + "аж", "sa" + "les", "билл" + "инг", "onboarding flow", "product designer", "frontend", "backend", "qa lead"];
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return legacyWords.some((word) => haystack.includes(word));
}

function mergeNotes(rawNotes) {
  const merged = { ...initialNotes };
  for (const [personId, body] of Object.entries(rawNotes)) {
    merged[personId] = hasLegacyBusinessText(body) ? initialNotes[personId] || "" : body;
  }
  return merged;
}

function ensureSeedLogin(db, config) {
  const index = db.users.findIndex((user) => user.username.toLowerCase() === config.username.toLowerCase());
  const passwordFields = hashPassword(config.password);

  if (index === -1) {
    db.users.push({
      id: makeId("user"),
      username: config.username,
      name: config.name,
      role: config.role,
      personId: config.personId,
      createdAt: new Date().toISOString(),
      ...passwordFields
    });
    return;
  }

  db.users[index] = {
    ...db.users[index],
    username: config.username,
    name: String(db.users[index].name || config.name),
    role: config.role,
    personId: config.personId,
    ...passwordFields
  };
}

async function initStorage() {
  if (storageMode === "postgres") {
    const { Pool } = await import("pg");
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
    await migratePostgres();
    await seedPostgres();
    console.log("Storage mode: postgres");
    return;
  }

  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    await writeDb(createSeedDb());
  } else {
    await writeDb(normalizeDb(JSON.parse(readFileSync(dataFile, "utf8"))));
  }
  console.log(`Storage mode: file (${dataFile})`);
}

async function migratePostgres() {
  await pgPool.query(`
    create table if not exists people (
      id text primary key,
      name text not null,
      meeting_name text not null,
      role text not null,
      team text not null,
      initials text not null,
      next_meeting text not null,
      cadence text not null,
      manager_focus text not null,
      last_summary text not null,
      trend text not null,
      meeting_type text not null default 'regular',
      mentorship_mode text not null default 'coach'
    );

    alter table people add column if not exists meeting_type text not null default 'regular';
    alter table people add column if not exists mentorship_mode text not null default 'coach';
    alter table people add column if not exists growth_narrative text not null default '';
    alter table people add column if not exists performance_narrative text not null default '';
    alter table people add column if not exists archived_at timestamptz;

    create table if not exists users (
      id text primary key,
      username text not null,
      name text not null,
      role text not null check (role in ('admin', 'employee')),
      person_id text references people(id) on delete restrict,
      salt text not null,
      password_hash text not null,
      created_at timestamptz not null default now()
    );

    create unique index if not exists users_username_lower_idx on users (lower(username));

    create table if not exists sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    );

    create index if not exists sessions_user_id_idx on sessions(user_id);
    create index if not exists sessions_expires_at_idx on sessions(expires_at);

    create table if not exists pulse (
      person_id text primary key references people(id) on delete cascade,
      energy integer not null check (energy between 1 and 10),
      load integer not null check (load between 1 and 10),
      clarity integer not null check (clarity between 1 and 10),
      trust integer not null check (trust between 1 and 10)
    );

    create table if not exists prep (
      person_id text primary key references people(id) on delete cascade,
      employee_agenda boolean not null default false,
      manager_agenda boolean not null default false,
      pulse boolean not null default false,
      last_actions boolean not null default false,
      growth boolean not null default false,
      commitments boolean not null default false
    );

    create table if not exists notes (
      person_id text primary key references people(id) on delete cascade,
      body text not null default ''
    );

    create table if not exists cards (
      id text primary key,
      person_id text not null references people(id) on delete cascade,
      source text not null check (source in ('manager', 'employee')),
      category text not null check (category in ('checkin', 'blocker', 'growth', 'feedback', 'decision', 'thanks')),
      priority text not null check (priority in ('high', 'medium', 'low')),
      status text not null check (status in ('todo', 'discussing', 'done')),
      title text not null,
      body text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists cards_person_id_idx on cards(person_id);
    create index if not exists cards_status_idx on cards(status);

    create table if not exists actions (
      id text primary key,
      person_id text not null references people(id) on delete cascade,
      owner text not null check (owner in ('manager', 'employee')),
      title text not null,
      due text not null,
      due_date date,
      done boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    -- Idempotent column add for existing tables before due_date was introduced
    alter table actions add column if not exists due_date date;

    create index if not exists actions_person_id_idx on actions(person_id);
    create index if not exists actions_done_idx on actions(done);
    create index if not exists actions_due_date_idx on actions(due_date) where done = false;

    create table if not exists goals (
      id text primary key,
      person_id text not null references people(id) on delete cascade,
      title text not null,
      description text not null default '',
      horizon text not null default '',
      progress integer not null check (progress between 0 and 100),
      status text not null check (status in ('active', 'achieved', 'abandoned')),
      created_at timestamptz not null default now(),
      due_date text not null default ''
    );

    create index if not exists goals_person_id_idx on goals(person_id);
    create index if not exists goals_status_idx on goals(status);

    create table if not exists pulse_history (
      person_id text not null references people(id) on delete cascade,
      captured_at date not null,
      energy integer not null check (energy between 1 and 10),
      load integer not null check (load between 1 and 10),
      clarity integer not null check (clarity between 1 and 10),
      trust integer not null check (trust between 1 and 10),
      primary key (person_id, captured_at)
    );

    create index if not exists pulse_history_captured_at_idx on pulse_history(captured_at);

    create table if not exists surveys (
      id text primary key,
      title text not null,
      description text not null default '',
      anonymous boolean not null default false,
      status text not null check (status in ('active', 'closed')),
      questions_json jsonb not null,
      is_demo_seed boolean not null default false,
      created_at timestamptz not null default now()
    );

    alter table surveys add column if not exists is_demo_seed boolean not null default false;

    create table if not exists survey_responses (
      id text primary key,
      survey_id text not null references surveys(id) on delete cascade,
      person_id text references people(id) on delete set null,
      answers_json jsonb not null,
      submitted_at timestamptz not null default now()
    );

    create index if not exists survey_responses_survey_id_idx on survey_responses(survey_id);
    create index if not exists survey_responses_person_id_idx on survey_responses(person_id);
    create unique index if not exists survey_responses_unique_per_person
      on survey_responses(survey_id, person_id)
      where person_id is not null;

    create table if not exists manager_notes (
      id text primary key,
      person_id text not null references people(id) on delete cascade,
      body text not null,
      tags text[] not null default '{}',
      created_at timestamptz not null default now()
    );

    create index if not exists manager_notes_person_id_idx on manager_notes(person_id);
    create index if not exists manager_notes_created_at_idx on manager_notes(created_at desc);

    create table if not exists oncall_load (
      person_id text not null references people(id) on delete cascade,
      week_start date not null,
      pages_total integer not null default 0,
      after_hours_pages integer not null default 0,
      incidents_led integer not null default 0,
      sleep_disrupted_nights integer not null default 0,
      primary key (person_id, week_start)
    );

    create index if not exists oncall_load_week_idx on oncall_load(week_start desc);

    create table if not exists meeting_log (
      id text primary key,
      person_id text not null references people(id) on delete cascade,
      held_at timestamptz not null,
      meeting_type text not null default 'regular',
      summary text not null default '',
      attended boolean not null default true
    );

    create index if not exists meeting_log_person_held_idx on meeting_log(person_id, held_at desc);
  `);
}

async function seedPostgres() {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const userCountResult = await client.query("select count(*)::int as count from users");
    const shouldSeedDemoLogin = Number(userCountResult.rows[0]?.count || 0) === 0;
    await upsertPeople(client, people);
    await upsertPulse(client, initialPulse);
    await upsertPrep(client, initialPrep);
    await upsertNotes(client, initialNotes);
    await insertSeedCards(client);
    await insertSeedActions(client);
    await insertSeedGoals(client);
    await insertSeedPulseHistory(client);
    await insertSeedSurveys(client);
    await upsertSeedUser(client, {
      username: adminUsername,
      password: adminPassword,
      name: "Максим Гусев",
      role: "admin",
      personId: null
    });
    if (shouldSeedDemoLogin) {
      await upsertSeedUser(client, {
        username: demoUsername,
        password: demoPassword,
        name: "Демо SRE-инженер",
        role: "employee",
        personId: "demo-sre"
      });
    }
    await client.query("delete from sessions where expires_at < now()");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function upsertPeople(client, rows) {
  for (const person of rows) {
    await client.query(
      `
        insert into people
          (id, name, meeting_name, role, team, initials, next_meeting, cadence, manager_focus, last_summary, trend, meeting_type, mentorship_mode, growth_narrative, performance_narrative, archived_at)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz)
        on conflict (id) do update set
          name = excluded.name,
          meeting_name = excluded.meeting_name,
          role = excluded.role,
          team = excluded.team,
          initials = excluded.initials,
          next_meeting = excluded.next_meeting,
          cadence = excluded.cadence,
          manager_focus = excluded.manager_focus,
          last_summary = excluded.last_summary,
          trend = excluded.trend,
          meeting_type = excluded.meeting_type,
          mentorship_mode = excluded.mentorship_mode,
          growth_narrative = excluded.growth_narrative,
          performance_narrative = excluded.performance_narrative,
          archived_at = excluded.archived_at
      `,
      [
        person.id,
        person.name,
        person.meetingName,
        person.role,
        person.team,
        person.initials,
        person.nextMeeting,
        person.cadence,
        person.managerFocus,
        person.lastSummary,
        person.trend,
        person.meetingType || "regular",
        person.mentorshipMode || "coach",
        person.growthNarrative || "",
        person.performanceNarrative || "",
        person.archivedAt || null
      ]
    );
  }
}

async function upsertPulse(client, pulse) {
  for (const [personId, value] of Object.entries(pulse)) {
    await client.query(
      `
        insert into pulse (person_id, energy, load, clarity, trust)
        values ($1, $2, $3, $4, $5)
        on conflict (person_id) do update set
          energy = coalesce(pulse.energy, excluded.energy),
          load = coalesce(pulse.load, excluded.load),
          clarity = coalesce(pulse.clarity, excluded.clarity),
          trust = coalesce(pulse.trust, excluded.trust)
      `,
      [personId, value.energy, value.load, value.clarity, value.trust]
    );
  }
}

async function upsertPrep(client, prep) {
  for (const [personId, value] of Object.entries(prep)) {
    await client.query(
      `
        insert into prep (person_id, employee_agenda, manager_agenda, pulse, last_actions, growth, commitments)
        values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (person_id) do nothing
      `,
      [
        personId,
        value.employeeAgenda,
        value.managerAgenda,
        value.pulse,
        value.lastActions,
        value.growth,
        value.commitments
      ]
    );
  }
}

async function upsertNotes(client, notes) {
  for (const [personId, body] of Object.entries(notes)) {
    await client.query(
      `
        insert into notes (person_id, body)
        values ($1, $2)
        on conflict (person_id) do nothing
      `,
      [personId, body]
    );
  }
}

async function insertSeedCards(client) {
  for (const card of initialCards) {
    await client.query(
      `
        insert into cards (id, person_id, source, category, priority, status, title, body)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (id) do update set
          person_id = excluded.person_id,
          source = excluded.source,
          category = excluded.category,
          priority = excluded.priority,
          status = excluded.status,
          title = excluded.title,
          body = excluded.body,
          updated_at = now()
      `,
      [card.id, card.personId, card.source, card.category, card.priority, card.status, card.title, card.body]
    );
  }
}

async function insertSeedActions(client) {
  for (const action of initialActions) {
    await client.query(
      `
        insert into actions (id, person_id, owner, title, due, due_date, done)
        values ($1, $2, $3, $4, $5, $6::date, $7)
        on conflict (id) do update set
          person_id = excluded.person_id,
          owner = excluded.owner,
          title = excluded.title,
          due = excluded.due,
          due_date = excluded.due_date,
          done = excluded.done,
          updated_at = now()
      `,
      [action.id, action.personId, action.owner, action.title, action.due, action.dueDate || null, action.done]
    );
  }
}

async function insertSeedGoals(client) {
  for (const goal of initialGoals) {
    await client.query(
      `
        insert into goals (id, person_id, title, description, horizon, progress, status, due_date)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (id) do nothing
      `,
      [goal.id, goal.personId, goal.title, goal.description, goal.horizon, goal.progress, goal.status, goal.dueDate]
    );
  }
}

async function insertSeedPulseHistory(client) {
  for (const entry of buildSeedPulseHistory()) {
    await client.query(
      `
        insert into pulse_history (person_id, captured_at, energy, load, clarity, trust)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (person_id, captured_at) do nothing
      `,
      [entry.personId, entry.capturedAt, entry.energy, entry.load, entry.clarity, entry.trust]
    );
  }
}

async function insertSeedSurveys(client) {
  for (const survey of initialSurveys) {
    await client.query(
      `
        insert into surveys (id, title, description, anonymous, status, questions_json, is_demo_seed, created_at)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz)
        on conflict (id) do nothing
      `,
      [
        survey.id,
        survey.title,
        survey.description,
        survey.anonymous,
        survey.status,
        JSON.stringify(survey.questions),
        survey.isDemoSeed === true,
        survey.createdAt
      ]
    );
  }
}

async function upsertSeedUser(client, config) {
  const passwordFields = hashPassword(config.password);
  const existing = await client.query("select id, name from users where lower(username) = lower($1)", [config.username]);
  if (existing.rows[0]) {
    await client.query(
      `
        update users set
          username = $1,
          name = $2,
          role = $3,
          person_id = $4,
          salt = $5,
          password_hash = $6
        where id = $7
      `,
      [
        config.username,
        existing.rows[0].name || config.name,
        config.role,
        config.personId,
        passwordFields.salt,
        passwordFields.passwordHash,
        existing.rows[0].id
      ]
    );
    return;
  }

  await client.query(
    `
      insert into users (id, username, name, role, person_id, salt, password_hash, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, now())
    `,
    [makeId("user"), config.username, config.name, config.role, config.personId, passwordFields.salt, passwordFields.passwordHash]
  );
}

async function readDb() {
  if (storageMode === "postgres") {
    const [
      peopleResult,
      cardsResult,
      actionsResult,
      goalsResult,
      prepResult,
      pulseResult,
      pulseHistoryResult,
      surveysResult,
      surveyResponsesResult,
      managerNotesResult,
      oncallLoadResult,
      meetingLogResult,
      notesResult,
      usersResult,
      sessionsResult
    ] =
      await Promise.all([
        pgPool.query(`
          select
            id,
            name,
            meeting_name as "meetingName",
            role,
            team,
            initials,
            next_meeting as "nextMeeting",
            cadence,
            manager_focus as "managerFocus",
            last_summary as "lastSummary",
            trend,
            meeting_type as "meetingType",
            mentorship_mode as "mentorshipMode",
            growth_narrative as "growthNarrative",
            performance_narrative as "performanceNarrative",
            to_char(archived_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "archivedAt"
          from people
          order by case id when 'demo-sre' then 0 when 'anna' then 1 when 'danila' then 2 when 'mila' then 3 when 'timur' then 4 else 99 end, name
        `),
        pgPool.query(`
          select
            id,
            person_id as "personId",
            source,
            category,
            priority,
            status,
            title,
            body
          from cards
          order by created_at asc, id asc
        `),
        pgPool.query(`
          select
            id,
            person_id as "personId",
            owner,
            title,
            due,
            to_char(due_date, 'YYYY-MM-DD') as "dueDate",
            done
          from actions
          order by created_at asc, id asc
        `),
        pgPool.query(`
          select
            id,
            person_id as "personId",
            title,
            description,
            horizon,
            progress,
            status,
            created_at as "createdAt",
            due_date as "dueDate"
          from goals
          order by created_at asc, id asc
        `),
        pgPool.query("select * from prep"),
        pgPool.query("select * from pulse"),
        pgPool.query(`
          select
            person_id as "personId",
            to_char(captured_at, 'YYYY-MM-DD') as "capturedAt",
            energy,
            load,
            clarity,
            trust
          from pulse_history
          order by captured_at asc
        `),
        pgPool.query(`
          select
            id,
            title,
            description,
            anonymous,
            status,
            questions_json as "questions",
            is_demo_seed as "isDemoSeed",
            created_at as "createdAt"
          from surveys
          order by created_at asc
        `),
        pgPool.query(`
          select
            id,
            survey_id as "surveyId",
            person_id as "personId",
            answers_json as "answers",
            submitted_at as "submittedAt"
          from survey_responses
          order by submitted_at asc
        `),
        pgPool.query(`
          select
            id,
            person_id as "personId",
            body,
            tags,
            created_at as "createdAt"
          from manager_notes
          order by created_at desc
        `),
        pgPool.query(`
          select
            person_id as "personId",
            to_char(week_start, 'YYYY-MM-DD') as "weekStart",
            pages_total as "pagesTotal",
            after_hours_pages as "afterHoursPages",
            incidents_led as "incidentsLed",
            sleep_disrupted_nights as "sleepDisruptedNights"
          from oncall_load
          order by week_start desc
        `),
        pgPool.query(`
          select
            id,
            person_id as "personId",
            held_at as "heldAt",
            meeting_type as "meetingType",
            summary,
            attended
          from meeting_log
          order by held_at desc
        `),
        pgPool.query("select person_id, body from notes"),
        pgPool.query(`
          select
            id,
            username,
            name,
            role,
            person_id as "personId",
            salt,
            password_hash as "passwordHash",
            created_at as "createdAt"
          from users
          order by created_at asc
        `),
        pgPool.query(`
          select
            id,
            user_id as "userId",
            created_at as "createdAt",
            expires_at as "expiresAt"
          from sessions
        `)
      ]);

    return normalizeDb({
      people: peopleResult.rows,
      cards: cardsResult.rows,
      actions: actionsResult.rows,
      goals: goalsResult.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt?.toISOString?.() || row.createdAt
      })),
      prep: Object.fromEntries(
        prepResult.rows.map((row) => [
          row.person_id,
          {
            employeeAgenda: row.employee_agenda,
            managerAgenda: row.manager_agenda,
            pulse: row.pulse,
            lastActions: row.last_actions,
            growth: row.growth,
            commitments: row.commitments
          }
        ])
      ),
      pulse: Object.fromEntries(
        pulseResult.rows.map((row) => [
          row.person_id,
          {
            energy: row.energy,
            load: row.load,
            clarity: row.clarity,
            trust: row.trust
          }
        ])
      ),
      pulseHistory: pulseHistoryResult.rows,
      surveys: surveysResult.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt?.toISOString?.() || row.createdAt,
        questions: Array.isArray(row.questions) ? row.questions : []
      })),
      surveyResponses: surveyResponsesResult.rows.map((row) => ({
        ...row,
        submittedAt: row.submittedAt?.toISOString?.() || row.submittedAt,
        answers: row.answers && typeof row.answers === "object" ? row.answers : {}
      })),
      managerNotes: managerNotesResult.rows.map((row) => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags : [],
        createdAt: row.createdAt?.toISOString?.() || row.createdAt
      })),
      oncallLoad: oncallLoadResult.rows,
      meetingLog: meetingLogResult.rows.map((row) => ({
        ...row,
        heldAt: row.heldAt?.toISOString?.() || row.heldAt
      })),
      notes: Object.fromEntries(notesResult.rows.map((row) => [row.person_id, row.body])),
      users: usersResult.rows,
      sessions: sessionsResult.rows.map((session) => ({
        ...session,
        createdAt: session.createdAt?.toISOString?.() || session.createdAt,
        expiresAt: session.expiresAt?.toISOString?.() || session.expiresAt
      }))
    });
  }

  const parsed = JSON.parse(readFileSync(dataFile, "utf8"));
  return normalizeDb(parsed);
}

async function writeDb(db) {
  const normalized = normalizeDb(db);

  if (storageMode === "postgres") {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await upsertPeople(client, normalized.people);
      await replaceCards(client, normalized.cards);
      await replaceActions(client, normalized.actions);
      await replaceGoals(client, normalized.goals);
      await replacePrep(client, normalized.prep);
      await replacePulse(client, normalized.pulse);
      await replacePulseHistory(client, normalized.pulseHistory);
      await replaceSurveys(client, normalized.surveys);
      await replaceSurveyResponses(client, normalized.surveyResponses);
      await replaceManagerNotes(client, normalized.managerNotes);
      await replaceOncallLoad(client, normalized.oncallLoad);
      await replaceMeetingLog(client, normalized.meetingLog);
      await replaceNotes(client, normalized.notes);
      await replaceUsers(client, normalized.users);
      await replaceSessions(client, normalized.sessions);
      await deleteMissingPeople(client, normalized.people);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  mkdirSync(dataDir, { recursive: true });
  // Atomic write: a partially written file from a crashed process would corrupt
  // the database, so write into a sibling tmp file and rename it into place.
  const tmpFile = `${dataFile}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    writeFileSync(tmpFile, JSON.stringify(normalized, null, 2));
    renameSync(tmpFile, dataFile);
  } catch (error) {
    try {
      unlinkSync(tmpFile);
    } catch {
      // tmp file already missing — nothing to clean
    }
    throw error;
  }
}

async function replaceCards(client, cards) {
  await client.query("delete from cards");
  for (const card of cards) {
    await client.query(
      `
        insert into cards (id, person_id, source, category, priority, status, title, body)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [card.id, card.personId, card.source, card.category, card.priority, card.status, card.title, card.body]
    );
  }
}

async function replaceActions(client, actions) {
  await client.query("delete from actions");
  for (const action of actions) {
    await client.query(
      `
        insert into actions (id, person_id, owner, title, due, due_date, done)
        values ($1, $2, $3, $4, $5, $6::date, $7)
      `,
      [
        action.id,
        action.personId,
        action.owner,
        action.title,
        action.due,
        action.dueDate || null,
        action.done
      ]
    );
  }
}

async function replaceGoals(client, goals) {
  await client.query("delete from goals");
  for (const goal of goals || []) {
    await client.query(
      `
        insert into goals (id, person_id, title, description, horizon, progress, status, created_at, due_date)
        values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), $9)
      `,
      [
        goal.id,
        goal.personId,
        goal.title,
        goal.description,
        goal.horizon,
        goal.progress,
        goal.status,
        goal.createdAt || null,
        goal.dueDate
      ]
    );
  }
}

async function replacePrep(client, prep) {
  await client.query("delete from prep");
  await upsertPrep(client, prep);
}

async function replacePulse(client, pulse) {
  await client.query("delete from pulse");
  for (const [personId, value] of Object.entries(pulse)) {
    await client.query(
      "insert into pulse (person_id, energy, load, clarity, trust) values ($1, $2, $3, $4, $5)",
      [personId, value.energy, value.load, value.clarity, value.trust]
    );
  }
}

async function replaceSurveys(client, surveys) {
  await client.query("delete from surveys");
  for (const survey of surveys || []) {
    await client.query(
      `
        insert into surveys (id, title, description, anonymous, status, questions_json, is_demo_seed, created_at)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7, coalesce($8::timestamptz, now()))
      `,
      [
        survey.id,
        survey.title,
        survey.description,
        survey.anonymous,
        survey.status,
        JSON.stringify(survey.questions || []),
        survey.isDemoSeed === true,
        survey.createdAt || null
      ]
    );
  }
}

async function replaceMeetingLog(client, entries) {
  await client.query("delete from meeting_log");
  for (const entry of entries || []) {
    await client.query(
      `
        insert into meeting_log (id, person_id, held_at, meeting_type, summary, attended)
        values ($1, $2, $3::timestamptz, $4, $5, $6)
      `,
      [entry.id, entry.personId, entry.heldAt, entry.meetingType, entry.summary, entry.attended]
    );
  }
}

async function replaceOncallLoad(client, entries) {
  await client.query("delete from oncall_load");
  for (const entry of entries || []) {
    await client.query(
      `
        insert into oncall_load
          (person_id, week_start, pages_total, after_hours_pages, incidents_led, sleep_disrupted_nights)
        values ($1, $2::date, $3, $4, $5, $6)
      `,
      [
        entry.personId,
        entry.weekStart,
        entry.pagesTotal,
        entry.afterHoursPages,
        entry.incidentsLed,
        entry.sleepDisruptedNights
      ]
    );
  }
}

async function replaceManagerNotes(client, notes) {
  await client.query("delete from manager_notes");
  for (const note of notes || []) {
    await client.query(
      `
        insert into manager_notes (id, person_id, body, tags, created_at)
        values ($1, $2, $3, $4::text[], coalesce($5::timestamptz, now()))
      `,
      [note.id, note.personId, note.body, note.tags || [], note.createdAt || null]
    );
  }
}

async function replaceSurveyResponses(client, responses) {
  await client.query("delete from survey_responses");
  for (const response of responses || []) {
    await client.query(
      `
        insert into survey_responses (id, survey_id, person_id, answers_json, submitted_at)
        values ($1, $2, $3, $4::jsonb, coalesce($5::timestamptz, now()))
      `,
      [
        response.id,
        response.surveyId,
        response.personId || null,
        JSON.stringify(response.answers || {}),
        response.submittedAt || null
      ]
    );
  }
}

async function replacePulseHistory(client, history) {
  // Upsert only — never truncate. snapshotPulse() already enforces dedup-by-day,
  // so the typical write touches one row per person regardless of history depth.
  const cutoff = new Date(Date.now() - pulseHistoryRetentionDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await client.query("delete from pulse_history where captured_at < $1::date", [cutoff]);
  for (const entry of history || []) {
    await client.query(
      `
        insert into pulse_history (person_id, captured_at, energy, load, clarity, trust)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (person_id, captured_at) do update set
          energy = excluded.energy,
          load = excluded.load,
          clarity = excluded.clarity,
          trust = excluded.trust
      `,
      [entry.personId, entry.capturedAt, entry.energy, entry.load, entry.clarity, entry.trust]
    );
  }
}

async function replaceNotes(client, notes) {
  await client.query("delete from notes");
  for (const [personId, body] of Object.entries(notes)) {
    await client.query("insert into notes (person_id, body) values ($1, $2)", [personId, body]);
  }
}

async function replaceUsers(client, users) {
  await client.query("delete from users where id <> all($1::text[])", [users.map((user) => user.id)]);
  for (const user of users) {
    await client.query(
      `
        insert into users (id, username, name, role, person_id, salt, password_hash, created_at)
        values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))
        on conflict (id) do update set
          username = excluded.username,
          name = excluded.name,
          role = excluded.role,
          person_id = excluded.person_id,
          salt = excluded.salt,
          password_hash = excluded.password_hash
      `,
      [user.id, user.username, user.name, user.role, user.personId, user.salt, user.passwordHash, user.createdAt || null]
    );
  }
}

async function replaceSessions(client, sessions) {
  await client.query("delete from sessions");
  for (const session of sessions) {
    await client.query(
      `
        insert into sessions (id, user_id, created_at, expires_at)
        values ($1, $2, $3::timestamptz, $4::timestamptz)
      `,
      [session.id, session.userId, session.createdAt, session.expiresAt]
    );
  }
}

async function deleteMissingPeople(client, peopleRows) {
  await client.query("delete from people where id <> all($1::text[])", [peopleRows.map((person) => person.id)]);
}

async function deletePersonById(personId) {
  if (storageMode === "postgres") {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("delete from sessions where user_id in (select id from users where person_id = $1)", [personId]);
      await client.query("delete from users where person_id = $1", [personId]);
      await client.query("delete from people where id = $1", [personId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return readDb();
  }

  const db = await readDb();
  const removedUserIds = new Set(db.users.filter((user) => user.personId === personId).map((user) => user.id));
  db.people = db.people.filter((person) => person.id !== personId);
  db.cards = db.cards.filter((card) => card.personId !== personId);
  db.actions = db.actions.filter((action) => action.personId !== personId);
  db.goals = (db.goals || []).filter((goal) => goal.personId !== personId);
  db.pulseHistory = (db.pulseHistory || []).filter((entry) => entry.personId !== personId);
  db.surveyResponses = (db.surveyResponses || []).filter((response) => response.personId !== personId);
  db.managerNotes = (db.managerNotes || []).filter((note) => note.personId !== personId);
  db.oncallLoad = (db.oncallLoad || []).filter((entry) => entry.personId !== personId);
  db.meetingLog = (db.meetingLog || []).filter((entry) => entry.personId !== personId);
  db.users = db.users.filter((user) => user.personId !== personId);
  db.sessions = db.sessions.filter((session) => !removedUserIds.has(session.userId));
  delete db.prep[personId];
  delete db.pulse[personId];
  delete db.notes[personId];
  await writeDb(db);
  return readDb();
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    personId: user.personId || null,
    createdAt: user.createdAt
  };
}

function validateProductionSecrets() {
  if (process.env.RAILWAY_ENVIRONMENT && adminPassword === defaultAdminPassword) {
    console.error("ADMIN_PASSWORD must be set explicitly in production. Refusing to start with the default value.");
    process.exit(1);
  }
}

function clientAddress(request) {
  if (trustProxy) {
    const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwardedFor) return forwardedFor;
  }
  return request.socket?.remoteAddress || "unknown";
}

function loginAttemptKey(request, username) {
  return `${clientAddress(request)}:${String(username || "").toLowerCase()}`;
}

function pruneLoginAttempt(entry, now = Date.now()) {
  if (!entry || entry.resetAt <= now) return { count: 0, resetAt: now + failedLoginWindowMs };
  return entry;
}

function isLoginRateLimited(request, username) {
  const userKey = loginAttemptKey(request, username);
  const ipKey = clientAddress(request);
  const userEntry = pruneLoginAttempt(failedLogins.get(userKey));
  const ipEntry = pruneLoginAttempt(failedLoginsByIp.get(ipKey));
  failedLogins.set(userKey, userEntry);
  failedLoginsByIp.set(ipKey, ipEntry);
  return userEntry.count >= maxFailedLoginAttempts || ipEntry.count >= maxFailedLoginAttemptsPerIp;
}

function recordFailedLogin(request, username) {
  const userKey = loginAttemptKey(request, username);
  const ipKey = clientAddress(request);
  const userEntry = pruneLoginAttempt(failedLogins.get(userKey));
  const ipEntry = pruneLoginAttempt(failedLoginsByIp.get(ipKey));
  failedLogins.set(userKey, { count: userEntry.count + 1, resetAt: userEntry.resetAt });
  failedLoginsByIp.set(ipKey, { count: ipEntry.count + 1, resetAt: ipEntry.resetAt });
}

function clearFailedLogins(request, username) {
  failedLogins.delete(loginAttemptKey(request, username));
  failedLoginsByIp.delete(clientAddress(request));
}

function pruneRateLimitMaps() {
  const now = Date.now();
  for (const [key, entry] of failedLogins) {
    if (entry.resetAt <= now) failedLogins.delete(key);
  }
  for (const [key, entry] of failedLoginsByIp) {
    if (entry.resetAt <= now) failedLoginsByIp.delete(key);
  }
}

setInterval(pruneRateLimitMaps, failedLoginWindowMs).unref?.();

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function sessionCookie(sessionId) {
  const secure = process.env.RAILWAY_ENVIRONMENT ? "; Secure" : "";
  return `th_session=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.RAILWAY_ENVIRONMENT ? "; Secure" : "";
  return `th_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

function applySecurityHeaders(response) {
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.setHeader(name, value);
  }
}

function sendJson(response, status, payload, headers = {}) {
  applySecurityHeaders(response);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Payload too large"));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function getAuthContext(request) {
  const db = await readDb();
  const sessionId = parseCookies(request.headers.cookie).th_session;
  const now = Date.now();
  const activeSessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);

  if (activeSessions.length !== db.sessions.length) {
    db.sessions = activeSessions;
    await writeDb(db);
  }

  const session = activeSessions.find((item) => item.id === sessionId);
  if (!session) return { db, user: null, session: null };

  const user = db.users.find((item) => item.id === session.userId);
  return { db, user: user || null, session };
}

async function requireAuth(request, response) {
  const context = await getAuthContext(request);
  if (!context.user) {
    sendJson(response, 401, { error: "Требуется авторизация" });
    return null;
  }
  return context;
}

function isAdmin(user) {
  return user.role === "admin";
}

function isProtectedUser(user) {
  const username = String(user.username || "").toLowerCase();
  return user.role === "admin" || username === adminUsername.toLowerCase();
}

function isDemoUser(user) {
  return String(user.username || "").toLowerCase() === demoUsername.toLowerCase();
}

function isDemoOnlyPersonId(personId) {
  return demoOnlyPersonIds.has(personId);
}

function isDemoOnlyAccess(user) {
  return isDemoUser(user) || isDemoOnlyPersonId(user.personId);
}

function isStaleDemoLinkedAccess(user) {
  return !isDemoUser(user) && user?.role === "employee" && isDemoOnlyPersonId(user.personId);
}

function scopedPersonIds(db, user) {
  if (isAdmin(user)) {
    return new Set(
      db.people
        .filter((person) => !isDemoOnlyPersonId(person.id))
        .filter((person) => !person.archivedAt)
        .map((person) => person.id)
    );
  }
  if (isDemoUser(user)) return new Set(["demo-sre"]);
  if (user.personId) {
    const p = db.people.find((person) => person.id === user.personId);
    if (p && p.archivedAt) return new Set();
    return new Set([user.personId]);
  }
  return new Set();
}

function scopedUsers(db, user) {
  if (!isAdmin(user)) return [];
  return db.users.filter((item) => !isDemoOnlyAccess(item)).map(publicUser);
}

function scopeWorkspace(db, user) {
  const ids = scopedPersonIds(db, user);
  const pickObject = (source) =>
    Object.fromEntries(Object.entries(source || {}).filter(([personId]) => ids.has(personId)));

  const allSurveys = db.surveys || [];
  // Demo seed surveys belong to the demo workspace; the admin's real team must
  // not see them so they do not look like a built-in fixed survey.
  const visibleSurveys = isAdmin(user)
    ? allSurveys.filter((s) => !s.isDemoSeed)
    : isDemoUser(user)
      ? allSurveys
      : allSurveys.filter((s) => !s.isDemoSeed);
  const allResponses = db.surveyResponses || [];
  const scopedSurveys = visibleSurveys.map((survey) => {
    const responsesForSurvey = allResponses.filter((response) => response.surveyId === survey.id);
    const myResponse = !isAdmin(user) && user.personId
      ? responsesForSurvey.find((response) => response.personId === user.personId) || null
      : null;
    const aggregate = isAdmin(user) ? buildSurveyAggregate(survey, responsesForSurvey) : null;
    const responseList =
      isAdmin(user) && !survey.anonymous
        ? responsesForSurvey
            .filter((response) => !response.personId || ids.has(response.personId))
            .map((response) => ({
              id: response.id,
              personId: response.personId,
              submittedAt: response.submittedAt,
              answers: response.answers
            }))
        : null;
    return {
      ...survey,
      responseCount: responsesForSurvey.length,
      myResponse: myResponse
        ? { id: myResponse.id, submittedAt: myResponse.submittedAt, answers: myResponse.answers }
        : null,
      aggregate,
      responses: responseList
    };
  });

  return {
    people: db.people.filter((person) => ids.has(person.id)),
    cards: db.cards.filter((card) => ids.has(card.personId)),
    actions: db.actions.filter((action) => ids.has(action.personId)),
    goals: (db.goals || []).filter((goal) => ids.has(goal.personId)),
    prep: pickObject(db.prep),
    pulse: pickObject(db.pulse),
    pulseHistory: (db.pulseHistory || []).filter((entry) => ids.has(entry.personId)),
    surveys: scopedSurveys,
    notes: isAdmin(user) ? pickObject(db.notes) : {},
    managerNotes: isAdmin(user)
      ? (db.managerNotes || []).filter((note) => ids.has(note.personId))
      : [],
    oncallLoad: (db.oncallLoad || []).filter((entry) => ids.has(entry.personId)),
    meetingLog: (db.meetingLog || []).filter((entry) => ids.has(entry.personId)),
    archivedPeople: isAdmin(user)
      ? db.people
          .filter((person) => person.archivedAt && !isDemoOnlyPersonId(person.id))
          .map((person) => ({
            id: person.id,
            name: person.name,
            role: person.role,
            team: person.team,
            initials: person.initials,
            archivedAt: person.archivedAt
          }))
      : [],
    users: scopedUsers(db, user)
  };
}

function buildSurveyAggregate(survey, responses) {
  const totals = { count: responses.length, perQuestion: {} };
  for (const question of survey.questions) {
    if (question.type === "scale") {
      const values = responses
        .map((response) => response.answers?.[question.id]?.value)
        .filter((value) => typeof value === "number");
      const distribution = Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1), value: 0 }));
      values.forEach((v) => {
        if (v >= 1 && v <= 10) distribution[v - 1].value += 1;
      });
      totals.perQuestion[question.id] = {
        count: values.length,
        avg: values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 0,
        distribution
      };
    } else if (question.type === "single") {
      const counts = Object.fromEntries(question.options.map((option) => [option, 0]));
      let answered = 0;
      for (const response of responses) {
        const choice = response.answers?.[question.id]?.value;
        if (choice && counts[choice] !== undefined) {
          counts[choice] += 1;
          answered += 1;
        }
      }
      totals.perQuestion[question.id] = {
        count: answered,
        distribution: question.options.map((option) => ({ label: option, value: counts[option] || 0 }))
      };
    } else if (question.type === "multi") {
      const counts = Object.fromEntries(question.options.map((option) => [option, 0]));
      let answered = 0;
      for (const response of responses) {
        const list = response.answers?.[question.id]?.values;
        if (Array.isArray(list) && list.length) {
          answered += 1;
          for (const item of list) {
            if (counts[item] !== undefined) counts[item] += 1;
          }
        }
      }
      totals.perQuestion[question.id] = {
        count: answered,
        distribution: question.options.map((option) => ({ label: option, value: counts[option] || 0 }))
      };
    } else if (question.type === "text") {
      const texts = responses
        .map((response) => response.answers?.[question.id]?.value)
        .filter((value) => typeof value === "string" && value.length);
      totals.perQuestion[question.id] = {
        count: texts.length,
        samples: survey.anonymous ? texts.slice(0, 30) : texts.slice(0, 30)
      };
    } else if (question.type === "date") {
      const dates = responses
        .map((response) => response.answers?.[question.id]?.value)
        .filter((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
        .sort();
      totals.perQuestion[question.id] = {
        count: dates.length,
        samples: dates.slice(0, 30)
      };
    }
  }
  return totals;
}

function sanitizeCard(card, personId, forcedSource = null) {
  return {
    id: String(card.id || makeId("card")),
    personId,
    source: forcedSource || (card.source === "manager" ? "manager" : "employee"),
    category: ["checkin", "blocker", "growth", "feedback", "decision", "thanks"].includes(card.category)
      ? card.category
      : "checkin",
    priority: ["high", "medium", "low"].includes(card.priority) ? card.priority : "medium",
    status: ["todo", "discussing", "done"].includes(card.status) ? card.status : "todo",
    title: String(card.title || "").slice(0, 160),
    body: String(card.body || "").slice(0, 1000)
  };
}

function sanitizeAction(action, personId, forcedOwner = null) {
  const rawDueDate = String(action.dueDate || "").trim();
  // Accept ISO date YYYY-MM-DD only; ignore anything else.
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDueDate) ? rawDueDate : "";
  return {
    id: String(action.id || makeId("action")),
    personId,
    owner: forcedOwner || (action.owner === "employee" ? "employee" : "manager"),
    title: String(action.title || "").slice(0, 180),
    due: String(action.due || "к следующему 1:1").slice(0, 80),
    dueDate,
    done: Boolean(action.done)
  };
}

function sanitizeSurveyQuestion(question, fallbackId) {
  const type = surveyQuestionTypes.includes(question?.type) ? question.type : "scale";
  const rawOptions = Array.isArray(question?.options) ? question.options : [];
  const options =
    type === "single" || type === "multi"
      ? rawOptions
          .map((option) => String(option || "").trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 20)
      : [];
  return {
    id: String(question?.id || fallbackId || makeId("q")).slice(0, 32),
    type,
    prompt: String(question?.prompt || "").slice(0, 500),
    required: Boolean(question?.required),
    options
  };
}

const demoSeedSurveyIds = new Set(initialSurveys.map((s) => s.id));

function sanitizeSurvey(survey) {
  const questions = Array.isArray(survey?.questions) ? survey.questions : [];
  const sanitized = questions
    .slice(0, 30)
    .map((q, i) => sanitizeSurveyQuestion(q, `q${i + 1}`))
    .filter((q) => q.prompt.length > 0);
  const id = String(survey?.id || makeId("survey"));
  return {
    id,
    title: String(survey?.title || "").slice(0, 200),
    description: String(survey?.description || "").slice(0, 1000),
    anonymous: Boolean(survey?.anonymous),
    status: survey?.status === "closed" ? "closed" : "active",
    // Legacy data files may miss this flag — fall back to recognising the known
    // seed id so the demo survey is still hidden from the admin's real workspace.
    isDemoSeed: Boolean(survey?.isDemoSeed) || demoSeedSurveyIds.has(id),
    createdAt:
      typeof survey?.createdAt === "string" && survey.createdAt
        ? survey.createdAt
        : new Date().toISOString(),
    questions: sanitized
  };
}

function sanitizeSurveyAnswers(rawAnswers, questions) {
  const result = {};
  const incoming = rawAnswers && typeof rawAnswers === "object" ? rawAnswers : {};
  for (const question of questions) {
    const value = incoming[question.id];
    if (question.type === "scale") {
      const num = clampInt(value?.value ?? value, 1, 10, null);
      if (num != null) result[question.id] = { value: num };
    } else if (question.type === "single") {
      const choice = String(value?.value ?? value ?? "").slice(0, 200);
      if (choice && question.options.includes(choice)) result[question.id] = { value: choice };
    } else if (question.type === "multi") {
      const list = Array.isArray(value?.values ?? value) ? value?.values ?? value : [];
      const valid = list
        .map((item) => String(item || "").slice(0, 200))
        .filter((item) => question.options.includes(item))
        .slice(0, question.options.length);
      if (valid.length) result[question.id] = { values: valid };
    } else if (question.type === "text") {
      const text = String(value?.value ?? value ?? "").slice(0, 1000).trim();
      if (text) result[question.id] = { value: text };
    } else if (question.type === "date") {
      const raw = String(value?.value ?? value ?? "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) result[question.id] = { value: raw };
    }
  }
  return result;
}

function sanitizeSurveyResponse(response, surveys) {
  const survey = (surveys || []).find((s) => s.id === response?.surveyId);
  if (!survey) return null;
  return {
    id: String(response?.id || makeId("response")),
    surveyId: survey.id,
    personId: response?.personId ? String(response.personId) : null,
    submittedAt:
      typeof response?.submittedAt === "string" && response.submittedAt
        ? response.submittedAt
        : new Date().toISOString(),
    answers: sanitizeSurveyAnswers(response?.answers, survey.questions)
  };
}

function sanitizeMeetingLog(entry, personIds) {
  if (!entry || !personIds.has(entry.personId)) return null;
  const ts = String(entry.heldAt || "").trim();
  const parsed = new Date(ts);
  if (!ts || Number.isNaN(parsed.getTime())) return null;
  return {
    id: String(entry.id || makeId("meeting")),
    personId: String(entry.personId),
    heldAt: parsed.toISOString(),
    meetingType: meetingTypes.includes(entry.meetingType) ? entry.meetingType : "regular",
    summary: String(entry.summary || "").slice(0, 4000),
    attended: entry.attended === false ? false : true
  };
}

function sanitizeOncallEntry(entry, personIds) {
  if (!entry || !personIds.has(entry.personId)) return null;
  const week = String(entry.weekStart || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;
  return {
    personId: String(entry.personId),
    weekStart: week,
    pagesTotal: clampInt(entry.pagesTotal, 0, 9999, 0),
    afterHoursPages: clampInt(entry.afterHoursPages, 0, 9999, 0),
    incidentsLed: clampInt(entry.incidentsLed, 0, 9999, 0),
    sleepDisruptedNights: clampInt(entry.sleepDisruptedNights, 0, 7, 0)
  };
}

const managerNoteTags = [
  "feedback",
  "concern",
  "career",
  "wellbeing",
  "incident",
  "decision"
];

function sanitizeManagerNote(note, personIds) {
  if (!note || !personIds.has(note.personId)) return null;
  const tags = Array.isArray(note.tags)
    ? note.tags
        .map((t) => String(t || "").toLowerCase().slice(0, 32))
        .filter((t) => managerNoteTags.includes(t))
        .slice(0, 6)
    : [];
  const body = String(note.body || "").slice(0, 4000).trim();
  if (!body) return null;
  return {
    id: String(note.id || makeId("note")),
    personId: String(note.personId),
    body,
    tags,
    createdAt:
      typeof note.createdAt === "string" && note.createdAt
        ? note.createdAt
        : new Date().toISOString()
  };
}

function snapshotPulse(db) {
  const today = new Date().toISOString().slice(0, 10);
  const history = Array.isArray(db.pulseHistory) ? [...db.pulseHistory] : [];
  for (const [personId, pulse] of Object.entries(db.pulse || {})) {
    if (!pulse) continue;
    const idx = history.findIndex((entry) => entry.personId === personId && entry.capturedAt === today);
    const record = {
      personId,
      capturedAt: today,
      energy: clampInt(pulse.energy, 1, 10, 6),
      load: clampInt(pulse.load, 1, 10, 6),
      clarity: clampInt(pulse.clarity, 1, 10, 6),
      trust: clampInt(pulse.trust, 1, 10, 7)
    };
    if (idx >= 0) history[idx] = record;
    else history.push(record);
  }
  const cutoff = new Date(Date.now() - pulseHistoryRetentionDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  db.pulseHistory = history
    .filter((entry) => entry.capturedAt >= cutoff)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

function sanitizeGoal(goal, personId) {
  return {
    id: String(goal.id || makeId("goal")),
    personId,
    title: String(goal.title || "").slice(0, 200),
    description: String(goal.description || "").slice(0, 1500),
    horizon: String(goal.horizon || "").slice(0, 32),
    progress: clampInt(goal.progress, 0, 100, 0),
    status: goalStatuses.includes(goal.status) ? goal.status : "active",
    createdAt: typeof goal.createdAt === "string" && goal.createdAt ? goal.createdAt : new Date().toISOString(),
    dueDate: String(goal.dueDate || "").slice(0, 32)
  };
}

function mergeWorkspaceUpdate(db, user, incoming) {
  const ids = scopedPersonIds(db, user);
  const incomingCards = Array.isArray(incoming.cards) ? incoming.cards : [];
  const incomingActions = Array.isArray(incoming.actions) ? incoming.actions : [];
  const incomingGoals = Array.isArray(incoming.goals) ? incoming.goals : [];

  if (isAdmin(user)) {
    const hiddenCards = db.cards.filter((card) => !ids.has(card.personId));
    const hiddenActions = db.actions.filter((action) => !ids.has(action.personId));
    const hiddenGoals = (db.goals || []).filter((goal) => !ids.has(goal.personId));
    db.cards = incomingCards
      .filter((card) => ids.has(card.personId))
      .map((card) => sanitizeCard(card, card.personId));
    db.cards = [...hiddenCards, ...db.cards];
    db.actions = incomingActions
      .filter((action) => ids.has(action.personId))
      .map((action) => sanitizeAction(action, action.personId));
    db.actions = [...hiddenActions, ...db.actions];
    db.goals = [
      ...hiddenGoals,
      ...incomingGoals
        .filter((goal) => ids.has(goal.personId))
        .map((goal) => sanitizeGoal(goal, goal.personId))
    ];
    db.prep = mergePrepUpdate(db.prep, incoming.prep, ids, adminWritablePrepKeys);
    db.pulse = mergePulseUpdate(db.pulse, incoming.pulse, ids);
    db.notes = mergeNotesUpdate(db.notes, incoming.notes, ids);
    snapshotPulse(db);
    return db;
  }

  const personId = user.personId;
  if (!personId) return db;

  const nextCardsById = new Map(incomingCards.filter((card) => card.personId === personId).map((card) => [String(card.id), card]));
  const preservedCards = [];
  const employeeCardIds = new Set();

  for (const card of db.cards) {
    if (card.personId !== personId) {
      preservedCards.push(card);
      continue;
    }

    const incomingCard = nextCardsById.get(String(card.id));
    if (card.source === "manager") {
      preservedCards.push({
        ...card,
        status: incomingCard && ["todo", "discussing", "done"].includes(incomingCard.status) ? incomingCard.status : card.status
      });
      continue;
    }

    if (incomingCard) {
      employeeCardIds.add(String(card.id));
      preservedCards.push(sanitizeCard(incomingCard, personId, "employee"));
    }
  }

  const newEmployeeCards = incomingCards
    .filter((card) => card.personId === personId && card.source === "employee" && !employeeCardIds.has(String(card.id)))
    .map((card) => sanitizeCard(card, personId, "employee"));

  const nextActionsById = new Map(incomingActions.filter((action) => action.personId === personId).map((action) => [String(action.id), action]));
  const preservedActions = [];
  const employeeActionIds = new Set();

  for (const action of db.actions) {
    if (action.personId !== personId) {
      preservedActions.push(action);
      continue;
    }

    const incomingAction = nextActionsById.get(String(action.id));
    if (action.owner === "manager") {
      preservedActions.push({
        ...action,
        done: incomingAction ? Boolean(incomingAction.done) : action.done
      });
      continue;
    }

    if (incomingAction) {
      employeeActionIds.add(String(action.id));
      preservedActions.push(sanitizeAction(incomingAction, personId, "employee"));
    }
  }

  const newEmployeeActions = incomingActions
    .filter((action) => action.personId === personId && action.owner === "employee" && !employeeActionIds.has(String(action.id)))
    .map((action) => sanitizeAction(action, personId, "employee"));

  db.cards = [...preservedCards, ...newEmployeeCards];
  db.actions = [...preservedActions, ...newEmployeeActions];

  const otherGoals = (db.goals || []).filter((goal) => goal.personId !== personId);
  const personGoals = incomingGoals
    .filter((goal) => goal.personId === personId)
    .map((goal) => sanitizeGoal(goal, personId));
  db.goals = [...otherGoals, ...personGoals];

  db.prep[personId] = sanitizePrepPatch(db.prep[personId] || {}, incoming.prep?.[personId] || {}, employeeWritablePrepKeys);
  db.pulse[personId] = sanitizePulsePatch(db.pulse[personId] || {}, incoming.pulse?.[personId] || {});
  snapshotPulse(db);
  return db;
}

async function handleApi(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(request);
    const db = await readDb();
    const username = String(body.username || "").trim();

    if (isLoginRateLimited(request, username)) {
      sendJson(response, 429, { error: "Слишком много попыток входа. Попробуйте позже" });
      return;
    }

    const user = db.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
    // Run scrypt unconditionally so response time does not reveal whether the
    // username exists.
    const passwordOk = verifyPassword(String(body.password || ""), user || dummyPasswordRecord);

    if (!user || !passwordOk) {
      recordFailedLogin(request, username);
      sendJson(response, 401, { error: "Неверный логин или пароль" });
      return;
    }

    const session = {
      id: makeId("session"),
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + sessionTtlMs).toISOString()
    };
    db.sessions = [...db.sessions.filter((item) => item.userId !== user.id), session];
    await writeDb(db);
    clearFailedLogins(request, username);
    sendJson(response, 200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(session.id) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const context = await getAuthContext(request);
    if (context.session) {
      context.db.sessions = context.db.sessions.filter((session) => session.id !== context.session.id);
      await writeDb(context.db);
    }
    sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    const context = await requireAuth(request, response);
    if (!context) return;
    sendJson(response, 200, { user: publicUser(context.user) });
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/me") {
    const context = await requireAuth(request, response);
    if (!context) return;
    const body = await readJson(request);
    const name = String(body.name || "").trim();

    if (name.length < 2) {
      sendJson(response, 400, { error: "Укажите имя" });
      return;
    }

    context.user.name = name.slice(0, 120);
    await writeDb(context.db);
    sendJson(response, 200, { user: publicUser(context.user), workspace: scopeWorkspace(context.db, context.user) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/workspace") {
    const context = await requireAuth(request, response);
    if (!context) return;
    sendJson(response, 200, scopeWorkspace(context.db, context.user));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/workspace") {
    const context = await requireAuth(request, response);
    if (!context) return;
    const body = await readJson(request);
    const nextDb = mergeWorkspaceUpdate(context.db, context.user, body);
    await writeDb(nextDb);
    sendJson(response, 200, scopeWorkspace(nextDb, context.user));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/users") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может создавать логины" });
      return;
    }

    const body = await readJson(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const personId = String(body.personId || "");
    let person = personId ? context.db.people.find((item) => item.id === personId) : null;

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      sendJson(response, 400, { error: "Логин: 3-32 символа, латиница, цифры, точка, дефис или подчеркивание" });
      return;
    }

    if (password.length < 8) {
      sendJson(response, 400, { error: "Пароль должен быть не короче 8 символов" });
      return;
    }

    const existingUser = context.db.users.find((user) => user.username.toLowerCase() === username.toLowerCase());
    if (existingUser) {
      if (isProtectedUser(existingUser) || isDemoUser(existingUser) || !isDemoOnlyAccess(existingUser)) {
        sendJson(response, 409, { error: "Такой логин уже существует" });
        return;
      }

      context.db.users = context.db.users.filter((user) => user.id !== existingUser.id);
      context.db.sessions = context.db.sessions.filter((session) => session.userId !== existingUser.id);
    }

    if (person && isDemoOnlyPersonId(person.id)) {
      sendJson(response, 400, { error: "Демо-профили недоступны в рабочей команде" });
      return;
    }

    if (!person) {
      const name = String(body.personName || body.name || "").trim();
      const role = String(body.personRole || body.role || "SRE Engineer").trim();
      const team = String(body.personTeam || body.team || "Reliability").trim();

      if (name.length < 2) {
        sendJson(response, 400, { error: "Укажите имя участника" });
        return;
      }

      person = context.db.people.find(
        (item) =>
          !isDemoOnlyPersonId(item.id) &&
          item.name.toLowerCase() === name.toLowerCase() &&
          !context.db.users.some((user) => user.personId === item.id)
      );

      if (!person) {
        person = {
          id: makePersonId(name),
          name: name.slice(0, 120),
          meetingName: String(body.meetingName || name).slice(0, 120),
          role: role.slice(0, 80),
          team: team.slice(0, 80),
          initials: makeInitials(name),
          nextMeeting: String(body.nextMeeting || "нужно запланировать").slice(0, 80),
          cadence: String(body.cadence || "каждую неделю").slice(0, 80),
          managerFocus: String(body.managerFocus || "понять нагрузку, риски и ближайшие блокеры").slice(0, 220),
          lastSummary: "История встреч пока пустая.",
          trend: "+0"
        };

        context.db.people.push(person);
        context.db.prep[person.id] = {
          employeeAgenda: false,
          managerAgenda: false,
          pulse: false,
          lastActions: false,
          growth: false,
          commitments: false
        };
        context.db.pulse[person.id] = {
          energy: 6,
          load: 6,
          clarity: 6,
          trust: 7
        };
        context.db.notes[person.id] = "";
      }
    }

    if (!person) {
      sendJson(response, 400, { error: "Выберите участника" });
      return;
    }

    const user = {
      id: makeId("user"),
      username,
      name: body.name ? String(body.name).slice(0, 120) : person.name,
      role: "employee",
      personId: person.id,
      createdAt: new Date().toISOString(),
      ...hashPassword(password)
    };

    context.db.users.push(user);
    await writeDb(context.db);
    // Return only what the caller needs: the freshly created user + person, plus
    // the scoped workspace. The duplicate `users` top-level array used to leak
    // the full directory into every create response and is not needed by the UI.
    sendJson(response, 201, {
      user: publicUser(user),
      person,
      workspace: scopeWorkspace(context.db, context.user)
    });
    return;
  }

  const userPasswordMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/password$/);
  if (request.method === "POST" && userPasswordMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может менять пароли" });
      return;
    }

    const targetUser = context.db.users.find((item) => item.id === decodeURIComponent(userPasswordMatch[1]));
    if (!targetUser) {
      sendJson(response, 404, { error: "Пользователь не найден" });
      return;
    }

    if (isDemoOnlyAccess(targetUser)) {
      sendJson(response, 404, { error: "Пользователь не найден" });
      return;
    }

    if (isProtectedUser(targetUser)) {
      sendJson(response, 400, { error: "Seed-аккаунты управляются через настройки окружения" });
      return;
    }

    const body = await readJson(request);
    const password = String(body.password || "");
    if (password.length < 8) {
      sendJson(response, 400, { error: "Пароль должен быть не короче 8 символов" });
      return;
    }

    Object.assign(targetUser, hashPassword(password));
    context.db.sessions = context.db.sessions.filter((session) => session.userId !== targetUser.id);
    await writeDb(context.db);
    sendJson(response, 200, { user: publicUser(targetUser), users: scopedUsers(context.db, context.user) });
    return;
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (request.method === "DELETE" && userMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может удалять логины" });
      return;
    }

    const targetUser = context.db.users.find((item) => item.id === decodeURIComponent(userMatch[1]));
    if (!targetUser) {
      sendJson(response, 404, { error: "Пользователь не найден" });
      return;
    }

    if (isDemoOnlyAccess(targetUser)) {
      sendJson(response, 404, { error: "Пользователь не найден" });
      return;
    }

    if (isProtectedUser(targetUser) || targetUser.id === context.user.id) {
      sendJson(response, 400, { error: "Этот системный доступ нельзя удалить из интерфейса" });
      return;
    }

    context.db.users = context.db.users.filter((item) => item.id !== targetUser.id);
    context.db.sessions = context.db.sessions.filter((session) => session.userId !== targetUser.id);
    await writeDb(context.db);
    sendJson(response, 200, { users: scopedUsers(context.db, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/people") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может управлять командой" });
      return;
    }

    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const role = String(body.role || "SRE Engineer").trim();
    const team = String(body.team || "Reliability").trim();

    if (name.length < 2) {
      sendJson(response, 400, { error: "Укажите имя участника" });
      return;
    }

    const person = {
      id: makePersonId(name),
      name: name.slice(0, 120),
      meetingName: String(body.meetingName || name).slice(0, 120),
      role: role.slice(0, 80),
      team: team.slice(0, 80),
      initials: makeInitials(name),
      nextMeeting: String(body.nextMeeting || "нужно запланировать").slice(0, 80),
      cadence: String(body.cadence || "каждую неделю").slice(0, 80),
      managerFocus: String(body.managerFocus || "понять нагрузку, риски и ближайшие блокеры").slice(0, 220),
      lastSummary: "История встреч пока пустая.",
      trend: "+0"
    };

    context.db.people.push(person);
    context.db.prep[person.id] = {
      employeeAgenda: false,
      managerAgenda: false,
      pulse: false,
      lastActions: false,
      growth: false,
      commitments: false
    };
    context.db.pulse[person.id] = {
      energy: 6,
      load: 6,
      clarity: 6,
      trust: 7
    };
    context.db.notes[person.id] = "";
    await writeDb(context.db);
    sendJson(response, 201, { person, workspace: scopeWorkspace(await readDb(), context.user) });
    return;
  }

  const personMatch = url.pathname.match(/^\/api\/people\/([^/]+)$/);
  if (request.method === "PATCH" && personMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может изменять участников" });
      return;
    }
    const personId = decodeURIComponent(personMatch[1]);
    const target = context.db.people.find((person) => person.id === personId);
    if (!target || isDemoOnlyPersonId(personId)) {
      sendJson(response, 404, { error: "Участник не найден" });
      return;
    }
    const body = await readJson(request);
    const updates = {};
    if (typeof body.name === "string") {
      const next = body.name.trim();
      if (next.length < 2) {
        sendJson(response, 400, { error: "Имя не короче 2 символов" });
        return;
      }
      updates.name = next.slice(0, 120);
      updates.initials = makeInitials(next);
      if (typeof body.meetingName !== "string" || !body.meetingName.trim()) {
        updates.meetingName = updates.name;
      }
    }
    if (typeof body.meetingName === "string" && body.meetingName.trim()) {
      updates.meetingName = body.meetingName.trim().slice(0, 120);
    }
    if (typeof body.role === "string" && body.role.trim()) {
      updates.role = body.role.trim().slice(0, 80);
    }
    if (typeof body.team === "string" && body.team.trim()) {
      updates.team = body.team.trim().slice(0, 80);
    }
    if (typeof body.cadence === "string" && body.cadence.trim()) {
      updates.cadence = body.cadence.trim().slice(0, 80);
    }
    if (typeof body.nextMeeting === "string" && body.nextMeeting.trim()) {
      updates.nextMeeting = body.nextMeeting.trim().slice(0, 80);
    }
    if (typeof body.managerFocus === "string") {
      updates.managerFocus = body.managerFocus.trim().slice(0, 220);
    }
    if (meetingTypes.includes(body.meetingType)) {
      updates.meetingType = body.meetingType;
    }
    if (mentorshipModes.includes(body.mentorshipMode)) {
      updates.mentorshipMode = body.mentorshipMode;
    }
    if (typeof body.growthNarrative === "string") {
      updates.growthNarrative = body.growthNarrative.slice(0, 8000);
    }
    if (typeof body.performanceNarrative === "string") {
      updates.performanceNarrative = body.performanceNarrative.slice(0, 8000);
    }

    Object.assign(target, updates);
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 200, {
      person: refreshed.people.find((p) => p.id === personId),
      workspace: scopeWorkspace(refreshed, context.user)
    });
    return;
  }

  if (request.method === "DELETE" && personMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может удалять участников" });
      return;
    }

    const personId = decodeURIComponent(personMatch[1]);
    const targetPerson = context.db.people.find((person) => person.id === personId);
    if (!targetPerson || isDemoOnlyPersonId(personId)) {
      sendJson(response, 404, { error: "Участник не найден" });
      return;
    }

    // Soft-delete: mark as archived. The person keeps history (cards, actions,
    // goals, notes, oncall_load) so admin can fully restore them later. Linked
    // user accounts are removed because logins should not survive archiving.
    const permanent = url.searchParams.get("permanent") === "1";
    if (permanent) {
      const nextDb = await deletePersonById(personId);
      sendJson(response, 200, { workspace: scopeWorkspace(nextDb, context.user) });
      return;
    }

    targetPerson.archivedAt = new Date().toISOString();
    // Remove logins linked to archived person so they can't sign in anymore.
    const removedUserIds = new Set(
      context.db.users.filter((u) => u.personId === personId).map((u) => u.id)
    );
    context.db.users = context.db.users.filter((u) => u.personId !== personId);
    context.db.sessions = context.db.sessions.filter((s) => !removedUserIds.has(s.userId));
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  const personRestoreMatch = url.pathname.match(/^\/api\/people\/([^/]+)\/restore$/);
  if (request.method === "POST" && personRestoreMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может восстанавливать участников" });
      return;
    }
    const personId = decodeURIComponent(personRestoreMatch[1]);
    const target = context.db.people.find((p) => p.id === personId);
    if (!target) {
      sendJson(response, 404, { error: "Участник не найден" });
      return;
    }
    target.archivedAt = null;
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/meetings/log") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Лог встреч ведёт администратор" });
      return;
    }
    const body = await readJson(request);
    const ids = scopedPersonIds(context.db, context.user);
    const entry = sanitizeMeetingLog(
      {
        personId: body.personId,
        heldAt: body.heldAt || new Date().toISOString(),
        meetingType: body.meetingType,
        summary: body.summary,
        attended: body.attended
      },
      ids
    );
    if (!entry) {
      sendJson(response, 400, { error: "Укажите участника и дату встречи" });
      return;
    }
    context.db.meetingLog = [entry, ...(context.db.meetingLog || [])];
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 201, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/oncall/ingest") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "On-call ingest доступен только администратору" });
      return;
    }
    const body = await readJson(request);
    const incoming = Array.isArray(body.entries) ? body.entries : [];
    const ids = scopedPersonIds(context.db, context.user);
    const cleaned = incoming.map((e) => sanitizeOncallEntry(e, ids)).filter(Boolean);
    const incomingKeys = new Set(cleaned.map((e) => `${e.personId}|${e.weekStart}`));
    const preserved = (context.db.oncallLoad || []).filter(
      (e) => !incomingKeys.has(`${e.personId}|${e.weekStart}`)
    );
    context.db.oncallLoad = [...preserved, ...cleaned];
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 200, { ingested: cleaned.length, workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/manager-notes") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Заметки лида доступны только администратору" });
      return;
    }
    const body = await readJson(request);
    const ids = scopedPersonIds(context.db, context.user);
    const note = sanitizeManagerNote(
      {
        personId: body.personId,
        body: body.body,
        tags: body.tags,
        createdAt: new Date().toISOString()
      },
      ids
    );
    if (!note) {
      sendJson(response, 400, { error: "Укажите участника и текст заметки" });
      return;
    }
    context.db.managerNotes = [note, ...(context.db.managerNotes || [])];
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 201, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  const managerNoteMatch = url.pathname.match(/^\/api\/manager-notes\/([^/]+)$/);
  if (request.method === "DELETE" && managerNoteMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Заметки лида доступны только администратору" });
      return;
    }
    const noteId = decodeURIComponent(managerNoteMatch[1]);
    context.db.managerNotes = (context.db.managerNotes || []).filter((note) => note.id !== noteId);
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/surveys") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может создавать опросы" });
      return;
    }
    const body = await readJson(request);
    const survey = sanitizeSurvey({
      title: body.title,
      description: body.description,
      anonymous: body.anonymous,
      status: "active",
      questions: body.questions
    });
    if (!survey.title || survey.questions.length === 0) {
      sendJson(response, 400, { error: "Название и хотя бы один вопрос обязательны" });
      return;
    }
    context.db.surveys = [...(context.db.surveys || []), survey];
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 201, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  const surveyDeleteMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)$/);
  if (request.method === "DELETE" && surveyDeleteMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может удалять опросы" });
      return;
    }
    const surveyId = decodeURIComponent(surveyDeleteMatch[1]);
    const exists = (context.db.surveys || []).some((survey) => survey.id === surveyId);
    if (!exists) {
      sendJson(response, 404, { error: "Опрос не найден" });
      return;
    }
    // Admin delete is authoritative — even legacy demo-seed surveys are wiped so
    // they don't reappear after future reads of older workspace.json files.
    context.db.surveys = (context.db.surveys || []).filter((survey) => survey.id !== surveyId);
    context.db.surveyResponses = (context.db.surveyResponses || []).filter((response) => response.surveyId !== surveyId);
    // Block seed re-injection for this id by replacing initialSurveys clone in DB
    // is not needed here: createSeedDb is only called on explicit /api/reset.
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  const surveyRespondMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/respond$/);
  if (request.method === "POST" && surveyRespondMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    const surveyId = decodeURIComponent(surveyRespondMatch[1]);
    const survey = (context.db.surveys || []).find((item) => item.id === surveyId);
    if (!survey || survey.status !== "active") {
      sendJson(response, 404, { error: "Опрос не найден или закрыт" });
      return;
    }

    if (isAdmin(context.user)) {
      sendJson(response, 400, { error: "Администратор не может отправлять ответы" });
      return;
    }

    const body = await readJson(request);
    const sanitizedAnswers = sanitizeSurveyAnswers(body.answers, survey.questions);

    const missing = survey.questions
      .filter((question) => question.required)
      .filter((question) => !Object.prototype.hasOwnProperty.call(sanitizedAnswers, question.id));
    if (missing.length) {
      sendJson(response, 400, { error: `Не отвечены обязательные вопросы: ${missing.length}` });
      return;
    }

    context.db.surveyResponses = context.db.surveyResponses || [];

    if (!survey.anonymous) {
      const existingIndex = context.db.surveyResponses.findIndex(
        (response) => response.surveyId === survey.id && response.personId === context.user.personId
      );
      if (existingIndex >= 0) {
        context.db.surveyResponses[existingIndex] = {
          ...context.db.surveyResponses[existingIndex],
          answers: sanitizedAnswers,
          submittedAt: new Date().toISOString()
        };
      } else {
        context.db.surveyResponses.push({
          id: makeId("response"),
          surveyId: survey.id,
          personId: context.user.personId,
          answers: sanitizedAnswers,
          submittedAt: new Date().toISOString()
        });
      }
    } else {
      context.db.surveyResponses.push({
        id: makeId("response"),
        surveyId: survey.id,
        personId: null,
        answers: sanitizedAnswers,
        submittedAt: new Date().toISOString()
      });
    }

    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор может сбросить демо" });
      return;
    }

    const nextDb = createSeedDb();
    const admin = nextDb.users.find((item) => item.username.toLowerCase() === adminUsername.toLowerCase());
    const session = {
      id: makeId("session"),
      userId: admin.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + sessionTtlMs).toISOString()
    };
    nextDb.sessions = [session];
    await writeDb(nextDb);
    sendJson(
      response,
      200,
      { ok: true, user: publicUser(admin), workspace: scopeWorkspace(nextDb, admin) },
      { "Set-Cookie": sessionCookie(session.id) }
    );
    return;
  }

  sendJson(response, 404, { error: "API endpoint not found" });
}

function safeResolve(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const normalizedPath = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const requested = join(distDir, normalizedPath);

  if (!requested.startsWith(distDir)) {
    return join(distDir, "index.html");
  }

  if (existsSync(requested) && statSync(requested).isFile()) {
    return requested;
  }

  return join(distDir, "index.html");
}

validateProductionSecrets();
await initStorage();

createServer((request, response) => {
  if ((request.url || "").startsWith("/api/")) {
    handleApi(request, response).catch((error) => {
      console.error(error);
      sendJson(response, 500, { error: "Внутренняя ошибка сервера" });
    });
    return;
  }

  const filePath = safeResolve(request.url || "/");
  const extension = extname(filePath);

  applySecurityHeaders(response);
  response.setHeader("Cache-Control", extension === ".html" ? "no-store" : "public, max-age=31536000, immutable");
  response.setHeader("Content-Type", contentTypes[extension] || "application/octet-stream");

  createReadStream(filePath)
    .on("error", () => {
      response.writeHead(404);
      response.end("Not found");
    })
    .pipe(response);
}).listen(port, "0.0.0.0", () => {
  console.log(`Team Health 1:1 is listening on ${port}`);
});
