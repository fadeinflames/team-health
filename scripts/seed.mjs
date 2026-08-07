#!/usr/bin/env node
// Демо-фикстуры: пять человек и всё, что к ним привязано.
//
// Раньше это выполнялось на каждом старте процесса внутри seedPostgres().
// Три следствия, из-за которых сидинг отсюда уехал:
//   - демо-люди воскресали после каждого рестарта, включая прод;
//   - удалённые демо-карточки возвращались;
//   - старт приложения зависел от данных разработчика.
//
// Теперь это ручная операция:
//   npm run seed        (или make seed)
//
// Вне APP_ENV=local отказывается работать без явного --force.
//
// Вставка идёт через unnest, а не построчным циклом: один round-trip вместо
// N. На пяти демо-персонах разницы не видно, но тот же приём нужен для
// импорта oncall, и держать два разных способа массовой вставки незачем.

import { scryptSync, randomBytes } from "node:crypto";
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
  buildSeedPulseHistory
} from "../fixtures/demo.mjs";

const force = process.argv.includes("--force");
const appEnv = process.env.APP_ENV || "local";

if (appEnv !== "local" && !force) {
  console.error(
    `APP_ENV=${appEnv}: сидинг демо-данными вне local надо подтвердить явно.\n` +
      "Если вы правда хотите залить демо-людей в это окружение: node scripts/seed.mjs --force"
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL не задан: сидинг работает только против postgres");
  process.exit(1);
}

function ssl() {
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

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, passwordHash: scryptSync(password, salt, 64).toString("hex") };
}

// Столбцовое представление: unnest раскладывает параллельные массивы в
// строки, поэтому данные удобнее готовить по колонкам, а не по записям.
function columns(rows, ...pickers) {
  return pickers.map((pick) => rows.map(pick));
}

const demoUsername = process.env.DEMO_USERNAME || "demo";
const demoPassword = process.env.DEMO_PASSWORD || "demo";

async function seedPeople(client) {
  await client.query(
    `
      insert into people
        (id, name, meeting_name, role, team, initials, next_meeting, cadence,
         manager_focus, last_summary, trend, meeting_type, mentorship_mode,
         growth_narrative, performance_narrative)
      select * from unnest(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
        $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[],
        $13::text[], $14::text[], $15::text[]
      )
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
        performance_narrative = excluded.performance_narrative
    `,
    columns(
      people,
      (p) => p.id,
      (p) => p.name,
      (p) => p.meetingName,
      (p) => p.role,
      (p) => p.team,
      (p) => p.initials,
      (p) => p.nextMeeting,
      (p) => p.cadence,
      (p) => p.managerFocus,
      (p) => p.lastSummary,
      (p) => p.trend,
      (p) => p.meetingType || "regular",
      (p) => p.mentorshipMode || "coach",
      (p) => p.growthNarrative || "",
      (p) => p.performanceNarrative || ""
    )
  );
}

async function seedPulse(client) {
  const rows = Object.entries(initialPulse).map(([personId, value]) => ({ personId, ...value }));
  await client.query(
    `
      insert into pulse (person_id, energy, load, clarity, trust)
      select * from unnest($1::text[], $2::int[], $3::int[], $4::int[], $5::int[])
      on conflict (person_id) do nothing
    `,
    columns(
      rows,
      (r) => r.personId,
      (r) => r.energy,
      (r) => r.load,
      (r) => r.clarity,
      (r) => r.trust
    )
  );
}

async function seedPrep(client) {
  const rows = Object.entries(initialPrep).map(([personId, value]) => ({ personId, ...value }));
  await client.query(
    `
      insert into prep (person_id, employee_agenda, manager_agenda, pulse, last_actions, growth, commitments)
      select * from unnest($1::text[], $2::bool[], $3::bool[], $4::bool[], $5::bool[], $6::bool[], $7::bool[])
      on conflict (person_id) do nothing
    `,
    columns(
      rows,
      (r) => r.personId,
      (r) => r.employeeAgenda,
      (r) => r.managerAgenda,
      (r) => r.pulse,
      (r) => r.lastActions,
      (r) => r.growth,
      (r) => r.commitments
    )
  );
}

