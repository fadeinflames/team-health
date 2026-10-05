# Changelog

## Unreleased

Schema management moves out of the application into migrations, secrets get a lifecycle, and mutations stop rewriting the whole database.

### Fixed (audit 2026-10-04, wave 1)

- Text containing «продаж», «sales» or «биллинг» is no longer silently dropped from cards, actions and notes (and, in PostgreSQL, deleted on the next write). The word filter is gone.
- Request bodies are decoded once from bytes, so Cyrillic split across network chunks is no longer corrupted; the size limit counts bytes; a body that is not a JSON object answers 400.
- The login rate limit can no longer be bypassed by forging the left side of `X-Forwarded-For`: the client address is taken from the right (`TRUSTED_PROXY_HOPS`, default 1). A successful login resets only the `ip:username` counter, the counters are bounded in size and key length.
- An unauthenticated request no longer reads the whole database (including password hashes) before answering 401.
- The client no longer retries a rejected save forever: a 409 shows a conflict banner with «load current data» / «overwrite with mine»; other 4xx stop retrying; network errors and 5xx back off up to 30 s. Changing an LPR status no longer forges a client-side `updatedAt` that caused a false 409.
- CSV exports are protected against formula injection (`src/csv.js`); destructive deletes ask for confirmation; save errors and toasts are announced (`role=alert` / `role=status`); closing the tab with unsaved edits warns; an error boundary replaces the blank screen after a render crash.
- Accessibility: visible focus on search and goal sliders, text contrast of muted and status colours raised to AA, reduced-motion respected.
- CI: the burned-values check no longer fails on its own block list; jobs have timeouts and concurrency groups; unit tests run in CI. Scripts treat Railway as production (`scripts/lib/env.mjs`), `redo` follows the same guard as `down`, a held migration lock exits 1, and `up` on an unbaselined legacy database prints the baseline instruction instead of failing obscurely.

### Fixed (audit 2026-10-04, wave 2)

- **Lost updates under concurrency.** Writes are now diff-based: `readDb()` records the state of every row it read, and `writeDb()` upserts only rows that changed and deletes only rows that were in that base and disappeared. Rows created by other requests in between are no longer deleted, and unchanged rows are not rewritten with stale values (this also stops admin operations from rolling back password changes or resurrecting revoked sessions). A stress run with 8 employees saving 6 cards each in parallel lost 42 of 48 saves before and none after.
- **Stale clients.** `POST /api/workspace` accepts `knownIds`; a row is deleted only if the client knew it. Without `knownIds` the old «absent means deleted» semantics apply. The client tracks the ids it has seen and refreshes row versions after a save that raced with new edits, so its own previous save no longer causes a false 409.
- Version checks run only for rows the request changed and lock them (`for update`) for the transaction.
- `/readyz` answers 503 `shutting_down` after SIGTERM while `/healthz` stays 200; `SHUTDOWN_DRAIN_MS` adds a drain pause. Railway's health check now uses `/readyz`.
- Password hashing is asynchronous (`scrypt`), so a login no longer blocks the event loop; the stored format is unchanged. A failed `ROLLBACK` no longer hides the original error or returns a broken connection to the pool.
- Backups: `scripts/backup.mjs` (`dump`, `verify`, `restore-check`; npm `db:backup`, `db:backup:verify`). Runbook in `docs/runbook.md`; decisions in `docs/adr/`.

### Changed (privacy and publication, wave 3)

- **Participants no longer receive** `performanceNarrative` and `growthNarrative`, and see only validated competency assessments; leads and admins are unchanged.
- **Anonymous surveys:** the minimum number of responses is at least 3 (older surveys saved with 2 behave as 3), and each question is hidden until at least that many people answered *it* (`perQuestion[id] = { count, hidden: true, minResponses }`). The real-time differencing risk between two views is a documented residual risk (`docs/adr/0005-privacy-model.md`).
- **Private manager notes remember their author** (`manager_notes.author_user_id`, migration 0027): a regular lead sees their own notes and legacy notes without an author, `platform_admin` sees all notes in scope; deleting someone else's note answers 404.
- Permanently deleting a person also deletes their named survey responses. A survey whose owner lead was deleted is no longer open to the whole organization: only `platform_admin` sees and manages it (migration 0029 drops the foreign key so the owner id survives the deletion).
- **Audit log** (`audit_log`, migration 0028): account, role, person, survey and note deletion events; `GET /api/audit-log` for `platform_admin` only. No note text or passwords are logged.
- Session tokens are stored hashed (sha256); the cookie keeps the raw token.
- Published under the MIT license; `SECURITY.md` and `CONTRIBUTING.md` added. The list of compromised passwords is kept only as sha256 hashes (`lib/burned-secrets.js`) and `scripts/check-burned.mjs` finds them in the tree without storing them.

### Breaking

- **Everyone signs in again after this release:** sessions created before it hold raw tokens that no longer match the stored hashes, and the server removes them at start.

- **`POST /api/me/password` requires `currentPassword`.** A missing or wrong value answers 400 «Неверный текущий пароль» (not 401); attempts count towards the login rate limit.
- **HSTS** (`Strict-Transport-Security`, six months, no subdomains) is sent when `APP_ENV=production`.
- **`lib/` is part of the runtime image** (`server.js` imports it); the Dockerfile copies it.

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

- `GET /api/workspace` reads only the rows the caller is allowed to see instead of every row of eighteen tables. Measured on 63 people and 2400 cards: an employee's request went from 5573 rows and 16 ms to 161 rows and 9 ms, with byte-identical responses. `WORKSPACE_SCOPED_READ=0` restores the old behaviour.
- The admin account's password hash is no longer recomputed and overwritten on every read. That cost a `scrypt` per request — the single most expensive operation on the read path — and worse, it silently reverted a CLI rotation on the next write.
- Writes no longer delete and reinsert sixteen tables. An unchanged row is not touched at all, and `created_at` survives updates — renaming a user used to reset it on every card.
- Authentication is a single query instead of reading the entire database, and expired sessions are cleaned up at login rather than through a full table rewrite on every request. This is what produced the intermittent 401s.
- The connection pool has limits and timeouts. One stuck transaction used to exhaust it and take the service down instead of degrading it.
- `pulse` is a view over `pulse_history` instead of a second table holding the same numbers. The two used to be kept in sync by two different write paths, and forgetting either one made "current pulse" and "the last point on the graph" disagree - with no way to tell which was right, since both look plausible. Retention now never deletes a person's most recent point, because that point is their current pulse.
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
