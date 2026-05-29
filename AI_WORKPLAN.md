# AI Workplan

This is the active AI handoff for the current project slice only.
Durable technical/domain rules belong in `PROJECT_CONTEXT.md`.
Plain-language operating rules belong in `BUSINESS_RULES.md`.
Completed plans and design history belong in `docs/archive/`.

---

## Current Goal

Polish the Operations Chief Dashboard and fix My Chores display issues surfaced during Step 11 testing.

---

## Current State

Steps 1–11 of the ScheduledWork ownership model are complete. The app has:

- `ScheduledWork` table tracking asset-level work independent of shift ownership
- Claiming/unclaiming logic in shift creation and edit
- Supervisor unassigned/missed sections on Everyone's Chores (Step 9)
- Supervisor direct-complete / not-applicable buttons on Everyone's Chores (Step 10)
- Operations Chief Dashboard v1 at `/dashboard` (supervisor+ only, 4-column layout)
- `location_note String?` and `phone_number String?` added to schema
- Lazy daily SW generation: `lib/ensure-daily-sw.ts` fires on first login after 5am
- Timezone fix: `chicagoServiceDate()` in `lib/dates.ts` used for all `service_date` computation
- Duplicate-log cleanup utility in Admin Utilities

---

## Non-Negotiables For Current Work