async function seedNotes(client) {
  const rows = Object.entries(initialNotes).map(([personId, body]) => ({ personId, body }));
  await client.query(
    `
      insert into notes (person_id, body)
      select * from unnest($1::text[], $2::text[])
      on conflict (person_id) do update set body = excluded.body
    `,
    columns(
      rows,
      (r) => r.personId,
      (r) => r.body
    )
  );
}

async function seedLprs(client) {
  await client.query(
    `
      insert into lprs (id, person_id, title, focus, status, created_at, updated_at)
      select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::timestamptz[])
      on conflict (id) do update set
        person_id = excluded.person_id,
        title = excluded.title,
        focus = excluded.focus,
        status = excluded.status
    `,
    columns(
      initialLprs,
      (l) => l.id,
      (l) => l.personId,
      (l) => l.title,
      (l) => l.focus,
      (l) => l.status,
      (l) => l.createdAt,
      (l) => l.updatedAt
    )
  );
}

async function seedCards(client) {
  await client.query(
    `
      insert into cards (id, person_id, lpr_id, source, category, priority, status, title, body)
      select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
      on conflict (id) do update set
        person_id = excluded.person_id,
        lpr_id = excluded.lpr_id,
        source = excluded.source,
        category = excluded.category,
        priority = excluded.priority,
        status = excluded.status,
        title = excluded.title,
        body = excluded.body
    `,
    columns(
      initialCards,
      (c) => c.id,
      (c) => c.personId,
      (c) => c.lprId || null,
      (c) => c.source,
      (c) => c.category,
      (c) => c.priority,
      (c) => c.status,
      (c) => c.title,
      (c) => c.body
    )
  );
}

async function seedActions(client) {
  await client.query(
    `
      insert into actions (id, person_id, owner, title, due, due_label, due_date, done)
      -- $5 дважды: due и due_label — одно и то же значение, пока идёт
      -- expand-переход (миграция 0022), см. migrations/README.md
      select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $5::text[], $6::date[], $7::bool[])
      on conflict (id) do update set
        person_id = excluded.person_id,
        owner = excluded.owner,
        title = excluded.title,
        due = excluded.due,
        due_label = excluded.due_label,
        due_date = excluded.due_date,
        done = excluded.done
    `,
    columns(
      initialActions,
      (a) => a.id,
      (a) => a.personId,
      (a) => a.owner,
      (a) => a.title,
      (a) => a.due,
      (a) => a.dueDate || null,
      (a) => a.done
    )
  );
}

async function seedGoals(client) {
  await client.query(
    `
      insert into goals (id, person_id, lpr_id, title, description, horizon, progress, status, due_date, due_at)
      select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::text[], $9::text[], $10::date[])
      on conflict (id) do update set
        person_id = excluded.person_id,
        lpr_id = coalesce(goals.lpr_id, excluded.lpr_id),
        title = excluded.title,
        description = excluded.description,
        horizon = excluded.horizon,
        due_date = excluded.due_date,
        due_at = excluded.due_at
    `,
    columns(
      initialGoals,
      (g) => g.id,
      (g) => g.personId,
      (g) => g.lprId || null,
      (g) => g.title,
      (g) => g.description,
      (g) => g.horizon,
      (g) => g.progress,
      (g) => g.status,
      (g) => g.dueDate || "",
      (g) => g.dueDate || null
    )
  );
}

async function seedCompetencyAssessments(client) {
  await client.query(
    `
      insert into competency_assessments
        (id, person_id, title, role_context, source, status, scale_max, average_score,
         min_score, grade, competencies_json, cases_json, recommendations_json, created_at, validated_at)
      select * from unnest(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[],
        $8::numeric[], $9::numeric[], $10::text[], $11::jsonb[], $12::jsonb[], $13::jsonb[],
        $14::timestamptz[], $15::timestamptz[]
      )
      on conflict (id) do nothing
    `,
    columns(
      initialCompetencyAssessments,
      (a) => a.id,
      (a) => a.personId,
      (a) => a.title,
      (a) => a.roleContext,
      (a) => a.source,
      (a) => a.status,
      (a) => a.scaleMax,
      (a) => a.averageScore,
      (a) => a.minScore,
      (a) => a.grade,
      (a) => JSON.stringify(a.competencies),
      (a) => JSON.stringify(a.cases),
      (a) => JSON.stringify(a.recommendations),
      (a) => a.createdAt,
      (a) => a.validatedAt || null
    )
  );
}

