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
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  people,
  initialCards,
  initialActions,
  initialLprs,
  initialGoals,
  initialCompetencyAssessments,
  initialSurveys,
  initialNotes,
  initialPrep,
  initialPulse,
  demoOnlyPersonIds,
  demoSeedSurveyIds,
  buildSeedPulseHistory,
  buildSeedOncallLoad
} from "./fixtures/demo.mjs";
import { syncWorkspace, VersionConflictError } from "./db/repositories/workspace.js";
import {
  findSessionUser,
  findUserByUsername,
  createSession,
  deleteSession,
  deleteOtherSessions,
  updateUserName,
  updateUserPassword
} from "./db/repositories/auth.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(__dirname, "dist");
const dataDir = process.env.DATA_DIR || join(__dirname, ".data");
const dataFile = join(dataDir, "workspace.json");
const port = Number(process.env.PORT) || 4173;
const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;
const storageMode = process.env.DATABASE_URL ? "postgres" : "file";
// Deployment mode drives every production guard below. RAILWAY_ENVIRONMENT stays
// as an auto-detect fallback so an existing Railway deploy needs no new variable,
// while any other target (Docker, Kubernetes) sets APP_ENV explicitly.
const appEnv = process.env.APP_ENV || (process.env.RAILWAY_ENVIRONMENT ? "production" : "local");
const isProduction = appEnv === "production";
const failedLoginWindowMs = 1000 * 60 * 15;
const maxFailedLoginAttempts = 8;
const maxFailedLoginAttemptsPerIp = 30;
const trustProxy = isProduction || process.env.TRUST_PROXY === "1";
const allowFileStorageInProduction = process.env.ALLOW_FILE_STORAGE === "1";
const demoResetAllowed = !isProduction || process.env.ENABLE_DEMO_RESET === "1";

// Дефолт есть только у имени пользователя. Пароля по умолчанию не существует
// ни в одном окружении: вне local его отсутствие — отказ старта, в local он
// генерируется при первом запуске и печатается один раз.
const defaultAdminUsername = "admin";
const adminUsername = process.env.ADMIN_USERNAME || defaultAdminUsername;
const adminName = process.env.ADMIN_NAME || "Администратор";
let adminPassword = process.env.ADMIN_PASSWORD || "";
const demoUsername = process.env.DEMO_USERNAME || "demo";
const demoPassword = process.env.DEMO_PASSWORD || "demo";

// Секрет анонимности опросов. Фолбэка на пароль администратора больше нет:
// respondent_hash = sha256(surveyId:userId:secret), а список userId админу
// доступен, поэтому знание пароля админа раскрывало авторов анонимных
// ответов за секунду.
let surveyResponseSecret = process.env.SURVEY_RESPONSE_SECRET || "";
// Поколение секрета. Смена секрета инкрементирует его, и старые ответы
// остаются в своём поколении вместо того, чтобы молча перестать
// дедуплицироваться. Значение живёт в app_meta.
let surveySecretVersion = 1;

// Значения, которые успели утечь или никогда не были секретом. Держать
// скомпрометированный пароль в коде ради его запрета нормально: это
// блок-лист, а не секрет.
const BURNED_SECRETS = new Set([
  "passwb121",
  "admin",
  "password",
  "changeme",
  "change-me-locally",
  "local-survey-secret",
  "test-survey-secret",
  "demo"
]);

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

const lprStatuses = ["active", "paused", "done"];
const goalStatuses = ["active", "achieved", "abandoned"];
const competencyAssessmentSources = ["case-ai", "manual", "review"];
const competencyAssessmentStatuses = ["draft", "validated"];

const meetingTypes = ["regular", "career", "performance", "post-incident", "first-1on1", "skip-level"];
const mentorshipModes = ["mentor", "coach", "sponsor"];

const pulseHistoryRetentionDays = 365;

const surveyQuestionTypes = ["scale", "single", "multi", "text", "date"];

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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function makeId(prefix) {
  return `${prefix}-${randomBytes(16).toString("hex")}`;
}

function seedUser({ username, password, name, role, personId = null, leadUserId = null, teamLabel = "" }) {
  return {
    id: makeId("user"),
    username,
    name,
    role,
    personId,
    leadUserId,
    teamLabel,
    createdAt: new Date().toISOString(),
    ...hashPassword(password)
  };
}

