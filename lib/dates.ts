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
