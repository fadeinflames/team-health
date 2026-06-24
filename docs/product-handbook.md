# Team Health 1:1 Product Handbook

Last updated: 2026-06-24

This handbook is the human-written companion for README, DeepWiki, and release reviews. It explains the product, the workflows it supports, and the implementation boundaries that matter before a production deploy.

## 1. Product Thesis

Team Health 1:1 is a lightweight team-management platform for managers, team leads, and employees who want recurring 1:1s to produce durable signal instead of scattered meeting notes.

The product connects:

- recurring 1:1 agendas;
- participant and manager preparation;
- live meeting protocol notes;
- pulse signals: energy, load, clarity, trust;
- action items with owners and dates;
- LPRs, goals, and growth plans;
- team surveys with scoped access and anonymous aggregates;
- competency and case-interview reports;
- team-level reporting for trends, risks, and follow-up.

The product is intentionally not a generic CRM and not a narrow SRE-only tool. SRE/Ops/on-call data can be plugged in as a domain template, but the core model is universal: people, conversations, agreements, progress, and team health.

## 2. Roles

### Platform Admin

The platform admin can see the whole working team, create lead and employee logins, manage passwords, delete non-admin users, manage people, run reports, create surveys, and manage demo/local reset flows.

Production safety: `/api/reset` is disabled when `RAILWAY_ENVIRONMENT` is set unless `ENABLE_DEMO_RESET=1` is also set. The UI receives `canResetDemo` from the server and hides the reset action when production reset is disabled.

### Lead

A lead sees only their scoped team. They can work with their people, create employee logins for their scope, run 1:1s, create team surveys for their audience, manage LPRs/goals, and see reports only for visible people.

Lead scoping is based on explicit `leadUserId` and fallback team labels where needed.

### Employee

An employee sees only their own workspace:

- own profile;
- own agenda cards;
- own actions;
- own pulse and prep state;
- own LPRs, goals, surveys, meeting drafts, and competency assessments;
- no global users list;
- no manager private notes;
- no data for other people.

### Demo

The demo account is a seeded employee-like workspace with ready 1:1 data. Local defaults are `demo/demo`; production should set explicit `DEMO_USERNAME` and `DEMO_PASSWORD` if demo access is intended.

## 3. Core 1:1 Workflow

### 3.1 Agenda Between Meetings

Both lead and employee can add agenda cards. Cards include title, details, source, priority, status, and optional links to development plans. This makes the meeting agenda an ongoing collection point, not a document created five minutes before the call.

### 3.2 Preparation

Each person has a preparation checklist. Employees can mark their own agenda and pulse readiness; leads can prepare manager agenda, notes, and next steps. The checklist exists to make the 1:1 less dependent on memory and less likely to collapse into "how are things?"

### 3.3 Pulse

Pulse tracks four dimensions:

- energy;
- load;
- clarity;
- trust.

The product keeps current pulse state and historical snapshots. Reports use this to surface risk, trend, and mismatch signals.

### 3.4 Live Meeting Protocol

`meetingDrafts` store a shared live protocol per person. The frontend saves it through a narrow meeting-state API:

```http
PATCH /api/people/:personId/meeting-state
```

This endpoint updates only meeting-local fields: selected prep keys, pulse values, and the meeting draft. It avoids overwriting unrelated workspace data such as users, passwords, surveys, or other people's rows.

### 3.5 Summary and Meeting Log

The "Итоги встречи" flow builds a summary from current agenda, protocol, and actions. Meeting summaries are saved in `meeting_log`. The current implementation can create duplicate log entries if the summary action is clicked repeatedly; this is a known release risk, not a data isolation issue.

### 3.6 Action Items

Actions include title, owner, due date, status, and person scope. Agenda cards can be converted into action items, and duplicate quick actions are blocked in the UI where possible.

## 4. Development, Goals, and Competencies

### LPR

LPRs connect recurring 1:1 topics to development focus. They have status and links to person-specific goals.

### Goals

Goals track progress, status, due date, and optional LPR linkage. Reports include goal progress and overdue/open action signals.

### Competency Assessments

Competency reports capture structured case-interview or review data:

- person;
- title and role context;
- source: `case-ai`, `manual`, or `review`;
- status: `draft` or `validated`;
- competencies with category, score, target score, evidence, and recommendation;
- case summaries;
- recommendations that can become LPR growth actions.

The frontend can parse table-like pasted rows and build an assessment. Reports aggregate assessments into a team matrix with strengths, weak spots, and bus-factor style coverage risks. CSV export is available for the matrix.

## 5. Surveys

Surveys support templates and custom questions. Question types include scale, single choice, multiple choice, text, and date.

Access and privacy rules:

- surveys are scoped by owner/team audience;
- leads cannot read/delete/copy unrelated surveys by direct id;
- anonymous survey results stay hidden until `anonymousMinResponses` is reached;
- repeated anonymous answers from the same user update the previous response through a server-side hash;
- anonymous text/date answers are redacted in aggregate output and CSV export; only counts are shown.

This keeps anonymous mode closer to "aggregate signal" and avoids turning a small-team text answer into accidental identity disclosure.

## 6. Reports

Reports combine:

- pulse averages and risk signals;
- open agenda themes;
- priorities;
- action item status;
- goals and LPR state;
- meeting history;
- survey aggregates;
- competency matrix rows;
- weak competencies and coverage risks.

The goal is not just dashboards. Reports should create the next management action: follow-up, development focus, survey, or process improvement.

