// Запись рабочего пространства.
//
// Семантика снаружи та же, что была: на входе снимок, на выходе база, ему
// соответствующая. Изменилось то, как это делается — вместо `delete from` по
// шестнадцати таблицам идёт upsert плюс удаление только того, чего в снимке
// нет. Строка, которая не менялась, не переписывается вообще: условие
// `is distinct from` в sync.js отсекает её до апдейта.
//
// Правильный ответ — гранулярные endpoint'ы вместо снимка целиком, но он
// требует правок фронтенда. Это промежуточный шаг, который снимает churn и
// потерю таймстемпов, не трогая клиент.
//
// Запись разностью. Снимок целиком и «удалить то, чего в нём нет» теряют чужие
// параллельные записи (см. комментарий в sync.js). Поэтому читающий код
// получает snapshotRows() — базу, с которой снимок прочитан, — и отдаёт её в
// syncWorkspace({ base }). С базой пишутся только изменённые и новые строки, а
// удаляются только ключи, которые снимок видел и потерял. Без базы поведение
// прежнее: полный снимок.

import {
  syncRows,
  syncCompositeRows,
  upsertRows,
  findStaleRows,
  snapshotTable,
  diffRows,
  deleteKeys,
  rowKey,
  rowSignature,
  signedColumns
} from "./sync.js";
import {
  peopleTable,
  lprsTable,
  cardsTable,
  actionsTable,
  goalsTable,
  competencyAssessmentsTable,
  prepTable,
  notesTable,
  meetingDraftsTable,
  pulseHistoryTable,
  oncallLoadTable,
  surveysTable,
  surveyResponsesTable,
  managerNotesTable,
  meetingLogTable,
  usersTable,
  sessionsTable
} from "./tables.js";

const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
let lastRetentionAt = 0;

function shouldRunRetention() {
  const now = Date.now();
  if (now - lastRetentionAt < RETENTION_INTERVAL_MS) return false;
  lastRetentionAt = now;
  return true;
}

// prep, pulse, notes и meeting_drafts приходят объектами, ключёванными по
// person_id. Разворачиваем в строки, чтобы дальше работать однообразно.
function fromMap(map, key = "personId") {
  return Object.entries(map || {}).map(([id, value]) =>
    typeof value === "object" && value !== null ? { [key]: id, ...value } : { [key]: id, body: value }
  );
}

// Конфликт версий. Отдельный класс, чтобы вызывающий код мог отличить его от
// любой другой ошибки записи и ответить 409, а не 500.
export class VersionConflictError extends Error {
  constructor(conflicts) {
    super("Данные изменились в другом месте");
    this.name = "VersionConflictError";
    this.conflicts = conflicts;
  }
}

// Таблицы, для которых имеет смысл проверять версию: те, что редактируются
// людьми параллельно. Журналы и производные данные сюда не входят — там
// конфликта в человеческом смысле не бывает.
const VERSIONED = [cardsTable, actionsTable, goalsTable, lprsTable];

const today = () => new Date().toISOString().slice(0, 10);

// Текущий пульс — сегодняшняя точка истории (миграция 0026). Снимок может
// нести сегодняшнюю точку, посчитанную независимо от db.pulse, и порядок
// несущий: pulse идёт ПОСЛЕ истории и перекрывает её по ключу. Иначе точка
// из истории затёрла бы то, что пользователь только что выставил: ровно так
// /api/reset подменял пульс демо-персон значением с графика.
function pulseHistoryRows(db) {
  const day = today();
  return [...(db.pulseHistory || []), ...fromMap(db.pulse).map((row) => ({ ...row, capturedAt: day }))];
}

