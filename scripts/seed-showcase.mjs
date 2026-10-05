#!/usr/bin/env node
// Наполняет ЛОКАЛЬНЫЙ работающий сервер реалистичной командой, чтобы
// интерфейс можно было разрабатывать и снимать на живых данных: лид, шесть
// участников с логинами, карточки, шаги, ЛПР, цели, оценка компетенций,
// опросы с ответами, заметки лида и история пульса.
//
// Всё идёт через публичное API (как работал бы человек), кроме истории пульса
// и журнала встреч: их через API не задать, они пишутся прямо в базу, если
// задан DATABASE_URL.
//
// Запуск (сервер уже работает):
//   ADMIN_PASSWORD=... SHOWCASE_PASSWORD=... node scripts/seed-showcase.mjs
//
// Логины: lead и по одному на участника (anna, danila, mila, timur, sofia,
// igor), пароль у всех SHOWCASE_PASSWORD. Скрипт отказывается работать с
// чужим адресом: данные выдуманные, на боевую базу им не место.
import pg from "pg";

const base = (process.env.BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const host = new URL(base).hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  console.error(`Отказ: ${host} не локальный адрес. Скрипт заполняет сервер выдуманными данными.`);
  process.exit(1);
}
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;
const password = process.env.SHOWCASE_PASSWORD;
if (!adminPassword) throw new Error("ADMIN_PASSWORD обязателен");
if (!password || password.length < 8) throw new Error("SHOWCASE_PASSWORD обязателен (от 8 символов)");

function client() {
  let cookie = "";
  return async (method, path, body) => {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const set = response.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* не JSON */
    }
    return { status: response.status, json };
  };
}
const must = (result, what, ok = [200, 201]) => {
  if (!ok.includes(result.status)) throw new Error(`${what}: ${result.status} ${JSON.stringify(result.json)?.slice(0, 200)}`);
  return result.json;
};

const TEAM = "Платформа";
const PEOPLE = [
  { key: "anna", name: "Анна Морозова", role: "Senior Frontend", meeting: "Анной", pulse: [8, 6, 8, 9], focus: "рост в роли tech lead и делегирование", next: "завтра, 11:00", cadence: "каждую неделю", trend: "+4" },
  { key: "danila", name: "Данила Ким", role: "Backend Engineer", meeting: "Данилой", pulse: [5, 9, 5, 7], focus: "нагрузка перед релизом и зависимости", next: "в четверг, 15:30", cadence: "каждую неделю", trend: "-6" },
  { key: "mila", name: "Мила Варламова", role: "Product Designer", meeting: "Милой", pulse: [9, 5, 9, 9], focus: "портфолио и выступление на конференции", next: "в пятницу, 12:00", cadence: "раз в две недели", trend: "+2" },
  { key: "timur", name: "Тимур Абашев", role: "QA Lead", meeting: "Тимуром", pulse: [5, 8, 6, 6], focus: "автотесты и процесс релизов", next: "на следующей неделе", cadence: "раз в две недели", trend: "-3" },
  { key: "sofia", name: "Софья Ильина", role: "SRE", meeting: "Софьей", pulse: [7, 7, 8, 8], focus: "дежурства и наблюдаемость", next: "во вторник, 10:00", cadence: "каждую неделю", trend: "+1" },
  { key: "igor", name: "Игорь Назаров", role: "Data Engineer", meeting: "Игорем", pulse: [6, 6, 7, 8], focus: "первый квартал в команде, онбординг", next: "завтра, 16:00", cadence: "каждую неделю", trend: "+5" }
];

