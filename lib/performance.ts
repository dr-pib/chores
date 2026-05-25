export interface PerformanceChore {
  status: string
  chore_template: { name: string }
}

export interface PerformanceLog {
  id: number
  service_date: Date
  actual_end: Date
  chores: PerformanceChore[]
}

export interface WindowStats {
  rate: number | null  // null when total = 0 (guard against division by zero)
  done: number
  total: number
  shifts: number
}

export interface LastShiftStats {
  rate: number | null
  log_id: number
  service_date: Date
  done: number
  total: number
}

export interface PerformanceStats {
  d60: WindowStats
  d30: WindowStats
  last_shift: LastShiftStats | null
}

function choreCount(chores: PerformanceChore[], isNRP: boolean) {
  const eligible = chores.filter(c => isNRP || c.chore_template.name !== 'NARC Expires')
  return {
    done: eligible.filter(c => c.status === 'completed').length,
    total: eligible.length,
  }
}

function windowStats(logs: PerformanceLog[], isNRP: boolean): WindowStats {
  let done = 0
  let total = 0
  for (const log of logs) {
    const c = choreCount(log.chores, isNRP)
    done += c.done
    total += c.total
  }
  return { rate: total > 0 ? done / total : null, done, total, shifts: logs.length }
}

export function computePerformanceStats(
  isNRP: boolean,
  logs: PerformanceLog[],
  now: Date = new Date(),
): PerformanceStats {
  const cutoff60 = new Date(now.getTime() - 60 * 24 * 3600 * 1000)
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000)

  // Only count shifts that have actually ended
  const completed = logs.filter(l => new Date(l.actual_end).getTime() < now.getTime())

  const logs60 = completed.filter(l => new Date(l.service_date).getTime() >= cutoff60.getTime())
  const logs30 = completed.filter(l => new Date(l.service_date).getTime() >= cutoff30.getTime())

  const mostRecent = [...completed].sort(
    (a, b) => new Date(b.actual_end).getTime() - new Date(a.actual_end).getTime()
  )[0] ?? null

  let last_shift: LastShiftStats | null = null
  if (mostRecent) {
    const c = choreCount(mostRecent.chores, isNRP)
    last_shift = {
      rate: c.total > 0 ? c.done / c.total : null,
      log_id: mostRecent.id,
      service_date: new Date(mostRecent.service_date),
      done: c.done,
      total: c.total,
    }
  }

  return {
    d60: windowStats(logs60, isNRP),
    d30: windowStats(logs30, isNRP),
    last_shift,
  }
}

export function trendArrow(d60Rate: number | null, d30Rate: number | null): '↑' | '↓' | '—' {
  if (d60Rate === null || d30Rate === null) return '—'
  const diff = d30Rate - d60Rate
  if (diff > 0.02) return '↑'
  if (diff < -0.02) return '↓'
  return '—'
}

export function formatRate(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

// Per-shift breakdown used in the per-employee detail page
export function perShiftStats(log: PerformanceLog, isNRP: boolean) {
  const c = choreCount(log.chores, isNRP)
  return { done: c.done, total: c.total, rate: c.total > 0 ? c.done / c.total : null }
}
