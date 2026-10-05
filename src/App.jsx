import {
  useAppearance
} from "./appearance.js";
import Shell from "./shell/Shell.jsx";
import HomeScreen from "./screens/Home.jsx";
import MeetingsScreen from "./screens/Meetings.jsx";
import LprsScreen from "./screens/Lprs.jsx";
import GoalsScreen from "./screens/Goals.jsx";
import SurveysScreen from "./screens/Surveys.jsx";
import ReportsScreen from "./screens/Reports.jsx";
import TeamScreen from "./screens/Team.jsx";
import AdminScreen from "./screens/Admin.jsx";
import CreateLoginCard from "./screens/team/CreateLoginCard.jsx";
import AuthScreen from "./screens/Auth.jsx";
import SettingsScreen from "./screens/Settings.jsx";
import UserMenu from "./shell/UserMenu.jsx";
import MoreTab from "./shell/MoreTab.jsx";
import CommandPalette from "./shell/CommandPalette.jsx";
import {
  Button,
  Kbd,
  useToast
} from "./ui";
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  toCsv
} from "./csv.js";
import {
  emptyWorkspace,
  goalStatusOrder,
  lprStatusOrder,
  competencyGradeLabel,
  todayISODate,
  duplicateTitleKey,
  clampRangeValue,
  formatScoreValue,
  competencyGradeFromScores,
  competencyKey,
  parseCompetencyRows,
  categories,
  checklist,
  sectionRegistry,
  primarySections,
  sectionDescriptionFor,
  roleLabel,
  emptyQuestionFor,
  pulseSeries,
  makeId,
  scorePulse,
  priorityLabel,
  ownerLabel,
  pluralizeRu,
  meetingSortValue,
  isDemoAccess,
  isPlatformAdminRole,
  isLeadRole,
  isProtectedAccess,
  ApiError,
  ANONYMOUS_MIN_RESPONSES,
  apiFetch,
  scrollBehavior,
  KNOWN_ID_TABLES,
  collectRowIds,
  SAVE_RETRY_FIRST_MS,
  SAVE_RETRY_MAX_MS,
  isRetryableError
} from "./lib/shared.jsx";

