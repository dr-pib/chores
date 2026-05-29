// Converts a Chicago-local calendar date (YYYY-MM-DD) and local clock time (HH:mm)
// to the correct UTC Date, handling both CST (UTC-6) and CDT (UTC-5) automatically.
// Use this whenever building actual_start/actual_end from operational shift times.
// Never use Date.UTC() directly with Chicago local clock values — it ignores the
// timezone offset and stores times 5–6 hours too early.
export function chicagoLocalToUtc(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const padded = (n: number) => String(n).padStart(2, '0')
  const expected = `${padded(hour)}:${padded(minute)}`
  for (const offsetH of [5, 6]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetH, minute))
    const roundTrip = candidate.toLocaleString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'America/Chicago',
    }).replace(/^24:/, '00:')
    if (roundTrip === expected) return candidate
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute)) // CDT fallback
}

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

// Returns the UTC-midnight Date for the Chicago-local calendar date of any given instant.
// Use this when computing service_date from actual_start — never use .getFullYear/Month/Date()
// which returns the UTC date and mis-classifies shifts that start after 7pm CDT (midnight UTC).
export function chicagoServiceDate(utcInstant: Date): Date {
  const dateStr = utcInstant.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  return new Date(dateStr + 'T00:00:00.000Z')
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
