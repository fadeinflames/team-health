# Changelog

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