function createSeedDb() {
  return normalizeDb({
    version: 7,
    people,
    cards: initialCards,
    actions: initialActions,
    lprs: initialLprs,
    goals: initialGoals,
    competencyAssessments: initialCompetencyAssessments,
    surveys: initialSurveys,
    surveyResponses: [],
    prep: initialPrep,
    pulse: initialPulse,
    pulseHistory: buildSeedPulseHistory(),
    oncallLoad: buildSeedOncallLoad(),
    notes: initialNotes,
    users: (() => {
      const admin = seedUser({
        username: adminUsername,
        password: adminPassword,
        name: adminName,
        role: "platform_admin"
      });
      const demo = seedUser({
        username: demoUsername,
        password: demoPassword,
        name: "Демо участник команды",
        role: "employee",
        personId: "demo-sre",
        leadUserId: admin.id
      });
      return [admin, demo];
    })(),
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
      role: String(person.role || "Team Member"),
      team: String(person.team || "Product"),
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
  const peopleById = new Map(allPeople.map((person) => [person.id, person]));
  const removedUserIds = new Set();
  const rawUsers = Array.isArray(rawDb.users)
    ? rawDb.users.filter((user) => {
        if (!user.username) return false;
        if (isStaleDemoLinkedAccess(user)) {
          if (user.id) removedUserIds.add(String(user.id));
          return false;
        }
        return true;
      })
    : [];

  // Normalise role + team fields. Legacy 'admin' becomes 'platform_admin'.
  // Team membership is stored as a label on users and people so leads can be
  // scoped by team even when a direct lead_user_id is missing.
  const users = rawUsers.map((user) => {
    const role = user.role === "admin" ? "platform_admin" : user.role;
    const safeRole = ["platform_admin", "lead", "employee"].includes(role) ? role : "employee";
    const personId = user.personId && personIds.has(String(user.personId)) ? String(user.personId) : null;
    const person = personId ? peopleById.get(personId) : null;
    const teamLabel = String(user.teamLabel || person?.team || "").slice(0, 120);
    const matchingLead = rawUsers.find((candidate) => {
      if (candidate.id === user.id) return false;
      const candidateRole = candidate.role === "admin" ? "platform_admin" : candidate.role;
      if (candidateRole !== "lead") return false;
      const candidatePerson = candidate.personId ? peopleById.get(String(candidate.personId)) : null;
      return normalizeTeamName(candidate.teamLabel || candidatePerson?.team || "") === normalizeTeamName(teamLabel);
    });
    const leadUserId =
      safeRole !== "employee"
        ? null
        : user.leadUserId != null
        ? String(user.leadUserId)
        : matchingLead
          ? String(matchingLead.id)
          : null;
    return {
      ...user,
      role: safeRole,
      personId,
      leadUserId: leadUserId === user.id ? null : leadUserId,
      teamLabel
    };
  });
  const lprs = Array.isArray(rawDb.lprs)
    ? rawDb.lprs
        .filter((lpr) => personIds.has(lpr.personId))
        .map((lpr) => sanitizeLpr(lpr, lpr.personId))
    : [];
  const seedLprIds = new Set(initialLprs.map((lpr) => lpr.id));
  const lprsById = new Map(lprs.map((lpr) => [lpr.id, lpr]));
  const allLprs = [
    ...initialLprs.map((lpr) => lprsById.get(lpr.id) || lpr),
    ...lprs.filter((lpr) => !seedLprIds.has(lpr.id))
  ];
  const lprIds = new Set(allLprs.map((lpr) => lpr.id));
  const cards = Array.isArray(rawDb.cards)
    ? rawDb.cards
        .filter((card) => personIds.has(card.personId))
        .map((card) => sanitizeCard(card, card.personId, null, lprIds))
    : [];
  const actions = Array.isArray(rawDb.actions) ? rawDb.actions.filter((action) => personIds.has(action.personId)) : [];
  const goals = Array.isArray(rawDb.goals)
    ? rawDb.goals
        .filter((goal) => personIds.has(goal.personId))
        .map((goal) => sanitizeGoal(goal, goal.personId, lprIds))
    : [];
  const competencyAssessments = Array.isArray(rawDb.competencyAssessments)
    ? rawDb.competencyAssessments
        .filter((assessment) => assessment && personIds.has(assessment.personId))
        .map((assessment) => sanitizeCompetencyAssessment(assessment, assessment.personId))
    : [];
  const seedCardIds = new Set(initialCards.map((card) => card.id));
  const seedActionIds = new Set(initialActions.map((action) => action.id));
  const seedGoalIds = new Set(initialGoals.map((goal) => goal.id));
  const seedAssessmentIds = new Set(initialCompetencyAssessments.map((assessment) => assessment.id));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const assessmentsById = new Map(competencyAssessments.map((assessment) => [assessment.id, assessment]));

  const db = {
    version: 7,
    people: allPeople,
    lprs: allLprs,
    cards: [
      ...initialCards.map((card) => {
        const existing = cardsById.get(card.id);
        return {
          ...card,
          status: existing?.status || card.status,
          lprId: existing?.lprId || card.lprId || "",
          // Демо-карточки накладываются поверх фикстур, но версию строки
          // надо брать из базы: иначе оптимистичная блокировка на них
          // никогда не сработает.
          createdAt: existing?.createdAt || card.createdAt || null,
          updatedAt: existing?.updatedAt || null
        };
      }),
      ...cards.filter((card) => !seedCardIds.has(card.id) && !hasLegacyBusinessText(card.title, card.body))
    ],
    actions: [
      ...initialActions.map((action) => {
        const existing = actionsById.get(action.id);
        return {
          ...action,
          done: typeof existing?.done === "boolean" ? existing.done : action.done,
          createdAt: existing?.createdAt || action.createdAt || null,
          updatedAt: existing?.updatedAt || null
        };
      }),
      ...actions.filter((action) => !seedActionIds.has(action.id) && !hasLegacyBusinessText(action.title, action.due))
    ],
    goals: [
      ...initialGoals.map((goal) => {
        const existing = goalsById.get(goal.id);
        return existing
          ? {
              ...existing,
              lprId: existing.lprId || goal.lprId || ""
            }
          : goal;
      }),
      ...goals.filter((goal) => !seedGoalIds.has(goal.id))
    ],
    competencyAssessments: [
      ...initialCompetencyAssessments.map((assessment) => assessmentsById.get(assessment.id) || sanitizeCompetencyAssessment(assessment, assessment.personId)),
      ...competencyAssessments.filter((assessment) => !seedAssessmentIds.has(assessment.id))
    ],
    prep: { ...initialPrep, ...(rawDb.prep || {}) },
    pulse: { ...initialPulse, ...(rawDb.pulse || {}) },
    pulseHistory: Array.isArray(rawDb.pulseHistory)
      ? rawDb.pulseHistory
          .filter((entry) => entry && personIds.has(entry.personId) && isValidISODate(String(entry.capturedAt || "").slice(0, 10)))
          .map((entry) => ({
            personId: String(entry.personId),
            capturedAt: String(entry.capturedAt).slice(0, 10),
            energy: clampInt(entry.energy, 1, 10, 6),
            load: clampInt(entry.load, 1, 10, 6),
            clarity: clampInt(entry.clarity, 1, 10, 6),
            trust: clampInt(entry.trust, 1, 10, 7)
          }))
      : [],
    surveys: Array.isArray(rawDb.surveys) ? rawDb.surveys.map((s) => sanitizeSurvey(s, users)) : [],
    surveyResponses: [],
    managerNotes: Array.isArray(rawDb.managerNotes)
      ? rawDb.managerNotes
          .map((note) => sanitizeManagerNote(note, personIds))
          .filter(Boolean)
      : [],
    oncallLoad: Array.isArray(rawDb.oncallLoad)
      ? rawDb.oncallLoad
          .map((entry) => sanitizeOncallEntry(entry, personIds))
          .filter(Boolean)
          .filter((entry) => !isDemoOnlyPersonId(entry.personId))
      : [],
    meetingLog: Array.isArray(rawDb.meetingLog)
      ? rawDb.meetingLog.map((entry) => sanitizeMeetingLog(entry, personIds)).filter(Boolean)
      : [],
    meetingDrafts: mergeMeetingDrafts(rawDb.meetingDrafts || {}, personIds),
    notes: mergeNotes(rawDb.notes || {}),
    users,
    sessions: Array.isArray(rawDb.sessions)
      ? rawDb.sessions.filter((session) => !removedUserIds.has(String(session.userId)))
      : []
  };

  ensureSeedLogin(db, {
    username: adminUsername,
    password: adminPassword,
    name: adminName,
    role: "platform_admin",
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

function normalizeTeamName(value) {
  return String(value || "").trim().toLowerCase();
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

function isValidISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
  const legacyWords = ["прод" + "аж", "sa" + "les", "билл" + "инг"];
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

function mergeMeetingDrafts(rawDrafts, personIds) {
  const result = {};
  for (const [personId, body] of Object.entries(rawDrafts || {})) {
    if (personIds.has(personId)) {
      result[personId] = String(body || "").slice(0, 12000);
    }
  }
  return result;
}

function mergeMeetingDraftsUpdate(currentDrafts = {}, incomingDrafts = {}, personIds) {
  const next = { ...currentDrafts };
  for (const personId of personIds) {
    if (Object.prototype.hasOwnProperty.call(incomingDrafts || {}, personId)) {
      next[personId] = String(incomingDrafts[personId] || "").slice(0, 12000);
    }
  }
  return next;
}

function ensureSeedLogin(db, config) {
  const index = db.users.findIndex((user) => user.username.toLowerCase() === config.username.toLowerCase());
  const passwordFields = hashPassword(config.password);
  const leadUserId = config.leadUserId || null;
  const teamLabel = String(config.teamLabel || "").slice(0, 120);

  if (index === -1) {
    db.users.push({
      id: makeId("user"),
      username: config.username,
      name: config.name,
      role: config.role,
      personId: config.personId,
      leadUserId,
      teamLabel,
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
    leadUserId,
    teamLabel,
    ...passwordFields
  };
}

// Only override SSL when DATABASE_SSL is set explicitly. Left unset, node-postgres
// keeps reading sslmode from the connection string, which is what Railway relies on.
function poolSslOption() {
  switch (process.env.DATABASE_SSL) {
    case "require":
      return { rejectUnauthorized: false };
    case "verify-full":
      return { rejectUnauthorized: true };
    case "disable":
      return false;
    default:
      return undefined;
  }
}

// Последняя миграция, на которую рассчитывает этот код. Поднимается вместе
// с миграцией, добавляющей то, что код начал использовать.
const EXPECTED_SCHEMA = "0024_teams_expand";

let schemaReady = false;

// Приложение больше не мигрирует, но обязано убедиться, что база не старше
// кода. Асимметрия проверки намеренная: база новее кода — штатная ситуация
// во время rolling update, ради неё и существует expand-шаг. База старше
// кода — гарантированная поломка, стартовать нельзя.
async function assertSchemaVersion(pool) {
  let rows;
  try {
    ({ rows } = await pool.query("select name from pgmigrations order by id desc limit 1"));
  } catch (error) {
    if (error.code === "42P01") {
      throw new Error(
        "Схема не инициализирована: таблицы pgmigrations нет. " +
          "Выполните `npm run migrate` (для базы, созданной до перехода на миграции — сначала `npm run migrate:baseline`)."
      );
    }
    throw error;
  }

  const actual = rows[0]?.name;
  if (!actual) {
    throw new Error("Схема не инициализирована: журнал миграций пуст. Выполните `npm run migrate`.");
  }
  if (actual < EXPECTED_SCHEMA) {
    throw new Error(`База на миграции ${actual}, коду нужна ${EXPECTED_SCHEMA}. Выполните \`npm run migrate\`.`);
  }
  if (actual > EXPECTED_SCHEMA) {
    console.warn(`База новее кода (${actual} > ${EXPECTED_SCHEMA}) — это нормально при rolling update`);
  }
  schemaReady = true;
}

async function initStorage() {
  if (storageMode === "postgres") {
    const { Pool } = await import("pg");
    const ssl = poolSslOption();
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ...(ssl === undefined ? {} : { ssl }),
      // Пул без параметров — это отказ сервиса вместо деградации: одна
      // зависшая транзакция выедает соединения, и падает всё сразу.
      max: Number(process.env.DATABASE_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "team-health-api",
      // Серверные таймауты, а не клиентские: клиентский отменяет ожидание,
      // но оставляет запрос молотить на сервере.
      options: "-c statement_timeout=15s -c idle_in_transaction_session_timeout=30s"
    });
    // Ошибка на простаивающем соединении (сервер закрыл его, сеть моргнула)
    // без обработчика роняет процесс целиком.
    pgPool.on("error", (error) => {
      console.error("Ошибка на простаивающем соединении пула:", error.message);
    });
    await assertSchemaVersion(pgPool);
    await ensureAdminAccounts();
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

// Отпечаток пары логин-пароль. sha256 необратим, поэтому запись в базе
// безопасна: восстановить по ней пароль нельзя, а сравнить — можно.
function secretFingerprint(...parts) {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

async function readMeta(client, key) {
  const { rows } = await client.query("select value from app_meta where key = $1", [key]);
  return rows[0]?.value ?? null;
}

async function writeMeta(client, key, value) {
  await client.query(
    `
      insert into app_meta (key, value) values ($1, $2)
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `,
    [key, value]
  );
}

// Учётная запись администратора.
//
// Раньше salt и password_hash безусловно перезаписывались из ADMIN_PASSWORD
// на каждом старте. Пароль так действительно менялся через окружение, но
// любая внешняя ротация — через CLI, через восстановление из бэкапа —
// молча откатывалась ближайшим рестартом.
//
// Отпечаток разводит два случая. Совпал — ADMIN_PASSWORD с прошлого старта
// не менялся, база авторитетна, не трогаем. Не совпал — переменную
// поменяли осознанно, применяем и гасим сессии.
async function ensureAdminPassword(client) {
  const fingerprint = secretFingerprint(adminUsername, adminPassword);
  const stored = await readMeta(client, "admin_password_fingerprint");
  const existing = await client.query("select id from users where lower(username) = lower($1)", [adminUsername]);
  const { salt, passwordHash } = hashPassword(adminPassword);

  if (!existing.rows[0]) {
    await client.query(
      `
        insert into users (id, username, name, role, person_id, lead_user_id, team_label, salt, password_hash)
        values ($1, $2, $3, 'platform_admin', null, null, '', $4, $5)
      `,
      [makeId("user"), adminUsername, adminName, salt, passwordHash]
    );
    await writeMeta(client, "admin_password_fingerprint", fingerprint);
    console.log(`Создана учётная запись администратора ${adminUsername}`);
    return;
  }

  if (stored === fingerprint) return;

  await client.query("update users set salt = $1, password_hash = $2 where id = $3", [
    salt,
    passwordHash,
    existing.rows[0].id
  ]);
  await writeMeta(client, "admin_password_fingerprint", fingerprint);
  // Смена пароля обязана инвалидировать активные сессии. Без этого старая
  // сессия продолжает работать после смены пароля через окружение, и
  // «сменил пароль» перестаёт означать «выгнал того, кто знал старый».
  const killed = await client.query("delete from sessions where user_id = $1", [existing.rows[0].id]);
  console.log(
    `Пароль администратора обновлён из ADMIN_PASSWORD, сброшено сессий: ${killed.rowCount}`
  );
}

// Поколение секрета опросов. Тот же приём с отпечатком: сменили
// SURVEY_RESPONSE_SECRET — поколение растёт, старые ответы остаются со
// своей версией, дедупликация внутри поколения продолжает работать.
async function ensureSurveySecretVersion(client) {
  const fingerprint = secretFingerprint("survey", surveyResponseSecret);
  const stored = await readMeta(client, "survey_secret_fingerprint");
  const version = Number(await readMeta(client, "survey_secret_version")) || 0;

  if (stored === fingerprint && version > 0) {
    surveySecretVersion = version;
    return;
  }

  surveySecretVersion = version + 1;
  await writeMeta(client, "survey_secret_fingerprint", fingerprint);
  await writeMeta(client, "survey_secret_version", String(surveySecretVersion));
  if (version > 0) {
    console.log(`SURVEY_RESPONSE_SECRET изменился, поколение хешей: ${surveySecretVersion}`);
  }
}

async function ensureAdminAccounts() {
  const client = await pgPool.connect();
  try {
    await client.query("begin");
    // В local секрет опросов может не быть задан вовсе — тогда он один раз
    // генерируется и сохраняется в базе. Иначе хеши разъезжались бы на
    // каждом рестарте, и локальная разработка опросов превратилась бы в
    // угадайку.
    if (!surveyResponseSecret) {
      const persisted = await readMeta(client, "survey_secret_local");
      surveyResponseSecret = persisted || randomBytes(24).toString("base64url");
      if (!persisted) await writeMeta(client, "survey_secret_local", surveyResponseSecret);
    }
    await ensureAdminPassword(client);
    await ensureSurveySecretVersion(client);
    await client.query("delete from sessions where expires_at < now()");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function readDb() {
  if (storageMode === "postgres") {
    const [
      peopleResult,
      lprsResult,
      cardsResult,
      actionsResult,
      goalsResult,
      competencyAssessmentsResult,
      prepResult,
      pulseResult,
      pulseHistoryResult,
      surveysResult,
      surveyResponsesResult,
      managerNotesResult,
      oncallLoadResult,
      meetingLogResult,
      meetingDraftsResult,
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
            to_char(archived_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "archivedAt",
            to_json(updated_at)#>>'{}' as "updatedAt"
          from people
          order by case id when 'demo-sre' then 0 when 'anna' then 1 when 'danila' then 2 when 'mila' then 3 when 'timur' then 4 else 99 end, name
        `),
        pgPool.query(`
          select
            id,
            person_id as "personId",
            title,
            focus,
            status,
            created_at as "createdAt",
            to_json(updated_at)#>>'{}' as "updatedAt"
          from lprs
          order by created_at asc, id asc
        `),
        pgPool.query(`
          select
            id,
            person_id as "personId",
            lpr_id as "lprId",
            source,
            category,
            priority,
            status,
            title,
            body,
            created_at as "createdAt",
            to_json(updated_at)#>>'{}' as "updatedAt"
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
            done,
            created_at as "createdAt",
            to_json(updated_at)#>>'{}' as "updatedAt"
          from actions
          order by created_at asc, id asc
        `),
        pgPool.query(`
          select
            id,
            person_id as "personId",
            lpr_id as "lprId",
            title,
            description,
            horizon,
            progress,
            status,
            created_at as "createdAt",
            to_json(updated_at)#>>'{}' as "updatedAt",
            due_date as "dueDate"
          from goals
          order by created_at asc, id asc
        `),
        pgPool.query(`
          select
            id,
            person_id as "personId",
            title,
            role_context as "roleContext",
            source,
            status,
            scale_max as "scaleMax",
            average_score::float as "averageScore",
            min_score::float as "minScore",
            grade,
            competencies_json as "competencies",
            cases_json as "cases",
            recommendations_json as "recommendations",
            created_at as "createdAt",
            to_json(updated_at)#>>'{}' as "updatedAt",
            validated_at as "validatedAt"
          from competency_assessments
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
            is_template as "isTemplate",
            owner_user_id as "ownerUserId",
            anonymous_min_responses as "anonymousMinResponses",
            created_at as "createdAt"
          from surveys
          order by created_at asc
        `),
        pgPool.query(`
          select
            id,
            survey_id as "surveyId",
            person_id as "personId",
            respondent_hash as "respondentHash",
            secret_version as "secretVersion",
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
        pgPool.query("select person_id, body from meeting_drafts"),
        pgPool.query("select person_id, body from notes"),
        pgPool.query(`
          select
            id,
            username,
            name,
            role,
            person_id as "personId",
            lead_user_id as "leadUserId",
            team_label as "teamLabel",
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
      lprs: lprsResult.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt?.toISOString?.() || row.createdAt,
        updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt
      })),
      cards: cardsResult.rows,
      actions: actionsResult.rows,
      goals: goalsResult.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt?.toISOString?.() || row.createdAt
      })),
      competencyAssessments: competencyAssessmentsResult.rows.map((row) => ({
        ...row,
        competencies: Array.isArray(row.competencies) ? row.competencies : [],
        cases: Array.isArray(row.cases) ? row.cases : [],
        recommendations: Array.isArray(row.recommendations) ? row.recommendations : [],
        createdAt: row.createdAt?.toISOString?.() || row.createdAt,
        validatedAt: row.validatedAt?.toISOString?.() || row.validatedAt || ""
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
      meetingDrafts: Object.fromEntries(meetingDraftsResult.rows.map((row) => [row.person_id, row.body])),
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

async function writeDb(db, options = {}) {
  const replaceAuth = options.replaceAuth !== false;
  const normalized = normalizeDb(db);

  if (storageMode === "postgres") {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await syncWorkspace(client, normalized, {
        replaceAuth,
        pulseHistoryRetentionDays,
        surveySecretVersion,
        checkVersions: options.checkVersions === true
      });
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
  if (!replaceAuth && existsSync(dataFile)) {
    try {
      const current = normalizeDb(JSON.parse(readFileSync(dataFile, "utf8")));
      normalized.users = current.users;
      normalized.sessions = current.sessions;
    } catch {
      // If the local file cannot be read, fall back to writing the normalized
      // snapshot so the app can recover rather than failing the data save.
    }
  }
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

async function upsertMeetingPrep(client, personId, prep) {
  await client.query(
    `
      insert into prep (person_id, employee_agenda, manager_agenda, pulse, last_actions, growth, commitments)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (person_id) do update set
        employee_agenda = excluded.employee_agenda,
        manager_agenda = excluded.manager_agenda,
        pulse = excluded.pulse,
        last_actions = excluded.last_actions,
        growth = excluded.growth,
        commitments = excluded.commitments
    `,
    [
      personId,
      prep.employeeAgenda,
      prep.managerAgenda,
      prep.pulse,
      prep.lastActions,
      prep.growth,
      prep.commitments
    ]
  );
}

async function upsertMeetingPulse(client, personId, pulse) {
  await client.query(
    `
      insert into pulse (person_id, energy, load, clarity, trust)
      values ($1, $2, $3, $4, $5)
      on conflict (person_id) do update set
        energy = excluded.energy,
        load = excluded.load,
        clarity = excluded.clarity,
        trust = excluded.trust
    `,
    [personId, pulse.energy, pulse.load, pulse.clarity, pulse.trust]
  );
}

async function upsertMeetingPulseHistory(client, personId, pulse) {
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - pulseHistoryRetentionDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await client.query(
    `
      insert into pulse_history (person_id, captured_at, energy, load, clarity, trust)
      values ($1, $2::date, $3, $4, $5, $6)
      on conflict (person_id, captured_at) do update set
        energy = excluded.energy,
        load = excluded.load,
        clarity = excluded.clarity,
        trust = excluded.trust
    `,
    [personId, today, pulse.energy, pulse.load, pulse.clarity, pulse.trust]
  );
  await client.query("delete from pulse_history where captured_at < $1::date", [cutoff]);
}

async function upsertMeetingDraft(client, personId, body) {
  await client.query(
    `
      insert into meeting_drafts (person_id, body, updated_at)
      values ($1, $2, now())
      on conflict (person_id) do update set
        body = excluded.body,
        updated_at = now()
    `,
    [personId, body]
  );
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
  db.lprs = (db.lprs || []).filter((lpr) => lpr.personId !== personId);
  db.cards = db.cards.filter((card) => card.personId !== personId);
  db.actions = db.actions.filter((action) => action.personId !== personId);
  db.goals = (db.goals || []).filter((goal) => goal.personId !== personId);
  db.competencyAssessments = (db.competencyAssessments || []).filter((assessment) => assessment.personId !== personId);
  db.pulseHistory = (db.pulseHistory || []).filter((entry) => entry.personId !== personId);
  db.surveyResponses = (db.surveyResponses || []).filter((response) => response.personId !== personId);
  db.managerNotes = (db.managerNotes || []).filter((note) => note.personId !== personId);
  db.oncallLoad = (db.oncallLoad || []).filter((entry) => entry.personId !== personId);
  db.meetingLog = (db.meetingLog || []).filter((entry) => entry.personId !== personId);
  delete db.meetingDrafts[personId];
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
    leadUserId: user.leadUserId || null,
    teamLabel: user.teamLabel || "",
    createdAt: user.createdAt,
    canResetDemo: isPlatformAdmin(user) && demoResetAllowed
  };
}

// Секрет попал в .env — дописываем, чтобы разработчик не терял его при
// следующем запуске. Молча пропускаем, если файла нет или он read-only:
// в контейнере это норма, а падать из-за невозможности записать удобство
// незачем.
function appendToDotEnv(key, value) {
  const envFile = join(__dirname, ".env");
  try {
    if (!existsSync(envFile)) return false;
    const current = readFileSync(envFile, "utf8");
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    writeFileSync(
      envFile,
      pattern.test(current) ? current.replace(pattern, line) : `${current.replace(/\n?$/, "\n")}${line}\n`
    );
    return true;
  } catch {
    return false;
  }
}

function validateProductionSecrets() {
  if (appEnv !== "local" && appEnv !== "production") {
    console.error(`APP_ENV must be "local" or "production", got "${appEnv}".`);
    process.exit(1);
  }

  const fail = (message) => {
    console.error(message);
    process.exit(1);
  };

  // Не isProduction, а «всё, что не local». Формулировка устойчивее к
  // появлению staging: третье значение APP_ENV сейчас отвергается выше, но
  // когда его добавят, требование секретов не должно проехать мимо.
  if (appEnv !== "local") {
    if (!adminPassword) fail("ADMIN_PASSWORD обязателен вне local. Отказываюсь стартовать без пароля администратора.");
    if (adminPassword.length < 12) fail("ADMIN_PASSWORD короче 12 символов.");
    if (BURNED_SECRETS.has(adminPassword)) fail("ADMIN_PASSWORD входит в список скомпрометированных значений.");
    if (!surveyResponseSecret) fail("SURVEY_RESPONSE_SECRET обязателен вне local.");
    if (BURNED_SECRETS.has(surveyResponseSecret)) fail("SURVEY_RESPONSE_SECRET входит в список скомпрометированных значений.");
    if (surveyResponseSecret === adminPassword) {
      fail("SURVEY_RESPONSE_SECRET не может совпадать с ADMIN_PASSWORD: это делает анонимность опросов фиктивной.");
    }
    if (storageMode === "file" && !allowFileStorageInProduction) {
      fail("DATABASE_URL обязателен вне local. Отказываюсь стартовать с эфемерным файловым хранилищем.");
    }
    return;
  }

  // В local отсутствующий пароль — не повод не дать поработать. Генерируем,
  // показываем один раз и дописываем в .env, если он доступен на запись.
  if (!adminPassword) {
    adminPassword = randomBytes(24).toString("base64url");
    const saved = appendToDotEnv("ADMIN_PASSWORD", adminPassword);
    console.log("");
    console.log("  ADMIN_PASSWORD не задан. Сгенерирован пароль администратора:");
    console.log("");
    console.log(`      ${adminUsername} / ${adminPassword}`);
    console.log("");
    console.log(saved ? "  Записан в .env." : "  В .env записать не удалось — сохраните сами, иначе он потеряется.");
    console.log("");
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
        return [part.slice(0, index), safeDecodeURIComponent(part.slice(index + 1))];
      })
  );
}

function sessionCookie(sessionId) {
  const secure = isProduction ? "; Secure" : "";
  return `th_session=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}${secure}`;
}

function clearSessionCookie() {
  const secure = isProduction ? "; Secure" : "";
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
    let settled = false;
    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (body.length > 1_000_000) {
        settled = true;
        request.destroy();
        reject(new HttpError(413, "Слишком большой запрос"));
      }
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new HttpError(400, "Некорректный JSON"));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

// withDb: false для endpoint'ов, которым рабочее пространство не нужно.
// Раньше выбора не было — каждый запрос вычитывал базу целиком, включая
// таблицу users с salt и password_hash, ради проверки одной куки.
async function getAuthContext(request, options = {}) {
  const withDb = options.withDb !== false;
  const sessionId = parseCookies(request.headers.cookie).th_session;

  if (storageMode === "postgres") {
    const auth = await findSessionUser(pgPool, sessionId);
    if (!auth) return { db: withDb ? await readDb() : null, user: null, session: null };
    return { db: withDb ? await readDb() : null, user: auth.user, session: auth.session };
  }

  const db = await readDb();
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

async function requireAuth(request, response, options = {}) {
  const context = await getAuthContext(request, options);
  if (!context.user) {
    sendJson(response, 401, { error: "Требуется авторизация" });
    return null;
  }
  return context;
}

function isPlatformAdmin(user) {
  if (!user) return false;
  // Легаси-роль 'admin' убрана миграцией 0017: строки переведены в
  // 'platform_admin', констрейнт сужен. Проверять её больше не надо.
  return user.role === "platform_admin";
}

function isLead(user) {
  if (!user) return false;
  return user.role === "lead" || isPlatformAdmin(user);
}

function isPlainLead(user) {
  return user?.role === "lead";
}

// Legacy alias kept so all existing call-sites keep working. Treat "admin" as
// "can manage the visible team workspace" everywhere.
function isAdmin(user) {
  return isLead(user);
}

function isProtectedUser(user) {
  const username = String(user.username || "").toLowerCase();
  // Роль проверяется через isPlatformAdmin, а не по строке 'admin': после
  // миграции 0017 такого значения в базе нет, и сравнение со строкой тихо
  // сняло бы защиту с тех, кого раньше защищало.
  return isPlatformAdmin(user) || username === adminUsername.toLowerCase();
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

function teamLabelForUser(db, user) {
  if (!user) return "";
  if (user.teamLabel) return user.teamLabel;
  const person = user.personId ? db.people.find((item) => item.id === user.personId) : null;
  return person?.team || "";
}

function personInLeadTeam(db, lead, person) {
  if (!lead || !person) return false;
  if (lead.personId && lead.personId === person.id) return true;
  const linkedUser = db.users.find((user) => user.personId === person.id);
  if (linkedUser?.leadUserId) return linkedUser.leadUserId === lead.id;
  const leadTeam = normalizeTeamName(teamLabelForUser(db, lead));
  const personTeam = normalizeTeamName(person.team);
  return (
    !linkedUser &&
    leadTeam &&
    personTeam &&
    leadTeam === personTeam
  );
}

function userInLeadTeam(db, lead, user) {
  if (!lead || !user) return false;
  if (user.id === lead.id) return true;
  if (user.leadUserId) return user.leadUserId === lead.id;
  if (user.role === "lead" || user.role === "platform_admin") return false;
  const leadTeam = normalizeTeamName(teamLabelForUser(db, lead));
  const userTeam = normalizeTeamName(teamLabelForUser(db, user));
  return Boolean(leadTeam && userTeam && leadTeam === userTeam);
}

function scopedPersonIds(db, user) {
  if (isPlatformAdmin(user)) {
    return new Set(
      db.people
        .filter((person) => !isDemoOnlyPersonId(person.id))
        .filter((person) => !person.archivedAt)
        .map((person) => person.id)
    );
  }
  if (isDemoUser(user)) return new Set(["demo-sre"]);

  if (isPlainLead(user)) {
    return new Set(
      db.people
        .filter((person) => !isDemoOnlyPersonId(person.id))
        .filter((person) => !person.archivedAt)
        .filter((person) => personInLeadTeam(db, user, person))
        .map((person) => person.id)
    );
  }

  // Plain employee — only their own person
  if (user.personId) {
    const p = db.people.find((person) => person.id === user.personId);
    if (p && p.archivedAt) return new Set();
    return new Set([user.personId]);
  }
  return new Set();
}

function scopedUsers(db, user) {
  if (isPlatformAdmin(user)) {
    return db.users.filter((item) => !isDemoOnlyAccess(item)).map(publicUser);
  }
  if (isPlainLead(user)) {
    // Lead sees only their own team directory.
    return db.users
      .filter((item) => !isDemoOnlyAccess(item))
      .filter((item) => userInLeadTeam(db, user, item))
      .map(publicUser);
  }
  return [];
}

function surveyOwner(db, survey) {
  if (!survey?.ownerUserId) return null;
  return db.users.find((user) => user.id === survey.ownerUserId) || null;
}

function surveyAudiencePersonIds(db, survey) {
  if (survey?.isDemoSeed) return new Set(["demo-sre"]);
  const owner = surveyOwner(db, survey);
  if (!owner || isPlatformAdmin(owner)) {
    return new Set(
      db.people
        .filter((person) => !isDemoOnlyPersonId(person.id))
        .filter((person) => !person.archivedAt)
        .map((person) => person.id)
    );
  }
  return scopedPersonIds(db, owner);
}

function hasAnyPersonId(left, right) {
  for (const id of left) {
    if (right.has(id)) return true;
  }
  return false;
}

function canAccessSurvey(db, user, survey) {
  if (!survey || survey.isTemplate) return false;
  if (isDemoUser(user)) return Boolean(survey.isDemoSeed);
  if (survey.isDemoSeed) return false;

  const audienceIds = surveyAudiencePersonIds(db, survey);
  if (isAdmin(user)) {
    if (isPlatformAdmin(user)) return true;
    return survey.ownerUserId === user.id || hasAnyPersonId(scopedPersonIds(db, user), audienceIds);
  }

  return Boolean(user?.personId && audienceIds.has(user.personId));
}

function canManageSurvey(db, user, survey) {
  if (!survey || survey.isTemplate || !isAdmin(user)) return false;
  if (isPlatformAdmin(user)) return !survey.isDemoSeed;
  return survey.ownerUserId === user.id;
}

function canSeeSurveyTemplate(db, user, survey) {
  if (!survey?.isTemplate || survey.isDemoSeed || !isLead(user)) return false;
  if (isPlatformAdmin(user)) return true;
  return !survey.ownerUserId || survey.ownerUserId === user.id;
}

// Хеш респондента. Секрет в него входит, чтобы админ, знающий список
// userId, не мог перебором сопоставить анонимный ответ с автором.
function surveyRespondentHash(user, survey) {
  if (!user?.id || !survey?.id) return null;
  return createHash("sha256")
    .update(`${survey.id}:${user.id}:${surveyResponseSecret}`)
    .digest("hex");
}

function scopeWorkspace(db, user) {
  const ids = scopedPersonIds(db, user);
  const pickObject = (source) =>
    Object.fromEntries(Object.entries(source || {}).filter(([personId]) => ids.has(personId)));

  const allSurveys = db.surveys || [];
  // Demo seed surveys belong to the demo workspace; the admin's real team must
  // not see them so they do not look like a built-in fixed survey.
  // Templates are NOT delivered as regular surveys — they go to a separate
  // surveyTemplates collection for the composer's empty state.
  const visibleSurveys = allSurveys.filter((s) => canAccessSurvey(db, user, s));
  const userTemplates = isLead(user)
    ? allSurveys.filter((s) => canSeeSurveyTemplate(db, user, s))
    : [];
  const allResponses = db.surveyResponses || [];
  const scopedSurveys = visibleSurveys.map((survey) => {
    const responsesForSurvey = allResponses.filter((response) => response.surveyId === survey.id);
    const currentRespondentHash = survey.anonymous ? surveyRespondentHash(user, survey) : null;
    const scopedResponsesForSurvey = responsesForSurvey.filter((response) => {
      if (survey.anonymous) {
        if (canManageSurvey(db, user, survey)) return true;
        return Boolean(
          !isAdmin(user) &&
          currentRespondentHash &&
          response.respondentHash === currentRespondentHash &&
          response.secretVersion === surveySecretVersion
        );
      }
      if (isPlatformAdmin(user) || isDemoUser(user)) return true;
      return response.personId ? ids.has(response.personId) : false;
    });
    const myResponse = !isAdmin(user) && user.personId
      ? scopedResponsesForSurvey.find((response) =>
          survey.anonymous
            ? response.respondentHash === currentRespondentHash && response.secretVersion === surveySecretVersion
            : response.personId === user.personId
        ) || null
      : null;
    const aggregate = isAdmin(user) ? buildSurveyAggregate(survey, scopedResponsesForSurvey) : null;
    const responseList =
      isAdmin(user) && !survey.anonymous
        ? scopedResponsesForSurvey.map((response) => ({
              id: response.id,
              personId: response.personId,
              submittedAt: response.submittedAt,
              answers: response.answers
            }))
        : null;
    return {
      ...survey,
      responseCount: scopedResponsesForSurvey.length,
      myResponse: myResponse
        ? { id: myResponse.id, submittedAt: myResponse.submittedAt, answers: myResponse.answers }
        : null,
      aggregate,
      responses: responseList
    };
  });

  return {
    people: db.people.filter((person) => ids.has(person.id)),
    lprs: (db.lprs || []).filter((lpr) => ids.has(lpr.personId)),
    cards: db.cards.filter((card) => ids.has(card.personId)),
    actions: db.actions.filter((action) => ids.has(action.personId)),
    goals: (db.goals || []).filter((goal) => ids.has(goal.personId)),
    competencyAssessments: (db.competencyAssessments || []).filter((assessment) => ids.has(assessment.personId)),
    prep: pickObject(db.prep),
    pulse: pickObject(db.pulse),
    pulseHistory: (db.pulseHistory || []).filter((entry) => ids.has(entry.personId)),
    surveys: scopedSurveys,
    surveyTemplates: userTemplates.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      anonymous: s.anonymous,
      anonymousMinResponses: s.anonymousMinResponses,
      questions: s.questions
    })),
    notes: isAdmin(user) ? pickObject(db.notes) : {},
    managerNotes: isAdmin(user)
      ? (db.managerNotes || []).filter((note) => ids.has(note.personId))
      : [],
    oncallLoad: (db.oncallLoad || []).filter((entry) => ids.has(entry.personId)),
    meetingLog: (db.meetingLog || []).filter((entry) => ids.has(entry.personId)),
    meetingDrafts: pickObject(db.meetingDrafts),
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
  if (survey.anonymous && responses.length < (survey.anonymousMinResponses || 3)) {
    return {
      ...totals,
      hidden: true,
      minResponses: survey.anonymousMinResponses || 3
    };
  }
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
        redacted: survey.anonymous,
        samples: survey.anonymous ? [] : texts.slice(0, 30)
      };
    } else if (question.type === "date") {
      const dates = responses
        .map((response) => response.answers?.[question.id]?.value)
        .filter((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
        .sort();
      totals.perQuestion[question.id] = {
        count: dates.length,
        redacted: survey.anonymous,
        samples: survey.anonymous ? [] : dates.slice(0, 30)
      };
    }
  }
  return totals;
}

function sanitizeCard(card, personId, forcedSource = null, lprIds = new Set()) {
  const lprId = String(card.lprId || "").trim();
  return {
    id: String(card.id || makeId("card")),
    personId,
    lprId: lprIds.has(lprId) ? lprId : "",
    source: forcedSource || (card.source === "manager" ? "manager" : "employee"),
    category: ["checkin", "blocker", "growth", "feedback", "decision", "thanks"].includes(card.category)
      ? card.category
      : "checkin",
    priority: ["high", "medium", "low"].includes(card.priority) ? card.priority : "medium",
    status: ["todo", "discussing", "done"].includes(card.status) ? card.status : "todo",
    title: String(card.title || "").slice(0, 160),
    body: String(card.body || "").slice(0, 1000),
    // Версия строки для оптимистичной блокировки. Пробрасывается как есть:
    // это значение из базы, клиент его только возвращает.
    updatedAt: typeof card.updatedAt === "string" && card.updatedAt ? card.updatedAt : null
  };
}

function sanitizeAction(action, personId, forcedOwner = null) {
  const rawDueDate = String(action.dueDate || "").trim();
  const dueDate = isValidISODate(rawDueDate) ? rawDueDate : "";
  return {
    id: String(action.id || makeId("action")),
    personId,
    owner: forcedOwner || (action.owner === "employee" ? "employee" : "manager"),
    title: String(action.title || "").slice(0, 180),
    due: String(action.due || "к следующему 1:1").slice(0, 80),
    dueDate,
    done: Boolean(action.done),
    // Версия строки для оптимистичной блокировки. Пробрасывается как есть:
    // это значение из базы, клиент его только возвращает.
    updatedAt: typeof action.updatedAt === "string" && action.updatedAt ? action.updatedAt : null
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


function sanitizeSurvey(survey, users = []) {
  const questions = Array.isArray(survey?.questions) ? survey.questions : [];
  const sanitized = questions
    .slice(0, 30)
    .map((q, i) => sanitizeSurveyQuestion(q, `q${i + 1}`))
    .filter((q) => q.prompt.length > 0);
  const id = String(survey?.id || makeId("survey"));
  const ownerUserId = survey?.ownerUserId && users.some((user) => user.id === survey.ownerUserId)
    ? String(survey.ownerUserId)
    : null;
  return {
    id,
    title: String(survey?.title || "").slice(0, 200),
    description: String(survey?.description || "").slice(0, 1000),
    anonymous: Boolean(survey?.anonymous),
    status: survey?.status === "closed" ? "closed" : "active",
    // Legacy data files may miss this flag — fall back to recognising the known
    // seed id so the demo survey is still hidden from the admin's real workspace.
    isDemoSeed: Boolean(survey?.isDemoSeed) || demoSeedSurveyIds.has(id),
    isTemplate: Boolean(survey?.isTemplate),
    ownerUserId,
    anonymousMinResponses: clampInt(survey?.anonymousMinResponses, 2, 10, 3),
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
      if (isValidISODate(raw)) result[question.id] = { value: raw };
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
    respondentHash: response?.respondentHash ? String(response.respondentHash).slice(0, 128) : null,
    // Поколение секрета, в котором посчитан respondentHash. Ответы старых
    // поколений сохраняются как есть — пересчитать их хеш нельзя, исходный
    // секрет утрачен, и это ровно то свойство, ради которого он и нужен.
    secretVersion: clampInt(response?.secretVersion, 1, 1_000_000, surveySecretVersion),
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
  if (!isValidISODate(week)) return null;
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

function defaultPrepState() {
  return Object.fromEntries(prepKeys.map((key) => [key, false]));
}

function defaultPulseState() {
  return { energy: 6, load: 6, clarity: 6, trust: 7 };
}

function applyMeetingStatePatch(db, user, personId, body = {}) {
  const ids = scopedPersonIds(db, user);
  if (!ids.has(personId)) {
    return { ok: false, status: 404, error: "Участник не найден" };
  }

  const person = db.people.find((item) => item.id === personId);
  if (!person || person.archivedAt) {
    return { ok: false, status: 404, error: "Участник не найден" };
  }

  const changed = { prep: false, pulse: false, meetingDraft: false };
  const writablePrepKeys = isAdmin(user) ? adminWritablePrepKeys : employeeWritablePrepKeys;

  if (body.prep && typeof body.prep === "object") {
    const currentPrep = { ...defaultPrepState(), ...(db.prep?.[personId] || {}) };
    db.prep[personId] = sanitizePrepPatch(currentPrep, body.prep, writablePrepKeys);
    changed.prep = true;
  }

  if (body.pulse && typeof body.pulse === "object") {
    const currentPulse = { ...defaultPulseState(), ...(db.pulse?.[personId] || {}) };
    db.pulse[personId] = sanitizePulsePatch(currentPulse, body.pulse);
    snapshotPulse(db);
    changed.pulse = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, "meetingDraft")) {
    db.meetingDrafts[personId] = String(body.meetingDraft || "").slice(0, 12000);
    changed.meetingDraft = true;
  }

  return {
    ok: true,
    changed,
    state: {
      personId,
      prep: { ...defaultPrepState(), ...(db.prep?.[personId] || {}) },
      pulse: { ...defaultPulseState(), ...(db.pulse?.[personId] || {}) },
      meetingDraft: db.meetingDrafts?.[personId] || ""
    }
  };
}

async function persistMeetingStatePatch(db, personId, state, changed) {
  if (storageMode === "postgres") {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      if (changed.prep) {
        await upsertMeetingPrep(client, personId, state.prep);
      }
      if (changed.pulse) {
        await upsertMeetingPulse(client, personId, state.pulse);
        await upsertMeetingPulseHistory(client, personId, state.pulse);
      }
      if (changed.meetingDraft) {
        await upsertMeetingDraft(client, personId, state.meetingDraft);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  await writeDb(db, { replaceAuth: false });
}

function sanitizeLpr(lpr, personId) {
  return {
    id: String(lpr.id || makeId("lpr")),
    personId,
    title: String(lpr.title || "").slice(0, 200),
    focus: String(lpr.focus || "").slice(0, 2000),
    status: lprStatuses.includes(lpr.status) ? lpr.status : "active",
    createdAt: typeof lpr.createdAt === "string" && lpr.createdAt ? lpr.createdAt : new Date().toISOString(),
    updatedAt: typeof lpr.updatedAt === "string" && lpr.updatedAt ? lpr.updatedAt : new Date().toISOString()
  };
}

function sanitizeGoal(goal, personId, lprIds = new Set()) {
  const lprId = String(goal.lprId || "").trim();
  const dueDate = String(goal.dueDate || "").trim();
  return {
    id: String(goal.id || makeId("goal")),
    personId,
    lprId: lprIds.has(lprId) ? lprId : "",
    title: String(goal.title || "").slice(0, 200),
    description: String(goal.description || "").slice(0, 1500),
    horizon: String(goal.horizon || "").slice(0, 32),
    progress: clampInt(goal.progress, 0, 100, 0),
    status: goalStatuses.includes(goal.status) ? goal.status : "active",
    createdAt: typeof goal.createdAt === "string" && goal.createdAt ? goal.createdAt : new Date().toISOString(),
    dueDate: isValidISODate(dueDate) ? dueDate : "",
    // Версия строки для оптимистичной блокировки. Пробрасывается как есть:
    // это значение из базы, клиент его только возвращает.
    updatedAt: typeof goal.updatedAt === "string" && goal.updatedAt ? goal.updatedAt : null
  };
}

function clampScore(value, min, max, fallback) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : fallback;
  return Math.max(min, Math.min(max, Math.round(safe * 10) / 10));
}

function competencyGradeFromScores(scores) {
  if (!scores.length) return { averageScore: 0, minScore: 0, grade: "junior" };
  const averageScore = Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
  const minScore = Math.round(Math.min(...scores) * 10) / 10;
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
  const grade = order[byAverage] <= order[byThreshold] ? byAverage : byThreshold;
  return { averageScore, minScore, grade };
}

function sanitizeCompetencyAssessment(assessment = {}, personId) {
  const scaleMax = clampInt(assessment.scaleMax, 1, 10, 5);
  const competencies = (Array.isArray(assessment.competencies) ? assessment.competencies : [])
    .slice(0, 30)
    .map((competency) => {
      const name = String(competency?.name || "").trim().slice(0, 160);
      if (!name) return null;
      const score = clampScore(competency.score, 0, scaleMax, 0);
      return {
        id: String(competency.id || makeId("competency")),
        name,
        category: String(competency.category || "").trim().slice(0, 120),
        score,
        targetScore: clampScore(competency.targetScore, 0, scaleMax, Math.min(scaleMax, Math.max(score, 3))),
        evidence: String(competency.evidence || "").trim().slice(0, 1200),
        recommendation: String(competency.recommendation || "").trim().slice(0, 1200)
      };
    })
    .filter(Boolean);
  const grade = competencyGradeFromScores(competencies.map((competency) => competency.score));
  const cases = (Array.isArray(assessment.cases) ? assessment.cases : [])
    .slice(0, 12)
    .map((item) => {
      const title = String(item?.title || "").trim().slice(0, 180);
      if (!title) return null;
      return {
        id: String(item.id || makeId("case")),
        title,
        summary: String(item.summary || "").trim().slice(0, 1200),
        checkedCompetencies: Array.isArray(item.checkedCompetencies)
          ? item.checkedCompetencies.map((value) => String(value || "").trim().slice(0, 160)).filter(Boolean).slice(0, 12)
          : []
      };
    })
    .filter(Boolean);
  const recommendations = (Array.isArray(assessment.recommendations) ? assessment.recommendations : [])
    .slice(0, 20)
    .map((item) => {
      const action = String(item?.action || "").trim().slice(0, 500);
      if (!action) return null;
      const dueDate = String(item.dueDate || "").trim();
      return {
        id: String(item.id || makeId("competency-action")),
        competencyName: String(item.competencyName || "").trim().slice(0, 160),
        action,
        dueDate: isValidISODate(dueDate) ? dueDate : ""
      };
    })
    .filter(Boolean);

  return {
    id: String(assessment.id || makeId("assessment")),
    personId,
    title: String(assessment.title || "Кейс-интервью по компетенциям").trim().slice(0, 200),
    roleContext: String(assessment.roleContext || "").trim().slice(0, 200),
    source: competencyAssessmentSources.includes(assessment.source) ? assessment.source : "case-ai",
    status: competencyAssessmentStatuses.includes(assessment.status) ? assessment.status : "draft",
    scaleMax,
    averageScore: grade.averageScore,
    minScore: grade.minScore,
    grade: grade.grade,
    competencies,
    cases,
    recommendations,
    createdAt: typeof assessment.createdAt === "string" && assessment.createdAt ? assessment.createdAt : new Date().toISOString(),
    validatedAt: typeof assessment.validatedAt === "string" && assessment.validatedAt ? assessment.validatedAt : ""
  };
}

function mergeWorkspaceUpdate(db, user, incoming) {
  const ids = scopedPersonIds(db, user);
  const incomingHasLprs = Array.isArray(incoming.lprs);
  const incomingLprs = incomingHasLprs ? incoming.lprs : [];
  const incomingCards = Array.isArray(incoming.cards) ? incoming.cards : [];
  const incomingActions = Array.isArray(incoming.actions) ? incoming.actions : [];
  const incomingGoals = Array.isArray(incoming.goals) ? incoming.goals : [];
  const incomingHasAssessments = Array.isArray(incoming.competencyAssessments);
  const incomingAssessments = incomingHasAssessments ? incoming.competencyAssessments : [];

  if (isAdmin(user)) {
    const hiddenLprs = (db.lprs || []).filter((lpr) => !ids.has(lpr.personId));
    const visibleLprs = (incomingHasLprs ? incomingLprs : (db.lprs || []).filter((lpr) => ids.has(lpr.personId)))
      .filter((lpr) => ids.has(lpr.personId))
      .map((lpr) => sanitizeLpr(lpr, lpr.personId));
    const visibleLprIds = new Set(visibleLprs.map((lpr) => lpr.id));
    const hiddenCards = db.cards.filter((card) => !ids.has(card.personId));
    const hiddenActions = db.actions.filter((action) => !ids.has(action.personId));
    const hiddenGoals = (db.goals || []).filter((goal) => !ids.has(goal.personId));
    const hiddenAssessments = (db.competencyAssessments || []).filter((assessment) => !ids.has(assessment.personId));
    db.lprs = [...hiddenLprs, ...visibleLprs];
    db.cards = incomingCards
      .filter((card) => ids.has(card.personId))
      .map((card) => sanitizeCard(card, card.personId, null, visibleLprIds));
    db.cards = [...hiddenCards, ...db.cards];
    db.actions = incomingActions
      .filter((action) => ids.has(action.personId))
      .map((action) => sanitizeAction(action, action.personId));
    db.actions = [...hiddenActions, ...db.actions];
    db.goals = [
      ...hiddenGoals,
      ...incomingGoals
        .filter((goal) => ids.has(goal.personId))
        .map((goal) => sanitizeGoal(goal, goal.personId, visibleLprIds))
    ];
    db.competencyAssessments = [
      ...hiddenAssessments,
      ...(incomingHasAssessments
        ? incomingAssessments
        : (db.competencyAssessments || []).filter((assessment) => ids.has(assessment.personId)))
        .filter((assessment) => assessment && ids.has(assessment.personId))
        .map((assessment) => sanitizeCompetencyAssessment(assessment, assessment.personId))
    ];
    db.prep = mergePrepUpdate(db.prep, incoming.prep, ids, adminWritablePrepKeys);
    db.pulse = mergePulseUpdate(db.pulse, incoming.pulse, ids);
    db.notes = mergeNotesUpdate(db.notes, incoming.notes, ids);
    db.meetingDrafts = mergeMeetingDraftsUpdate(db.meetingDrafts, incoming.meetingDrafts, ids);
    snapshotPulse(db);
    return db;
  }

  const personId = user.personId;
  if (!personId) return db;

  const otherLprs = (db.lprs || []).filter((lpr) => lpr.personId !== personId);
  const personLprs = (incomingHasLprs ? incomingLprs : (db.lprs || []).filter((lpr) => lpr.personId === personId))
    .filter((lpr) => lpr.personId === personId)
    .map((lpr) => sanitizeLpr(lpr, personId));
  const personLprIds = new Set(personLprs.map((lpr) => lpr.id));
  db.lprs = [...otherLprs, ...personLprs];

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
      preservedCards.push(sanitizeCard(incomingCard, personId, "employee", personLprIds));
    }
  }

  const newEmployeeCards = incomingCards
    .filter((card) => card.personId === personId && card.source === "employee" && !employeeCardIds.has(String(card.id)))
    .map((card) => sanitizeCard(card, personId, "employee", personLprIds));

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
    .map((goal) => sanitizeGoal(goal, personId, personLprIds));
  db.goals = [...otherGoals, ...personGoals];

  db.prep[personId] = sanitizePrepPatch(db.prep[personId] || {}, incoming.prep?.[personId] || {}, employeeWritablePrepKeys);
  db.pulse[personId] = sanitizePulsePatch(db.pulse[personId] || {}, incoming.pulse?.[personId] || {});
  db.meetingDrafts = mergeMeetingDraftsUpdate(db.meetingDrafts, incoming.meetingDrafts, new Set([personId]));
  snapshotPulse(db);
  return db;
}

async function handleApi(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(request);
    const username = String(body.username || "").trim();

    if (isLoginRateLimited(request, username)) {
      sendJson(response, 429, { error: "Слишком много попыток входа. Попробуйте позже" });
      return;
    }

    const user =
      storageMode === "postgres"
        ? await findUserByUsername(pgPool, username)
        : (await readDb()).users.find((item) => item.username.toLowerCase() === username.toLowerCase());
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
    if (storageMode === "postgres") {
      await createSession(pgPool, session);
    } else {
      const db = await readDb();
      db.sessions = [...db.sessions.filter((item) => item.userId !== user.id), session];
      await writeDb(db);
    }
    clearFailedLogins(request, username);
    sendJson(response, 200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(session.id) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const context = await getAuthContext(request, { withDb: storageMode !== "postgres" });
    if (context.session) {
      if (storageMode === "postgres") {
        await deleteSession(pgPool, context.session.id);
      } else {
        context.db.sessions = context.db.sessions.filter((session) => session.id !== context.session.id);
        await writeDb(context.db);
      }
    }
    sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    // Рабочее пространство здесь не нужно: отвечаем одним пользователем.
    const context = await requireAuth(request, response, { withDb: storageMode !== "postgres" });
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
    if (storageMode === "postgres") {
      // Точечный update вместо перезаписи шестнадцати таблиц. Именно здесь
      // раньше сбрасывался created_at у карточек: переименование
      // пользователя переписывало всю базу.
      await updateUserName(pgPool, context.user.id, context.user.name);
    } else {
      await writeDb(context.db);
    }
    sendJson(response, 200, {
      user: publicUser(context.user),
      workspace: scopeWorkspace(await readDb(), context.user)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/me/password") {
    const context = await requireAuth(request, response, { withDb: storageMode !== "postgres" });
    if (!context) return;
    if (isDemoUser(context.user)) {
      sendJson(response, 403, { error: "Демо-пароль управляется через переменные окружения" });
      return;
    }
    if (isProtectedUser(context.user) && context.user.username.toLowerCase() === adminUsername.toLowerCase()) {
      // Seed platform-admin password is governed by ADMIN_PASSWORD env var.
      // Allow self-change only if it's NOT the seed username. (For now we keep
      // the env-managed seed account immutable — change ADMIN_PASSWORD instead.)
      sendJson(response, 400, { error: "Пароль системного админа управляется через переменные окружения" });
      return;
    }
    const body = await readJson(request);
    const password = String(body.password || "");
    if (password.length < 8) {
      sendJson(response, 400, { error: "Пароль должен быть не короче 8 символов" });
      return;
    }
    const credentials = hashPassword(password);
    Object.assign(context.user, credentials);
    if (storageMode === "postgres") {
      await updateUserPassword(pgPool, context.user.id, credentials);
      // Текущая сессия остаётся, остальные гаснут: смена пароля обязана
      // выкинуть всех, кто знал старый, но не того, кто её делает.
      await deleteOtherSessions(pgPool, context.user.id, context.session.id);
    } else {
      context.db.sessions = context.db.sessions.filter(
        (s) => s.userId !== context.user.id || s.id === context.session.id
      );
      await writeDb(context.db);
    }
    sendJson(response, 200, { ok: true });
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
    try {
      await writeDb(nextDb, { replaceAuth: false, checkVersions: true });
    } catch (error) {
      if (!(error instanceof VersionConflictError)) throw error;
      // Кто-то успел сохранить те же сущности раньше. Отдаём актуальное
      // состояние: клиент должен показать конфликт, а не молча затереть
      // чужие правки повторной отправкой.
      const current = await readDb();
      console.warn(
        `Конфликт версий при сохранении: ${error.conflicts.map((c) => `${c.table}:${c.id}`).join(", ")}`
      );
      sendJson(response, 409, {
        error: "Данные изменились в другом месте. Обновите страницу и повторите",
        conflicts: error.conflicts,
        workspace: scopeWorkspace(current, context.user)
      });
      return;
    }
    // Читаем заново: в снимке из памяти лежат версии строк до записи,
    // и клиент запомнил бы устаревший updatedAt.
    sendJson(response, 200, scopeWorkspace(await readDb(), context.user));
    return;
  }

  const meetingStateMatch = url.pathname.match(/^\/api\/people\/([^/]+)\/meeting-state$/);
  if (request.method === "PATCH" && meetingStateMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    const personId = safeDecodeURIComponent(meetingStateMatch[1]);
    const body = await readJson(request);
    const patch = applyMeetingStatePatch(context.db, context.user, personId, body);
    if (!patch.ok) {
      sendJson(response, patch.status, { error: patch.error });
      return;
    }

    await persistMeetingStatePatch(context.db, personId, patch.state, patch.changed);
    const refreshed = await readDb();
    sendJson(response, 200, {
      meetingState: patch.state,
      workspace: scopeWorkspace(refreshed, context.user)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/users") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isLead(context.user)) {
      sendJson(response, 403, { error: "Только администратор платформы или тимлид может создавать логины" });
      return;
    }

    const body = await readJson(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const personId = String(body.personId || "");
    // Requested role from the client; only platform admins can create leads.
    const requestedRole = ["lead", "employee"].includes(body.role) ? body.role : "employee";
    if (!isPlatformAdmin(context.user) && requestedRole === "lead") {
      sendJson(response, 403, { error: "Только администратор платформы может создавать тимлидов" });
      return;
    }
    let leadUserId = null;
    if (requestedRole === "employee") {
      if (isPlainLead(context.user)) {
        leadUserId = context.user.id;
      } else if (body.leadUserId) {
        const proposed = context.db.users.find((u) => u.id === body.leadUserId);
        if (proposed && isPlainLead(proposed)) leadUserId = proposed.id;
      }
    }
    let person = personId ? context.db.people.find((item) => item.id === personId) : null;
    const callerTeamLabel = teamLabelForUser(context.db, context.user);

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

    if (person && isPlainLead(context.user) && !personInLeadTeam(context.db, context.user, person)) {
      sendJson(response, 403, { error: "Тимлид может выдавать логины только своей команде" });
      return;
    }

    if (requestedRole === "lead") {
      const name = String(body.name || body.personName || "").trim();
      const teamLabel = String(body.teamLabel || body.personTeam || body.team || "").trim();
      if (name.length < 2) {
        sendJson(response, 400, { error: "Укажите имя тимлида" });
        return;
      }
      if (teamLabel.length < 2) {
        sendJson(response, 400, { error: "Укажите команду тимлида" });
        return;
      }
      const user = {
        id: makeId("user"),
        username,
        name: name.slice(0, 120),
        role: "lead",
        personId: person?.id || null,
        leadUserId: null,
        teamLabel: teamLabel.slice(0, 120),
        createdAt: new Date().toISOString(),
        ...hashPassword(password)
      };

      context.db.users.push(user);
      await writeDb(context.db);
      sendJson(response, 201, {
        user: publicUser(user),
        person: person || null,
        workspace: scopeWorkspace(await readDb(), context.user)
      });
      return;
    }

    if (!person) {
      const name = String(body.personName || body.name || "").trim();
      const role = String(body.personRole || body.role || "Team Member").trim();
      const leadUser = leadUserId ? context.db.users.find((u) => u.id === leadUserId) : null;
      const team = String(isPlainLead(context.user) ? callerTeamLabel : body.personTeam || body.team || leadUser?.teamLabel || "Product").trim();

      if (name.length < 2) {
        sendJson(response, 400, { error: "Укажите имя участника" });
        return;
      }

      if (isPlainLead(context.user) && team.length < 2) {
        sendJson(response, 400, { error: "У тимлида не задана команда" });
        return;
      }

      person = context.db.people.find(
        (item) =>
          !isDemoOnlyPersonId(item.id) &&
          item.name.toLowerCase() === name.toLowerCase() &&
          (!isPlainLead(context.user) || personInLeadTeam(context.db, context.user, item)) &&
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
        context.db.meetingDrafts[person.id] = "";
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
      role: requestedRole,
      personId: person.id,
      leadUserId,
      teamLabel: String(isPlainLead(context.user) ? callerTeamLabel || person.team : body.teamLabel || body.personTeam || person.team || "").slice(0, 120),
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
      workspace: scopeWorkspace(await readDb(), context.user)
    });
    return;
  }

  const userPasswordMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/password$/);
  if (request.method === "POST" && userPasswordMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isPlatformAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор платформы может менять пароли" });
      return;
    }

    const targetUser = context.db.users.find((item) => item.id === safeDecodeURIComponent(userPasswordMatch[1]));
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

  const userPatchMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (request.method === "PATCH" && userPatchMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isPlatformAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор платформы может менять иерархию" });
      return;
    }
    const target = context.db.users.find((u) => u.id === safeDecodeURIComponent(userPatchMatch[1]));
    if (!target || isDemoOnlyAccess(target)) {
      sendJson(response, 404, { error: "Пользователь не найден" });
      return;
    }
    if (isProtectedUser(target)) {
      sendJson(response, 400, { error: "Системный аккаунт нельзя изменять из интерфейса" });
      return;
    }
    const body = await readJson(request);
    if (["platform_admin", "lead", "employee"].includes(body.role)) {
      target.role = body.role;
    }
    if (body.leadUserId === null) {
      target.leadUserId = null;
    } else if (typeof body.leadUserId === "string" && body.leadUserId) {
      const proposed = context.db.users.find((u) => u.id === body.leadUserId);
      if (proposed && isPlainLead(proposed) && proposed.id !== target.id) {
        target.leadUserId = proposed.id;
      }
    }
    if (typeof body.teamLabel === "string") {
      target.teamLabel = body.teamLabel.slice(0, 120);
    }
    await writeDb(context.db);
    const refreshed = await readDb();
    sendJson(response, 200, {
      user: publicUser(refreshed.users.find((u) => u.id === target.id)),
      workspace: scopeWorkspace(refreshed, context.user)
    });
    return;
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (request.method === "DELETE" && userMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isPlatformAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор платформы может удалять логины" });
      return;
    }

    const targetUser = context.db.users.find((item) => item.id === safeDecodeURIComponent(userMatch[1]));
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
    if (!isPlatformAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор платформы может управлять командой" });
      return;
    }

    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const role = String(body.role || "Team Member").trim();
    const team = String(body.team || "Product").trim();

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
    context.db.meetingDrafts[person.id] = "";
    await writeDb(context.db, { replaceAuth: false });
    sendJson(response, 201, { person, workspace: scopeWorkspace(await readDb(), context.user) });
    return;
  }

  const personMatch = url.pathname.match(/^\/api\/people\/([^/]+)$/);
  if (request.method === "PATCH" && personMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isPlatformAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор платформы может изменять участников" });
      return;
    }
    const personId = safeDecodeURIComponent(personMatch[1]);
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
    await writeDb(context.db, { replaceAuth: false });
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
    if (!isPlatformAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор платформы может удалять участников" });
      return;
    }

    const personId = safeDecodeURIComponent(personMatch[1]);
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
    if (!isPlatformAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор платформы может восстанавливать участников" });
      return;
    }
    const personId = safeDecodeURIComponent(personRestoreMatch[1]);
    const target = context.db.people.find((p) => p.id === personId);
    if (!target) {
      sendJson(response, 404, { error: "Участник не найден" });
      return;
    }
    target.archivedAt = null;
    await writeDb(context.db, { replaceAuth: false });
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/meetings/log") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Лог встреч ведёт лид команды" });
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
    await writeDb(context.db, { replaceAuth: false });
    const refreshed = await readDb();
    sendJson(response, 201, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/oncall/ingest") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "On-call ingest доступен только лиду команды" });
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
    await writeDb(context.db, { replaceAuth: false });
    const refreshed = await readDb();
    sendJson(response, 200, { ingested: cleaned.length, workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/manager-notes") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Заметки лида доступны только лиду команды" });
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
    await writeDb(context.db, { replaceAuth: false });
    const refreshed = await readDb();
    sendJson(response, 201, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  const managerNoteMatch = url.pathname.match(/^\/api\/manager-notes\/([^/]+)$/);
  if (request.method === "DELETE" && managerNoteMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Заметки лида доступны только лиду команды" });
      return;
    }
    const noteId = safeDecodeURIComponent(managerNoteMatch[1]);
    const ids = scopedPersonIds(context.db, context.user);
    const note = (context.db.managerNotes || []).find((item) => item.id === noteId);
    if (!note || !ids.has(note.personId)) {
      sendJson(response, 404, { error: "Заметка не найдена" });
      return;
    }
    context.db.managerNotes = (context.db.managerNotes || []).filter((note) => note.id !== noteId);
    await writeDb(context.db, { replaceAuth: false });
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/surveys") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только лид команды может создавать опросы" });
      return;
    }
    const body = await readJson(request);
    const survey = sanitizeSurvey({
      title: body.title,
      description: body.description,
      anonymous: body.anonymous,
      status: "active",
      ownerUserId: context.user.id,
      anonymousMinResponses: body.anonymousMinResponses,
      questions: body.questions
    }, context.db.users);
    if (!survey.title || survey.questions.length === 0) {
      sendJson(response, 400, { error: "Название и хотя бы один вопрос обязательны" });
      return;
    }
    context.db.surveys = [...(context.db.surveys || []), survey];
    await writeDb(context.db, { replaceAuth: false });
    const refreshed = await readDb();
    sendJson(response, 201, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  const surveyTemplateMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/template$/);
  if (request.method === "POST" && surveyTemplateMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isLead(context.user)) {
      sendJson(response, 403, { error: "Только лид может сохранять шаблоны" });
      return;
    }
    const sourceId = safeDecodeURIComponent(surveyTemplateMatch[1]);
    const source = (context.db.surveys || []).find((s) => s.id === sourceId);
    if (!source || !canAccessSurvey(context.db, context.user, source)) {
      sendJson(response, 404, { error: "Опрос не найден" });
      return;
    }
    const template = sanitizeSurvey({
      title: source.title,
      description: source.description,
      anonymous: source.anonymous,
      status: "active",
      isTemplate: true,
      ownerUserId: context.user.id,
      anonymousMinResponses: source.anonymousMinResponses,
      questions: source.questions
    }, context.db.users);
    context.db.surveys = [...(context.db.surveys || []), template];
    await writeDb(context.db, { replaceAuth: false });
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  const surveyDeleteMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)$/);
  if (request.method === "DELETE" && surveyDeleteMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isAdmin(context.user)) {
      sendJson(response, 403, { error: "Только лид команды может удалять опросы" });
      return;
    }
    const surveyId = safeDecodeURIComponent(surveyDeleteMatch[1]);
    const survey = (context.db.surveys || []).find((item) => item.id === surveyId);
    if (!survey || !canManageSurvey(context.db, context.user, survey)) {
      sendJson(response, 404, { error: "Опрос не найден" });
      return;
    }
    // Admin delete is authoritative — even legacy demo-seed surveys are wiped so
    // they don't reappear after future reads of older workspace.json files.
    context.db.surveys = (context.db.surveys || []).filter((survey) => survey.id !== surveyId);
    context.db.surveyResponses = (context.db.surveyResponses || []).filter((response) => response.surveyId !== surveyId);
    // Block seed re-injection for this id by replacing initialSurveys clone in DB
    // is not needed here: createSeedDb is only called on explicit /api/reset.
    await writeDb(context.db, { replaceAuth: false });
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  const surveyRespondMatch = url.pathname.match(/^\/api\/surveys\/([^/]+)\/respond$/);
  if (request.method === "POST" && surveyRespondMatch) {
    const context = await requireAuth(request, response);
    if (!context) return;
    const surveyId = safeDecodeURIComponent(surveyRespondMatch[1]);
    const survey = (context.db.surveys || []).find((item) => item.id === surveyId);
    if (!survey || survey.status !== "active" || !canAccessSurvey(context.db, context.user, survey)) {
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
      const respondentHash = surveyRespondentHash(context.user, survey);
      // Совпадение ищем внутри текущего поколения секрета: ответ, посчитанный
      // старым секретом, сравнивать не с чем.
      const existingIndex = context.db.surveyResponses.findIndex(
        (response) =>
          response.surveyId === survey.id &&
          response.respondentHash === respondentHash &&
          response.secretVersion === surveySecretVersion
      );
      const anonymousResponse = {
        id: makeId("response"),
        surveyId: survey.id,
        personId: null,
        respondentHash,
        secretVersion: surveySecretVersion,
        answers: sanitizedAnswers,
        submittedAt: new Date().toISOString()
      };
      if (existingIndex >= 0) {
        context.db.surveyResponses[existingIndex] = {
          ...context.db.surveyResponses[existingIndex],
          respondentHash,
          secretVersion: surveySecretVersion,
          answers: sanitizedAnswers,
          submittedAt: anonymousResponse.submittedAt
        };
      } else {
        context.db.surveyResponses.push(anonymousResponse);
      }
    }

    await writeDb(context.db, { replaceAuth: false });
    const refreshed = await readDb();
    sendJson(response, 200, { workspace: scopeWorkspace(refreshed, context.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    const context = await requireAuth(request, response);
    if (!context) return;
    if (!isPlatformAdmin(context.user)) {
      sendJson(response, 403, { error: "Только администратор платформы может сбросить демо" });
      return;
    }
    if (!demoResetAllowed) {
      sendJson(response, 403, { error: "Сброс демо-данных отключён в production" });
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
      { ok: true, user: publicUser(admin), workspace: scopeWorkspace(await readDb(), admin) },
      { "Set-Cookie": sessionCookie(session.id) }
    );
    return;
  }

  sendJson(response, 404, { error: "API endpoint not found" });
}

async function isStorageReady() {
  if (storageMode === "postgres") {
    if (!pgPool) return false;
    // Живого соединения мало: под с базой, до которой миграции не доехали,
    // трафик принимать не должен.
    if (!schemaReady) return false;
    await pgPool.query("SELECT 1");
    return true;
  }
  return existsSync(dataFile);
}

// Liveness and readiness are deliberately separate: /healthz answers as long as the
// process is running, /readyz also requires storage, so a rollout does not send
// traffic to a pod that cannot reach the database.
async function handleHealth(pathname, request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (pathname === "/healthz") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  try {
    const ready = await isStorageReady();
    sendJson(response, ready ? 200 : 503, {
      status: ready ? "ok" : "unavailable",
      storage: storageMode
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 503, { status: "unavailable", storage: storageMode });
  }
}

function safeResolve(pathname) {
  let decoded = "/";
  try {
    decoded = decodeURIComponent(pathname.split("?")[0]);
  } catch {
    decoded = "/";
  }
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

const server = createServer((request, response) => {
  const pathname = (request.url || "/").split("?")[0];

  if (pathname === "/healthz" || pathname === "/readyz") {
    handleHealth(pathname, request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) {
        sendJson(response, 503, { status: "unavailable" });
      } else {
        response.end();
      }
    });
    return;
  }

  if ((request.url || "").startsWith("/api/")) {
    handleApi(request, response).catch((error) => {
      console.error(error);
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "Внутренняя ошибка сервера";
      if (!response.headersSent) {
        sendJson(response, status, { error: message });
      } else {
        response.end();
      }
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
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Team Health 1:1 is listening on ${port} (${appEnv})`);
});

const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10_000;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  const forceExit = setTimeout(() => {
    console.error(`Graceful shutdown exceeded ${shutdownTimeoutMs}ms, forcing exit`);
    process.exit(1);
  }, shutdownTimeoutMs);
  forceExit.unref();

  server.close(async () => {
    try {
      await pgPool?.end();
    } catch (error) {
      console.error(error);
    }
    clearTimeout(forceExit);
    process.exit(0);
  });

  // Keep-alive sockets would otherwise hold the server open until the timeout.
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
