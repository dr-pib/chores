# EMS Chores Project Context

This file captures durable project knowledge for Codex, Claude Code, Claude, Ultraplan, and future contributors. Keep it current. If an AI or developer learns a new stable rule, workflow, naming convention, deployment constraint, or architectural decision, they should recommend an update here before finishing.

For a human-facing explanation of the operating/business rules, read `BUSINESS_RULES.md`. This file can include technical context; `BUSINESS_RULES.md` should stay readable for supervisors/admins and avoid implementation detail.

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
- Bays are assignment/responsibility details, not owning entities. They help capture which trucks/bays a Harrison crew is responsible for during a shift and drive Daily Truck Checks, Monthly Expires, and Quarterly Expires accountability.
- Harrison crews usually have two bay responsibilities. The normal truck is often in the primary bay, and the secondary bay often has a familiar backup/second truck, but real-world circumstances can change this. Crews may verbally trade secondary bay/truck responsibility for a shift; the app records the actual shift-specific responsibility rather than assuming bay ownership.
- Trucks/units and NARC boxes are assets; bays are not assets. Do not attach non-bay assets to a bay unless the workflow is specifically bay-level. NARC box responsibility follows the medic/shift responsibility, not the physical bay row.
- Shift Setup/Edit Current Shift should capture the current/actual truck and NARC box responsibility for the shift. The real-world workflow does not track every temporary handoff as a separate "drop" event; crews update/check whatever trucks and boxes they actually ended up responsible for.
- For pending/uncompleted scheduled work, editing a shift's selected truck or NARC box should eventually move responsibility to the current selected asset and avoid stale ownership. Completed historical work should not be silently rewritten.
- Asset-based chores belong conceptually to the asset, then may be owned/claimed by a shift while that shift is responsible for the asset. Responsibility for doing/checking off that work belongs to the employees on the shift that claimed the asset. Daily Truck Checks, Monthly Expires, and Quarterly Expires go with trucks/units. NARC Expires go with NARC boxes. Station chores go with the Harrison crew/shift profile.
- If a truck is removed from a shift before its pending Daily Truck Check/Monthly/Quarterly is completed, that pending asset work should become unassigned and visible to supervisors/Operations Chief. If the work was already completed, the completion should remain attached to the crew/shift that did it.
- If a crew later takes over a truck, they need to see whether that truck's asset-based work for the day/date has already been completed by another crew or is still pending/unassigned.
- When a shift is created or edited and ScheduledWork already exists with `status='complete'` for the same asset/date/template, no duplicate pending Chore should be created. The current shift should eventually be able to see the work was already done (UI deferred). Implementation: shift creation/edit queries both pending and complete SW, builds a completed-key set, and filters `choresToCreate` before building chores — rows matching a completed SW key are dropped.
- When responsibility for an asset transfers after the original crew completed the work, do not duplicate the task and do not erase completion credit. The new/current responsible shift should see the work as already complete, while completed-by / completed-at and performance credit remain with the original employee/crew that performed it.
- NARC boxes are assets like units/trucks for scheduling purposes. The selected NARC box on a shift gets its own NARC Box Check each shift and its own NARC Expires work on the 25th; boxes in the safe still need NARC Expires tracked.
- NARC Box Check is real current shift-start work, not hypothetical. Today it is done as part of entering the truck check: crews record the NARC box number/letter, seal number, medication counts, and completed paperwork counts for each medication. In this app it should eventually become its own NARC-box asset workflow. It is forfeitable like a Daily Truck Check: if missed during the shift-start responsibility window, it cannot truly be made up later; it becomes a missed accountability record.
- Critical asset-based scheduled work exists whether or not a crew registers a shift. Daily Truck Checks, NARC Box Checks, NARC Expires, Monthly Expires, Quarterly Expires, and future asset-based scheduled work must be trackable even when the truck/box is not added to any shift because it was missed, intentionally unused, in the safe, or at the mechanic.
- Criticality and persistence are separate concepts. Daily Truck Checks are critical asset work, but they are not make-up/persistent work: if missed for that shift/day, they should be recorded as missed/overdue for accountability, not regenerated later as something to complete twice. Use `forfeitable` for this lifecycle: once the meaningful work window closes, the task becomes a missed accountability record rather than still-actionable work. Expires are critical and persistent because the work remains needed until completed and will not recur for 30/90 days.
- Truck Checks and Harrison station chores are due every 24 hours. A 48-hour shift should have one Truck Check per covered unit per day and one station chore per applicable Harrison shift-profile day.
- Daily Truck Check and NARC Box Check timing: due at shift start + 1 hour, but employees may still complete them until shift start + 31 hours. A chore is `overdue` after the due time but before the employee completion window closes. After shift start + 31 hours, forfeitable work becomes `missed` if still incomplete. Overdue and missed are different states and should be colored/listed/handled differently.
- Late completion behavior differs by lifecycle type:
  - **Forfeitable work** (Daily Truck Check, NARC Box Check, station chores): no late-completion category. Once the lock window closes, the work is missed and cannot be made up for performance. The miss is recorded as an accountability gap; supervisors may document a reason (at shop, oversight, N/A) but retroactive completion does not restore performance credit.
  - **Persistent work** (Monthly Expires, Quarterly Expires, NARC Expires): can be completed late. After the lock window closes, it is missed for the originally responsible employee/crew. If the original employee/crew completes it after the window, it counts as a late completion in their performance. If someone else completes it after the window, the original employee/crew keeps the miss, and the completing employee gets normal completion credit (adds to both their numerator and denominator — no extra credit, just credit for work actually completed). The overall dashboard should surface work completed late / resolved late.