const CARDS = {
  anna: [
    ["growth", "high", "employee", "Хочу попробовать роль tech lead", "Готова взять ведение следующего эпика, нужен план и поддержка."],
    ["feedback", "medium", "manager", "Сильная работа над дизайн-системой", "Отметить на встрече: ускорила команду, стоит рассказать на демо."],
    ["decision", "medium", "employee", "Миграция на новый роутер", "Нужно решение, делаем в этом квартале или откладываем."]
  ],
  danila: [
    ["blocker", "high", "employee", "Много внезапных запросов от продаж", "Хочу договориться, какие запросы можно откладывать до релиза."],
    ["checkin", "medium", "employee", "Усталость после дежурства", "Две недели подряд ночные алерты, нужен перерыв."],
    ["decision", "high", "manager", "Перераспределить задачи релиза", "Часть задач по биллингу передать Софье."]
  ],
  mila: [
    ["thanks", "low", "employee", "Спасибо за поддержку на ревью", "Командное ревью дизайна прошло спокойнее, чем в прошлом квартале."],
    ["growth", "medium", "employee", "Выступление на конференции", "Есть тема про дизайн-токены, нужна помощь с форматом."]
  ],
  timur: [
    ["blocker", "high", "employee", "Нестабильные автотесты", "Каждый третий прогон красный без причины, команда перестала им доверять."],
    ["feedback", "medium", "manager", "Больше говорить о результатах тестирования", "Показывать метрики качества на планировании, не только по запросу."],
    ["checkin", "low", "employee", "Планы на отпуск", "Хочу уйти в отпуск в начале следующего месяца."]
  ],
  sofia: [
    ["checkin", "medium", "employee", "Ротация дежурств", "Предлагаю график 1 через 3, чтобы выровнять нагрузку."],
    ["growth", "medium", "manager", "Развитие в сторону платформенной инженерии", "Обсудить, какие задачи дадут опыт без роста нагрузки."]
  ],
  igor: [
    ["checkin", "medium", "employee", "Онбординг: что непонятно", "Не хватает карты сервисов, трачу время на поиск владельцев."],
    ["growth", "low", "manager", "План на испытательный срок", "Согласовать цели на 3 месяца."]
  ]
};

const ACTIONS = {
  anna: [["manager", "Выбрать эпик для первого ведения", "до пятницы"], ["employee", "Подготовить план ведения эпика", "к следующему 1:1"]],
  danila: [["manager", "Согласовать с продажами окна для запросов", "до среды"], ["employee", "Описать зависимости релиза", "до четверга"]],
  mila: [["employee", "Набросать тезисы доклада", "через две недели"]],
  timur: [["manager", "Выделить неделю на стабилизацию тестов", "в этом спринте"], ["employee", "Собрать топ нестабильных тестов", "до пятницы"]],
  sofia: [["employee", "Предложить график дежурств", "на этой неделе"]],
  igor: [["manager", "Нарисовать карту сервисов с владельцами", "до пятницы"]]
};

const LPRS = {
  anna: { title: "ЛПР: путь к tech lead", focus: "Собрать повторяющиеся темы из 1:1, превратить их в план развития и связать с измеримыми целями.", goals: [["Провести первый эпик как tech lead", 45, "active", "2026-Q4"], ["Научить двоих разработчиков ревью архитектуры", 20, "active", "2026-Q4"]] },
  mila: { title: "ЛПР: публичные выступления", focus: "Выйти на внешнюю сцену с темой про дизайн-токены и систему компонентов.", goals: [["Подать заявку на две конференции", 70, "active", "2026-Q4"], ["Провести внутренний митап", 100, "done", "2026-Q3"]] },
  timur: { title: "ЛПР: системное качество", focus: "Перейти от тестирования к управлению качеством: метрики, процесс, автоматизация.", goals: [["Снизить долю нестабильных тестов до 2%", 35, "active", "2026-Q4"], ["Ввести метрики качества в планирование", 10, "paused", "2027-Q1"]] }
};

const NOTES = {
  danila: [["Перегорает: два дежурства подряд и релиз на носу. Не давать новые срочные задачи до релиза.", ["risk", "workload"]]],
  timur: [["Недоволен текущим процессом релизов, но не выносит это на команду. Поддержать инициативу, чтобы не ушёл в молчание.", ["risk"]]],
  anna: [["Готова к следующему шагу. Подумать о повышении на следующем цикле калибровки.", ["growth"]]]
};