async function seedPulseHistory(client) {
  const rows = buildSeedPulseHistory();
  await client.query(
    `
      insert into pulse_history (person_id, captured_at, energy, load, clarity, trust)
      select * from unnest($1::text[], $2::date[], $3::int[], $4::int[], $5::int[], $6::int[])
      on conflict (person_id, captured_at) do nothing
    `,
    columns(
      rows,
      (r) => r.personId,
      (r) => r.capturedAt,
      (r) => r.energy,
      (r) => r.load,
      (r) => r.clarity,
      (r) => r.trust
    )
  );
}

async function seedSurveys(client) {
  await client.query(
    `
      insert into surveys (id, title, description, anonymous, status, questions_json,
                           is_demo_seed, is_template, anonymous_min_responses, created_at)
      select * from unnest($1::text[], $2::text[], $3::text[], $4::bool[], $5::text[], $6::jsonb[],
                           $7::bool[], $8::bool[], $9::int[], $10::timestamptz[])
      on conflict (id) do update set
        title = excluded.title,
        description = excluded.description,
        anonymous = excluded.anonymous,
        status = excluded.status,
        questions_json = excluded.questions_json,
        is_demo_seed = excluded.is_demo_seed,
        is_template = excluded.is_template,
        anonymous_min_responses = excluded.anonymous_min_responses
    `,
    columns(
      initialSurveys,
      (s) => s.id,
      (s) => s.title,
      (s) => s.description,
      (s) => s.anonymous,
      (s) => s.status,
      (s) => JSON.stringify(s.questions),
      (s) => s.isDemoSeed === true,
      (s) => s.isTemplate === true,
      (s) => s.anonymousMinResponses || 3,
      (s) => s.createdAt
    )
  );
}

// Демо-учётка заводится только на пустой базе и только если её ещё нет.
// Пароль у неё слабый по определению — это витрина, а не доступ, и вне
// local такого пользователя быть не должно.
async function seedDemoLogin(client) {
  const existing = await client.query("select id from users where lower(username) = lower($1)", [demoUsername]);
  if (existing.rows[0]) return false;

  const lead = await client.query("select id from users where role = 'platform_admin' order by created_at limit 1");
  const { salt, passwordHash } = hashPassword(demoPassword);
  await client.query(
    `
      insert into users (id, username, name, role, person_id, lead_user_id, team_label, salt, password_hash)
      values ($1, $2, $3, 'employee', 'demo-sre', $4, '', $5, $6)
    `,
    [`user-${randomBytes(8).toString("hex")}`, demoUsername, "Демо участник команды", lead.rows[0]?.id || null, salt, passwordHash]
  );
  return true;
}

async function main() {
  const { default: pg } = await import("pg");
  const sslOption = ssl();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    application_name: "team-health-seed",
    ...(sslOption === undefined ? {} : { ssl: sslOption })
  });
  await client.connect();

  try {
    await client.query("begin");
    await seedPeople(client);
    await seedPulse(client);
    await seedPrep(client);
    await seedNotes(client);
    await seedLprs(client);
    await seedCards(client);
    await seedActions(client);
    await seedGoals(client);
    await seedCompetencyAssessments(client);
    await seedPulseHistory(client);
    await seedSurveys(client);
    // Дежурная нагрузка демо-персон намеренно чистится: цифры выгорания,
    // взятые с потолка, читаются как настоящие.
    await client.query("delete from oncall_load where person_id = any($1::text[])", [people.map((p) => p.id)]);
    const demoCreated = await seedDemoLogin(client);
    await client.query("commit");

    console.log(`Демо-данные залиты: ${people.length} человек, ${initialCards.length} карточек, ${initialActions.length} договорённостей.`);
    if (demoCreated) console.log(`Создана демо-учётка ${demoUsername}.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
