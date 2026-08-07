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
  pulseTable,
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
  await syncRows(client, pulseTable, fromMap(db.pulse));
  await syncRows(client, notesTable, fromMap(db.notes));
  await syncRows(client, meetingDraftsTable, fromMap(db.meetingDrafts));
  await syncRows(client, surveysTable, db.surveys || []);
  await syncRows(client, surveyResponsesTable(surveySecretVersion), db.surveyResponses || []);
  await syncRows(client, managerNotesTable, db.managerNotes || []);
  await syncRows(client, meetingLogTable, db.meetingLog || []);
  await syncCompositeRows(client, oncallLoadTable, db.oncallLoad || []);

  // История пульса не синхронизируется по снимку: снимок содержит только то,
  // что клиент успел прочитать, и удаление «лишнего» стёрло бы историю,
  // которой в нём просто нет. Только upsert плюс ретеншн.
  await upsertRows(client, pulseHistoryTable, db.pulseHistory || []);
  const cutoff = new Date(Date.now() - pulseHistoryRetentionDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await client.query("delete from pulse_history where captured_at < $1::date", [cutoff]);

  if (!replaceAuth) return;

  await syncUsers(client, db.users);
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
