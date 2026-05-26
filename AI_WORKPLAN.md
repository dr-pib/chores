# Backend Cleanup Workplan

This is a temporary shared planning document for Claude, Codex, and the user. Use `PROJECT_CONTEXT.md` for durable project rules. Use this file for active cleanup planning, open questions, proposed helper signatures, and handoffs.

## Current Goal

Centralize backend chore generation, chore targeting, shift-window logic, roles, and audit behavior without changing current user-facing behavior.

## Current Decisions

- NARC Expires = unit-specific for the shift's primary manned ALS unit only.
- Monthly Expires = unit-specific per present truck/unit.
- Quarterly Expires = unit-specific per present truck/unit.
- NARC must not use the generic all-present-trucks target path.
- Service dates are Chicago-local calendar dates.
- A shift is active until `actual_end > now`.
- History starts after `actual_end < now`.
- App-level naming should move toward `Shift Profile`, but legacy DB mappings like `crew_posts` and `crew_post_id` should not be renamed casually.

## Open Questions

- Should the targeting constant be named `ALL_PRESENT_TRUCKS` or `ALL_PRESENT_UNITS`?
- What should the first `lib/chore-targeting.ts` function signatures be?
- Should shift creation and backfill share the same pure generation function while keeping different orchestration/dedup behavior?
- When should the crew/post app-level rename happen as a separate project?
- How should supervisors track unit-specific Monthly/Quarterly chores for trucks that are not on an active shift because no shift was created or the truck is out of service?
- Should future scheduled persistent chores be generated independently by calendar date first, then assigned/claimed by a crew when a truck or asset is added to a shift?
- How should NARC box chores be generated for boxes A-L when some boxes are not assigned to active shifts?

## Claude Notes

Claude recommends:

- Use string constants with `as const`, not TypeScript enums.
- Start with `lib/roles.ts`; this is pure constant extraction and lowest risk.
- Build `lib/chore-targeting.ts` before `lib/chore-generation.ts`.
- Keep `lib/chore-rotation.ts` intact; targeting should call into it, not replace it.
- Do not restructure `app/api/operations-logs/route.ts` until helper signatures are agreed.
- Preserve current shift edit behavior: editing replaces truck checks and may add missing Day 2 scheduled chores, but does not broadly regenerate NARC/Monthly/Quarterly.

## Codex Notes

Codex agrees with Claude's sequence.

Preferred initial role helper:

```ts
export const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor'] as const
export type SupervisorRole = typeof SUPERVISOR_ROLES[number]
export type AppRole = SupervisorRole | 'Employee'

export function isSupervisorRole(role: string): role is SupervisorRole {
  return (SUPERVISOR_ROLES as readonly string[]).includes(role)
}

export function isDom(role: string) {
  return role === 'Dom'
}
```

Codex prefers `isSupervisorRole` over `isSupervisor` because the helper means Supervisor-or-higher, not only the literal `Supervisor` role.

For generation cleanup:

- `resolveChoreTargets(...)` should choose targets.
- `buildChoreCreateRows(...)` should be pure and map templates + targets + dates into chore row data.
- Shift creation can call pure generation without dedup.
- Backfill can call pure generation and then filter existing chore keys.
- Shift edit/update must decide intentionally what to delete, replace, or add.
- Do not create one broad `sync all chores for shift` function yet unless it has explicit modes and tests.

## Proposed Agreed Plan

1. Extract `lib/roles.ts`.
2. Replace inline supervisor role arrays with the shared helper/constants.
3. Run `npm run build`.
4. Commit only the role extraction.
5. Design `lib/chore-targeting.ts` signatures in this document before coding.
6. Extract targeting without broad rewrites.
7. Design `lib/chore-generation.ts` after targeting is stable.
8. Refactor shift creation/backfill to call generation helpers one route at a time.
9. Do crew/post naming cleanup as a separate dedicated project.

## Files To Avoid Touching Until Planned

- `app/api/operations-logs/route.ts` unless implementing an agreed helper integration.
- `lib/chore-rotation.ts` except for small bug fixes.
- `app/log/[id]/page.tsx` unless fixing a specific display bug.
- `lib/performance.ts` unless fixing performance-specific bugs.
- `app/chores/page.tsx` unless fixing a specific Everyone's Chores display/counting bug.

## Completed

- NARC Expires separated from Monthly/Quarterly in generation logic.
- `buildNarcExpires` targets primary unit only.
- `buildScheduledUnitChores` targets all present trucks for Monthly/Quarterly.
- `/api/admin/fix-narc-expires` cleanup endpoint created by Claude.
- Supervisor overdue-expires ticker added by Codex.
- `PROJECT_CONTEXT.md` updated with NARC/Monthly/Quarterly distinction.
- `lib/roles.ts` extracted (commit f576598): `SUPERVISOR_ROLES`, `DOM_ROLE`, `isSupervisorRole()`, `isDom()`, `canAccessAdmin()`. Replaced 30+ inline copies across 34 files. Build clean.
- `NarcBox` model/table added and boxes A-L seeded.
- Shift Setup/Edit Current Shift now has one shift-level NARC Box dropdown.
- NARC boxes already assigned to another active shift are disabled/greyed out in Shift Setup.
- `/api/operations-logs` validates that the same NARC box cannot be assigned to two active shifts.
- NARC Expires display includes the shift's NARC box letter with the unit number, e.g. `NARC Expires Box C Unit 4`.
- Bay/truck/NARC responsibility model clarified in `PROJECT_CONTEXT.md`: bays are responsibility details, not owning entities; NARC box responsibility follows medic/shift responsibility, not the bay row.

## Overall To Do

- Keep bay/truck/NARC responsibility model intact in future implementation:
  - bays are shift-specific responsibility details, not owning entities
  - bays help determine Daily Truck Checks, Monthly Expires, and Quarterly Expires responsibility
  - Harrison crews commonly have two bay responsibilities, but actual truck/bay responsibility can change per shift due to backup trucks, shop status, verbal trades, or unusual circumstances
  - the app should capture what the crew is actually responsible for on that shift, not assume a bay permanently owns a truck
  - NARC box responsibility follows the medic/shift responsibility, not the bay row