- Due and lock offsets are per-template admin settings, not hard-coded universal rules. The common defaults are due offset `+1 hour` and lock offset `+31 hours`, but Chore Admin should allow different chores to use different offsets. For shift-linked work, both offsets are relative to the shift's actual start time.
- Independently-generated ScheduledWork that is not yet linked/assigned to a shift should default to due at 0800 Chicago local time on its work date. When the work is linked to a shift, update the due time to the shift's actual start plus the template due offset.
- Monthly and Quarterly Expires generate for Units 1-11, Unit 14, and Unit 20 Explorer. Current backup units are 1, 3, 5, 6, 7, and 8; current frontline units are 2, 4, 9, 10, 11, and 14. Backup/frontline is operational context, not a reason to exclude a unit from Expires generation.
- NARC Expires generate for all NARC boxes A-L on the 25th of each month, including boxes sitting in the safe and boxes not claimed by a shift.
- Supervisors may need to attach unassigned asset work to someone, complete it themselves, or mark the asset/work with an operational status such as at shop/out of service. This belongs on supervisor/Operations Chief visibility surfaces.
- Supervisors should eventually be able to assign work directly. Two important cases: (1) create a one-off chore assigned to a crew/shift, and (2) reassign existing scheduled work that will not get done by the original/current crew to another crew/shift. "Claimed by" and "assigned to" are both acceptable user-facing wording; internally, keep the distinction clear that ScheduledWork belongs to the asset/date/template while a shift/crew is assigned responsibility for it.
- Do not delete ScheduledWork just because an asset is at the shop, out of service, remounted, or otherwise unavailable. Supervisors can document day-by-day that the work is not applicable for that date; admins may eventually block out an asset for longer date ranges proactively or retroactively. This should remove the work from the active "needs attention" list without erasing the operational record.
- If shift-level employees do not claim a critical asset work item and therefore do not take responsibility for it, someone up the chain of command must know in real time and be able to assign it, complete it, or document why it is not applicable.
- Station chores are less critical crew/shift work. If a Harrison crew does not run that day, station chores for that crew may simply not be created/done. A supervisor may optionally assign station work, but missed station chores do not need the same command-dashboard treatment as unassigned asset work.
- Future Chore Admin must classify each chore template by scope and criticality, not only frequency. Important questions for each template: is this station/crew work or asset work? If asset work, is it tied to a truck/unit or a NARC box? Is it critical command-dashboard work? Does it persist until complete? Does it generate even when no shift claims the asset?
- Chore template classification is a matrix of independent dimensions, not one binary category. Key dimensions include scope/owner (`truck/unit asset`, `NARC box asset`, `crew/shift`, `station`), lifecycle (`persistent`, `forfeitable`), criticality (`critical`, `routine`), frequency/generation rule, license/credential applicability, station applicability, and specific asset/group applicability. Team vocabulary: **Persistent or Forfeitable** for the lifecycle dimension.

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
- Employee records can have an optional `schedule_import_first_name` for schedule-import matching when ESO or another scheduling source uses a different first name than the app display name. Examples: Jim Ketterman may appear as `James Ketterman`; Dale Halliday may appear as `Jerry Halliday`. Import matching should check display name and this import first name before treating a person as unmatched.
- Shift card top line format: `24-8 | Teddy Burkitt, NRP & Cathy Harris, EMT`.
- Shift card second line should be the shift start/end date-time range.
- Use the same shift card format and default sort order on Today's Roster, History, and Everyone's Chores.
- Default internal shift sort order: Supervisor, 24-7, 24-8, Swing, Diamond City, Newton County.
- Keep Diamond City and Newton County shift labels as they exist in the system, such as `DC-ALS` and `NC-ALS`, unless the user asks otherwise.
- The active side of segmented switches should be visually obvious; current pattern is a blue selected pill.
- Roster date navigation (Today's Roster) allows moving forward into future dates. Future dates with no shifts show the normal empty state. Only the back arrow suppresses navigation at a logical boundary (do not disable it either unless there is a specific reason). Do not hide or disable the forward arrow when the selected date is today.

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
- The ticker now also includes unclaimed pending persistent critical ScheduledWork past `due_at` (no shift has claimed it). Truck-scope SW contributes unit numbers; narc_box-scope SW contributes "Box X" identifiers (e.g. "Box C").
- Ticker visibility: Supervisor, Admin, and Dom only.
- Avoid user-facing lifecycle jargon such as `Persistent`; prefer operational labels like overdue, unfinished, expires, or scheduled chores.
- Everyone's Chores has two supervisor-only sections (Supervisor/Admin/Dom) above the existing overdue/shift lists:
  1. **Unassigned — Needs Completion** (amber): unclaimed pending persistent critical ScheduledWork. Shows template name, asset (Unit X or Box Y), work date, due time. Work that still needs to be done.
  2. **Coverage Gaps — Missed Forfeitable Work** (yellow/zinc): missed forfeitable critical ScheduledWork for the last 30 days. Truck Checks and future NARC Box Checks that closed without completion. Cannot be made up — documentation is Step 10. Shows template name, asset, work date, and which shift claimed it.
- Regular employees never see these command-level sections.

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
- `lib/lifecycle.ts` — `isPersistent(t)` and `isForfeitable(t)` helpers read `ChoreTemplate.lifecycle` (`'persistent'` | `'forfeitable'`). Always use these helpers; never compare `lifecycle_type` in new code.
- `lib/chore-targeting.ts` — `resolvePresentTruckTargets`, `resolvePrimaryUnitTarget`, `resolveCrewTarget`, `targetKey`. Use `resolvePrimaryUnitTarget` for NARC Expires only; never route NARC through `resolvePresentTruckTargets`.
- `lib/chore-generation.ts` — `buildChoreRows` (pure, no Prisma). `ChoreCreateData` for nested shift creation; `ChoreCreateManyData` (adds `operations_log_id`) for `prisma.chore.createMany`.
- `lib/dates.ts` — `chicago0800(date)` converts a UTC-midnight `Date` to the 08:00 America/Chicago instant for that calendar date. Use this for all default `due_at` values on independently-generated `ScheduledWork` rows. Also exports `chicagoLocalToUtc(dateStr, timeStr)` which converts a Chicago-local calendar date (`YYYY-MM-DD`) and local clock time (`HH:mm`) to the correct UTC `Date`. **Always use this helper when building `actual_start` / `actual_end` from operational shift times.** Never use `Date.UTC(year, month, day, hour, minute)` with Chicago local clock values — that treats local time as UTC and stores times 5–6 hours early depending on DST. Shift times in the app are Chicago-local operational times, not UTC.
- `ScheduledWork` table: `asset_type + asset_key` non-nullable dedup fields avoid Postgres nullable-unique pitfalls. `asset_key = String(unit.id)` for trucks; `String(narcBox.id)` for NARC boxes. `claimed_by_log_id` tracks shift ownership; `status` (`pending` | `complete` | `missed` | `not_applicable` | `voided`) tracks work state — these are independent concepts.
- `ChoreTemplate.lifecycle_type` is intentionally preserved for the Chore Admin edit form and its API routes. All runtime lifecycle checks must use `ChoreTemplate.lifecycle` via `lib/lifecycle.ts`.

## Deployment Notes

- Railway build command should be `npm run build`.
- The build script includes `prisma generate`; keep that intact unless deployment strategy changes.
- Railway database environment variables have needed fallback handling before; be careful changing DB connection setup.
- Run `npm run build` before pushing meaningful app changes when possible. Turbopack (local dev) skips some production checks — notably, `useSearchParams()` in Next.js App Router requires a `<Suspense>` boundary that Turbopack does not enforce but the full build does. Any page using `useSearchParams()` must wrap the consuming component in `<Suspense>` or the Railway deployment will fail.

## Admin Utilities

Located in **Chore Templates → Admin Utilities** (bottom of left sidebar, supervisor+ only):

- **Backfill Missing Scheduled Chores** — adds any missing NARC/Monthly/Quarterly Expires Chore rows to all currently active shifts. Run after fixing bay assignments or when a shift was built on a day those chores should have generated.
- **Fix NARC Expires (Remove Bad Records)** — deletes NARC Expires records that have no `unit_id` or whose `unit_id` does not match the shift's `primary_unit_id`. Run this first if bad NARC records are present, then run Backfill to add correct ones back. This two-step process was needed after a code bug created NARC Expires for every bay unit (including backup trucks) instead of primary unit only.
- **Generate Scheduled Work** — creates `ScheduledWork` rows service-wide for all eligible assets (units 1–11, 14, 20 and NARC boxes A–L) on qualifying dates in a given date range. Useful for backfilling unassigned asset work for trucks or NARC boxes that were never on any shift (at shop, in safe, etc.). Normal shift creation and edit now auto-ensure SW rows for the shift's specific assets, so this button is only needed for assets not claimed by any shift.
- **Mark Missed Forfeitable Work** — transitions `pending` forfeitable `ScheduledWork` rows past their lock window to `status: 'missed'`. Safe to run repeatedly; designed to be called by a future cron job.

## Known Roadmap

- Current short-term goal:
  - Get the build green after the latest supervisor-edit/timezone work.
  - Finish the supervisor shift review workflow: `/log/[id]` must show both review state and an obvious supervisor action to confirm/unconfirm.
  - Finish supervisor shift correction: supervisors need an `Edit shift` path that safely edits the selected shift, not their own shift by accident.
  - Clean up secondary bay semantics: `Select one` is a form placeholder, `Empty` is an intentional operational status, and `Secondary Unit Unassigned` / `Bay 2 Missing Truck` is a setup warning.
  - Make unassigned Daily Truck Checks visible to supervisors before the lock window closes.
- Chore template/frequency editor:
  - create/edit chores
  - configure daily/weekly/monthly/quarterly/persistent frequency
  - configure station/crew/asset targeting
  - configure whether each chore is crew/shift work, truck/unit asset work, NARC box asset work, or station-level work
  - configure whether each chore is critical enough to appear in supervisor/Operations Chief unassigned-work dashboards
  - configure whether each chore generates independently of shifts or only when a shift/crew exists
  - configure license/credential-based applicability when needed (for example NRP-only work)
  - configure repeating patterns such as day-of-week, third Tuesday, 25th of month, quarterly rules, or manual/ad hoc
  - UI should use appropriate controls for these independent dimensions: segmented controls/selects for scope/lifecycle/frequency, checkboxes/toggles for critical/generates independently/license restrictions, station/asset selectors for applicability
- Supervisor/Admin/Dom unassigned Truck Check visibility — **design settled, not yet built**:
  - The concern is *unassigned chores*, not uncovered shifts. Supervisors know staffing. They need to know: "Unit 10's Truck Check has no one assigned today." If no crew claims a unit, the forfeitable window will close with no accountability record.
  - Preferred fix: extend independent SW generation to include forfeitable critical templates (Truck Check) for the current service date. Each eligible unit gets a `ScheduledWork` row at the start of each day. Unclaimed rows surface in the existing "Unassigned / Needs Completion" section without new UI. Claimed rows get linked to the shift's Chore via the existing claim path. After the lock window, unclaimed rows transition to `missed` via the existing mark-missed endpoint.
  - Three distinct supervisor situations that must stay visually separate: (1) Unassigned SW (Step 9 Section 1) = work exists but no shift owns it — act now; (2) Coverage Gaps (Step 9 Section 2) = shift had the unit but missed the check — document after; (3) Unassigned SW for persistent expires = Monthly/Quarterly/NARC with no claiming shift — complete or mark N/A.
  - show trucks with unchecked persistent/scheduled chores
  - resolve the tracking gap for unit-specific Monthly/Quarterly chores when no shift is created for a truck or a truck is out of service
- Secondary bay UI semantics:
  - `Select one` / `Select unit` is only a setup/edit form placeholder and must not be treated as an operational value.
  - `Empty` means the user intentionally marked the bay empty and should save as `unit_status = 'empty_bay'`.
  - `At Shop` should save as `unit_status = 'unit_at_shop'`.
  - A present Bay 2 with no meaningful unit/status is a setup warning, displayed to supervisors as `Secondary Unit Unassigned` or `Bay 2 Missing Truck`.
  - Roster cards should show Bay 2 present/empty/shop/missing state clearly for supervisors.
- Operations Chief / command-level dashboard:
  - higher-level view for supervisors/chiefs who are not assigned to a truck
  - should surface coverage gaps, unassigned scheduled work, out-of-service/offsite trucks, unchecked expires, and eventually NARC box status
- Scheduled-work ownership model — **built** (Steps 1–8):
  - `ScheduledWork` table tracks asset-level work independent of shift ownership
  - `ChoreTemplate` now has `asset_scope`, `lifecycle`, `is_critical`, `generates_independently`, `station_scope` classification fields
  - Shift creation and edit auto-ensure persistent `ScheduledWork` rows for the shift's specific present trucks (Monthly/Quarterly Expires) and NARC box (NARC Expires) on qualifying dates; no admin pre-run required
  - Claim/unclaim/re-claim logic in `app/api/operations-logs/route.ts` links pending unclaimed SW to shift Chores and releases claims when assets are removed or swapped
  - `ScheduledWork.is_late_completion` flag set when persistent work is completed after it was already `missed`
  - Step 9 **built**: supervisor-only sections in Everyone's Chores surface unassigned pending persistent SW and missed forfeitable SW; overdue ticker extended to include unclaimed SW
  - Still to do: supervisor direct-complete/not-applicable route (Step 10), cron job for mark-missed transition
- NARC box model — **built** (foundation complete):
  - NARC boxes A–L have their own `NarcBox` table; Shift Setup saves one shift-level NARC box selection
  - NARC Expires display shows box letter and unit number together when both are known, e.g. `NARC Expires Box C Unit 4`
  - Unresolved: boxes in the safe are not yet auto-generated via shift creation (requires the admin generation endpoint or a future cron); the SW model is ready for it
- Performance reporting — **built**: `lib/performance.ts`, `/api/performance`, `/api/performance/all`, `/report`, `/report/[id]`, stat strip on My Chores detail, performance card on profile. Supervisor nav shows "Report" link.
  - Still to do: on-time rate (completed before `due_at`), export/CSV, peer comparison
- Deeper route cleanup for Chores/Roster after the current UX shape proves stable.
- Settings/Admin configuration later, including custom shift sort if needed.

## AI Handoff Rule

Every AI working in this repo should ask: "Did I learn or rely on a durable project rule that belongs in `PROJECT_CONTEXT.md`?" If yes, recommend the addition in the final response or update the file when explicitly asked.
