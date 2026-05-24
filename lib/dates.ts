export function todayChicago(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'America/Chicago',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00.000Z`)
}

// Returns true if the operations log's service_date is before today (Chicago time)
export function isPastShift(serviceDate: Date): boolean {
  return serviceDate.getTime() < todayChicago().getTime()
}