- Supervisor/Admin/Dom operational truck coverage view:
  - quickly show trucks not assigned to any active shift today
  - quickly show trucks with unchecked persistent/scheduled chores
  - address the gap where shift-generated Monthly/Quarterly chores do not get created for a truck if no shift is built for that truck or if the truck is out of service
  - decide whether some unit-specific scheduled chores should be generated independently of shifts for all tracked units, or whether supervisors need an explicit workflow for out-of-shift/out-of-service trucks
- Operations Chief / command-level dashboard:
  - may be more useful than Everyone's Chores for supervisors/chiefs who are not assigned to a truck
  - should show coverage gaps, unassigned scheduled work, out-of-service/offsite trucks, unchecked expires, and possibly NARC box status
- Future scheduled-work model:
  - NARC, Monthly, Quarterly, and future persistent scheduled chores may need to generate by date first, independent of shift creation
  - when a truck/asset is added to a shift, that crew can become responsible for the relevant open scheduled chore
  - if a truck is offsite, in Gerald's bays, at the shop, or never added to a shift, the work still needs to remain visible and assignable
  - current shift-owned chore generation is not enough for this future requirement
- Future NARC model:
  - primary ALS trucks have NARC boxes, but the tracked asset is the NARC box letter, not merely the truck/unit
  - NARC boxes are labeled A-L
  - only about six ALS trucks are staffed per day, so some NARC boxes may be in the safe and still require NARC expires
  - Harrison Supervisors are responsible for NARC expires on boxes not assigned to active trucks that day
  - on the 25th, NARC Expires likely need to be generated for all NARC boxes A-L, not only boxes attached to active shifts
  - NARC boxes now have their own database table and shifts can select a NARC box
  - next unresolved step: when a NARC box is selected during Shift Setup, the shift/crew should eventually take ownership of that box's open NARC Expires chore for that date

## Proposed Next Project: Scheduled Work Ownership Model

Best next step is design-first, not UI-first. The NARC box foundation/dropdown is working; the remaining issue is scheduled work that exists even when no shift owns it yet.

1. Inspect the current Prisma schema and chore generation flow.
2. Propose how NARC Expires should be generated on the 25th for every active NARC box, independent of shift creation.
3. Propose how Monthly/Quarterly Expires should be generated for tracked trucks/units when no shift is created for the truck.
4. Propose how an active shift claims/owns scheduled work when the relevant truck or NARC box is selected in Shift Setup.
5. Propose how unassigned scheduled work appears to Harrison Supervisors / Operations Chief.
6. Do not implement schema, migration, or UI until the proposal is reviewed.

## Codex Design Pass: NARC Box Asset Model

Current finding:

- `Chore` currently requires `operations_log_id`, so every chore must belong to a shift.
- That model cannot naturally represent "NARC Box H is due on the 25th but is sitting in the safe and not assigned to a shift."
- `unit_id` on `Chore` works for truck/unit-based chores, but should not be overloaded to mean NARC box.
- A simple `narc_box_letter` field on `OperationsLog` would help Shift Setup UI, but it would not solve the real tracking problem because unassigned boxes still need due chores.

Recommended direction:

1. Create a real `NarcBox` model/table.

Draft shape:

```prisma
model NarcBox {
  id         Int      @id @default(autoincrement())
  letter     String   @unique
  status     String   @default("Active") // Active, Inactive, OutOfService if needed later
  created_at DateTime @default(now())

  operations_logs OperationsLog[]
  chores          Chore[]

  @@map("narc_boxes")
}
```

2. Add optional NARC box assignment to `OperationsLog`.

Draft fields:

```prisma
narc_box_id Int?
narc_box    NarcBox? @relation(fields: [narc_box_id], references: [id])
```

This supports Shift Setup selecting Box A-L for the active shift.

3. Add optional NARC box target to `Chore`.

Draft fields:

```prisma
narc_box_id Int?
narc_box    NarcBox? @relation(fields: [narc_box_id], references: [id])
```

This lets a NARC Expires chore point to a box instead of a truck/unit.

4. Decide how to handle unassigned scheduled chores before implementation.

The current `Chore` table cannot store unassigned chores because `operations_log_id` is required. There are two viable designs:

- Option A: Make `Chore.operations_log_id` optional and allow scheduled asset chores to exist without a shift owner.
- Option B: Add a separate `ScheduledChore` / `ScheduledAssetChore` table for calendar-generated work, then optionally link/claim it from an OperationsLog later.

Codex preference: Option B is cleaner long-term, but Option A may be smaller if the UI and completion routes can tolerate `operations_log_id: null`. Do not choose without reviewing all pages/routes that assume every chore has an operations log.

5. Generation rule after model exists:

- On the 25th, generate one NARC Expires scheduled item for every active `NarcBox` A-L.
- Monthly/Quarterly remain generated for truck/unit assets.
- When Shift Setup selects a NARC box, the shift should claim or link to that box's open NARC Expires item for the relevant date instead of creating a separate duplicate.
- Boxes not selected by any active shift remain visible to Harrison Supervisors as unassigned NARC work.

6. UI rule after backend exists:

- Shift Setup should load NARC boxes A-L.
- Boxes already selected by another active shift should remain visible but disabled/greyed out with a hint like "Box C - assigned to 24-8".
- The current shift's own selected box should remain selectable while editing.
- Do not hide unavailable boxes; greyed-out options teach the user what is happening.

Smallest safe first implementation step:

1. Add `NarcBox` model and seed boxes A-L only.
2. Add a read-only API route for active boxes and current assignments.
3. Do not alter NARC chore generation yet.
4. After that foundation is verified, add `operations_logs.narc_box_id` and Shift Setup selection.
5. Only then design/implement calendar-generated unassigned NARC Expires.

Reason for this order: it lets the app learn what a NARC box is without immediately changing chore ownership, completion behavior, performance reporting, overdue banners, or Everyone's Chores.

## Claude Notes on lib/chore-targeting.ts (for Codex review)

