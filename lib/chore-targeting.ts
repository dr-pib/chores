// Minimal bay shape required for target resolution — subset of BayInput.
// sort_order is not needed here and is intentionally omitted.
export interface TargetingBayInput {
  bay_label: string | null
  unit_id: number | null
  unit_status: string
}

// What a chore template targets — used by generation helpers to resolve
// the correct unit_id and bay_label for each chore row.
export const ChoreScope = {
  CREW: 'crew',
  // NARC Expires only — shift's primary manned ALS unit. Never use for Monthly/Quarterly.
  PRIMARY_UNIT: 'primary_unit',
  // Truck Check, Monthly Expires, Quarterly Expires — every present truck on the shift.
  ALL_PRESENT_TRUCKS: 'all_present_trucks',
  STATION: 'station',
} as const
export type ChoreScope = typeof ChoreScope[keyof typeof ChoreScope]

// A resolved target for one chore row. Generation helpers turn (template, target, date) → row.
export interface ChoreTarget {
  scope: ChoreScope
  unit_id: number | null   // null for CREW and STATION scope
  bay_label: string | null // null for PRIMARY_UNIT (NARC) and CREW/STATION scope
}

// Truck Check, Monthly Expires, Quarterly Expires: one target per present truck.
// Filters strictly to unit_status === 'unit_present' with a non-null unit_id.
export function resolvePresentTruckTargets(bays: TargetingBayInput[]): ChoreTarget[] {
  return bays
    .filter(b => b.unit_status === 'unit_present' && b.unit_id != null)
    .map(b => ({
      scope: ChoreScope.ALL_PRESENT_TRUCKS,
      unit_id: b.unit_id,
      bay_label: b.bay_label,
    }))
}

// NARC Expires only — primary manned ALS unit.
// Returns [] when primaryUnitId is null: never create NARC Expires without a primary unit.
// Do NOT use this for Monthly or Quarterly Expires.
export function resolvePrimaryUnitTarget(primaryUnitId: number | null): ChoreTarget[] {
  if (primaryUnitId == null) return []
  return [{ scope: ChoreScope.PRIMARY_UNIT, unit_id: primaryUnitId, bay_label: null }]
}

// Station rotation and crew-level chores: one target with no unit.
export function resolveCrewTarget(): ChoreTarget[] {
  return [{ scope: ChoreScope.CREW, unit_id: null, bay_label: null }]
}

// Deduplication key matching the format used in shift creation and backfill.
// Accepts any object with unit_id — works with ChoreTarget or a generated ChoreCreateData row.
export function targetKey(templateId: number, choreDate: Date, target: { unit_id: number | null }): string {
  return `${templateId}-${choreDate.getTime()}-${target.unit_id ?? 'shift'}`
}
