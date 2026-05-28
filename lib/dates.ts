// Returns the UTC Date representing 08:00 America/Chicago on the given work_date.
// workDate must be midnight UTC for a Chicago calendar date (as stored in @db.Date fields).
export function chicago0800(workDate: Date): Date {
  for (const tzOffsetH of [5, 6]) {
    const candidateMidnight = new Date(workDate.getTime() + tzOffsetH * 3_600_000)
    const hhmm = candidateMidnight.toLocaleString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'America/Chicago',
    })
    if (hhmm.startsWith('00:')) return new Date(candidateMidnight.getTime() + 8 * 3_600_000)
  }
  return new Date(workDate.getTime() + 13 * 3_600_000) // CDT fallback
}

export function todayChicago(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'America/Chicago',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00.000Z`)
}

export function nextServiceDate(serviceDate: Date): Date {
  return new Date(serviceDate.getTime() + 24 * 3600 * 1000)
}

// Prefer actual_end when available so 48-hour shifts remain current after midnight.
export function isPastShift(serviceDate: Date, actualEnd?: Date): boolean {
  if (actualEnd) return actualEnd.getTime() < Date.now()

  return serviceDate.getTime() < todayChicago().getTime()
}