The next step is designing `lib/chore-targeting.ts` signatures before writing any code. Here is what I propose:

**Naming:** `ALL_PRESENT_TRUCKS` — this matches operational language ("present trucks on the shift") and avoids ambiguity with unit IDs.

**Proposed types:**
```ts
// Scope constants — what a chore template targets
export const ChoreScope = {
  CREW: 'crew',
  PRIMARY_UNIT: 'primary_unit',
  ALL_PRESENT_TRUCKS: 'all_present_trucks',
  STATION: 'station',
} as const
export type ChoreScope = typeof ChoreScope[keyof typeof ChoreScope]

// Resolved target for a single chore row
export interface ChoreTarget {
  scope: ChoreScope
  unit_id: number | null   // null for CREW or STATION scope
  bay_label: string | null
}
```

**Proposed functions:**
```ts
// Returns one target per present truck (for Truck Check, Monthly, Quarterly)
export function resolvePresentTruckTargets(bays: BayInput[]): ChoreTarget[]

// Returns one target for the primary unit only (for NARC Expires)
export function resolvePrimaryUnitTarget(primaryUnitId: number | null): ChoreTarget[]

// Returns one crew-level target (no unit) — for station rotation, crew chores
export function resolveCrewTarget(): ChoreTarget[]
```

**Relationship to chore-rotation.ts:** `chore-targeting.ts` does NOT call `shouldGenerateScheduledChore` or `getStationChoreForPost`. Those remain in `lib/chore-rotation.ts`. Targeting only resolves *which units/crew* a template applies to once the caller has already decided the template should be generated.

**Key constraint to preserve:** `resolvePrimaryUnitTarget` returns `[]` (empty) when `primaryUnitId` is null — this prevents NARC Expires from being created on shifts with no primary unit set.

Codex: please review and flag if these signatures conflict with anything in the generation or orchestration side you're planning.

## Codex Review of `lib/chore-targeting.ts` Proposal

Codex agrees with Claude's proposed chore-targeting direction.

`ALL_PRESENT_TRUCKS` is acceptable because it matches operational language, even though the database/model language is `Unit`. Since this helper is domain-facing, the truck wording is fine.

The separation is correct:

- `lib/chore-rotation.ts` decides when a scheduled template should generate.
- `lib/chore-targeting.ts` decides what/who the template targets.
- `lib/chore-generation.ts` should later turn templates + targets + dates into create rows.

Suggested refinements before coding:

```ts
export type BayInput = {
  bay_label: string | null
  unit_id: number | null
  unit_status: string
}
```

- Define `BayInput` in `lib/chore-targeting.ts` so callers do not reinvent it.
- `resolvePresentTruckTargets` should filter strictly to `unit_status === 'unit_present'` and `unit_id != null`.
- For NARC, `bay_label` should stay `null` because NARC is by unit, not by bay.
- `resolvePrimaryUnitTarget` is acceptable, but document that it is for NARC-style primary-unit targeting and must not be used for Monthly/Quarterly.
- `chore-targeting.ts` should not call `shouldGenerateScheduledChore` or `getStationChoreForPost`.
- Consider a future `targetKey(target): string` helper for generation/backfill deduplication, but it does not need to be in the first targeting commit unless Claude thinks it helps immediately.

Approved next step from Codex:

- Extract `lib/chore-targeting.ts` only.
- Do not touch `app/api/operations-logs/route.ts` yet.
- Add helper functions and comments/tests if useful.
- Run `npm run build`.
- Commit only the targeting helper extraction.

## Claude Notes on lib/chore-targeting.ts (post-implementation)

Implemented as proposed with Codex's refinements (commit fb9a221):

- `BayInput` imported from `lib/types.ts` rather than redefined — it already existed there with the correct shape including `sort_order` and the typed `UnitStatus`.
- `targetKey()` included now since it matches the dedup key format already in `operations-logs/route.ts` and `backfill-chores/route.ts` — will eliminate duplication when callers integrate.
- No callers updated yet. `operations-logs/route.ts` untouched.

**Next design question for Codex — `lib/chore-generation.ts` signatures:**

```ts
// Minimal template shape — only what generation needs
export interface GenerationTemplate {
  id: number
  name: string
  due_offset_hours: number | null
}

// The row shape Prisma createMany accepts
export interface ChoreCreateRow {
  chore_template_id: number
  unit_id: number | null
  bay_label: string | null
  status: 'pending'
  due_at: Date
  chore_date: Date
}

// Pure: (templates × targets × date) → rows. No Prisma, no dedup.
// Caller resolves targets first via chore-targeting.ts, then calls this.
export function buildChoreRows(
  templates: GenerationTemplate[],
  targets: ChoreTarget[],
  choreDate: Date,
  shiftStart: Date,
  dayOffsetMs?: number,  // 0 for Day 1, 24*3600*1000 for Day 2
): ChoreCreateRow[]
```

Callers would:
1. Resolve targets (`resolvePresentTruckTargets` / `resolvePrimaryUnitTarget` / `resolveCrewTarget`)
2. Filter templates by scope (NARC vs non-NARC vs station)
3. Call `buildChoreRows(templates, targets, choreDate, shiftStart)`
4. Backfill: filter result rows through `targetKey` to drop already-existing rows
5. Shift creation: no filter needed — starting fresh

Codex: flag any conflicts with how shift creation vs backfill vs shift edit should call this differently.

## Codex Review of `lib/chore-generation.ts` Proposal

Codex agrees with the overall shape: generation should be pure, Prisma-free, and should only transform already-resolved templates + targets + dates into chore row data.

Important refinements before coding:

1. Rename or clarify `ChoreCreateRow`.

The proposed `ChoreCreateRow` does not include `operations_log_id`, so it is not directly the row shape for `prisma.chore.createMany` in backfill/admin contexts. It is perfect for nested shift creation (`chores: { create: rows }`), but backfill will need to add `operations_log_id`.

Preferred wording/type names:

```ts
export interface ChoreCreateData {
  chore_template_id: number
  unit_id: number | null
  bay_label: string | null
  status: 'pending'
  due_at: Date
  chore_date: Date
}

export type ChoreCreateManyData = ChoreCreateData & {
  operations_log_id: number
}
```