import {
  LogOut,
  Search,
  Sun,
  Moon,
  Monitor,
  UserRoundCheck
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
  // Сообщения идут тостами: успех гаснет сам и озвучивается вежливо (role="status"),
  // ошибка висит, пока её не закроют, и озвучивается сразу (role="alert").
  const { toast, dismiss: dismissToast } = useToast();
  const noticeToastRef = useRef(null);
  const setUserMessage = (text) => {
    if (noticeToastRef.current) dismissToast(noticeToastRef.current);
    noticeToastRef.current = text ? toast({ title: text, tone: "success" }) : null;
  };
  const setUserError = (text) => {
    if (noticeToastRef.current) dismissToast(noticeToastRef.current);
    noticeToastRef.current = text ? toast({ title: text, tone: "danger" }) : null;
  };
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
  const upcomingMeetings = [...dashboardSnapshots]
    .sort((a, b) => meetingSortValue(a.person.nextMeeting) - meetingSortValue(b.person.nextMeeting))
    .slice(0, 5);
  const peopleInRiskZone = dashboardSnapshots.filter((item) => item.score < 64 || item.urgentCards > 0).length;
  const selectedSection = sectionRegistry[activeSection] || sectionRegistry.home;
  const pageTitle = activeSection === "meetings" && selectedPerson ? `1:1 с ${selectedPerson.meetingName}` : selectedSection.title;
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
      <div className="workspace">
        {conflict && (
          <div className="app-banner" role="alert" data-testid="conflict-banner">
            <p>
              Данные изменились в другом месте
              {conflict.conflicts.length > 0 ? ` (записей: ${conflict.conflicts.length})` : ""}. Ваши правки ещё не
              сохранены: загрузите актуальную версию или перезапишите её своими правками.
            </p>
            <div className="app-banner-actions">
              <Button variant="neutral" size="sm" data-testid="conflict-reload" onClick={() => resolveConflict("reload")}>
                Загрузить актуальные данные
              </Button>
              <Button variant="danger" size="sm" data-testid="conflict-overwrite" onClick={() => resolveConflict("overwrite")}>
                Перезаписать моими правками
              </Button>
            </div>
          </div>
        )}
        {saveError && (
          <div className="app-banner" role="alert" data-testid="save-error">
            <p>
              <strong>{saveError}</strong> — изменения пока не сохранены.
            </p>
            <div className="app-banner-actions">
              <Button variant="neutral" size="sm" data-testid="save-retry" onClick={retrySaveNow}>
                Повторить
              </Button>
            </div>
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

        {activeSection === "meetings" && (
          <MeetingsScreen
            isAdmin={isAdmin}
            workspace={workspace}
            selectedPerson={selectedPerson}
            pageDescription={pageDescription}
            people={filteredMeetingPeople}
            peopleSearch={peopleSearch}
            setPeopleSearch={setPeopleSearch}
            teamScore={teamScore}
            riskCount={riskCards.length}
            openTopicsCount={workspace.cards.filter((card) => card.status !== "done").length}
            selectedScore={selectedScore}
            selectedPulse={selectedPulse}
            readiness={readiness}
            briefing={briefing}
            person360Metrics={person360Metrics}
            personCards={personCards}
            filteredCards={filteredCards}
            personActions={personActions}
            unresolvedActions={unresolvedActions}
            personPrep={personPrep}
            lprById={lprById}
            activePersonLprs={activePersonLprs}
            openCardTitleKeys={openCardTitleKeys}
            openActionTitleKeys={openActionTitleKeys}
            selectedMeetingDraft={selectedMeetingDraft}
            summaryText={summaryText}
            summaryPanelRef={summaryPanelRef}
            activeView={activeView}
            setActiveView={setActiveView}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            newCard={newCard}
            setNewCard={setNewCard}
            newCardTitleKey={newCardTitleKey}
            newCardAlreadyOpen={newCardAlreadyOpen}
            newAction={newAction}
            setNewAction={setNewAction}
            newActionTitleKey={newActionTitleKey}
            newActionAlreadyOpen={newActionAlreadyOpen}
            editingCardId={editingCardId}
            setEditingCardId={setEditingCardId}
            cardEditDraft={cardEditDraft}
            setCardEditDraft={setCardEditDraft}
            editingActionId={editingActionId}
            setEditingActionId={setEditingActionId}
            actionEditDraft={actionEditDraft}
            setActionEditDraft={setActionEditDraft}
            newManagerNote={newManagerNote}
            setNewManagerNote={setNewManagerNote}
            expandedMeetingId={expandedMeetingId}
            setExpandedMeetingId={setExpandedMeetingId}
            onSelectPerson={selectPerson}
            onOpenSection={openSection}
            showMeetingSummary={showMeetingSummary}
            buildSummary={buildSummary}
            addAgendaCard={addAgendaCard}
            addSeedCard={addSeedCard}
            updateCardFields={updateCardFields}
            updateCardStatus={updateCardStatus}
            promoteCardToAction={promoteCardToAction}
            promoteCardToLpr={promoteCardToLpr}
            deleteCard={deleteCard}
            pulseValue={pulseValue}
            updatePulseDraft={updatePulseDraft}
            commitPulseValue={commitPulseValue}
            updateMeetingDraft={updateMeetingDraft}
            clearMeetingDraft={clearMeetingDraft}
            addAction={addAction}
            toggleAction={toggleAction}
            updateActionFields={updateActionFields}
            deleteAction={deleteAction}
            togglePrep={togglePrep}
            updateNotes={updateNotes}
            toggleNewNoteTag={toggleNewNoteTag}
            addManagerNote={addManagerNote}
            deleteManagerNote={deleteManagerNote}
          />
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

      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />
    </Shell>
  );
}
