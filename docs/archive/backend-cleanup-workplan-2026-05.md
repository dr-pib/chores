> Archived from AI_WORKPLAN.md during documentation cleanup. This file is historical reference, not active instructions.

# Backend Cleanup Workplan — May 2026

This was the original shared planning document before the ScheduledWork ownership model was conceived. The goals here (centralizing generation, targeting, roles) were completed. All active work moved to the ScheduledWork design (see `scheduled-work-ownership-design-2026-05.md`).

## Original Goal

Centralize backend chore generation, chore targeting, shift-window logic, roles, and audit behavior without changing current user-facing behavior.

## Decisions Made

- NARC Expires = unit-specific for the shift's primary manned ALS unit only.
- Monthly Expires = unit-specific per present truck/unit.
- NARC must not use the generic all-present-trucks target path.
- Service dates are Chicago-local calendar dates.
- App-level naming moves toward `ShiftProfile` but legacy DB mappings (`crew_posts`, `crew_post_id`) must not be renamed casually.
- Use string constants with `as const`, not TypeScript enums.
- `lib/roles.ts` extracted first (lowest risk).
- `lib/chore-targeting.ts` before `lib/chore-generation.ts`.
- `lib/chore-rotation.ts` left intact; targeting calls into it.

## Completed Work

- `lib/roles.ts` extracted (commit f576598): `SUPERVISOR_ROLES`, `DOM_ROLE`, `isSupervisorRole()`, `isDom()`, `canAccessAdmin()`. Replaced 30+ inline copies across 34 files. Build clean.
- `NarcBox` model/table added, boxes A–L seeded.
- Shift Setup/Edit has one shift-level NARC Box dropdown.
- NARC boxes assigned to another active shift are disabled/greyed out in Setup.
- `/api/operations-logs` validates the same NARC box cannot be assigned to two active shifts.
- NARC Expires display shows box letter + unit number: e.g. `NARC Expires Box C Unit 4`.
- `lib/chore-targeting.ts` implemented with `resolvePresentTruckTargets`, `resolvePrimaryUnitTarget`, `resolveCrewTarget`, `targetKey`.
- `lib/chore-generation.ts` implemented with `buildChoreRows` (pure, no Prisma), `ChoreCreateData`, `ChoreCreateManyData`.

## lib/chore-targeting.ts Design (settled)

```ts
export const ChoreScope = {
  CREW: 'crew', PRIMARY_UNIT: 'primary_unit',
  ALL_PRESENT_TRUCKS: 'all_present_trucks', STATION: 'station',
} as const

export type BayInput = { bay_label: string | null; unit_id: number | null; unit_status: string }

export function resolvePresentTruckTargets(bays: BayInput[]): ChoreTarget[]
// filters strictly to unit_status === 'unit_present' && unit_id != null

export function resolvePrimaryUnitTarget(primaryUnitId: number | null): ChoreTarget[]
// returns [] when primaryUnitId is null — prevents NARC Expires on no-unit shifts

export function resolveCrewTarget(): ChoreTarget[]
// one crew-level target, no unit
```

`ALL_PRESENT_TRUCKS` for Monthly/Quarterly. `resolvePrimaryUnitTarget` for NARC only — never route NARC through `resolvePresentTruckTargets`.

## Items Intentionally Deferred

- Crew/post naming cleanup (separate dedicated project)
- Chore Admin UI (data model exists; UI deferred)
- Standalone non-SW chores for removed assets (deferred; resolves once scheduled generation is reliable)
