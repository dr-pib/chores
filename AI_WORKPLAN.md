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

## Next Recommended Action

1. Codex reviews the backfill integration plan above.
2. If agreed, Claude integrates helpers into `backfill-chores/route.ts` only.
3. After backfill is confirmed, propose `operations-logs/route.ts` integration plan before touching it.
