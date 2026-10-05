import { useAppearance } from "./appearance.js";
import Shell from "./shell/Shell.jsx";
import HomeScreen from "./screens/Home.jsx";
// @screens:meetings
import LprsScreen from "./screens/Lprs.jsx";
import GoalsScreen from "./screens/Goals.jsx";
import SurveysScreen from "./screens/Surveys.jsx";
import ReportsScreen from "./screens/Reports.jsx";
import TeamScreen from "./screens/Team.jsx";
import AdminScreen from "./screens/Admin.jsx";
import CreateLoginCard from "./screens/team/CreateLoginCard.jsx";
import DeleteConfirm from "./screens/team/DeleteConfirm.jsx";
import AuthScreen from "./screens/Auth.jsx";
import SettingsScreen from "./screens/Settings.jsx";
import UserMenu from "./shell/UserMenu.jsx";
import MoreTab from "./shell/MoreTab.jsx";
import CommandPalette from "./shell/CommandPalette.jsx";
import { Kbd } from "./ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { toCsv } from "./csv.js";
import {
  emptyWorkspace,
  goalStatusLabel,
  goalStatusOrder,
  lprStatusLabel,
  lprStatusOrder,
  competencyGradeLabel,
  competencySourceLabel,
  todayISODate,
  ruMonthsFull,
  ruWeekdaysShort,
  formatDateRu,
  duplicateTitleKey,
  clampRangeValue,
  parseScoreValue,
  formatScoreValue,
  competencyGradeFromScores,
  competencyKey,
  competencyTone,
  parseCompetencyRows,
  buildMonthGrid,
  DatePicker,
  categories,
  checklist,
  meetingTypeLabel,
  mentorshipModeLabel,
  mentorshipModeHint,
  baseQuestionSeeds,
  questionSeedsByMeetingType,
  questionSeedsByMode,
  getQuestionSeeds,
  managerNoteTagLabel,
  managerNoteTagOrder,
  formatRuDate,
  sectionRegistry,
  primarySections,
  sectionDescriptionFor,
  roleLabel,
  surveyQuestionTypeLabel,
  emptyQuestionFor,
  templateQuestion,
  surveyTemplates,
  pulseSeries,
  LineChart,
  ScoreLineChart,
  BarChart,
  makeId,
  scorePulse,
  heatmapTone,
  priorityLabel,
  sourceLabel,
  sourceTone,
  ownerLabel,
  pluralizeRu,
  countLabel,
  meetingSortValue,
  isDemoAccess,
  isPlatformAdminRole,
  isLeadRole,
  isProtectedAccess,
  ApiError,
  ANONYMOUS_MIN_RESPONSES,
  ANONYMOUS_MAX_RESPONSES,
  clampAnonymousMin,
  apiFetch,
  scrollBehavior,
  KNOWN_ID_TABLES,
  collectRowIds,
  SAVE_RETRY_FIRST_MS,
  SAVE_RETRY_MAX_MS,
  isRetryableError
} from "./lib/shared.jsx";

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

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [activeSection, setActiveSection] = useState("home");
  const [activeView, setActiveView] = useState("agenda");
  const [activeFilter, setActiveFilter] = useState("all");
  const [loginError, setLoginError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveRetryTick, setSaveRetryTick] = useState(0);
  // 409 при сохранении: {conflicts, workspace} с актуальным состоянием сервера.
  const [conflict, setConflict] = useState(null);
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
  // Ошибки отделены от успехов: успех сам гаснет и озвучивается вежливо
  // (role="status"), ошибка висит до следующего действия и озвучивается сразу.
  const [userNotice, setUserNotice] = useState({ text: "", error: false });
  const setUserMessage = (text) => setUserNotice({ text, error: false });
  const setUserError = (text) => setUserNotice({ text, error: true });
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
  // Подтверждение остальных удалений: «вид:id» объекта, ждущего второго клика.
  const [pendingDeleteKey, setPendingDeleteKey] = useState("");
  const [newGoal, setNewGoal] = useState({
    personId: "",
    lprId: "",
    title: "",
    description: "",
    horizon: "",
    dueDate: ""
  });
  const [goalsFilter, setGoalsFilter] = useState({ personId: "all", status: "active" });
  const [goalComposeOpen, setGoalComposeOpen] = useState(false);
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
  const [showSurveyComposer, setShowSurveyComposer] = useState(false);
  const [surveyComposer, setSurveyComposer] = useState({
    title: "",
    description: "",
    anonymous: false,
    anonymousMinResponses: ANONYMOUS_MIN_RESPONSES,
    questions: [emptyQuestionFor("scale")]
  });
  // Тема, акцент, плотность, размер текста: одно хранилище на всё приложение (src/appearance.js).
  const { appearance, setAppearance } = useAppearance();
  const theme = appearance.theme;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState("");
  const [cardEditDraft, setCardEditDraft] = useState({ title: "", body: "" });
  const [editingActionId, setEditingActionId] = useState("");
  const [actionEditDraft, setActionEditDraft] = useState({ title: "", due: "", dueDate: "" });
  const [expandedMeetingId, setExpandedMeetingId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
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

  // ⌘K / Ctrl+K открывает палитру команд, пока человек вошёл.
  useEffect(() => {
    if (!user) return undefined;
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [user]);
  const [revealSummary, setRevealSummary] = useState(false);
  const summaryPanelRef = useRef(null);
  const dirtyRef = useRef(false);
  // id строк, которые клиент видел: пришли с сервера целиком или были нами
  // успешно сохранены. Уходят в knownIds, см. saveWorkspace.
  const knownIdsRef = useRef(collectRowIds(null));
  // Номер сессии: растёт при выходе/401. Сохранение, начатое в прошлой сессии,
  // не должно ни дополнить known, ни подменить пространство уже следующего человека.
  const sessionEpochRef = useRef(0);
  const workspaceRef = useRef(null);
  const saveInFlightRef = useRef(false);
  // Почему автосохранение стоит: "conflict" ждёт решения человека, "rejected"
  // — сервер отклонил снимок (4xx), ждём правки или «Повторить».
  const saveHaltRef = useRef("");
  const saveRetryDelayRef = useRef(SAVE_RETRY_FIRST_MS);
  const meetingStateInFlightRef = useRef(false);
  const meetingStateRetryDelayRef = useRef(SAVE_RETRY_FIRST_MS);
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

  workspaceRef.current = workspace;

  // Coalesce rapid edits (slider drags, typing) into a single trailing save.
  useEffect(() => {
    if (!workspace || !dirtyRef.current || saveHaltRef.current) return undefined;
    const snapshot = workspace;
    const timeoutId = window.setTimeout(() => {
      // Пока предыдущее сохранение в полёте, новое не шлём: оно ушло бы со
      // старой версией строк и получило бы 409 от собственной же записи.
      // Правки остаются dirty, а saveWorkspace по завершении запустит цикл заново.
      if (!dirtyRef.current || saveInFlightRef.current) return;
      dirtyRef.current = false;
      void saveWorkspace(snapshot);
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [workspace, saveRetryTick]);

  // Закрытие вкладки с несохранёнными правками или записью в полёте теряет
  // данные молча; браузер хотя бы переспросит. А когда вкладку прячут
  // (переключение, закрытие на телефоне), пробуем отправить правки сразу.
  useEffect(() => {
    const hasUnsavedChanges = () =>
      dirtyRef.current ||
      saveInFlightRef.current ||
      meetingStateInFlightRef.current ||
      Object.keys(meetingStateSaveQueueRef.current).length > 0;

    function handleBeforeUnload(event) {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "hidden") return;
      if (meetingStateSaveTimerRef.current) {
        window.clearTimeout(meetingStateSaveTimerRef.current);
        void flushMeetingStateSaves();
      }
      // Остановленное сохранение (конфликт, отказ сервера) вслепую не шлём.
      if (dirtyRef.current && !saveInFlightRef.current && !saveHaltRef.current && workspaceRef.current) {
        dirtyRef.current = false;
        void saveWorkspace(workspaceRef.current);
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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
    // Ошибку не гасим по таймеру: человек мог не успеть её прочитать.
    if (!userNotice.text || userNotice.error) return undefined;
    const timeoutId = window.setTimeout(() => setUserMessage(""), 3600);
    return () => window.clearTimeout(timeoutId);
  }, [userNotice]);

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
      summaryPanelRef.current?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
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
      knownIdsRef.current = collectRowIds(null);
      setWorkspace(null);
      setAuthState("ready");
    }
  }

  async function loadWorkspace(nextUser = user) {
    const data = await apiFetch("/api/workspace");
    const nextWorkspace = { ...emptyWorkspace, ...data };
    const defaultPersonId = nextWorkspace.people.find((person) => person.id !== "demo-sre")?.id || nextWorkspace.people[0]?.id || "";
    adoptServerWorkspace(nextWorkspace);
    const firstPersonId = nextUser?.personId || defaultPersonId;
    setSelectedPersonId((current) => (nextWorkspace.people.some((person) => person.id === current) ? current : firstPersonId));
    setPasswordUpdate((current) => ({
      ...current,
      userId: current.userId || nextWorkspace.users.find((item) => !isProtectedAccess(item))?.id || ""
    }));
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

  // Состояние сохранения принадлежит прошлой сессии (выход, 401) и не должно
  // перейти к следующему человеку на этом экране: ни правки, ни остановка
  // автосохранения, ни очередь meeting-state, ни таймеры повтора.
  function resetSaveState() {
    dirtyRef.current = false;
    saveHaltRef.current = "";
    saveRetryDelayRef.current = SAVE_RETRY_FIRST_MS;
    meetingStateRetryDelayRef.current = SAVE_RETRY_FIRST_MS;
    for (const timerRef of [retrySaveTimerRef, meetingStateSaveTimerRef]) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    meetingStateSaveQueueRef.current = {};
    // Знание о строках тоже принадлежит прошлой сессии: следующий человек
    // начнёт с пустого, иначе чужие id дали бы право удалять строки.
    knownIdsRef.current = collectRowIds(null);
    sessionEpochRef.current += 1;
    setConflict(null);
    setSaveError("");
  }

  async function logout() {
    await apiFetch("/api/logout", { method: "POST", body: "{}" }).catch(() => {});
    resetSaveState();
    setUser(null);
    setWorkspace(null);
    setSummaryText("");
    setActiveSection("home");
    setShowCreateLoginForm(false);
  }

  function commitWorkspace(updater) {
    dirtyRef.current = true;
    // Новая правка может исправить то, из-за чего сервер отказал, — пробуем
    // снова. Конфликт так не снимается: он ждёт решения человека.
    if (saveHaltRef.current === "rejected") saveHaltRef.current = "";
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

  // Единственная дверь, через которую целое рабочее пространство от сервера
  // попадает в состояние: заодно известные id заменяются на id из него. Если
  // принять пространство, не обновив known, клиент либо не сможет удалить то,
  // что реально видел, либо получит право удалить то, чего не видел.
  function adoptServerWorkspace(ws) {
    const next = { ...emptyWorkspace, ...ws };
    knownIdsRef.current = collectRowIds(next);
    setWorkspace(next);
    return next;
  }

  // Версия строки — это её updated_at из базы, придуманная не клиентом. После
  // своего же сохранения подтягиваем версии в локальные строки: иначе следующая
  // правка той же строки уйдёт со старой версией и получит 409 от нашей записи.
  function mergeRowVersions(current, saved) {
    const next = { ...current };
    for (const table of ["cards", "actions", "goals", "lprs"]) {
      // Только updatedAt и только у строк, что есть локально: содержимое несохранённых
      // правок трогать нельзя, а чужие строки из ответа добавлять нельзя — клиент
      // их не видел, и они не должны попасть в наш следующий снимок.
      const versions = new Map((saved[table] || []).filter((row) => row.updatedAt).map((row) => [row.id, row.updatedAt]));
      next[table] = (current[table] || []).map((row) =>
        versions.has(row.id) ? { ...row, updatedAt: versions.get(row.id) } : row
      );
    }
    return next;
  }

  function scheduleSaveRetry() {
    if (retrySaveTimerRef.current) return;
    const delay = saveRetryDelayRef.current;
    saveRetryDelayRef.current = Math.min(delay * 2, SAVE_RETRY_MAX_MS);
    retrySaveTimerRef.current = window.setTimeout(() => {
      retrySaveTimerRef.current = null;
      setSaveRetryTick((tick) => tick + 1);
    }, delay);
  }

  async function saveWorkspace(nextWorkspace) {
    saveInFlightRef.current = true;
    const epoch = sessionEpochRef.current;
    try {
      setSaveError("");
      if (retrySaveTimerRef.current) {
        window.clearTimeout(retrySaveTimerRef.current);
        retrySaveTimerRef.current = null;
      }
      const sentIds = collectRowIds(nextWorkspace);
      const knownIds = {};
      for (const table of KNOWN_ID_TABLES) knownIds[table] = [...knownIdsRef.current[table]];
      const saved = await apiFetch("/api/workspace", {
        method: "POST",
        body: JSON.stringify({ ...nextWorkspace, knownIds })
      });
      // Сессия сменилась, пока шёл запрос: ответ принадлежит прошлому человеку.
      if (epoch !== sessionEpochRef.current) return;
      // Сервер принял всё, что мы прислали, — значит, эти строки мы «видели».
      // Дополняем known до разбора ответа: он может и не приниматься (dirty).
      for (const table of KNOWN_ID_TABLES) {
        for (const id of sentIds[table]) knownIdsRef.current[table].add(id);
      }
      saveRetryDelayRef.current = SAVE_RETRY_FIRST_MS;
      saveHaltRef.current = "";
      setConflict(null);
      // Apply server-sanitized state only when no further edits are pending —
      // otherwise we'd overwrite in-flight changes with a stale snapshot.
      if (!dirtyRef.current) {
        adoptServerWorkspace(saved);
      } else {
        // Ответ не принимаем целиком, но версии строк из него подтягиваем: без
        // этого следующее сохранение той же строки уйдёт со старым updatedAt и
        // получит ложный 409 от нашей же предыдущей записи.
        setWorkspace((current) =>
          current ? { ...mergeRowVersions(current, saved), users: saved.users || current.users } : current
        );
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        resetSaveState();
        setUser(null);
        setWorkspace(null);
        return;
      }
      dirtyRef.current = true;
      if (error instanceof ApiError && error.status === 409) {
        // Автоповтор запрещён: тот же снимок снова получит 409, а повтор
        // «в обход» затёр бы чужие правки. Решает человек.
        saveHaltRef.current = "conflict";
        setConflict({ conflicts: error.payload.conflicts || [], workspace: error.payload.workspace || null });
        return;
      }
      setSaveError(error.message);
      if (isRetryableError(error)) {
        scheduleSaveRetry();
      } else {
        saveHaltRef.current = "rejected";
      }
    } finally {
      saveInFlightRef.current = false;
      // Правки, набранные за время запроса, ждали его конца.
      if (dirtyRef.current && !saveHaltRef.current && !retrySaveTimerRef.current) {
        setSaveRetryTick((tick) => tick + 1);
      }
    }
  }

  // «Повторить» после отказа сервера: пауза и счётчик пауз начинаются заново.
  function retrySaveNow() {
    // Конфликт «Повторить» не снимает: он ждёт решения в баннере.
    if (saveHaltRef.current === "rejected") saveHaltRef.current = "";
    saveRetryDelayRef.current = SAVE_RETRY_FIRST_MS;
    if (retrySaveTimerRef.current) {
      window.clearTimeout(retrySaveTimerRef.current);
      retrySaveTimerRef.current = null;
    }
    setSaveRetryTick((tick) => tick + 1);
    if (Object.keys(meetingStateSaveQueueRef.current).length) {
      if (meetingStateSaveTimerRef.current) window.clearTimeout(meetingStateSaveTimerRef.current);
      meetingStateRetryDelayRef.current = SAVE_RETRY_FIRST_MS;
      void flushMeetingStateSaves();
    }
  }

  async function resolveConflict(mode) {
    if (!conflict) return;
    try {
      const latest = conflict.workspace || (await apiFetch("/api/workspace"));
      saveRetryDelayRef.current = SAVE_RETRY_FIRST_MS;
      if (mode === "reload") {
        // Локальные правки сбрасываем: снимок сервера становится единственным.
        dirtyRef.current = false;
        saveHaltRef.current = "";
        setConflict(null);
        setSaveError("");
        adoptServerWorkspace(latest);
        return;
      }
      // Перезапись: у конфликтующих строк берём версию сервера, остальное
      // остаётся нашим, и сервер примет снимок как правку поверх актуальной.
      const versions = new Map(
        conflict.conflicts.map(({ table, id }) => [
          `${table}:${id}`,
          (latest[table] || []).find((row) => row.id === id)?.updatedAt
        ])
      );
      setWorkspace((current) => {
        if (!current) return current;
        const next = { ...current };
        for (const table of new Set(conflict.conflicts.map((item) => item.table))) {
          next[table] = (current[table] || []).map((row) =>
            versions.get(`${table}:${row.id}`) ? { ...row, updatedAt: versions.get(`${table}:${row.id}`) } : row
          );
        }
        return next;
      });
      dirtyRef.current = true;
      saveHaltRef.current = "";
      setConflict(null);
      setSaveRetryTick((tick) => tick + 1);
    } catch (error) {
      setSaveError(error.message);
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

    meetingStateInFlightRef.current = true;
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
      meetingStateRetryDelayRef.current = SAVE_RETRY_FIRST_MS;
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
      if (error instanceof ApiError && error.status === 401) {
        resetSaveState();
        setUser(null);
        setWorkspace(null);
        return;
      }
      setSaveError(error.message);
      for (const [personId, patch] of entries) {
        meetingStateSaveQueueRef.current[personId] = mergeMeetingStatePatch(
          patch,
          meetingStateSaveQueueRef.current[personId]
        );
      }
      // После отказа сервера (4xx) тот же запрос уйдёт снова только вместе с
      // новой правкой или по «Повторить»; сеть и 5xx повторяем с нарастающей паузой.
      if (isRetryableError(error) && !meetingStateSaveTimerRef.current) {
        const delay = meetingStateRetryDelayRef.current;
        meetingStateRetryDelayRef.current = Math.min(delay * 2, SAVE_RETRY_MAX_MS);
        meetingStateSaveTimerRef.current = window.setTimeout(() => {
          void flushMeetingStateSaves();
        }, delay);
      }
    } finally {
      meetingStateInFlightRef.current = false;
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
  const pageSubtitle = "";
  // Разделы, у которых своя шапка страницы (PageHeader внутри экрана).
  const migratedSections = new Set([
    "home",
    // @migrated:meetings
    "lprs",
    "goals",
    "surveys",
    "reports",
    "team",
    "admin",
    "settings",
  ]);
  const visibleSections = primarySections
    .filter((sectionId) => {
      const meta = sectionRegistry[sectionId];
      if (meta.adminOnly && !isAdmin) return false;
      if (meta.platformAdminOnly && !isPlatformAdminRole(user)) return false;
      return true;
    })
    .map((sectionId) => ({ id: sectionId, ...sectionRegistry[sectionId] }));
  // На телефоне внизу четыре главных раздела, остальные уходят под «Ещё».
  const tabSectionIds = ["home", "meetings", "goals", "surveys"].filter((id) => visibleSections.some((section) => section.id === id));
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
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: scrollBehavior() }));
  }

  function openSection(sectionId) {
    const meta = sectionRegistry[sectionId];
    if (!meta) return;
    if (meta.adminOnly && !isAdmin) return;
    if (meta.platformAdminOnly && !isPlatformAdminRole(user)) return;
    setUserMessage("");
    setPendingDeletePersonId("");
    setPendingDeleteKey("");
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
      createLoginPanelRef.current?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
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

  // Двухшаговое удаление, как у участника: первый клик только просит
  // подтверждения и называет объект, удаляет второй. Исчезновение карточки или
  // цели одним случайным кликом откатить нечем.
  function requestDelete(key, label) {
    setPendingDeleteKey(key);
    setUserMessage(`Подтвердите удаление ${label}`);
  }

  function cancelDelete() {
    setPendingDeleteKey("");
    setUserMessage("");
  }

  function renderDeleteConfirm(label, onConfirm) {
    return (
      <DeleteConfirm
        label={label}
        onConfirm={() => {
          setPendingDeleteKey("");
          onConfirm();
        }}
        onCancel={cancelDelete}
      />
    );
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
    if (!targetPersonId || !newGoal.title.trim()) return false;
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
    return true;
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
    if (!targetPersonId || !newLpr.title.trim()) return false;
    // updatedAt у строки — её версия из базы: новой строке версию даёт сервер.
    const lpr = {
      id: makeId("lpr"),
      personId: targetPersonId,
      title: newLpr.title.trim(),
      focus: newLpr.focus.trim(),
      status: "active",
      createdAt: new Date().toISOString()
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
    return true;
  }

  function setLprStatus(lprId, status) {
    commitWorkspace((current) => ({
      ...current,
      lprs: (current.lprs || []).map((lpr) =>
        // updatedAt не трогаем: это версия строки из базы, по ней сервер
        // замечает, что ЛПР успели изменить в другом месте.
        lpr.id === lprId ? { ...lpr, status } : lpr
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
      createdAt: now
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
    const rows = [headers];
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
        ]);
      }
    }
    const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
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
      createdAt: now
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
    setGoalComposeOpen(true);
    setActiveSection("goals");
  }

  // Опросы: состояние черновиков остаётся здесь (переживает смену раздела),
  // а интерфейс и локальная логика живут в src/screens/Surveys.jsx.
  // Эти функции только ходят в API и бросают Error при неудаче: сообщения
  // (успех и ошибка) показывает сам экран.
  async function createSurvey(payload) {
    const response = await apiFetch("/api/surveys", { method: "POST", body: JSON.stringify(payload) });
    if (response.workspace) adoptServerWorkspace(response.workspace);
  }

  async function saveSurveyAsTemplate(surveyId) {
    const response = await apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}/template`, {
      method: "POST",
      body: "{}"
    });
    if (response.workspace) adoptServerWorkspace(response.workspace);
  }

  async function deleteSurvey(surveyId) {
    const response = await apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}`, { method: "DELETE" });
    if (response.workspace) adoptServerWorkspace(response.workspace);
  }

  async function submitSurveyResponse(surveyId, answers) {
    const response = await apiFetch(`/api/surveys/${encodeURIComponent(surveyId)}/respond`, {
      method: "POST",
      body: JSON.stringify({ answers })
    });
    if (response.workspace) adoptServerWorkspace(response.workspace);
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
      setUser(response.user);
      const nextWorkspace = adoptServerWorkspace(response.workspace);
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
      if (userResponse.workspace) adoptServerWorkspace(userResponse.workspace);
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
      if (response.workspace) adoptServerWorkspace(response.workspace);
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
      if (!currentPassword) {
        throw new Error("Введите текущий пароль");
      }
      if (myPassword.length < 8) {
        throw new Error("Пароль должен быть не короче 8 символов");
      }
      // Неверный текущий пароль сервер отвечает 400 «Неверный текущий пароль»,
      // и ошибка показывается рядом с формой, а не разлогинивает.
      await apiFetch("/api/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, password: myPassword })
      });
      setCurrentPassword("");
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
      setUserError(error.message);
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
      const nextWorkspace = adoptServerWorkspace(response.workspace);
      setSelectedPersonId(nextWorkspace.people[0]?.id || "");
      setPasswordUpdate((current) => ({
        ...current,
        userId: nextWorkspace.users.find((item) => !isProtectedAccess(item))?.id || ""
      }));
      setPendingDeletePersonId("");
      setUserMessage(`Участник ${person.name} удален`);
    } catch (error) {
      setUserError(error.message);
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
      if (response.workspace) adoptServerWorkspace(response.workspace);
      setNewManagerNote({ body: "", tags: [] });
      setUserMessage("Заметка сохранена");
    } catch (error) {
      setUserError(error.message);
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
      if (response.workspace) adoptServerWorkspace(response.workspace);
    } catch (error) {
      setUserError(error.message);
    }
  }

  async function deleteManagerNote(noteId) {
    try {
      const response = await apiFetch(`/api/manager-notes/${encodeURIComponent(noteId)}`, {
        method: "DELETE"
      });
      if (response.workspace) adoptServerWorkspace(response.workspace);
      setUserMessage("Заметка удалена");
    } catch (error) {
      // 404 сервер отдаёт и для чужой заметки (не раскрывает её существование), и для уже
      // удалённой: остаёмся в разделе и просто объясняем, что с этой заметкой ничего не сделать.
      if (error?.status === 404) {
        setUserError("Заметка не найдена или недоступна: удалить её может только автор или администратор платформы");
        return;
      }
      setUserError(error.message);
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
      if (response.workspace) adoptServerWorkspace(response.workspace);
      setUserMessage("Участник восстановлен");
    } catch (error) {
      setUserError(error.message);
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
      if (response.workspace) adoptServerWorkspace(response.workspace);
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
      adoptServerWorkspace(response.workspace);
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
      setUserError(error.message);
    }
  }

  function renderCreateLoginCard({
    id = "create-login-panel",
    description = "Тимлид получает доступ к своей команде, участник — только к своему 1:1.",
    allowLeadCreation = canCreateLeadLogin,
    showCancel = false
  } = {}) {
    return (
      <CreateLoginCard
        id={id}
        description={description}
        allowLeadCreation={allowLeadCreation}
        showCancel={showCancel}
        cardRef={createLoginPanelRef}
        form={newUser}
        setForm={setNewUser}
        teamLocked={!allowLeadCreation && Boolean(user?.teamLabel)}
        leadUsers={teamLeadUsers}
        error={formErrors.createUser}
        onSubmit={createEmployeeUser}
        onClose={closeCreateLoginForm}
      />
    );
  }

  if (authState === "loading") return <AuthScreen mode="loading" />;

  if (!user) return <AuthScreen mode="login" loginError={loginError} onLogin={performLogin} />;

  if (!workspace || (!selectedPerson && !isAdmin)) return <AuthScreen mode="no-profile" onLogout={logout} />;

  const paletteItems = [
    ...visibleSections.map((section) => ({
      id: `go-${section.id}`,
      group: "Разделы",
      label: section.label,
      hint: section.hint || "",
      icon: section.icon,
      run: () => openSection(section.id)
    })),
    ...(workspace?.people || []).map((person) => ({
      id: `person-${person.id}`,
      group: "Участники",
      label: person.name,
      hint: person.role,
      icon: UserRoundCheck,
      keywords: `1:1 встреча ${person.team || ""}`,
      run: () => selectPerson(person.id)
    })),
    { id: "theme-light", group: "Действия", label: "Светлая тема", icon: Sun, run: () => setAppearance({ theme: "light" }) },
    { id: "theme-dark", group: "Действия", label: "Тёмная тема", icon: Moon, run: () => setAppearance({ theme: "dark" }) },
    { id: "theme-system", group: "Действия", label: "Тема как в системе", icon: Monitor, run: () => setAppearance({ theme: "system" }) },
    { id: "logout", group: "Действия", label: "Выйти", icon: LogOut, run: logout }
  ];

  return (
    <Shell
      sections={visibleSections}
      activeSection={activeSection}
      onNavigate={openSection}
      tabIds={tabSectionIds}
      collapsed={appearance.sidebarCollapsed}
      onToggleCollapsed={() => setAppearance({ sidebarCollapsed: !appearance.sidebarCollapsed })}
      pageTitle={pageTitle}
      sidebarFooter={
        <UserMenu
          displayName={displayName}
          roleText={roleLabel[user?.role] || "участник"}
          theme={theme}
          onSetTheme={(value) => setAppearance({ theme: value })}
          onOpenSettings={() => openSection("settings")}
          onLogout={logout}
        />
      }
      topbarEnd={
        <button type="button" className="shell-search" onClick={() => setPaletteOpen(true)} aria-label="Быстрый переход: поиск по разделам и людям">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="shell-search-text">Поиск</span>
          <Kbd>⌘K</Kbd>
        </button>
      }
      moreSlot={({ active }) => (
        <MoreTab
          active={active}
          sections={visibleSections.filter((section) => !tabSectionIds.includes(section.id))}
          activeSection={activeSection}
          theme={theme}
          onSetTheme={(value) => setAppearance({ theme: value })}
          onNavigate={openSection}
          onLogout={logout}
        />
      )}
    >
      <div className={`page-body section-${activeSection}`}>
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

      <div className="workspace">
        {!migratedSections.has(activeSection) && (
        <header className="page-head">
          <div className="page-head-text">
            <h1 className="page-title">{pageTitle}</h1>
            {pageSubtitle && <p className="page-subtitle">{pageSubtitle}</p>}
          </div>
          {activeSection === "meetings" && selectedPerson && (
            <div className="page-head-actions">
              <button className="primary-button" type="button" onClick={showMeetingSummary}>
                <ClipboardCheck size={17} />
                Итоги встречи
              </button>
            </div>
          )}
        </header>
        )}

        {conflict && (
          <div className="form-error inline-error" role="alert" data-testid="conflict-banner">
            <p>
              Данные изменились в другом месте
              {conflict.conflicts.length > 0 ? ` (записей: ${conflict.conflicts.length})` : ""}. Ваши правки ещё не
              сохранены: загрузите актуальную версию или перезапишите её своими правками.
            </p>
            <div className="confirm-actions">
              <button
                className="soft-button"
                type="button"
                data-testid="conflict-reload"
                onClick={() => resolveConflict("reload")}
              >
                Загрузить актуальные данные
              </button>
              <button
                className="soft-button danger-button"
                type="button"
                data-testid="conflict-overwrite"
                onClick={() => resolveConflict("overwrite")}
              >
                Перезаписать моими правками
              </button>
            </div>
          </div>
        )}
        {saveError && (
          <div className="form-error inline-error" role="alert" data-testid="save-error">
            <strong>{saveError}</strong> — изменения пока не сохранены.{" "}
            <button className="soft-button" type="button" data-testid="save-retry" onClick={retrySaveNow}>
              Повторить
            </button>
          </div>
        )}
        {/* Контейнер статуса стоит в DOM всегда: читалки объявляют текст, который появился внутри уже существующей live-области. */}
        <div role="status" aria-live="polite">
          {userNotice.text && !userNotice.error && <div className="form-hint inline-message">{userNotice.text}</div>}
        </div>
        {userNotice.text && userNotice.error && (
          <div className="form-error inline-error" role="alert">
            {userNotice.text}
          </div>
        )}

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

        {pageDescription && !migratedSections.has(activeSection) && (
          <div className="section-intro">
            <p>{pageDescription}</p>
          </div>
        )}

        {activeSection === "home" && (
          <HomeScreen
            displayName={displayName}
            isAdmin={isAdmin}
            workspace={workspace}
            dashboardPeople={dashboardPeople}
            hasDashboardPeople={hasDashboardPeople}
            dashboardScore={dashboardScore}
            dashboardSnapshots={dashboardSnapshots}
            peopleInRiskZone={peopleInRiskZone}
            urgentCount={urgentDashboardCards.length}
            openCardsCount={openDashboardCards.length}
            openActionsCount={openDashboardActions.length}
            upcomingMeetings={upcomingMeetings}
            actionInboxItems={actionInboxItems}
            myPulse={!isAdmin && dashboardPeople[0] ? workspace?.pulse?.[dashboardPeople[0].id] : null}
            createLoginPanel={
              isAdmin && showCreateLoginForm
                ? renderCreateLoginCard({
                    id: "home-create-login-panel",
                    description: canCreateLeadLogin
                      ? "Создайте участника или тимлида, не уходя с главной."
                      : "Добавьте участника в свою команду и сразу выдайте ему доступ.",
                    allowLeadCreation: canCreateLeadLogin,
                    showCancel: true
                  })
                : null
            }
            onOpenPerson={selectPerson}
            onOpenSection={openSection}
            onCreateLogin={openCreateLoginForm}
          />
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
                                  {pendingDeleteKey === `card:${card.id}` ? (
                                    renderDeleteConfirm(`темы «${card.title}»`, () => deleteCard(card.id))
                                  ) : (
                                    <button
                                      className="soft-button danger-button"
                                      type="button"
                                      onClick={() => requestDelete(`card:${card.id}`, `темы «${card.title}»`)}
                                      title="Удалить тему"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  )}
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
                              {pendingDeleteKey === `action:${action.id}` ? (
                                renderDeleteConfirm(`шага «${action.title}»`, () => deleteAction(action.id))
                              ) : (
                                <button
                                  className="icon-button danger-button"
                                  type="button"
                                  onClick={() => requestDelete(`action:${action.id}`, `шага «${action.title}»`)}
                                  title="Удалить"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
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
          <LprsScreen
            isAdmin={isAdmin}
            currentPersonId={user?.personId || ""}
            people={workspace.people}
            lprs={allLprs}
            visibleLprs={filteredLprs}
            goals={allGoals}
            cards={workspace.cards || []}
            aggregate={lprAggregate}
            filter={lprFilter}
            onFilterChange={setLprFilter}
            draft={newLpr}
            onDraftChange={setNewLpr}
            targetPersonId={lprTargetPersonId}
            onAdd={addLpr}
            onSetStatus={setLprStatus}
            onDelete={deleteLpr}
            onOpenPerson={selectPerson}
            onAddGoal={openGoalForLpr}
          />
        )}

        {activeSection === "goals" && (
          <GoalsScreen
            isAdmin={isAdmin}
            currentPersonId={user?.personId || ""}
            people={workspace.people}
            goals={allGoals}
            visibleGoals={filteredGoals}
            aggregate={goalsAggregate}
            filter={goalsFilter}
            onFilterChange={setGoalsFilter}
            lprs={allLprs}
            availableLprs={goalAvailableLprs}
            draft={newGoal}
            onDraftChange={setNewGoal}
            targetPersonId={goalTargetPersonId}
            composeOpen={goalComposeOpen}
            onComposeOpenChange={setGoalComposeOpen}
            onAdd={addGoal}
            progressOf={goalProgressValue}
            onProgressDraft={updateGoalProgressDraft}
            onProgressCommit={commitGoalProgressValue}
            onSetStatus={setGoalStatus}
            onDelete={deleteGoal}
          />
        )}

        {activeSection === "surveys" && (
          <SurveysScreen
            isAdmin={isAdmin}
            workspace={workspace}
            composer={surveyComposer}
            setComposer={setSurveyComposer}
            composerOpen={showSurveyComposer}
            setComposerOpen={setShowSurveyComposer}
            answerDrafts={surveyDrafts}
            setAnswerDrafts={setSurveyDrafts}
            onCreateSurvey={createSurvey}
            onSaveTemplate={saveSurveyAsTemplate}
            onDeleteSurvey={deleteSurvey}
            onSubmitResponse={submitSurveyResponse}
            onOpenSection={openSection}
          />
        )}

        {activeSection === "reports" && (
          <ReportsScreen
            isAdmin={isAdmin}
            people={workspace.people}
            reportsData={reportsData}
            teamHeatmapRows={teamHeatmapRows}
            reportRecommendations={reportRecommendations}
            competencyDraft={competencyDraft}
            setCompetencyDraft={setCompetencyDraft}
            competencyFormError={formErrors["competency-report"]}
            onSubmitCompetency={submitCompetencyAssessment}
            onExportCsv={exportCompetencyCsv}
            onImportToLpr={importAssessmentToLpr}
            onDeleteAssessment={deleteCompetencyAssessment}
            onOpenPerson={selectPerson}
            onOpenSection={openSection}
          />
        )}

        {activeSection === "team" && isAdmin && (
          <TeamScreen
            workspace={workspace}
            isPlatformAdmin={isPlatformAdmin}
            peopleInRiskZone={peopleInRiskZone}
            showCreateLoginForm={showCreateLoginForm}
            createLoginPanel={
              showCreateLoginForm
                ? renderCreateLoginCard({
                    id: "team-create-login-panel",
                    description: canCreateLeadLogin
                      ? "Создайте логин участника и при необходимости привяжите его к тимлиду."
                      : "Добавьте участника в свою команду и сразу выдайте ему доступ.",
                    allowLeadCreation: canCreateLeadLogin,
                    showCancel: true
                  })
                : null
            }
            onToggleCreateLogin={() => (showCreateLoginForm ? closeCreateLoginForm() : openCreateLoginForm())}
            editingPersonId={editingPersonId}
            personEditDraft={personEditDraft}
            setPersonEditDraft={setPersonEditDraft}
            editError={formErrors.editPerson}
            onStartEdit={(person) => {
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
            onSaveEdit={savePersonEdit}
            onCancelEdit={() => {
              setEditingPersonId("");
              clearFormError("editPerson");
            }}
            pendingDeletePersonId={pendingDeletePersonId}
            onDeletePerson={deleteEmployeePerson}
            onCancelDeletePerson={() => {
              setPendingDeletePersonId("");
              setUserMessage("");
            }}
            onRestorePerson={restoreArchivedPerson}
            onOpenPerson={selectPerson}
            onOpenSection={openSection}
            showAdminLink={isPlatformAdminRole(user)}
          />
        )}

        {activeSection === "admin" && isPlatformAdminRole(user) && (
          <AdminScreen
            realUsers={realUsers}
            editableUsers={editableUsers}
            people={workspace.people}
            createLoginPanel={renderCreateLoginCard({ id: "admin-create-login-panel", allowLeadCreation: true })}
            passwordUpdate={passwordUpdate}
            setPasswordUpdate={setPasswordUpdate}
            passwordError={formErrors.password}
            onResetPassword={updateEmployeePassword}
            onDeleteUser={deleteEmployeeUser}
          />
        )}

        {activeSection === "settings" && (
          <SettingsScreen
            user={user}
            roleText={roleLabel[user?.role] || "участник"}
            displayName={displayName}
            profileName={profileName}
            onProfileNameChange={setProfileName}
            onSaveProfile={updateAccountName}
            profileError={formErrors.profile}
            currentPassword={currentPassword}
            onCurrentPasswordChange={setCurrentPassword}
            newPassword={myPassword}
            onNewPasswordChange={setMyPassword}
            onChangePassword={updateMyPassword}
            passwordError={formErrors.myPassword}
            canResetDemo={canResetDemo}
            onResetDemo={resetDemo}
            onLogout={logout}
          />
        )}
      </div>

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
                      {pendingDeleteKey === `note:${note.id}` ? (
                        renderDeleteConfirm(`заметки от ${formatRuDate(note.createdAt)}`, () => deleteManagerNote(note.id))
                      ) : (
                        <button
                          className="icon-button danger-button"
                          type="button"
                          title="Удалить заметку"
                          onClick={() => requestDelete(`note:${note.id}`, `заметки от ${formatRuDate(note.createdAt)}`)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
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
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />
    </Shell>
  );
}