const SURVEY_WEEKLY = {
  title: "Еженедельный пульс команды",
  description: "Короткий опрос, чтобы понять состояние команды, фокус и риски недели.",
  anonymous: false,
  questions: [
    { id: "q1", type: "scale", prompt: "Насколько понятен фокус недели? (1 — неясно, 10 — полностью понятно)", required: true, options: [] },
    { id: "q2", type: "single", prompt: "Насколько перегружен(а) сейчас?", required: true, options: ["Спокойно", "Нормально", "На пределе", "Нужна помощь"] },
    { id: "q3", type: "multi", prompt: "Что съедало фокус?", required: false, options: ["Срочные запросы", "Встречи", "Переключения контекста", "Нехватка информации", "Зависимости"] },
    { id: "q4", type: "text", prompt: "Что хочешь поднять на ближайшем 1:1?", required: false, options: [] }
  ]
};
const SURVEY_ANON = {
  title: "Анонимно: как нам работается",
  description: "Анонимный опрос о культуре команды. Результаты видны, когда ответят не меньше трёх человек.",
  anonymous: true,
  anonymousMinResponses: 3,
  questions: [
    { id: "q1", type: "scale", prompt: "Могу ли я честно говорить о проблемах? (1 — нет, 10 — всегда)", required: true, options: [] },
    { id: "q2", type: "single", prompt: "Как часто я чувствую, что меня слышат?", required: true, options: ["Почти никогда", "Иногда", "Чаще да", "Всегда"] },
    { id: "q3", type: "text", prompt: "Что одно изменение сделало бы работу лучше?", required: false, options: [] }
  ]
};
const WEEKLY_ANSWERS = [
  [9, "Нормально", ["Встречи"], "Хочу обсудить ведение эпика."],
  [6, "На пределе", ["Срочные запросы", "Зависимости"], "Нужна помощь с приоритетами релиза."],
  [9, "Спокойно", [], ""],
  [5, "Нормально", ["Нехватка информации"], "Про стабильность тестов."],
  [8, "Нормально", ["Переключения контекста"], ""],
  [7, "Нормально", ["Нехватка информации"], "Как устроены сервисы?"]
];
const ANON_ANSWERS = [
  [7, "Чаще да", "Меньше встреч без повестки."],
  [9, "Всегда", ""],
  [5, "Иногда", "Чётче расставлять приоритеты."],
  [8, "Чаще да", "Больше времени на глубокую работу."],
  [6, "Иногда", ""]
];

