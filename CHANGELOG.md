# Changelog

## Unreleased

Schema management moves out of the application into migrations, secrets get a lifecycle, and mutations stop rewriting the whole database.

### Breaking

- **Demo data is no longer recreated on start.** `seedPostgres()` used to run on every boot, so deleted demo people, cards and goals came back after a restart — including in production. Seeding is now `make seed` / `npm run seed`, refuses to run outside `local` without `--force`, and demo fixtures live in `fixtures/demo.json`. If you relied on demo data reappearing, run the seed explicitly.
- **The default admin login changed to `admin`, and the default password is gone.** There is no default password in any environment: outside `local` a missing `ADMIN_PASSWORD` refuses the start, in `local` one is generated on first run and printed once. Set `ADMIN_USERNAME` explicitly before upgrading if you were relying on the old default. The previous default password must be treated as compromised — it is in the public git history — and rotated anywhere it was reused.
- **`SURVEY_RESPONSE_SECRET` no longer falls back to the admin password.** The two sharing a value made survey anonymity fiction: the admin knows every `userId`, so the same secret let them match an anonymous answer to its author. Outside `local` the secret is required and must differ from `ADMIN_PASSWORD`.
- **The application no longer creates the schema.** Run `npm run migrate` before starting it. An existing database created by the old code needs `npm run migrate:baseline` once, first. `/readyz` answers 503 until the schema is at least as new as the code.
- **The legacy `admin` role is gone** from both the data and the constraint; those rows are now `platform_admin`.

### Added

- `migrations/` with the schema as reviewable SQL files, `scripts/migrate.mjs` with an advisory lock, and `db/schema.sql` as a committed snapshot.
- `make secrets`, `make secrets-check` and `make admin-password` for generating, checking and rotating secrets. Admin password rotation now survives a restart, and changing the password invalidates that account's sessions.
- Survey secret versioning: changing `SURVEY_RESPONSE_SECRET` starts a new generation instead of silently breaking response deduplication.
- Optimistic locking on cards, actions, goals and development plans. A save against a stale version answers 409 with the conflicting ids and the current state.
- `GET /metrics` with connection-pool occupancy and the conflict counter; `make db-dump`, `db-restore`, `db-bloat`, `db-vacuum`.
- `teams` as a first-class table, kept in sync from the existing lead chain.

### Changed

- Writes no longer delete and reinsert sixteen tables. An unchanged row is not touched at all, and `created_at` survives updates — renaming a user used to reset it on every card.
- Authentication is a single query instead of reading the entire database, and expired sessions are cleaned up at login rather than through a full table rewrite on every request. This is what produced the intermittent 401s.
- The connection pool has limits and timeouts. One stuck transaction used to exhaust it and take the service down instead of degrading it.
- `pulse_history` retention runs at most hourly instead of inside every write transaction.
- Text length limits the application already enforced are now constraints in the database.

## rc0.2.4 - 2026-05-11

Patch release for left navigation contrast and theme consistency.

### Changed

- Moved the global sidebar colors onto design tokens so hover, active, brand, and footer states stay consistent across light and dark themes.
- Tuned the dark-mode sidebar background so navigation remains visually separate from the main content.

## rc0.2.3 - 2026-05-11

Patch release for left navigation visual stability.

### Fixed

- Kept the global sidebar at full viewport height so its background does not end before the screen bottom.

## rc0.2.2 - 2026-05-11

Patch release for dashboard focus and test alignment.

### Changed

- Removed the dashboard quick-navigation card so the first screen stays focused on team state, urgent topics, and upcoming 1:1s.
- Updated smoke coverage to match the simplified dashboard.
- Removed unused quick-navigation styling and icon imports after the panel cleanup.

## rc0.2.1 - 2026-05-11

Patch release for production stability and interface cleanup after rc0.2.

### Fixed

- Hardened Postgres user replacement so an empty upstream user array cannot wipe logins.
- Clarified the role-check migration for existing Railway databases using the new `platform_admin` and `lead` roles.
- Removed the duplicate right-rail access list now that user management lives in the admin section.

### Changed

- Improved right-rail/sidebar stretching and admin/settings form widths.
- Refined the date picker trigger spacing and surface treatment.

## rc0.2 - 2026-05-11

Second release candidate focused on account hierarchy, admin workflows, and survey reuse.

### Added

- Platform-admin role vocabulary with lead-chain fields for users and Postgres persistence.
- Separate platform admin area for creating logins, resetting passwords, and managing access.
- Self-service password change in settings for non-env-managed accounts.
- Personal survey templates saved from existing surveys and reused in the composer.

### Changed

- Moved profile editing and account security into settings.
- Moved user access management out of the team directory into the admin section.
- Improved quick navigation density and page scrolling so the main workspace keeps a single primary scrollbar.
- Updated smoke coverage for the new admin and settings flows.

### Fixed

- Migrates existing Postgres `users.role` checks so Railway databases created on rc0.1 accept `platform_admin` and `lead`.
- Preserves seed user hierarchy fields during Postgres seeding.

## rc0.1 - 2026-05-11

Release candidate for the first Team Health 1:1 production cut.

### Added

- Team Health 1:1 workspace for manager-led and employee-scoped one-to-one workflows.
- Server-side auth with httpOnly sessions, demo access, admin access, and employee data isolation.
- Shared agenda cards with owner/source, category, priority, status, filters, and promotion into next steps.
- Pulse tracking for energy, load, clarity, and trust, plus preparation checklist and manager private notes.
- Team administration for adding participants, issuing logins, resetting passwords, deleting non-admin access, and resetting demo data.
- Meeting summary generation that switches directly to the outcomes view.
- Railway production configuration with PostgreSQL support and local file-storage fallback.

### Changed

- Refined the dashboard, team admin, meeting workspace, mobile layout, empty states, focus states, and confirmation flows.
- Hardened workspace updates so client payloads are sanitized by role before persistence.
- Added production security headers and stricter production admin-password handling.
- Expanded smoke coverage for auth, admin workflow, employee isolation, protected updates, and the meeting-summary flow.

### Verified

- Deployed to Railway production.
- `npm run build`
- `npm run test:smoke`
- Public health check on `https://team-health-121-production.up.railway.app`
