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

## Next Recommended Action

1. Codex reviews the `lib/chore-targeting.ts` signatures above.
2. Once agreed, either Claude or Codex extracts targeting (no operations-logs/route.ts changes yet).
3. After targeting is stable, design `lib/chore-generation.ts` signatures the same way — propose in this doc before coding.