// Все таблицы, которые пишет syncWorkspace, в порядке записи. Один список на
// чтение базы и на запись: если бы они разъехались, снимок перестал бы
// описывать то, что потом пишется.
//
// kind: "keyed" — один ключ, удаление «чего нет»; "composite" — составной
// ключ; "append" — только upsert (в полном режиме удаления нет вовсе).
function workspaceTables(db, surveySecretVersion) {
  return [
    { spec: lprsTable, rows: db.lprs || [], kind: "keyed" },
    { spec: cardsTable, rows: db.cards || [], kind: "keyed" },
    { spec: actionsTable, rows: db.actions || [], kind: "keyed" },
    { spec: goalsTable, rows: db.goals || [], kind: "keyed" },
    { spec: competencyAssessmentsTable, rows: db.competencyAssessments || [], kind: "keyed" },
    { spec: prepTable, rows: fromMap(db.prep), kind: "keyed" },
    { spec: notesTable, rows: fromMap(db.notes), kind: "keyed" },
    { spec: meetingDraftsTable, rows: fromMap(db.meetingDrafts), kind: "keyed" },
    { spec: surveysTable, rows: db.surveys || [], kind: "keyed" },
    { spec: surveyResponsesTable(surveySecretVersion), rows: db.surveyResponses || [], kind: "keyed" },
    { spec: managerNotesTable, rows: db.managerNotes || [], kind: "keyed" },
    { spec: meetingLogTable, rows: db.meetingLog || [], kind: "keyed" },
    { spec: oncallLoadTable, rows: db.oncallLoad || [], kind: "composite" },
    { spec: pulseHistoryTable, rows: pulseHistoryRows(db), kind: "append" }
  ];
}

// Базовое состояние: для каждой таблицы Map ключ -> подпись значений колонок.
// Подпись считается теми же функциями value(), что идут в upsert, поэтому
// «подпись не изменилась» значит «upsert записал бы то же самое».
//
// Объект непрозрачный: его надо хранить рядом со снимком и вернуть в
// syncWorkspace как есть. Считать его надо ОДИН раз при чтении, до любых
// правок снимка в памяти, и по тому, что реально прочитано из базы.
export function snapshotRows(db, { surveySecretVersion = 1 } = {}) {
  const base = {
    people: snapshotTable(peopleTable, db.people || []),
    users: snapshotTable(usersTable, db.users || []),
    sessions: snapshotTable(sessionsTable, db.sessions || [])
  };
  for (const { spec, rows } of workspaceTables(db, surveySecretVersion)) {
    base[spec.table] = snapshotTable(spec, rows);
  }
  return base;
}

async function assertNoConflicts(client, changedByTable) {
  const conflicts = [];
  for (const spec of VERSIONED) {
    const stale = await findStaleRows(client, spec, changedByTable.get(spec.table) || []);
    for (const id of stale) conflicts.push({ table: spec.table, id });
  }
  if (conflicts.length) throw new VersionConflictError(conflicts);
}

