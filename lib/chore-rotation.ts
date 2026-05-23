// Station chores in rotation order
// May 2026 base: Supervisor=Bathroom, 24-7=Garage, 24-8=Kitchen, Swing=Quarters
const STATION_CHORES = ['Bathroom', 'Garage', 'Kitchen', 'Quarters'] as const
const HARRISON_CREWS = ['Supervisor', '24-7', '24-8', 'Swing']
const BASE_MONTH = 5

export function getStationChoreForPost(crewPostName: string, month: number): string | null {
  const crewIndex = HARRISON_CREWS.indexOf(crewPostName)
  if (crewIndex === -1) return null
  const idx = (((month - BASE_MONTH) + crewIndex) % 4 + 4) % 4
  return STATION_CHORES[idx]
}

function thirdTuesday(year: number, monthIndex: number): Date {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const daysUntilTuesday = (2 - firstOfMonth.getDay() + 7) % 7
  return new Date(year, monthIndex, 1 + daysUntilTuesday + 14)
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

export function shouldGenerateScheduledChore(templateName: string, serviceDate: Date): boolean {
  const year = serviceDate.getFullYear()
  const month = serviceDate.getMonth()

  if (templateName === 'NARC Expires') {
    return serviceDate.getDate() === 25
  }

  if (templateName === 'Monthly Expires') {
    return isSameLocalDate(serviceDate, thirdTuesday(year, month))
  }

  if (templateName === 'Quarterly Expires') {
    if (![0, 3, 6, 9].includes(month)) return false
    const monthlyDate = thirdTuesday(year, month)
    const quarterlyDate = new Date(year, month, monthlyDate.getDate() + 2)
    return isSameLocalDate(serviceDate, quarterlyDate)
  }

  return false
}

const CHORE_PRIORITY: Record<string, number> = {
  'Truck Check':      0,
  'Bathroom':        10,
  'Garage':          10,
  'Kitchen':         10,
  'Quarters':        10,
  'Monthly Expires': 20,
  'NARC Expires':    30,
  'Quarterly Expires': 40,
  'Additional Chore': 50,
}

export function sortChores<T extends {
  chore_template: { name: string }
  unit?: { unit_number: number } | null
}>(chores: T[]): T[] {
  return [...chores].sort((a, b) => {
    const ap = CHORE_PRIORITY[a.chore_template.name] ?? 15
    const bp = CHORE_PRIORITY[b.chore_template.name] ?? 15
    if (ap !== bp) return ap - bp
    // Truck Checks: sort by unit number
    if (ap === 0) return (a.unit?.unit_number ?? 0) - (b.unit?.unit_number ?? 0)
    return 0
  })
}