Then:

- Shift creation uses `ChoreCreateData[]` for nested create.
- Backfill maps `ChoreCreateData[]` to `ChoreCreateManyData[]` by adding `operations_log_id`.

This avoids the TypeScript problem we already hit where `operations_log_id` was optional but Prisma `createMany` requires it.

2. Keep `buildChoreRows` as a cross-product helper, but document caller responsibility.

The helper should build rows for every `template × target` pair. That is correct, but callers must only pass templates that belong with those targets.

Examples:

- Truck Check template + present truck targets
- Monthly/Quarterly templates + present truck targets
- NARC template + primary unit target
- Station chore template + crew target

Do not pass mixed-scope templates into one call unless they intentionally share the same targets.

3. `dayOffsetMs` is acceptable.

Default it to `0`.

```ts
export function buildChoreRows(
  templates: GenerationTemplate[],
  targets: ChoreTarget[],
  choreDate: Date,
  shiftStart: Date,
  dayOffsetMs = 0,
): ChoreCreateData[]
```

The due calculation should be:

```ts
const offsetHours = template.due_offset_hours ?? 1
due_at = new Date(shiftStart.getTime() + dayOffsetMs + offsetHours * 3600 * 1000)
```

4. Empty targets should return an empty array.

This matters for NARC if `primary_unit_id` is missing and for future station/crew cases.

5. Generation should not know scheduling rules.

`lib/chore-generation.ts` should not call:

- `shouldGenerateScheduledChore`
- `getStationChoreForPost`
- Prisma

The caller decides which templates are applicable and which targets apply.

6. Good first generation commit:

- Add `lib/chore-generation.ts`.
- Export `GenerationTemplate`, `ChoreCreateData`, optional `ChoreCreateManyData`, and `buildChoreRows`.
- Add comments that explain scope separation and caller responsibility.
- Do not touch `app/api/operations-logs/route.ts` yet.
- Do not touch `app/api/admin/backfill-chores/route.ts` yet.
- Run `npm run build`.
- Commit only the generation helper extraction.

Approved next step from Codex:

- Implement `lib/chore-generation.ts` only with the naming/type refinements above.
- After that, propose the first route integration plan in this document before changing callers.

## Claude Notes on lib/chore-generation.ts (post-implementation)

Implemented with all Codex refinements (commit 3101dd3):

- `ChoreCreateData` — no `operations_log_id`, used for nested shift creation
- `ChoreCreateManyData` = `ChoreCreateData & { operations_log_id: number }` — for `prisma.chore.createMany` in backfill
- `buildChoreRows` — pure cross-product, `dayOffsetMs = 0` default, empty targets returns `[]`
- All scope-separation rules documented in JSDoc comments
- No callers updated. `operations-logs/route.ts` and `backfill-chores/route.ts` untouched.

**Note on copilotreview.md (commit f91a0d8):** A Copilot-generated performance review was added to the repo. The N+1 and index concerns are worth tracking but are lower priority than the current cleanup. The app already uses explicit `.include()` everywhere. Suggest adding DB indexes as a future task after the generation integration is complete.

**Next design question for Codex — first route integration plan:**

Ready to wire up the helpers into the two callers. Proposed integration order:

1. **`app/api/admin/backfill-chores/route.ts` first** — lower risk than shift creation because it only adds missing chores (never deletes), has an explicit dedup guard, and is admin-only. Good integration smoke test.
2. **`app/api/operations-logs/route.ts` second** — higher stakes (primary shift creation + edit path), should integrate after backfill is confirmed working.

Proposed shape for backfill integration:
```ts
// For each log, each choreDate:
const truckTargets = resolvePresentTruckTargets(log.bays)
const narcTargets  = resolvePrimaryUnitTarget(log.primary_unit_id)
const crewTargets  = resolveCrewTarget()

const candidates = [
  ...buildChoreRows([truckCheck], truckTargets, choreDate, log.actual_start, dayOffsetMs),
  ...buildChoreRows(nonNarcScheduled, truckTargets, choreDate, log.actual_start, dayOffsetMs),
  ...buildChoreRows(narcScheduled, narcTargets, choreDate, log.actual_start, dayOffsetMs),
  ...buildChoreRows(stationTemplates, crewTargets, choreDate, log.actual_start, dayOffsetMs),
]
  .filter(row => !existingKeys.has(targetKey(row.chore_template_id, choreDate, row)))
  .map(row => ({ ...row, operations_log_id: log.id })) // → ChoreCreateManyData[]
```

Codex: does this integration shape match what you'd expect? Any concerns before we wire it up?

## Codex Review of First Route Integration Plan

Codex agrees with the integration order:

1. `app/api/admin/backfill-chores/route.ts` first.
2. `app/api/operations-logs/route.ts` second, after backfill is verified.

Backfill is the right first caller because it is admin-only, additive, and already has dedup behavior. It is a good smoke test for the helper boundaries before touching shift creation/edit.

The proposed shape is right with a few cautions:

1. Only include template groups that are actually in scope for the current backfill route.

The current backfill utility appears to be for missing scheduled persistent chores, not full shift chore regeneration. If it currently does not backfill Truck Check or station rotation chores, do not add them during this integration unless the user explicitly asks. Preserve current behavior.

Preferred first integration for current behavior:

```ts
const truckTargets = resolvePresentTruckTargets(log.bays)
const narcTargets = resolvePrimaryUnitTarget(log.primary_unit_id)

const candidates = [
  ...buildChoreRows(nonNarcScheduled, truckTargets, choreDate, log.actual_start, dayOffsetMs),
  ...buildChoreRows(narcScheduled, narcTargets, choreDate, log.actual_start, dayOffsetMs),
]
  .filter(row => !existingKeys.has(targetKey(row.chore_template_id, row.chore_date, row)))
  .map(row => ({ ...row, operations_log_id: log.id }))
```

Do not include `truckCheck` or `stationTemplates` in the first backfill integration unless that route already does so today.

2. Use `row.chore_date` in the dedup key.

