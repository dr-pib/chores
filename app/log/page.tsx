import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import { formatUnit } from '@/lib/units'

function toDateParam(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
function fmtTime(d: Date | string) {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const { date: dateParam } = await searchParams
  const now = new Date()
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  let serviceDate: Date
  if (dateParam) {
    const parsed = new Date(dateParam + 'T00:00:00Z')
    serviceDate = isNaN(parsed.getTime()) ? todayUtc : parsed
  } else {
    serviceDate = todayUtc
  }

  const isToday = serviceDate.getTime() === todayUtc.getTime()
  const prevDate = new Date(serviceDate.getTime() - 24 * 3600 * 1000)
  const nextDate = new Date(serviceDate.getTime() + 24 * 3600 * 1000)

  const [crewPosts, logs] = await Promise.all([
    prisma.crewPost.findMany({
      include: { station: true, default_unit: true },
      orderBy: [{ station: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.operationsLog.findMany({
      where: { service_date: serviceDate },
      include: {
        crew_post: true,
        primary_employee: true,
        partner_employee: true,
        primary_unit: true,
        bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
        chores: true,
      },
      orderBy: { created_at: 'asc' },
    }),
  ])

  const logByPost: Record<number, typeof logs[0]> = {}
  for (const log of logs) logByPost[log.crew_post_id] = log

  const stationOrder: string[] = []
  const postsByStation: Record<string, typeof crewPosts> = {}
  for (const post of crewPosts) {
    const s = post.station.name
    if (!postsByStation[s]) { postsByStation[s] = []; stationOrder.push(s) }
    postsByStation[s].push(post)
  }

  return (
    <div className="min-h-screen bg-[#09090b]">
      <NavBar userName={session.name} userRole={session.role} />

      <div className="max-w-[1100px] mx-auto px-4 py-4">
        {/* ── Date nav header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href={`/log?date=${toDateParam(prevDate)}`}
              className="font-mono text-[10px] text-zinc-600 hover:text-zinc-300 px-2 py-1 border border-[#1e2028] hover:border-zinc-600 transition-colors rounded-sm"
              aria-label="Previous day">
              ◄
            </Link>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mr-2">
                {isToday ? 'TODAY' : ''}
              </span>
              <span className="font-mono text-xs text-zinc-200">{fmtDate(serviceDate).toUpperCase()}</span>
            </div>
            {!isToday ? (
              <Link href={`/log?date=${toDateParam(nextDate)}`}
                className="font-mono text-[10px] text-zinc-600 hover:text-zinc-300 px-2 py-1 border border-[#1e2028] hover:border-zinc-600 transition-colors rounded-sm"
                aria-label="Next day">
                ►
              </Link>
            ) : (
              <span className="w-8" />
            )}
          </div>
          <Link href="/setup"
            className="op-btn op-btn-primary">
            + NEW SHIFT
          </Link>
        </div>

        {/* ── Roster table ─────────────────────────────────────────── */}
        <div className="op-panel">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[140px_1fr_100px_130px_90px] gap-x-4 px-3 py-1.5 border-b border-[#1e2028]">
            {['POST', 'PERSONNEL', 'UNIT(S)', 'SHIFT', 'CHORES'].map(h => (
              <span key={h} className="op-label">{h}</span>
            ))}
          </div>

          {/* Rows */}
          {stationOrder.map(stationName => (
            <div key={stationName}>
              {/* Station separator */}
              <div className="px-3 py-1 border-b border-[#1e2028] bg-[#0a0b0d]">
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-zinc-600">{stationName}</span>
              </div>

              {postsByStation[stationName].map(post => {
                const log = logByPost[post.id]

                if (log) {
                  const done = log.chores.filter(c => c.status === 'completed').length
                  const total = log.chores.length
                  const allDone = total > 0 && done === total
                  const secondUnit = log.bays.find(b => b.unit && b.unit_id !== log.primary_unit_id)?.unit

                  return (
                    <Link key={post.id} href={`/log/${log.id}`} className="block">
                      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_100px_130px_90px] gap-x-4 px-3 py-2 op-row hover:bg-[#0f1015] transition-colors items-center">
                        {/* Post */}
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-zinc-100 font-semibold">{post.name}</span>
                          {log.supervisor_confirmed_at && (
                            <span className="font-mono text-[9px] text-cyan-500 border border-cyan-800/50 px-1">CNF</span>
                          )}
                        </div>
                        {/* Personnel */}
                        <div className="font-mono text-xs text-zinc-300 truncate">
                          {log.primary_employee.name}
                          {log.partner_employee && <span className="text-zinc-500"> / {log.partner_employee.name}</span>}
                        </div>
                        {/* Unit(s) */}
                        <div className="font-mono text-xs text-zinc-300">
                          {formatUnit(log.primary_unit, false)}
                          {secondUnit && <span className="text-zinc-600"> ({formatUnit(secondUnit, false)})</span>}
                        </div>
                        {/* Shift times */}
                        <div className="font-mono text-xs text-zinc-400">
                          {fmtTime(log.actual_start)}–{fmtTime(log.actual_end)}
                        </div>
                        {/* Chore progress */}
                        <div className={`font-mono text-xs ${allDone ? 'text-cyan-400' : 'text-zinc-500'}`}>
                          {total === 0 ? '—' : `${done}/${total}`}
                          {allDone && <span className="ml-1">●</span>}
                        </div>
                      </div>
                    </Link>
                  )
                }

                // Unbuilt shift
                return (
                  <div key={post.id} className="grid grid-cols-1 sm:grid-cols-[140px_1fr_100px_130px_90px] gap-x-4 px-3 py-2 op-row items-center opacity-35">
                    <span className="font-mono text-xs text-zinc-500">{post.name}</span>
                    <span className="font-mono text-[10px] text-zinc-700 col-span-3">
                      {post.default_unit ? formatUnit(post.default_unit, false) : '—'}
                    </span>
                    <span className="font-mono text-[9px] tracking-wide uppercase text-zinc-700">NO SHIFT</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
