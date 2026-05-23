interface UnitLike {
  unit_name?: string | null
  unit_number: number
  unit_type?: string | null
}

export function formatUnit(unit: UnitLike, showType = true): string {
  if (unit.unit_name) return unit.unit_name
  return showType && unit.unit_type
    ? `Unit ${unit.unit_number} (${unit.unit_type})`
    : `Unit ${unit.unit_number}`
}