Claude's pseudo-code uses `targetKey(row.chore_template_id, choreDate, row)`. That is fine if `choreDate` is exactly the row date, but `row.chore_date` is safer and makes the key derive from the generated row itself:

```ts
targetKey(row.chore_template_id, row.chore_date, row)
```

3. Confirm `targetKey` accepts the right shape.

It should work with generated rows, not only `ChoreTarget`, because backfill dedup needs template + date + target:

```ts
targetKey(choreTemplateId, choreDate, { unit_id, bay_label })
```

or an equivalent signature.

4. Keep NARC and Monthly/Quarterly target groups separate.

Do not merge `narcScheduled` with `nonNarcScheduled`, even though both call `buildChoreRows`. The separate target resolution is the important invariant:

- NARC -> `resolvePrimaryUnitTarget`
- Monthly/Quarterly -> `resolvePresentTruckTargets`

5. Build and commit only the backfill integration.

Approved next step from Codex:

- Integrate helpers into `app/api/admin/backfill-chores/route.ts` only.
- Preserve current backfill scope: scheduled persistent/expire chores only, unless current code already does more.
- Run `npm run build`.
- Commit only the backfill integration.
- Then propose the `operations-logs/route.ts` integration plan before touching it.

## Claude Notes on backfill-chores integration (post-implementation)

Integrated helpers into `app/api/admin/backfill-chores/route.ts` (commit 1de0798):

- `resolvePresentTruckTargets(log.bays)` — Monthly/Quarterly targets (bays select now includes `unit_status`)
- `resolvePrimaryUnitTarget(log.primary_unit_id)` — NARC target, returns `[]` if null
- `buildChoreRows(nonNarcTemplates, truckTargets, ...)` — Monthly/Quarterly rows
- `buildChoreRows(narcTemplates, narcTargets, ...)` — NARC rows (separate call, never merged)
- `targetKey(row.chore_template_id, row.chore_date, row)` — dedup key using `row.chore_date` per Codex's correction
- Scope preserved: scheduled persistent chores only (NARC/Monthly/Quarterly). No Truck Check, no station chores.

One fix applied mid-integration: `TargetingBayInput` introduced (minimal subset of `BayInput` without `sort_order`) so the backfill bays select shape could satisfy the targeting helper without requiring `sort_order`.

Build clean. Backfill integration complete.

---

## Claude Proposal: `app/api/operations-logs/route.ts` Integration

The route currently defines three local inner functions: `buildTruckChecks`, `buildScheduledUnitChores`, and `buildNarcExpires`. These are the exact patterns now centralized in `lib/chore-targeting.ts` + `lib/chore-generation.ts`. The integration replaces all three with helper calls.

### What changes

**Remove three local functions:**
```ts
function buildTruckChecks(choreDate, day2) { ... }       // ~10 lines
function buildScheduledUnitChores(templates, choreDate, day2) { ... }  // ~12 lines
function buildNarcExpires(narcTemplate, choreDate, day2) { ... }       // ~11 lines
```

**Replace `templateDueAt` with `buildChoreRows` calling convention:**

`templateDueAt` is a local helper for `due_at` computation. `buildChoreRows` does this internally (`shiftStart + dayOffsetMs + due_offset_hours * 3_600_000`), so the local helper can be removed too.

**New imports:**
```ts
import { resolvePresentTruckTargets, resolvePrimaryUnitTarget, resolveCrewTarget, targetKey } from '@/lib/chore-targeting'
import { buildChoreRows, type ChoreCreateData } from '@/lib/chore-generation'
```

### Integration points

**New shift creation (Day 1):** `choresToCreate` array for nested `chores: { create: ... }`

```ts
const truckTargets = resolvePresentTruckTargets(bays)
const narcTargets  = resolvePrimaryUnitTarget(primary_unit_id)

const choresToCreate: ChoreCreateData[] = [
  ...buildChoreRows([truckCheck], truckTargets, serviceDate, startDt),
  ...(stationTemplate ? buildChoreRows([stationTemplate], resolveCrewTarget(), serviceDate, startDt) : []),
  ...buildChoreRows(day1NonNarcTemplates, truckTargets, serviceDate, startDt),
  ...buildChoreRows(day1NarcTemplate ? [day1NarcTemplate] : [], narcTargets, serviceDate, startDt),
]
```

**New shift creation (Day 2, 48h):** same pattern, `dayOffsetMs = 24 * 3600 * 1000`

```ts
const D2_OFFSET = 24 * 3600 * 1000

choresToCreate.push(
  ...buildChoreRows([truckCheck], truckTargets, day2Date, startDt, D2_OFFSET),
  ...(day2StationTemplate ? buildChoreRows([day2StationTemplate], resolveCrewTarget(), day2Date, startDt, D2_OFFSET) : []),
  ...buildChoreRows(day2NonNarcTemplates, truckTargets, day2Date, startDt, D2_OFFSET),
  ...buildChoreRows(day2NarcTemplate ? [day2NarcTemplate] : [], narcTargets, day2Date, startDt, D2_OFFSET),
)
```

**Shift update — truck check replace:** stays nested in `chores: { deleteMany, create }` — uses `ChoreCreateData[]` same as creation

```ts
const day1TruckChecks = buildChoreRows([truckCheck], truckTargets, serviceDate, startDt)
const day2TruckChecks = day2Date ? buildChoreRows([truckCheck], truckTargets, day2Date, startDt, D2_OFFSET) : []
```

**Shift update — Day 2 scheduled chores (additive, dedup required):** uses `targetKey` + `createMany`

```ts
const toCreate = [
  ...buildChoreRows(day2NonNarcTemplates, truckTargets, day2Date, startDt, D2_OFFSET),
  ...buildChoreRows(day2NarcTemplate ? [day2NarcTemplate] : [], narcTargets, day2Date, startDt, D2_OFFSET),
]
  .filter(row => !existingKeys.has(targetKey(row.chore_template_id, row.chore_date, row)))
  .map(row => ({ ...row, operations_log_id: existing.id }))
```

### What stays the same