export async function syncWorkspace(client, db, options = {}) {
  const {
    replaceAuth = true,
    pulseHistoryRetentionDays = 365,
    surveySecretVersion = 1,
    checkVersions = false,
    base = null
  } = options;

  const tables = workspaceTables(db, surveySecretVersion);
  const baseOf = (spec) => (base ? base[spec.table] || new Map() : null);

  // Разница с базой считается один раз и используется и проверкой версий, и
  // записью. В полном режиме (без base) разницы нет: «изменено» — всё.
  const plans = new Map();
  const plan = (spec, rows) => {
    if (!plans.has(spec.table)) plans.set(spec.table, diffRows(spec, rows, baseOf(spec)));
    return plans.get(spec.table);
  };

  if (checkVersions) {
    // Версию проверяем только у строк, которые этот запрос меняет: клиент с
    // устаревшим updatedAt у нетронутой карточки не должен получать конфликт
    // из-за того, что сосед поправил её, пока форма была открыта.
    const changedByTable = new Map();
    for (const { spec, rows } of tables) {
      if (VERSIONED.includes(spec)) changedByTable.set(spec.table, base ? plan(spec, rows).changed : rows);
    }
    await assertNoConflicts(client, changedByTable);
  }

  const syncTable = async ({ spec, rows, kind }) => {
    if (!base) {
      if (kind === "keyed") await syncRows(client, spec, rows);
      else if (kind === "composite") await syncCompositeRows(client, spec, rows);
      // История и текущий пульс могут нести одну и ту же точку (человек,
      // сегодня); в одном insert ... on conflict дубликат ключа — ошибка,
      // поэтому набор сводится по ключу, побеждает последняя строка (пульс).
      else await upsertRows(client, spec, diffRows(spec, rows, null).changed);
      return;
    }
    const { changed, removed } = plan(spec, rows);
    await upsertRows(client, spec, changed);
    // pulse_history не синхронизируется по снимку: снимок содержит только
    // то, что клиент успел прочитать, и удаление «лишнего» стёрло бы историю.
    if (kind !== "append") await deleteKeys(client, spec, removed);
  };

  // Люди только upsert'ятся: удаление отложено до самого конца, после
  // пользователей. users.person_id — FK с on delete restrict, и попытка
  // снести человека раньше, чем уедет ссылающаяся на него учётка, падает.
  if (base) await upsertRows(client, peopleTable, plan(peopleTable, db.people).changed);
  else await upsertRows(client, peopleTable, db.people);

  // Порядок как раньше; pulse_history (с текущим пульсом, он последний в её
  // строках, см. pulseHistoryRows) идёт последней из таблиц.
  for (const table of tables) await syncTable(table);

  // Ретеншн — не дело пользовательской транзакции. Раньше `delete ... where
  // captured_at < cutoff` выполнялся при каждой записи пульса: лишний
  // диапазонный скан и лишний лок в горячем пути ради строк, которые никуда
  // не денутся за следующий час.
  if (shouldRunRetention()) {
    const cutoff = new Date(Date.now() - pulseHistoryRetentionDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // Последняя точка каждого человека не удаляется никогда: с миграции 0026
    // именно она и есть его текущий пульс, и вычистить её значит стереть
    // показатель, а не историю.
    const { rowCount } = await client.query(
      `
        delete from pulse_history old
        where old.captured_at < $1::date
          and exists (
            select 1 from pulse_history newer
            where newer.person_id = old.person_id and newer.captured_at > old.captured_at
          )
      `,
      [cutoff]
    );
    if (rowCount) console.log(`Ретеншн pulse_history: удалено строк ${rowCount}`);
  }

  if (!replaceAuth) return;

  if (base) {
    await syncUsersByDiff(client, db.users, plan(usersTable, db.users || []), base.users || new Map());
    await syncTeams(client);
    const sessions = plan(sessionsTable, db.sessions || []);
    // Сессии, которых в базе не было (заведены параллельным логином), здесь
    // не удаляются и не перезаписываются: удаляются только те, что снимок
    // видел и потерял, upsert идёт только по новым и изменившимся.
    await upsertRows(client, sessionsTable, sessions.changed);
    await deleteKeys(client, sessionsTable, sessions.removed);
    await deleteKeys(client, peopleTable, plan(peopleTable, db.people).removed);
    return;
  }

  await syncUsers(client, db.users);
  await syncTeams(client);
  await syncRows(client, sessionsTable, db.sessions || []);
  await client.query("delete from people where id <> all($1::text[])", [db.people.map((person) => person.id)]);
}

// Колонки учётной записи, которые не относятся к паролю. Запись по ним
// отделена от записи credentials: пользователь, которому эта операция
// пароль не меняла, не должен получить обратно старые salt и hash,
// прочитанные до параллельной смены пароля.
const USER_PROFILE_COLUMNS = ["username", "name", "role", "person_id", "team_label"];
const USER_CREDENTIAL_COLUMNS = ["salt", "password_hash"];

// Обновление профиля существующих учёток без credentials. Именно update, а
// не upsert: если учётку успели удалить параллельно, воскрешать её без
// пароля нельзя, и отсутствие строки здесь просто пропускается.
async function updateUserProfiles(client, users) {
  if (!users.length) return;
  const idColumn = usersTable.columns.find((column) => column.name === "id");
  const columns = USER_PROFILE_COLUMNS.map((name) => usersTable.columns.find((column) => column.name === name));
  const source = [idColumn, ...columns];
  await client.query(
    `
      update users u set ${columns.map((column) => `${column.name} = src.${column.name}`).join(", ")}
      from unnest(${source.map((column, index) => `$${index + 1}::${column.type}[]`).join(", ")})
        as src(${source.map((column) => column.name).join(", ")})
      where u.id = src.id
        and (${columns.map((column) => `u.${column.name}`).join(", ")})
          is distinct from (${columns.map((column) => `src.${column.name}`).join(", ")})
    `,
    source.map((column) => users.map(column.value))
  );
}

// Пользователи разностью. Те же два прохода, что в syncUsers, но только по
// изменённым строкам, и credentials пишутся только тем, у кого они изменились
// относительно базы.
async function syncUsersByDiff(client, users, { changed, removed }, baseUsers) {
  // Пустой список — сбой выше по стеку, а не команда разлогинить всех (см.
  // syncUsers). Пропускаем и удаление: removed в этом случае был бы всей базой.
  if (!Array.isArray(users) || users.length === 0) {
    console.warn("syncUsers получил пустой список пользователей — пропускаю, чтобы не снести логины");
    return;
  }

  await deleteKeys(client, usersTable, removed);

  const signed = signedColumns(usersTable).map((column) => column.name);
  const credentialIndexes = USER_CREDENTIAL_COLUMNS.map((name) => signed.indexOf(name));
  const credentialsChanged = (user) => {
    const before = baseUsers.get(rowKey(usersTable, user));
    // Строки нет в базе — новая учётка, пишется целиком.
    if (before === undefined) return true;
    const after = JSON.parse(rowSignature(usersTable, user));
    const was = JSON.parse(before);
    return credentialIndexes.some((index) => was[index] !== after[index]);
  };

  const withCredentials = changed.filter(credentialsChanged);
  const profileOnly = changed.filter((user) => !withCredentials.includes(user));
  await upsertRows(client, usersTable, withCredentials);
  await updateUserProfiles(client, profileOnly);

  if (!changed.length) return;
  await client.query(
    `
      update users u set lead_user_id = src.lead_user_id
      from unnest($1::text[], $2::text[]) as src(id, lead_user_id)
      where u.id = src.id and u.lead_user_id is distinct from src.lead_user_id
    `,
    [changed.map((user) => user.id), changed.map((user) => user.leadUserId || null)]
  );
}

// Пользователи в два прохода: lead_user_id ссылается на другого пользователя,
// который может появиться в том же наборе позже. Оба прохода — по одному
// запросу, а не по запросу на строку.
async function syncUsers(client, users) {
  // Пустой массив здесь означал бы «удалить все логины». Это никогда не
  // бывает намерением: снимок без пользователей — это сбой выше по стеку,
  // а не команда разлогинить всех.
  if (!Array.isArray(users) || users.length === 0) {
    console.warn("syncUsers получил пустой список пользователей — пропускаю, чтобы не снести логины");
    return;
  }

  await client.query("delete from users where id <> all($1::text[])", [users.map((user) => user.id)]);
  await upsertRows(client, usersTable, users);
  await client.query(
    `
      update users u set lead_user_id = src.lead_user_id
      from unnest($1::text[], $2::text[]) as src(id, lead_user_id)
      where u.id = src.id and u.lead_user_id is distinct from src.lead_user_id
    `,
    [users.map((user) => user.id), users.map((user) => user.leadUserId || null)]
  );
}

// Команды как производная проекция.
//
// Expand-шаг из миграции 0024 создал таблицу и разложил по ней существующие
// связи. Здесь она поддерживается в актуальном состоянии: пока принадлежность
// команде выражена через users.lead_user_id и team_label, teams пересчитывается
// из них при каждой записи.
//
// Так у следующего релиза, который переключит чтение скоупа на team_id, не
// будет разрыва: колонка уже заполнена и не отстаёт. После переключения
// направление меняется на противоположное — teams становится источником
// правды, а эта функция уходит вместе с team_label.
//
// Каждый запрос идемпотентен и заканчивается `is distinct from`, поэтому на
// неизменившихся данных не пишет ничего.
async function syncTeams(client) {
  // Команда на каждого, кто кем-то руководит.
  await client.query(`
    insert into teams (name, lead_user_id)
    select coalesce(nullif(u.team_label, ''), u.name), u.id
    from users u
    where u.role in ('lead', 'platform_admin')
    on conflict (lead_user_id) where lead_user_id is not null do nothing
  `);

  // Переименование команды подхватывается, но пустой team_label не затирает
  // уже осмысленное имя.
  await client.query(`
    update teams t set name = u.team_label
    from users u
    where u.id = t.lead_user_id
      and u.team_label <> ''
      and t.name is distinct from u.team_label
  `);

  // Лид — в своей команде, подчинённые — в команде своего лида, все
  // остальные — вне команд.
  await client.query(`
    update users u set team_id = resolved.team_id
    from (
      select u2.id, coalesce(own.id, inherited.id) as team_id
      from users u2
      left join teams own on own.lead_user_id = u2.id
      left join teams inherited on inherited.lead_user_id = u2.lead_user_id
    ) as resolved
    where u.id = resolved.id and u.team_id is distinct from resolved.team_id
  `);

  // Люди наследуют команду через связанную учётную запись. Человек без
  // учётки остаётся без team_id: угадывать принадлежность по совпадению
  // строки people.team значит тихо слепить вместе «Платформа» и «платформа».
  await client.query(`
    update people p set team_id = u.team_id
    from users u
    where u.person_id = p.id and p.team_id is distinct from u.team_id
  `);
}
