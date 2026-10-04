# Product Notes

## Source-backed decisions

- GitLab Handbook recommends a consistent 1:1 agenda, both parties adding items, keeping the document open during the week, and populating agenda items at least 24 hours in advance: https://handbook.gitlab.com/handbook/leadership/1-1/
- Atlassian emphasizes a collaborative agenda, employee-led discussion, clear action items, and resisting unnecessary rescheduling: https://www.atlassian.com/blog/teamwork/running-successful-one-on-one-meetings
- Culture Amp groups useful 1:1 questions around wellbeing, alignment, progress, relationships, and career aspirations: https://www.cultureamp.com/blog/one-on-one-meeting-questions
- Railway documentation recommends React/Vite as a supported path, supports config-as-code via `railway.json`, and allows explicit build/start commands: https://docs.railway.com/guides/react and https://docs.railway.com/config-as-code

## Product scope

Team Health 1:1 is a general team-management platform for recurring 1:1s, growth conversations, goals, feedback, team pulse, agreements, and follow-up. It should read as useful for Product, Engineering, Support, Sales, Operations, People teams, and other manager-led teams.

SRE/Ops/on-call is a domain template, not the primary product category. Domain-specific signals can be added on top of the universal workflow without making the whole product feel SRE-only.

This version is a working Node + React platform deployed as a Railway service. It has server-side auth, normalized PostgreSQL storage in production, local file fallback for development, a stable product sidebar, onboarding intro, admin team management, lead-scoped workspaces, employee-scoped workspaces, shared 1:1 agendas, live meeting protocol drafts, pulse signals, preparation checklists, private manager notes, LPRs, goals, surveys, reports, meeting history, and action items.

## Persisted data model

The schema is created by SQL migrations (`migrations/`), not by the application; `db/schema.sql` is the committed snapshot and the source of truth for columns. Tables:

- `people`: employee profile, role, team, cadence, manager focus.
- `users`, `sessions`: logins and server-side sessions (one active session per user).
- `teams`: team as an object, derived from `users.lead_user_id` and `team_label` on every credentials-carrying write; not yet used for scoping.
- `pulse_history`: energy, load, clarity, trust per person per day (also used for trend reports and risk signals). `pulse` is a **view** over it (the latest point per person is the current pulse), not a table; do not write into it.
- `cards`: person, source, category, priority, status, title, body.
- `prep`: checklist state per person.
- `actions`: owner, title, due date, completion.
- `notes`: current text of the private manager note about a person (one row per person). The history of private notes lives in `manager_notes`.
- `lprs`: learning/development plans linked to 1:1 topics and goals.
- `goals`: measurable goals with progress, status, due date, and optional LPR link.
- `competency_assessments`: structured case-interview reports with competency scores, grade, evidence, recommendations, and LPR-importable growth actions.
- `surveys`: survey templates and live team surveys.
- `survey_responses`: scoped or anonymous answers.
- `manager_notes`: private manager note history.
- `oncall_load`: optional Ops/on-call domain signal table.
- `meeting_log`: generated 1:1 summaries and meeting history.
- `meeting_drafts`: live shared protocol text for the current 1:1 by person.
- `app_meta`: service records (fingerprints of the admin password and the survey secret, survey secret generation).
- `pgmigrations`: migration journal maintained by `node-pg-migrate`.

## Access model implemented

- Admin login comes from `ADMIN_USERNAME` (defaults to `admin`) and `ADMIN_PASSWORD`, which has no default in any environment: outside `local` a missing password refuses the start, in `local` one is generated on first run and printed once. `make secrets` generates it; `make admin-password` rotates it without a restart.
- Demo login is created by `scripts/seed.mjs` (`make seed`) from `DEMO_USERNAME` / `DEMO_PASSWORD` (in file mode the app itself creates it). In the docker stack `make env` generates a random `DEMO_PASSWORD` into `.env`; `demo` / `demo` only applies where `DEMO_PASSWORD` is unset (file mode on the host, the compose test profile). The account is scoped to a ready universal 1:1. It is not recreated on every start, and seeding is forbidden outright in production.
- In production, data lives in normalized PostgreSQL tables. Local file storage is only a fallback when `DATABASE_URL` is absent.
- Saving the workspace writes only what changed (diff against the state the request was read from), and a row deleted by omission from the client body is removed only if the client reported it as seen (`knownIds`); concurrent edits of the same row end in a `409` conflict banner. See `docs/adr/0001-write-model.md`.
- Changing your own password requires the current password.
- The frontend bundle does not contain employee seed data; it calls `/api/workspace` after login.
- Platform admin receives the full team workspace and can create lead or employee logins.
- Leads receive only their scoped team workspace.
- Admin can add employees from the “Команда” view. Demo reset keeps the admin session locally, but is disabled in production (`APP_ENV=production`, or Railway detected by `RAILWAY_ENVIRONMENT`) unless `ENABLE_DEMO_RESET=1`.
- Admin manages logins inside the “Админка” view: real accounts and demo accounts are separated, employee passwords can be reset, and every non-admin login can be deleted, including demo logins.
- The admin account named by `ADMIN_USERNAME` is protected from in-app deletion or password reset because its password lifecycle belongs to the environment and to `scripts/admin-password.mjs`.
- Employee receives only the workspace rows scoped to their `personId`; `users` and `notes` are returned as empty collections.

## PostgreSQL tables

- `people`
- `users`
- `sessions`
- `teams`
- `cards`
- `actions`
- `lprs`
- `goals`
- `competency_assessments`
- `prep`
- `notes`
- `pulse_history` (and `pulse`, a view over it)
- `surveys`
- `survey_responses`
- `manager_notes`
- `oncall_load`
- `meeting_log`
- `meeting_drafts`
- `app_meta`
- `pgmigrations` (migration journal, not part of `db/schema.sql`)