async function main() {
  const admin = client();
  must(await admin("POST", "/api/login", { username: adminUsername, password: adminPassword }), "вход админа");

  // Повторный прогон: убираем то, что создали раньше, вместе с людьми.
  const known = new Set(["lead", ...PEOPLE.map((item) => item.key)]);
  const before = must(await admin("GET", "/api/workspace"), "чтение пространства админа");
  for (const user of before.users || []) {
    if (!known.has(String(user.username).toLowerCase())) continue;
    await admin("DELETE", `/api/users/${encodeURIComponent(user.id)}`);
    if (user.personId) await admin("DELETE", `/api/people/${encodeURIComponent(user.personId)}?permanent=1`);
  }

  const lead = must(
    await admin("POST", "/api/users", { role: "lead", username: "lead", password, name: "Ирина Соколова", teamLabel: TEAM }),
    "создание лида",
    [201]
  ).user;
  console.log(`лид: lead (${lead.id})`);

  const leadApi = client();
  must(await leadApi("POST", "/api/login", { username: "lead", password }), "вход лида");

  const people = {};
  for (const item of PEOPLE) {
    const created = must(
      await leadApi("POST", "/api/users", { role: "employee", username: item.key, password, personName: item.name, personRole: item.role }),
      `создание ${item.key}`,
      [201]
    );
    people[item.key] = { ...item, personId: created.user.personId, userId: created.user.id };
    must(
      await admin("PATCH", `/api/people/${encodeURIComponent(created.user.personId)}`, {
        meetingName: item.meeting,
        cadence: item.cadence,
        nextMeeting: item.next,
        managerFocus: item.focus
      }),
      `профиль ${item.key}`
    );
  }
  console.log(`участников: ${PEOPLE.length}`);

  // Рабочее пространство лида целиком одним сохранением.
  let ws = must(await leadApi("GET", "/api/workspace"), "чтение пространства");
  const stamp = Date.now().toString(36);
  const cards = [];
  const actions = [];
  const lprs = [];
  const goals = [];
  for (const item of PEOPLE) {
    const pid = people[item.key].personId;
    (CARDS[item.key] || []).forEach(([category, priority, source, title, body], index) => {
      cards.push({ id: `sc-${stamp}-${item.key}-${index}`, personId: pid, source, category, priority, status: index === 2 ? "discussing" : "todo", title, body });
    });
    (ACTIONS[item.key] || []).forEach(([owner, title, due], index) => {
      actions.push({ id: `sa-${stamp}-${item.key}-${index}`, personId: pid, owner, title, due, dueDate: "", done: index === 1 && item.key === "danila" });
    });
    const lpr = LPRS[item.key];
    if (lpr) {
      const lprId = `sl-${stamp}-${item.key}`;
      lprs.push({ id: lprId, personId: pid, title: lpr.title, focus: lpr.focus, status: "active" });
      lpr.goals.forEach(([title, progress, status, horizon], index) => {
        goals.push({ id: `sg-${stamp}-${item.key}-${index}`, personId: pid, lprId, title, description: "", horizon, progress, status, dueDate: "" });
      });
    }
  }
  const pulse = Object.fromEntries(PEOPLE.map((item) => [people[item.key].personId, { energy: item.pulse[0], load: item.pulse[1], clarity: item.pulse[2], trust: item.pulse[3] }]));
  const assessment = {
    id: `sca-${stamp}`,
    personId: people.anna.personId,
    title: "Кейс-интервью: фронтенд-архитектура",
    roleContext: "Senior Frontend · Платформа",
    source: "case-ai",
    status: "validated",
    scaleMax: 5,
    competencies: [
      { id: "cc1", name: "Архитектурное мышление", category: "Engineering", score: 3.5, targetScore: 4, evidence: "Хорошо раскладывает систему на слои, но редко фиксирует решения письменно.", recommendation: "Вести ADR для крупных решений." },
      { id: "cc2", name: "Коммуникация со стейкхолдерами", category: "Collaboration", score: 4.5, targetScore: 4.5, evidence: "Ясно объясняет компромиссы и сроки.", recommendation: "Удерживать практику коротких recap." },
      { id: "cc3", name: "Наставничество", category: "Leadership", score: 3, targetScore: 4, evidence: "Помогает по запросу, но не строит системную поддержку.", recommendation: "Назначить двух подопечных и регулярные ревью." }
    ],
    cases: [{ id: "cs1", title: "Миграция на новый роутер", summary: "Проверялись архитектура и коммуникация.", checkedCompetencies: ["Архитектурное мышление", "Коммуникация со стейкхолдерами"] }],
    recommendations: [{ id: "cr1", competencyName: "Наставничество", action: "Взять двух подопечных и вести еженедельное ревью", dueDate: "" }]
  };
  ws = must(
    await leadApi("POST", "/api/workspace", {
      ...ws,
      cards: [...ws.cards, ...cards],
      actions: [...ws.actions, ...actions],
      lprs: [...ws.lprs, ...lprs],
      goals: [...ws.goals, ...goals],
      competencyAssessments: [...(ws.competencyAssessments || []), assessment],
      pulse: { ...ws.pulse, ...pulse }
    }),
    "сохранение пространства"
  );
  console.log(`карточек ${cards.length}, шагов ${actions.length}, ЛПР ${lprs.length}, целей ${goals.length}`);

  for (const [key, notes] of Object.entries(NOTES)) {
    for (const [body, tags] of notes) {
      must(await leadApi("POST", "/api/manager-notes", { personId: people[key].personId, body, tags }), "заметка");
    }
  }

  // Опросы и ответы участников.
  const weekly = must(await leadApi("POST", "/api/surveys", SURVEY_WEEKLY), "опрос", [201]);
  const anon = must(await leadApi("POST", "/api/surveys", SURVEY_ANON), "анонимный опрос", [201]);
  const surveys = (await leadApi("GET", "/api/workspace")).json.surveys;
  const weeklyId = surveys.find((s) => s.title === SURVEY_WEEKLY.title)?.id;
  const anonId = surveys.find((s) => s.title === SURVEY_ANON.title)?.id;
  void weekly;
  void anon;
  for (const [index, item] of PEOPLE.entries()) {
    const api = client();
    must(await api("POST", "/api/login", { username: item.key, password }), `вход ${item.key}`);
    const [scale, single, multi, text] = WEEKLY_ANSWERS[index];
    const answers = { q1: { value: scale }, q2: { value: single }, q3: { values: multi } };
    if (text) answers.q4 = { value: text };
    must(await api("POST", `/api/surveys/${encodeURIComponent(weeklyId)}/respond`, { answers }), `ответ ${item.key}`, [200, 201]);
    if (index < ANON_ANSWERS.length) {
      const [s, c, t] = ANON_ANSWERS[index];
      const a = { q1: { value: s }, q2: { value: c } };
      if (t) a.q3 = { value: t };
      must(await api("POST", `/api/surveys/${encodeURIComponent(anonId)}/respond`, { answers: a }), `анонимный ответ ${item.key}`, [200, 201]);
    }
  }
  console.log("опросы и ответы готовы");

  // История пульса и журнал встреч: только через базу, только локально.
  if (process.env.DATABASE_URL) {
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "disable" ? false : undefined });
    await db.connect();
    try {
      const today = new Date();
      for (const item of PEOPLE) {
        const pid = people[item.key].personId;
        for (let week = 1; week <= 12; week += 1) {
          const day = new Date(today.getTime() - week * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
          const drift = (week - 6) / 6;
          const wobble = (n) => Math.max(1, Math.min(10, Math.round(item.pulse[n] + drift * (item.trend.startsWith("-") ? 1.5 : -1) + Math.sin(week + n) * 1.1)));
          await db.query(
            `insert into pulse_history (person_id, captured_at, energy, load, clarity, trust) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
            [pid, day, wobble(0), wobble(1), wobble(2), wobble(3)]
          );
        }
        const summaries = ["Обсудили приоритеты квартала и риски.", "Разобрали блокеры и договорились о следующих шагах.", "Поговорили о развитии и обратной связи."];
        for (let index = 0; index < 3; index += 1) {
          const held = new Date(today.getTime() - (index + 1) * 9 * 24 * 3600 * 1000).toISOString();
          await db.query(
            `insert into meeting_log (id, person_id, held_at, meeting_type, summary, attended) values ($1, $2, $3, 'regular', $4, true) on conflict do nothing`,
            [`sm-${stamp}-${item.key}-${index}`, pid, held, summaries[index]]
          );
        }
      }
      console.log("история пульса и журнал встреч записаны в базу");
    } finally {
      await db.end();
    }
  } else {
    console.log("DATABASE_URL не задан: история пульса и журнал встреч пропущены");
  }
  console.log(`Готово. Логины: lead, ${PEOPLE.map((p) => p.key).join(", ")}; пароль из SHOWCASE_PASSWORD.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
