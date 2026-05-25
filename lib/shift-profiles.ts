const SHIFT_ORDER = ['Supervisor', '24-7', '24-8', 'Swing']

export interface ShiftProfileSortItem {
  name: string
  station: { name: string }
}

export function shiftProfileRank(profile: ShiftProfileSortItem) {
  const directRank = SHIFT_ORDER.indexOf(profile.name)
  if (directRank >= 0) return directRank

  if (profile.station.name === 'Diamond City' || profile.name.includes('DC')) return 4
  if (profile.station.name === 'Newton County' || profile.name.includes('NC')) return 5

  return 100
}

export function compareShiftProfiles(a: ShiftProfileSortItem, b: ShiftProfileSortItem) {
  const rankDiff = shiftProfileRank(a) - shiftProfileRank(b)
  if (rankDiff !== 0) return rankDiff
  return a.name.localeCompare(b.name)
}