## 7. Backend Architecture

The backend is a custom ESM Node.js HTTP server in `server.js`.

Main responsibilities:

- static serving of `dist`;
- JSON parsing and API error handling;
- auth and session cookies;
- password hashing with Node.js `scrypt`;
- login rate limiting by username and IP;
- production secret validation;
- PostgreSQL migration and seed data;
- local file fallback for development;
- workspace normalization and sanitization;
- scoped workspace serialization;
- survey anonymity and aggregation;
- narrow meeting-state patches;
- Railway health endpoint through `/`.

Important API routes:

- `POST /api/login`;
- `POST /api/logout`;
- `GET /api/me`;
- `PATCH /api/me`;
- `POST /api/me/password`;
- `GET /api/workspace`;
- `POST /api/workspace`;
- `PATCH /api/people/:personId/meeting-state`;
- `POST /api/users`;
- `POST /api/users/:id/password`;
- `PATCH /api/users/:id`;
- `DELETE /api/users/:id`;
- `POST /api/people`;
- `PATCH /api/people/:id`;
- `DELETE /api/people/:id`;
- `POST /api/people/:id/restore`;
- `POST /api/meetings/log`;
- `POST /api/oncall/ingest`;
- `POST /api/manager-notes`;
- `DELETE /api/manager-notes/:id`;
- `POST /api/surveys`;
- `POST /api/surveys/:id/template`;
- `DELETE /api/surveys/:id`;
- `POST /api/surveys/:id/respond`;
- `POST /api/reset`.

## 8. Data Model

Production PostgreSQL tables are created idempotently on startup:

- `people`;
- `users`;
- `sessions`;
- `pulse`;
- `prep`;
- `notes`;
- `cards`;
- `actions`;
- `lprs`;
- `goals`;
- `competency_assessments`;
- `pulse_history`;
- `surveys`;
- `survey_responses`;
- `manager_notes`;
- `oncall_load`;
- `meeting_log`;
- `meeting_drafts`.

Local development uses `.data/workspace.json` when `DATABASE_URL` is absent. Production on Railway refuses file storage unless `ALLOW_FILE_STORAGE=1` is explicitly set.

## 9. Frontend Architecture

The React app lives mostly in `src/App.jsx` with styling in `src/styles.css`.

Sections:

- Home;
- 1:1 meetings;
- LPR;
- Goals;
- Surveys;
- Reports;
- Team;
- Admin;
- Settings.

State model:

- `workspace` contains server-scoped data;
- `commitWorkspace` saves full workspace snapshots;
- `queueMeetingStateSave` saves live meeting fields through the narrow meeting-state API;
- form drafts are local React state;
- role flags (`isPlatformAdmin`, `isAdmin`, `canCreateLeadLogin`, `canResetDemo`) derive UI permissions from the server-provided user object.

The frontend should not be treated as the security boundary. Server scoping and sanitization are the source of truth.

## 10. Deployment

Railway config:

- build command: `npm run build`;
- start command: `npm run start`;
- healthcheck path: `/`;
- restart policy: `ON_FAILURE`;
- PostgreSQL required through `DATABASE_URL` for normal production.

Required or recommended environment variables:

- `PORT`: set by Railway;
- `DATABASE_URL`: Railway PostgreSQL;
- `ADMIN_USERNAME`;
- `ADMIN_PASSWORD`: must not be default in Railway;
- `DEMO_USERNAME`;
- `DEMO_PASSWORD`;
- `SURVEY_RESPONSE_SECRET`;
- `TRUST_PROXY=1` if running behind a proxy outside Railway;
- `ENABLE_DEMO_RESET=1` only for an intentional resettable demo environment;
- `ALLOW_FILE_STORAGE=1` only for a conscious production file-storage exception.

## 11. Verification

Local release checks:

```bash
npm run build
npm run test:smoke
npm run test:ui
npm audit --audit-level=high
git diff --check
```

Smoke coverage includes:

- unauthenticated API rejection;
- login and reset flows;
- admin team creation;
- lead and employee scoping;
- password reset/session invalidation;
- meeting draft save through full workspace and meeting-state APIs;
- forbidden cross-person meeting-state updates;
- demo scoping;
- lead/team isolation;
- competency assessment scoping;
- survey anonymity and text redaction.

UI audit coverage includes:

- desktop and mobile viewport checks;
- main section navigation;
- no browser console errors;
- no horizontal overflow offenders.

Important: smoke and UI tests mutate shared local state and must run sequentially against the same local server.

## 12. Known Release Risks

Current known risks before a larger production rollout:

- full `POST /api/workspace` saves are still last-write-wins snapshots, so concurrent broad edits can overwrite unrelated changes;
- repeated "Итоги встречи" clicks can create duplicate meeting-log entries;
- demo credentials must be intentionally configured before exposing a public demo;
- CSS was covered by UI audit across main screens, but not every possible long-content edge case has visual regression coverage.

## 13. Source Notes for 1:1 Process Positioning

The product process is aligned with public 1:1 management material used during content preparation:

- TeamLead Conf abstract for "One-to-One-встречи и культура доверия" frames 1:1s as a retention and trust tool, including development management and prevention of drama, resentment, and unmet expectations.
- KOTELOV podcast notes for "Почему one-to-one — это не просто формальность?" emphasize avoiding a shallow "как дела?" format, preparing context before the meeting, and aiming for win-win outcomes.
- The other referenced YouTube videos are used by title/topic because transcripts were not accessible from the current environment.
