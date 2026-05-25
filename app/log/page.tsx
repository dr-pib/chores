import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import { formatUnit } from '@/lib/units'
import { nextServiceDate } from '@/lib/dates'

function formatRosterDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
function formatShiftMil(d: Date | string) {
  const dt = new Date(d)
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Chicago',
  }).formatToParts(dt)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  let hour = get('hour')
  if (hour === '24') hour = '00'
  return `${get('weekday')}, ${get('month')}/${get('day')} ${hour}${get('minute')}`
}
function toDateParam(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const { date: dateParam } = await searchParams

  const now = new Date()
  // Determine today's date in Central Time (not UTC — UTC rolls over 5 hours early for CDT users)
  const todayLocal = new Date(
    now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) + 'T00:00:00Z'
  )

  let serviceDate: Date
  if (dateParam) {
    const parsed = new Date(dateParam + 'T00:00:00Z')
    serviceDate = isNaN(parsed.getTime()) ? todayLocal : parsed
  } else {
    serviceDate = todayLocal
  }

  const isToday = serviceDate.getTime() === todayLocal.getTime()
  const prevDate = new Date(serviceDate.getTime() - 24 * 3600 * 1000)
  const nextDate = nextServiceDate(serviceDate)

  const [shiftProfiles, logs] = await Promise.all([
    prisma.shiftProfile.findMany({
      include: { station: true, default_unit: true },
      orderBy: [{ station: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.operationsLog.findMany({
      where: {
        actual_start: { lt: nextDate },
        actual_end: { gt: serviceDate },
      },
      include: {
        shift_profile: true,
        primary_employee: true,
        partner_employee: true,
        primary_unit: true,
        bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
        chores: true,
      },
      orderBy: { created_at: 'asc' },
    }),
  ])

  // Build a map: shift_profile_id → log (most recent if multiple somehow exist)
  const logByPost: Record<number, typeof logs[0]> = {}
  for (const log of logs) {
    logByPost[log.shift_profile_id] = log
  }

  // Group shift profiles by station name
  const stationOrder: string[] = []
  const postsByStation: Record<string, typeof shiftProfiles> = {}
  for (const post of shiftProfiles) {
    const sName = post.station.name
    if (!postsByStation[sName]) {
      postsByStation[sName] = []
      stationOrder.push(sName)
    }
    postsByStation[sName].push(post)
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-zinc-100">Today&apos;s Roster</h1>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2 mb-6">
          <Link
            href={`/log?date=${toDateParam(prevDate)}`}
            className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Previous day"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="text-zinc-100 font-medium text-sm">
            {isToday && <span className="text-blue-400 mr-1.5">Today —</span>}
            {formatRosterDate(serviceDate)}
          </span>
          {!isToday ? (
            <Link
              href={`/log?date=${toDateParam(nextDate)}`}
              className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label="Next day"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <span className="w-8" />
          )}
        </div>

        {/* Roster by station */}
        <div className="space-y-6">
          {stationOrder.map(stationName => (
            <div key={stationName}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{stationName}</h2>
              <div className="space-y-2">
                {postsByStation[stationName].map(post => {
                  const log = logByPost[post.id]
                  if (log) {
                    const done = log.chores.filter(c => c.status === 'completed').length
                    const total = log.chores.length
                    const allDone = total > 0 && done === total
                    return (
                      <Link key={post.id} href={`/log/${log.id}`} className="block">
                        <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-zinc-100">{post.name}</span>
                                {log.supervisor_confirmed_at && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">Confirmed</span>
                                )}
                              </div>
                              <div className="text-zinc-400 text-sm mt-0.5">
                                {log.primary_employee.name}
                                {log.partner_employee && <span> &amp; {log.partner_employee.name}</span>}
                                <span className="text-zinc-600 mx-1.5">·</span>
                                {formatShiftMil(log.actual_start)} – {formatShiftMil(log.actual_end)}
                                <span className="text-zinc-600 mx-1.5">·</span>
                                {formatUnit(log.primary_unit, false)}
                                {(() => {
                                  const secondUnit = log.bays.find(b => b.unit && b.unit_id !== log.primary_unit_id)?.unit
                                  return secondUnit ? <span className="text-zinc-600"> ({formatUnit(secondUnit, false)})</span> : null
                                })()}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`text-xs ${allDone ? 'text-green-400' : 'text-zinc-500'}`}>
                                {done}/{total} chores
                              </div>
                              <svg className="w-4 h-4 text-zinc-600 mt-1 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  }

                  // Unbuilt shift — muted placeholder
                  return (
                    <div key={post.id} className="bg-zinc-900/30 border border-zinc-800/40 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-zinc-600">{post.name}</span>
                          <div className="text-zinc-700 text-sm mt-0.5">
                            {post.default_unit ? formatUnit(post.default_unit, false) : '—'}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-700 uppercase tracking-wider font-medium">No shift</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
