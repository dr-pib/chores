# EMS Chores Project Context

This file captures durable project knowledge for Codex, Claude Code, Claude, Ultraplan, and future contributors. Keep it current. If an AI or developer learns a new stable rule, workflow, naming convention, deployment constraint, or architectural decision, they should recommend an update here before finishing.

## Product Purpose

EMS Chores is an internal operations app for EMS shift setup, roster visibility, chore tracking, persistent overdue work, history, employee defaults, and supervisor/admin configuration.

The app should feel like a quiet operational tool: dense enough for repeated use, clear enough for tired crews, and direct about urgent exceptions.

## Core Domain Rules

- Service dates are Chicago-local calendar dates, not UTC dates.
- Shifts can be 24 or 48 hours.
- A shift remains current/active until `actual_end`, even after midnight.
- History should include a shift only after `actual_end` has passed.
- Shift detail pages for ended shifts should present as `Historical Shift Record`, not as active `My Chores`, even when the logged-in user was on that shift.
- Today/Roster views should include shifts that overlap the selected day.
- Employees can be either the primary employee or partner on a shift; both count as being part of the shift.
- Shift Setup is the dedicated place to create/build a shift.

## Chore Lifecycle Rules

- Daily chores reset by chore date.
- Persistent chores remain open until completed.
- NARC Expires generate on the 25th of every month and are unit-specific for the shift's primary manned ALS unit only. Backup/secondary/non-crewed trucks have no NARC box and must never receive a NARC Expires chore. Use `resolvePrimaryUnitTarget(primary_unit_id)` from `lib/chore-targeting.ts` — do NOT route NARC through `resolvePresentTruckTargets` (the generic per-bay-unit path used for Monthly/Quarterly).
- Monthly Expires generate on the 3rd Tuesday of every month and are unit-specific per present truck (all bay units with `unit_status = 'unit_present'`).
- Quarterly Expires generate on the Thursday after the 3rd Tuesday in January, April, July, and October and are unit-specific per present truck (all bay units).
- All three scheduled expire chores (NARC, Monthly, Quarterly) are per-shift; do not deduplicate across shifts sharing a service date.
- CRITICAL: NARC, Monthly, and Quarterly Expires must never share a single generic "unit-specific scheduled chore" creation path. NARC = primary unit only; Monthly/Quarterly = all present trucks. Collapsing them into one path is a bug that creates NARC Expires on backup trucks.
- Remote posts do not get Harrison station chore rotation.
- Harrison station chore rotation assigns one station chore per crew per month and cycles Bathroom, Garage, Kitchen, Quarters.
- Future chore template admin console needs a targeting-scope field: station-level chore | truck-level chore | crew-level chore | manned-ALS-truck-only chore.
- Overdue persistent chores should generally mean the source shift has ended and the chore remains pending.

## UI Vocabulary

- Use `Shift Profiles`, not `Crews`, for the admin/config area formerly called crews.
- Use `Trucks` for user-facing truck/unit responsibility sections.
- Use bay language only where the actual bay selector/label is being discussed.
- Main nav uses `Chores` with a switch for `My Chores` and `Everyone's Chores`.
- Main nav uses `Roster` with a switch for `Today` and `History`.
- Chores nav routing rules: if user has an active shift → their log. If no active shift and Supervisor/Admin/Dom → Everyone's Chores (nav click) or Setup (login). If no active shift and regular employee → Setup always.
- Historical shift records use the same underlying detail page as active shifts, but should show a clear historical heading/state and a back link to Roster History.
- Everyone's Chores should list the same active shifts as Today's Roster; it should additionally show unchecked past persistent chores in a separate overdue/persistent section.
- Supervisor/admin chore configuration should be called `Chore Templates` to avoid confusion with the main `Chores` tab.
- Keep `Setup` or `Shift Setup` as the place where employees build their shift.

## Display Conventions

- Employee card/title format: `John Robinson, NRP`.
- Employee dropdown/list format: `Robinson, John, NRP`.
- Employee dropdowns/lists should sort by last name.
- Shift card top line format: `24-8 | Teddy Burkitt, NRP & Cathy Harris, EMT`.
- Shift card second line should be the shift start/end date-time range.
- Use the same shift card format and default sort order on Today's Roster, History, and Everyone's Chores.
- Default internal shift sort order: Supervisor, 24-7, 24-8, Swing, Diamond City, Newton County.
- Keep Diamond City and Newton County shift labels as they exist in the system, such as `DC-ALS` and `NC-ALS`, unless the user asks otherwise.
- The active side of segmented switches should be visually obvious; current pattern is a blue selected pill.

## Badges And Alerts

- The main `Chores` nav item can show multiple badge counts at once.
- Red badge: My Chores has overdue/missed chores.
- Blue badge: My Chores has current/not-overdue chores.
- Amber badge: Everyone's Chores has service-wide open persistent chores.
- Do not collapse these badge colors into one priority badge unless the user asks.
- Supervisors, Admin, and Dom see a red overdue-expires ticker when pending Monthly, Quarterly, or NARC Expires are overdue anywhere in the service.
- Proposed supervisor ticker text pattern:
  `Overdue: MONTHLY EXPIRES: Unit(s) 1, 2, and 6 | QUARTERLY EXPIRES: Unit(s) 1, 2, 6, 7, and 14 | NARC EXPIRES: Unit(s) 4 and 11.`
