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
  // "Overall" = own-shift work PLUS persistent chores this employee personally
  // completed on other crews' shifts (make-up work) in the window. Each make-up
  // adds 1 to both numerator and denominator, so overall_rate >= rate.
  overall_rate: number | null
  overall_done: number
  overall_total: number
}

// Make-up completions counted per window (chores done for other crews).
export interface MakeupCounts {
  d30: number
  d60: number
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

function windowStats(logs: PerformanceLog[], isNRP: boolean, makeups = 0): WindowStats {
  let done = 0
  let total = 0
  for (const log of logs) {
    const c = choreCount(log.chores, isNRP)
    done += c.done
    total += c.total
  }
  const overallDone = done + makeups
  const overallTotal = total + makeups
  return {
    rate: total > 0 ? done / total : null,
    done,
    total,
    shifts: logs.length,
    overall_rate: overallTotal > 0 ? overallDone / overallTotal : null,
    overall_done: overallDone,
    overall_total: overallTotal,
  }
}

export function computePerformanceStats(
  isNRP: boolean,
  logs: PerformanceLog[],
  now: Date = new Date(),
  makeups: MakeupCounts = { d30: 0, d60: 0 },
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
    d60: windowStats(logs60, isNRP, makeups.d60),
    d30: windowStats(logs30, isNRP, makeups.d30),
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

// Renders an own/overall pair as "70%/81%". Collapses to a single value when the
// employee did no make-up work that window (own === overall), to avoid "70%/70%".
export function formatRatePair(stats: WindowStats): string {
  const own = formatRate(stats.rate)
  if (stats.overall_total === stats.total) return own
  return `${own}/${formatRate(stats.overall_rate)}`
}

// Per-shift breakdown used in the per-employee detail page
export function perShiftStats(log: PerformanceLog, isNRP: boolean) {
  const c = choreCount(log.chores, isNRP)
  return { done: c.done, total: c.total, rate: c.total > 0 ? c.done / c.total : null }
}

// In-progress stats for an active shift given its chores directly
export function choreStats(chores: PerformanceChore[], isNRP: boolean) {
  const c = choreCount(chores, isNRP)
  return { done: c.done, total: c.total, rate: c.total > 0 ? c.done / c.total : null }
}
