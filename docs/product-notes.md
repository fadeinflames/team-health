# Product Notes

## Source-backed decisions

- GitLab Handbook recommends a consistent 1:1 agenda, both parties adding items, keeping the document open during the week, and populating agenda items at least 24 hours in advance: https://handbook.gitlab.com/handbook/leadership/1-1/
- Atlassian emphasizes a collaborative agenda, employee-led discussion, clear action items, and resisting unnecessary rescheduling: https://www.atlassian.com/blog/teamwork/running-successful-one-on-one-meetings
- Culture Amp groups useful 1:1 questions around wellbeing, alignment, progress, relationships, and career aspirations: https://www.cultureamp.com/blog/one-on-one-meeting-questions
- Railway documentation recommends React/Vite as a supported path, supports config-as-code via `railway.json`, and allows explicit build/start commands: https://docs.railway.com/guides/react and https://docs.railway.com/config-as-code

## Product scope

This version is a working Node + React platform deployed as a Railway service. It has server-side auth, normalized PostgreSQL storage in production, local file fallback for development, a stable product sidebar, onboarding intro, admin team management, employee-scoped workspaces, shared 1:1 agendas, pulse signals, preparation checklists, private manager notes, and action items.

## Data model to persist later

- `people`: employee profile, role, team, cadence, manager focus.
- `pulse`: energy, load, clarity, trust.
- `cards`: person, source, category, priority, status, title, body.
- `prep`: checklist state per person.
- `actions`: owner, title, due date, completion.
- `notes`: private manager notes.

## Access model implemented

- Admin login is seeded from `ADMIN_USERNAME` / `ADMIN_PASSWORD`, defaulting to `mgusev` / `passwb121`.
- Demo login is seeded from `DEMO_USERNAME` / `DEMO_PASSWORD`, defaulting to `demo` / `demo`, and is scoped to a ready SRE 1:1.
- In production, data lives in normalized PostgreSQL tables. Local file storage is only a fallback when `DATABASE_URL` is absent.
- The frontend bundle does not contain employee seed data; it calls `/api/workspace` after login.
- Admin receives the full team workspace and can create employee logins.
- Admin can add employees from the “Команда” view and reset demo data without being logged out.
- Admin manages logins inside the “Команда” view: real accounts and demo accounts are separated, employee passwords can be reset, and every non-admin login can be deleted, including demo logins.
- The admin account `mgusev` is protected from in-app deletion or password reset because it is controlled by environment defaults.
- Employee receives only the workspace rows scoped to their `personId`; `users` and `notes` are returned as empty collections.

## PostgreSQL tables

- `people`
- `users`
- `sessions`
- `pulse`
- `prep`
- `notes`
- `cards`
- `actions`