- **Never run `railway run npx prisma db push`** — hits the shared Supabase instance (Simplify's tables). The Railway deploy start command runs `prisma db push` against the correct Chores Postgres automatically.
- **Always use `chicagoServiceDate(utcInstant)`** from `lib/dates.ts` when computing `service_date` from timestamps. Never use `.getFullYear()/.getMonth()/.getDate()` on a UTC Date for service dates.
- **`lib/lifecycle.ts` helpers only** — never compare `lifecycle_type` values in new code. Use `isPersistent(t)` and `isForfeitable(t)`.
- **NARC Expires route separately** — never route NARC through `resolvePresentTruckTargets`. Use `resolvePrimaryUnitTarget` for NARC only.
- **Run `npm run build` before pushing.** Turbopack skips production checks; full build catches `useSearchParams()` Suspense errors.

---

## Files To Read Before Editing

| Before changing… | Read… |
|---|---|
| Product behavior, data model, dates, shift/chore lifecycle, roles, navigation, audit | `PROJECT_CONTEXT.md` |
| Human-facing chore rules, supervisor workflows, persistent/forfeitable behavior, asset responsibility | `BUSINESS_RULES.md` |
| Any date/time logic | `lib/dates.ts` |
| Lifecycle checks | `lib/lifecycle.ts` |
| Role checks | `lib/roles.ts` |
| Chore generation or targeting | `lib/chore-targeting.ts`, `lib/chore-generation.ts`, `lib/chore-rotation.ts` |

---

## Files / Areas To Avoid Unless Explicitly Working On Them

- `app/api/operations-logs/route.ts` — complex claiming logic; read thoroughly before touching
- `prisma/schema.prisma` — nullable columns only; db push runs on deploy; never touch the Simplify shared Supabase
- `lib/performance.ts` — performance scoring rules are settled; don't change without reading `PROJECT_CONTEXT.md` performance section

---

## Immediate Next Steps

1. **Fix My Chores progress display** — `myChoresForProgress` currently blends today's chores with inherited persistent ones into a single `2/3` fraction. Fix: show `X/Y today's chores` separately from `N previous unfinished`. The progress bar denominator should be today's chores only. The "N previous unfinished" label already exists in red alongside — just stop adding it to the denominator.

2. **Move overdue/persistent section above Daily Chores on My Chores** — the red "Overdue / Unfinished" inherited persistent chore section should appear above the Daily Chores section so it cannot be missed.

3. **Dashboard — location note setter** — supervisors need a way to tag an unassigned truck as Gerald-1/2/3 or Off-site directly from Column 2 on the dashboard. `location_note` is in the schema; no setter UI exists yet.

4. **Dashboard — redesign ScheduledWorkActionButtons** — remove "Complete" button entirely (supervisors use Everyone's Chores to complete); replace N/A with a small inline form: pick Off-Site or Inaccessible, optional free-text note. See conversation 2026-05-29 for design details.

5. **Add unavailable trucks to Today's Roster** — after a supervisor marks SW as `not_applicable`, show those units in a section at the bottom of Today's Roster visible to all users.

6. **Dashboard — phone numbers** — add `phone_number` field to Shift Profiles edit form; surface on dashboard shift cards.

7. **Dashboard — confirmed vs unconfirmed shifts** — Column 2 (Unassigned Trucks) and Column 4 (Shift Status) should distinguish shifts that have been supervisor-confirmed vs those that haven't.

8. **Performance denominator** — inherited persistent chores (from prior shifts, shown on My Chores for visibility) must not count in the current shift's performance denominator. Verified: `computePerformanceStats` already excludes them. The display fraction fix (item 1 above) makes this consistent in the UI too.

---

## Open Questions / Needs Answer Before Building

**Q0 — Programmer role:**
User confirmed they want a role above Dom for dev/demo tooling — "Dom only, probably ME only, I maybe should have another level." For now the dev dashboard at `/dev` is gated to Dom only (there is only one Dom = Clay). A formal "Programmer" role can be added later as a DB + seed change if needed. No action required yet.

**Q1 — NARC Box dropdown (already exists — needs verification):**
The NARC box dropdown already exists in Shift Setup and Edit Shift — both use `app/setup/page.tsx` which has `narcBoxId` state and a NARC box selector. The user has asked to "add" it, which may mean they don't see it in the current UI, OR they want confirmation that selecting the NARC box there actually drives NARC Expires generation. The real gap is the claiming logic: NARC Expires are currently claimed based on the truck's `primary_unit_id`, not the shift's `narc_box_id`. Fix needed in `app/api/operations-logs/route.ts` claiming path. **Question for user: do you currently see a NARC box dropdown in Shift Setup? If yes, does selecting it not work as expected?**

**Q2 — Programmer / Demo Dashboard:**
User wants a tool to build backdated shifts and mark chores complete for demo purposes. Questions before building:
- Should this be a separate route (e.g., `/demo` or `/dev`) accessible only to Dom?
- For "build shifts from the past": should it reuse the normal Shift Setup form but allow past dates? Or a streamlined bulk-entry form?
- For completing chores: one-click "Mark all complete" per shift, or individual chore checkboxes?
- Should backdated shifts trigger NARC Expires / Monthly / Quarterly generation for those past dates, or just create basic chores?
- Should this page be hidden/removed after the demo, or kept as a permanent utility?

## Open Questions

- ~~**NARC Expires follow the truck, not the NARC box**~~ ✅ Fixed — `previousPersistentChores` query now excludes NARC Expires from the truck-based unit_id condition and instead matches them by `operations_log.narc_box_id = log.narc_box_id`. NARC Expires now follow the NARC box across crews, not the truck. No schema change needed — the ScheduledWork table already had correct narc_box_id; only the Chore query needed fixing.
- **Harrison Daily Station Duties Rotation table is hard-coded** — future Chore Admin should generate it dynamically from the database.
- **Completed truck check gets unchecked when secondary truck added via Edit Shift** — when a crew member completes their Unit 11 truck check then edits their shift to add a secondary truck, the Unit 11 truck check reverts to uncompleted. Root cause: the edit path deletes and recreates all Truck Check chores including completed ones. Fix: skip completed Truck Check chores in the TC delete/recreate cycle — only delete/replace pending ones.
- **Overdue expires red banner should show for all users, not just supervisors** — user wants mild peer pressure visibility across all roles. Currently gated to `isSupervisorRole` in NavBar. Widen to all logged-in users. Note: the banner text and link should remain the same; just remove the role gate.
- **Supervisor action buttons on Roster cards** — supervisors need Delete, Edit, and Confirm buttons directly on the shift cards on Today's Roster. Currently these only appear after clicking into the shift detail. The supervisor should be able to act from the card without drilling in. Edit → goes to Shift Setup with `?logId=X`. Confirm and Delete can be inline buttons on the card (same logic as the existing ConfirmShiftButton and DeleteShiftButton components, just rendered on the roster card for supervisor+ roles).
- **Supervisor confirm warning for Harrison shifts without secondary truck** — when a supervisor confirms a Harrison shift that has no secondary truck assigned, they should receive a warning before confirming. The confirm workflow itself may need re-evaluation (unclear if it's still needed and why it was added). Do not implement until the purpose of shift confirmation is revisited.
- **Coverage Gaps backfill needed for historical dates** — the lazy trigger only generates Truck Check SW rows going forward (starting from when it was deployed). Past dates have no SW rows, so `markMissedForfeitable` has nothing to transition for them. To populate Coverage Gaps for prior dates: Admin Utilities → Generate Scheduled Work, set start date ~30 days ago and end date yesterday, click Generate. Then log in again to trigger mark-missed. One-time operation. Also fixed `void ensureDailySW()` → `await` so the promise actually completes before Next.js `redirect()` terminates the request.

---

## Recent Completed Work

- Steps 1–10: Full ScheduledWork ownership model (see `docs/archive/scheduled-work-ownership-design-2026-05.md`)
- Step 11 v1: Operations Chief Dashboard at `/dashboard`
- `location_note`, `phone_number` added to schema
- `lib/ensure-daily-sw.ts`: lazy daily Truck Check SW generation on first login after 5am
- `chicagoServiceDate()` helper: fixed service_date timezone bug (UTC vs Chicago local)
- My Chores login redirect: now uses `actual_start <= now` to pick the currently active shift, not future imports
- Duplicate active log cleanup utility in Admin Utilities
- Harrison Rotation renamed to "Harrison Daily Station Duties Rotation"
- Fix NARC Expires button removed from Admin Utilities (one-time cleanup, long fixed)

---

## Archive Index

| File | Contents |
|---|---|
| `docs/archive/backend-cleanup-workplan-2026-05.md` | Original backend cleanup goals, roles/targeting/generation helper design, completed early work |
| `docs/archive/scheduled-work-ownership-design-2026-05.md` | Full ScheduledWork design rationale and Steps 1–10 implementation history |
| `docs/archive/ai-review-notes-2026-05.md` | Gemini review (May 28), overnight pin context |
