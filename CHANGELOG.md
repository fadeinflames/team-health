# Changelog

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