- The ticker should only show categories that have overdue units, deduplicate units per category, sort unit numbers ascending, and link to Everyone's Chores.
- Ticker visibility: Supervisor, Admin, and Dom only.
- Avoid user-facing lifecycle jargon such as `Persistent`; prefer operational labels like overdue, unfinished, expires, or scheduled chores.

## Permissions And Audit

- Employees should see and work their own active shift, whether they are primary or partner.
- Supervisors, Admin, and Dom can see broader operational/admin views.
- Dom-only delete applies to change-log rows.
- Dom-only edit applies to EMT numbers; the change is written to the change log with old and new value.
- The change log houses multiple change types: chore status changes (chore_id + operations_log_id set) and employee record changes (target_employee_id set, chore_id/operations_log_id null). Both display in the same Change Log page.
- Past shift edits require supervisor-level permission and should be logged.
- Audit/tracking should record the person who clicked, not just the employee assigned to the shift.
- If a supervisor edits a past shift, the log should show that supervisor as the actor.
- Build audit history first; derive performance percentages later from trustworthy events.
- Performance stats are computed from completed OperationsLogs (shifts where `actual_end` has passed). Active shifts are excluded from historical rates. Computation lives in `lib/performance.ts` (`computePerformanceStats`).
- NARC Expires are excluded from a non-NRP employee's performance denominator entirely; NRP employees include them.
- Both primary and partner employees share credit for all chores on a shift (shift-level credit model).

## Data And Technical Notes

- Prisma generated client lives in `app/generated/prisma`; do not manually edit generated files.
- The Prisma model names use `ShiftProfile`, but database mappings may preserve old table/column names such as `crew_posts` and `crew_post_id`. Do not remove these mappings casually.
- Prefer shared helpers for dates, employee labels, shift-profile sorting, badge logic, and repeated card/switch UI.
- Avoid broad route rewrites unless explicitly doing a route cleanup project.
- Current lower-risk route shape keeps existing routes while presenting consolidated navigation:
  - `/my-chores` and `/chores` live under the `Chores` nav concept.
  - `/log` and `/history` live under the `Roster` nav concept.
- A later cleanup may consolidate to `/chores?view=my|everyone` and `/roster?view=today|history`.

## Deployment Notes

- Railway build command should be `npm run build`.
- The build script includes `prisma generate`; keep that intact unless deployment strategy changes.
- Railway database environment variables have needed fallback handling before; be careful changing DB connection setup.
- Run `npm run build` before pushing meaningful app changes when possible.

## Admin Utilities

Located in **Chore Templates → Admin Utilities** (bottom of left sidebar, supervisor+ only):

- **Backfill Missing Scheduled Chores** — adds any missing NARC/Monthly/Quarterly Expires to all currently active shifts. Run after fixing bay assignments or when a shift was built on a day those chores should have generated.
- **Fix NARC Expires (Remove Bad Records)** — deletes NARC Expires records that have no `unit_id` or whose `unit_id` does not match the shift's `primary_unit_id`. Run this first if bad NARC records are present, then run Backfill to add correct ones back. This two-step process was needed after a code bug created NARC Expires for every bay unit (including backup trucks) instead of primary unit only.

## Known Roadmap

- Chore template/frequency editor:
  - create/edit chores
  - configure daily/weekly/monthly/quarterly/persistent frequency
  - configure station targeting (station-level | truck-level | crew-level | manned-ALS-truck-only)
- Supervisor/Admin/Dom truck coverage view:
  - show trucks not assigned to active shifts today
  - show trucks with unchecked persistent/scheduled chores
  - resolve the tracking gap for unit-specific Monthly/Quarterly chores when no shift is created for a truck or a truck is out of service
- Operations Chief / command-level dashboard:
  - higher-level view for supervisors/chiefs who are not assigned to a truck
  - should surface coverage gaps, unassigned scheduled work, out-of-service/offsite trucks, unchecked expires, and eventually NARC box status
- Future scheduled-work model:
  - NARC, Monthly, Quarterly, and future persistent scheduled chores may need to generate from the calendar date independent of shift creation
  - a crew/shift can take ownership when the relevant truck or asset is assigned to the shift
  - work still needs to be visible when a truck is offsite, in Gerald's bays, at the shop, or never added to a shift
- Future NARC box model:
  - NARC tracking is by NARC box asset/letter, not only by truck/unit
  - NARC boxes are labeled A-I
  - primary ALS trucks carry NARC boxes, but boxes can also sit in the safe when fewer ALS trucks are staffed
  - Harrison Supervisors are responsible for NARC expires on boxes not assigned to active trucks that day
  - future Shift Setup may need a NARC box letter field; do not implement until the data model/workflow is designed
- Performance reporting — **built**: `lib/performance.ts`, `/api/performance`, `/api/performance/all`, `/report`, `/report/[id]`, stat strip on My Chores detail, performance card on profile. Supervisor nav shows "Report" link.
  - Still to do: on-time rate (completed before `due_at`), export/CSV, peer comparison
- Deeper route cleanup for Chores/Roster after the current UX shape proves stable.
- Settings/Admin configuration later, including custom shift sort if needed.

## AI Handoff Rule

Every AI working in this repo should ask: "Did I learn or rely on a durable project rule that belongs in `PROJECT_CONTEXT.md`?" If yes, recommend the addition in the final response or update the file when explicitly asked.