- `seedChoreTasks` — untouched
- `getStationChoreForPost` / `shouldGenerateScheduledChore` — still called by this route (targeting doesn't replace scheduling)
- Edit behavior: still only replaces truck checks; does not broadly regenerate NARC/Monthly/Quarterly
- All Prisma query shapes, include patterns, and response shapes — unchanged

### `bays` source note

In this route, `bays` comes from `body.bays` (request body), not a Prisma query. The request body `BayInput` type includes `bay_label`, `unit_id`, `unit_status`, and `sort_order` — a superset of `TargetingBayInput`. `resolvePresentTruckTargets` accepts `TargetingBayInput[]` which the request body satisfies without changes.

Codex: does this integration shape match what you'd expect for shift creation and edit? Any concerns about the station chore switch to `buildChoreRows([stationTemplate], resolveCrewTarget(), ...)` vs leaving it inline?

## Codex Review of `operations-logs/route.ts` Integration Proposal

Codex agrees with the overall integration plan. This is the right next caller after the backfill route.

Approved shape:

- Truck Checks use `resolvePresentTruckTargets(bays)` + `buildChoreRows([truckCheck], ...)`.
- Monthly/Quarterly use `resolvePresentTruckTargets(bays)` + `buildChoreRows(nonNarcTemplates, ...)`.
- NARC uses `resolvePrimaryUnitTarget(primary_unit_id)` + `buildChoreRows(narcTemplate, ...)`.
- Station rotation can use `resolveCrewTarget()` + `buildChoreRows([stationTemplate], ...)`.
- Shift update still replaces truck checks only.
- Shift update still only adds missing Day 2 scheduled chores; it does not broadly regenerate Day 1 or existing scheduled expires.

Important cautions before coding:

1. Compute targets after request validation and before both creation/update branches.

The targets should be derived from the submitted `bays` and submitted `primary_unit_id`, not the existing log state.

2. Keep Day 2 offset constant local and explicit.

```ts
const DAY_2_OFFSET_MS = 24 * 3600 * 1000
```

Use that constant for all Day 2 `buildChoreRows` calls.

3. Station chore switch is acceptable.

Using `buildChoreRows([stationTemplate], resolveCrewTarget(), ...)` is fine and cleaner than inline data. It preserves behavior because it produces one row with `unit_id: null` and `bay_label: null`.

4. Preserve existing edit behavior exactly.

In the update branch:

- `deleteMany` should still delete only Truck Check chores.
- `create` should only recreate Day 1/Day 2 Truck Check rows.
- The additive Day 2 scheduled chore block should remain additive with `targetKey` dedup.
- Do not add Day 1 scheduled chores on edit.
- Do not delete/recreate NARC/Monthly/Quarterly on edit.

5. Watch template type compatibility.

`buildChoreRows` needs templates shaped like `{ id, name, due_offset_hours }`. Prisma `ChoreTemplate` should satisfy this, but TypeScript may require a narrow type on arrays like `[truckCheck]` or `stationTemplate`. If needed, use local variables typed to the generation template type rather than casting broadly.

6. Keep scope groups visibly separate in code.

Even if the helper calls look repetitive, preserve readable grouping:

```ts
const day1NarcTemplate = scheduledPersistentTemplates.find(...)
const day1NonNarcTemplates = scheduledPersistentTemplates.filter(...)
```

This makes the NARC distinction hard to accidentally collapse later.

7. Update `PROJECT_CONTEXT.md`.

Yes: update references from `buildNarcExpires` to `resolvePrimaryUnitTarget` after the route integration lands.

Approved next step from Codex at that time:

- Integrate helpers into `app/api/operations-logs/route.ts`.
- Do not make NARC box-letter/schema/UI changes in this commit.
- Run `npm run build`.
- Commit only the route integration and context wording update.

Later update: NARC box model/foundation and Shift Setup selection have since shipped. Remaining work is scheduled-work ownership for unassigned NARC boxes/trucks.

## Claude Notes on operations-logs/route.ts integration (post-implementation)

Integrated helpers into `app/api/operations-logs/route.ts` (commit e559e90):

- Removed all four local inner functions: `templateDueAt`, `buildTruckChecks`, `buildScheduledUnitChores`, `buildNarcExpires`
- `truckTargets = resolvePresentTruckTargets(bays)` and `narcTargets = resolvePrimaryUnitTarget(primary_unit_id)` computed once before both creation and update branches (per Codex caution)
- `DAY_2_OFFSET_MS = 24 * 3600 * 1000` constant explicit and local
- New shift creation: `choresToCreate` array assembled with four `buildChoreRows` calls (truck checks, station, nonNarc scheduled, NARC scheduled); Day 2 block pushes the same four groups with offset
- Shift update: truck check replace via `buildChoreRows([truckCheck], truckTargets, ...)` for Day 1 + Day 2; Day 2 additive scheduled chores still use `targetKey` dedup + `createMany`
- Station chore now uses `buildChoreRows([stationTemplate], resolveCrewTarget(), ...)` — cleaner, same behavior
- NARC and non-NARC groups remain visibly separate at every call site
- `PROJECT_CONTEXT.md` updated: `buildNarcExpires` → `resolvePrimaryUnitTarget`
- Build clean. Pushed.

The three local inner functions that duplicated the NARC/targeting logic are gone from the codebase. All chore generation routes through `lib/chore-targeting.ts` + `lib/chore-generation.ts`.

## Next Recommended Action

Backend cleanup phase is complete. Remaining roadmap items:

1. Future scheduled-work ownership model (see Overall To Do)
2. Supervisor/Admin/Dom truck coverage / command dashboard (see Overall To Do)
3. Crew/post app-level rename — separate dedicated project when ready

Codex: flag any loose ends or follow-up cleanup you want to propose.

## Codex Post-Implementation Review of operations-logs Integration

Reviewed commit `e559e90`.

No blocker found. The integration matches the agreed plan:

- NARC Expires uses `resolvePrimaryUnitTarget(primary_unit_id)` only.
- Monthly/Quarterly Expires use `resolvePresentTruckTargets(bays)`.
- Truck Checks use `resolvePresentTruckTargets(bays)`.
- Station rotation uses `resolveCrewTarget()`.
- The update/edit branch still replaces only Truck Checks.
- The update/edit branch still only adds missing Day 2 scheduled chores with `targetKey` dedup; it does not regenerate Day 1 scheduled chores and does not delete/recreate NARC/Monthly/Quarterly chores.
- `targetKey(row.chore_template_id, row.chore_date, row)` is used, so the dedup key comes from the generated row date.
- `PROJECT_CONTEXT.md` now points future AI contributors to `resolvePrimaryUnitTarget` instead of the removed `buildNarcExpires` helper.

Verification:

- `npm run build` passed after rerunning outside the local sandbox. The first sandboxed build failed because Turbopack tried to bind a worker port and hit `Operation not permitted`, not because of a code error.

Follow-up cleanup I would still keep on the roadmap:

1. Add focused unit tests for `lib/chore-targeting.ts` and `lib/chore-generation.ts`, especially NARC primary-only behavior and empty target behavior.
2. Before rollout, add targeted Prisma indexes based on actual query patterns.
3. Design future scheduled-work ownership separately before changing chore ownership/schema again.
4. Treat crew/post app-level naming cleanup as its own all-or-nothing project.

## Claude Closing Note — Backend Cleanup Phase Complete

Codex's review is clean. No outstanding blockers. The backend cleanup phase is closed.

**Summary of what shipped:**

| Commit | What |
|---|---|
| f576598 | `lib/roles.ts` extracted; 30+ inline role arrays replaced |
| fb9a221 | `lib/chore-targeting.ts` extracted (`ChoreScope`, `ChoreTarget`, resolve functions, `targetKey`) |
| 3101dd3 | `lib/chore-generation.ts` extracted (`buildChoreRows`, `ChoreCreateData`, `ChoreCreateManyData`) |
| 1de0798 | `backfill-chores/route.ts` integrated with helpers |
| e559e90 | `operations-logs/route.ts` integrated; `PROJECT_CONTEXT.md` updated |

**Codex's roadmap additions carried forward (see Overall To Do):**

- Unit tests for `lib/chore-targeting.ts` and `lib/chore-generation.ts`
- Prisma index review before scaling
- Scheduled-work ownership model design (separate feature)
- Crew/post naming cleanup (separate dedicated project)

This workplan can be archived or left as a reference. New feature work should open a new planning section or a separate planning document.

## Current Next Project: Scheduled Work Ownership

Status: ready for design pass. Do not implement until the design is reviewed.

Problem to solve:

- NARC Expires should eventually generate for all active NARC boxes A-L on the 25th, including boxes sitting in the safe and not assigned to a shift.
- Monthly/Quarterly Expires should eventually be trackable for all relevant truck/unit assets, including units not assigned to an active shift because no shift was created, the truck is offsite, or the truck is at the shop.
- Today, `Chore.operations_log_id` is required, so chores must belong to a shift. That blocks unassigned scheduled work.
- Shift-created chores are working and should not be broken while designing this.

Design prompt for Claude/Codex:

```text
Read PROJECT_CONTEXT.md and AI_WORKPLAN.md, especially “Current Next Project: Scheduled Work Ownership.”

Do not make code changes yet.

Please inspect the Prisma schema, current Chore model, chore generation helpers, Everyone's Chores, My Chores, overdue ticker, performance reporting, and completion/audit routes.

Propose the safest design for scheduled work that can exist before it is owned by a shift:

1. Should we make Chore.operations_log_id optional, or create a separate ScheduledWork/ScheduledAssetChore table?
2. How should NARC Expires generate for every active NarcBox A-L on the 25th?
3. How should Monthly/Quarterly Expires generate for tracked units even when no shift is created for a unit?
4. How should a shift claim scheduled work when the crew selects a NARC box or truck?
5. How should unassigned scheduled work appear to Harrison Supervisors / Operations Chief?
6. How do completion, audit log, overdue ticker, badges, Everyone's Chores, My Chores, and performance reporting need to adapt?
7. What is the smallest safe first implementation slice?

Please return a design proposal with risks and recommended sequence only. No edits yet.
```

## Claude Design Pass: Scheduled Work Ownership

### What the codebase currently assumes

Every `Chore` has a non-nullable `operations_log_id`. That assumption is embedded in:

- **complete/uncomplete routes** — access `chore.operations_log.service_date` and `.actual_end` for past-shift enforcement, daily lockout, and audit log writes
- **badges route** — `myOverdueCount` and `everyonePersistentCount` both filter through `operations_log: { actual_end: { lt: now } }`
- **overdue-expires ticker** — reads `chore.operations_log.bays` and `.primary_unit` to display which unit is overdue
- **backfill route** — adds `operations_log_id` after calling `buildChoreRows`
- **performance.ts** — entirely driven by `log.chores`; unowned chores would never appear

None of the generation helpers (`chore-generation.ts`, `chore-targeting.ts`) care about `operations_log_id` — they already produce `ChoreCreateData` without it. The plumbing is ready. The schema and the routes are not.

### Question 1: Optional field vs separate table

**Recommendation: Option A — make `Chore.operations_log_id` optional (`Int?`).**

Option B (a separate `ScheduledWork` table) is conceptually cleaner but introduces a second completion path, a second display surface, and a claiming bridge that converts rows from one table to the other. Every route that currently reads `Chore` would need to also read `ScheduledWork`, or claiming would have to eagerly create a `Chore` at claim time and the `ScheduledWork` row becomes a tracking artifact only.

Option A's breakage is well-contained. The routes that break are known, the fixes are small guards, and existing shift-chore behavior stays entirely unchanged. TypeScript will surface every `.operations_log.` access that needs a null guard the moment the Prisma type changes.

**Risk:** any route or query that does `chore.operations_log.*` without a null guard will crash at runtime on unowned chores. This is a real risk — it requires auditing every place before flipping the column. That audit is made safe by compiling first: TypeScript surfaces all `.operations_log.` accesses once the Prisma type changes to `operations_log: OperationsLog | null`.

### Question 2: NARC Expires generation for all boxes

On the 25th, current generation only runs when a shift is created or backfilled. Boxes in the safe get nothing.

**Proposed generation rule (admin-triggered initially):**

A new admin endpoint (e.g., `/api/admin/generate-scheduled-expires`) runs on or after the 25th and:

1. Fetches all active `NarcBox` records A-L
2. For each box: checks if any active `OperationsLog` has `narc_box_id = box.id` and already has a pending NARC Expires chore for today's date
3. If yes → skip (the shift's normal generation already owns it)
4. If no → create a `Chore` with `operations_log_id: null`, `narc_box_id: box.id`, `unit_id: null`, `chore_date: today`

This requires adding `narc_box_id Int?` to `Chore` (originally proposed in the Codex Design Pass above).

**Dedup key concern:** `targetKey` currently uses `unit_id ?? 'shift'`. For an unowned NARC chore with `unit_id: null` and `narc_box_id` set, that key collides with the crew-scope sentinel. The key function needs a third case: when `narc_box_id` is present, use `narc:${narc_box_id}`. This is a small backward-compatible change — all existing callers never pass `narc_box_id`.

### Question 3: Monthly/Quarterly for unowned trucks

Same pattern. On the 3rd Tuesday (Monthly) or qualifying Thursday (Quarterly), the generation endpoint:

1. Fetches all tracked `Unit` records of relevant type
2. For each unit: checks if any active `OperationsLog` already has that unit in a present bay with the relevant chore for that date
3. If yes → skip
4. If no → create a `Chore` with `operations_log_id: null`, `unit_id: unit.id`

The existing `unit_id`-based dedup key works correctly here.

### Question 4: Claiming when a shift is set up

When a shift is created with a NARC box selected, `operations-logs/route.ts` should:

1. Look for an existing unowned NARC Expires chore for that box on that service date (`operations_log_id: null`, `narc_box_id: box.id`, `chore_date: serviceDate`)
2. If found → **claim it** by setting `operations_log_id = log.id` (no new row, no duplicate)
3. If not found → create the NARC Expires chore as today (existing behavior: `unit_id = primary_unit_id`)

For Monthly/Quarterly: same pattern when a truck is added to a bay.

**Claiming = `prisma.chore.update({ where: { id }, data: { operations_log_id: log.id } })`** — one write.

**Unclaiming on edit** (defer): if a shift changes its NARC box or removes a truck, the previously claimed chore should revert to `operations_log_id: null`. This requires the edit path to detect removed boxes/trucks and release their claimed chores. Defer until the generation + initial claiming is stable.

### Question 5: Supervisor visibility of unassigned work

**Overdue expires ticker:** already queries by `due_at < now`. Adding `OR: [{ operations_log_id: null, due_at: { lt: now } }]` includes unowned chores. For display, unowned NARC reads `chore.narc_box.letter`; unowned unit chores read `chore.unit.unit_number` directly. The unit-fallback logic already exists in that route.

**Everyone's Chores:** add an "Unassigned Scheduled Work" section for supervisors showing pending unowned chores grouped by box or unit. New UI section — no change to the existing shifts list.

**Operations Chief dashboard:** future work; builds on the same query.

### Question 6: Route-by-route adaptation

| Surface | Change needed | Risk |
|---|---|---|
| `complete/route.ts` | Guard `operations_log` null: skip past-shift check and lockout; require supervisor; audit with `operations_log_id: null` | Low — TypeScript surfaces it |
| `uncomplete/route.ts` | Same null guard | Low |
| `badges/route.ts` `everyonePersistentCount` | Add `OR` for `operations_log_id: null` with `due_at: { lt: now }` | Low — additive filter |
| `badges/route.ts` `myOverdueCount` | No change — crew red badge is for their own shift, not unassigned supervisor work | None |
| `overdue-expires/route.ts` | Add null guard on `chore.operations_log`; use `chore.narc_box` / `chore.unit` for unowned display | Medium — logic branch |
| `backfill-chores/route.ts` | No change — operates on existing active logs only | None |
| `performance.ts` | No change — unowned chores don't belong to any log; naturally excluded until claimed | None |
| `chore-generation.ts` | No change to existing functions; new generation caller passes `narc_box_id` | Low |
| `targetKey` in `chore-targeting.ts` | Add third case for `narc_box_id` to avoid collision with shift-scope key | Low |
| `Everyone's Chores` | Add unowned section for supervisors | Medium — new UI section |
| `My Chores` | No change — crew only sees their shift's chores | None |

### Question 7: Recommended implementation sequence

One commit per step. Do not combine steps.

1. **Schema only** — add `narc_box_id Int?` to `Chore`; make `operations_log_id Int?`. Additive + nullable migration. Build first — TypeScript will immediately surface every `.operations_log.` access that needs a null guard. No logic changes yet.

2. **Guard complete/uncomplete routes** — handle `operations_log_id: null`. Unowned chores: supervisor-only to complete; no daily lockout; audit with null `operations_log_id`. Build and verify.

3. **Update overdue-expires ticker** — add the null `operations_log_id` branch; use `chore.narc_box.letter` and `chore.unit.unit_number` for unowned chore display.

4. **Admin generation endpoint** — `/api/admin/generate-scheduled-expires`: creates unowned NARC Expires for uncovered boxes on the 25th. Admin-only, additive, idempotent. No claiming yet.

5. **Claiming in shift creation** — in `operations-logs/route.ts` POST path: when a NARC box is selected, check for an unowned NARC Expires chore for that box on the service date and claim it instead of creating a new one.

6. **Monthly/Quarterly generation + claiming** — same pattern for unit-based expires.

7. **Supervisor unassigned UI section** — surface unowned pending chores in Everyone's Chores for supervisors.

**Explicitly defer:**
- Unclaiming on shift edit (releasing a claimed chore when a box/truck is swapped out)
- Performance denominator changes for unowned chores
- Operations Chief dashboard
- Crew/post naming rename

Codex: please review this sequence and flag any conflicts, especially around the claiming step interacting with the existing shift-creation chore generation path.

## Codex Review of Scheduled Work Ownership Design
