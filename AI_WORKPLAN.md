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

## Open Questions

- **NARC Expires follow the truck, not the NARC box** — because Edit Shift lacks a NARC box dropdown. NARC Expires should follow the NARC box asset, not the truck. Fix: add NARC box dropdown to Edit Shift (same as Shift Setup already has), then update claiming logic to key off `narc_box_id` on the OperationsLog.
- **Harrison Daily Station Duties Rotation table is hard-coded** — future Chore Admin should generate it dynamically from the database.
- **Completed truck check gets unchecked when secondary truck added via Edit Shift** — when a crew member completes their Unit 11 truck check then edits their shift to add a secondary truck, the Unit 11 truck check reverts to uncompleted. Root cause: the edit path deletes and recreates all Truck Check chores including completed ones. Fix: skip completed Truck Check chores in the TC delete/recreate cycle — only delete/replace pending ones.
- **Overdue expires red banner should show for all users, not just supervisors** — user wants mild peer pressure visibility across all roles. Currently gated to `isSupervisorRole` in NavBar. Widen to all logged-in users. Note: the banner text and link should remain the same; just remove the role gate.
- **Supervisor confirm warning for Harrison shifts without secondary truck** — when a supervisor confirms a Harrison shift that has no secondary truck assigned, they should receive a warning before confirming. The confirm workflow itself may need re-evaluation (unclear if it's still needed and why it was added). Do not implement until the purpose of shift confirmation is revisited.

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
