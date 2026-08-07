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

import { syncRows, syncCompositeRows, upsertRows, findStaleRows } from "./sync.js";
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

async function assertNoConflicts(client, db) {
  const rowsFor = { cards: db.cards, actions: db.actions, goals: db.goals || [], lprs: db.lprs || [] };
  const conflicts = [];
  for (const spec of VERSIONED) {
    const stale = await findStaleRows(client, spec, rowsFor[spec.table] || []);
    for (const id of stale) conflicts.push({ table: spec.table, id });
  }
  if (conflicts.length) throw new VersionConflictError(conflicts);
}

export async function syncWorkspace(client, db, options = {}) {
  const { replaceAuth = true, pulseHistoryRetentionDays = 365, surveySecretVersion = 1, checkVersions = false } = options;

  if (checkVersions) await assertNoConflicts(client, db);

  // Люди только upsert'ятся: удаление отложено до самого конца, после
  // пользователей. users.person_id — FK с on delete restrict, и попытка
  // снести человека раньше, чем уедет ссылающаяся на него учётка, падает.
  await upsertRows(client, peopleTable, db.people);
  await syncRows(client, lprsTable, db.lprs || []);
  await syncRows(client, cardsTable, db.cards);
  await syncRows(client, actionsTable, db.actions);
  await syncRows(client, goalsTable, db.goals || []);
  await syncRows(client, competencyAssessmentsTable, db.competencyAssessments || []);
  await syncRows(client, prepTable, fromMap(db.prep));
  await syncRows(client, notesTable, fromMap(db.notes));
  await syncRows(client, meetingDraftsTable, fromMap(db.meetingDrafts));
  await syncRows(client, surveysTable, db.surveys || []);
  await syncRows(client, surveyResponsesTable(surveySecretVersion), db.surveyResponses || []);
  await syncRows(client, managerNotesTable, db.managerNotes || []);
  await syncRows(client, meetingLogTable, db.meetingLog || []);
  await syncCompositeRows(client, oncallLoadTable, db.oncallLoad || []);

  // История пульса не синхронизируется по снимку: снимок содержит только то,
  // что клиент успел прочитать, и удаление «лишнего» стёрло бы историю,
  // которой в нём просто нет. Только upsert.
  await upsertRows(client, pulseHistoryTable, db.pulseHistory || []);

  // Текущий пульс — сегодняшняя точка истории (миграция 0026), и пишется он
  // строго ПОСЛЕ самой истории. Порядок здесь несущий: снимок может нести
  // сегодняшнюю точку, посчитанную независимо от db.pulse, и если записать
  // её последней, она станет «текущим пульсом», затерев то, что пользователь
  // только что выставил. Ровно так /api/reset подменял пульс демо-персон
  // сгенерированным значением с графика.
  const today = new Date().toISOString().slice(0, 10);
  await upsertRows(
    client,
    pulseHistoryTable,
    fromMap(db.pulse).map((row) => ({ ...row, capturedAt: today }))
  );
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

  await syncUsers(client, db.users);
  await syncTeams(client);
  await syncRows(client, sessionsTable, db.sessions || []);
  await client.query("delete from people where id <> all($1::text[])", [db.people.map((person) => person.id)]);
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
