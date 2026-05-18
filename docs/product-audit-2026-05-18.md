# Product Audit: Team Health 1:1

Date: 2026-05-18

## What Was Strengthened Now

- Survey access is now scoped to the owning lead/team instead of being globally visible by id.
- Anonymous survey aggregates stay hidden until the minimum response threshold is reached.
- Anonymous responses are one-per-user via a server-side respondent hash, without exposing the person id in the response row.
- Leads with the same visible team label no longer inherit each other's explicitly assigned members.
- The meeting view keeps participant switching available on tablet/narrow desktop.
- Personal dashboards no longer label the bottom personal status panel as "Команда".

## Competitive Signals Used

- Lattice 1:1 action items support due dates, assignment, completion, and carry-over between meetings.
- 15Five positions 1:1 as a recurring weekly loop: agenda, meeting, notes, action items, repeat.
- Atlassian Team Health Monitor uses eight team-health attributes and explicitly turns assessment into focus areas and an improvement plan.
- Atlassian OKR play recommends clear time periods and recurring progress tracking.
- Officevibe hides anonymous results until minimum response thresholds are met.
- Culture Amp's wellbeing materials emphasize actionable drivers, not just mood collection.

## Product Gaps To Build Next

1. Recurring 1:1 scheduling
   - Add structured `nextMeetingAt`, `cadenceWeeks`, and prep reminders.
   - Keep existing text fields as display/fallback.

2. Stronger action loop
   - Add due date in the quick action form.
   - Add status beyond done/not done: `todo`, `in_progress`, `blocked`, `done`.
   - Add "carry to next 1:1" and "review at start of meeting".

3. Team health model
   - Add a Team Health Monitor template with 8-10 metric keys.
   - Show focus areas in Reports and let the lead create an improvement plan from a weak metric.

4. OKR maturity
   - Split goals into Objective / Key Result.
   - Add measurable start/current/target values and confidence.
   - Add parent alignment for team goals.

5. Review packet
   - Generate an evidence packet per person from meeting summaries, done actions, achieved goals, feedback cards, and tagged private notes.

6. Privacy model
   - Add note `authorUserId` and `visibility: shared | manager_private | author_private`.
   - Make platform admin/global viewer visibility explicit in the UI.

## Sources

- Lattice: https://help.lattice.com/hc/en-us/articles/360060026934-Add-and-Manage-1-1-Action-Items
- 15Five: https://success.15five.com/hc/en-us/articles/360002880911-1-on-1s-Feature-Overview
- Atlassian Health Monitor: https://www.atlassian.com/team-playbook/health-monitor
- Atlassian OKRs: https://www.atlassian.com/team-playbook/plays/okrs
- Workleap Officevibe anonymity: https://help.workleap.com/en/articles/10281766-workleap-officevibe-anonymity
- Culture Amp wellbeing question set: https://support.cultureamp.com/en/articles/7048340-welcome-to-the-culture-amp-wellbeing-question-set
