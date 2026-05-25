import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import { formatUnit } from '@/lib/units'
import { formatEmployeeTitle } from '@/lib/employees'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']
const SHIFT_ORDER = ['Supervisor', '24-7', '24-8', 'Swing']

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Chicago',
  })
}

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

function shiftRank(log: {
  shift_profile: { name: string; station: { name: string } }
}) {
  const profileName = log.shift_profile.name
  const directRank = SHIFT_ORDER.indexOf(profileName)
  if (directRank >= 0) return directRank

  const stationName = log.shift_profile.station.name
  if (stationName === 'Diamond City' || profileName.includes('DC')) return 4
  if (stationName === 'Newton County' || profileName.includes('NC')) return 5

  return 100
}

export default async function HistoryPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const isSupervisor = SUPERVISOR_ROLES.includes(session.role)
  const now = new Date()

  const logs = await prisma.operationsLog.findMany({
    where: {
      actual_end: { lt: now },
      ...(isSupervisor
        ? {}
        : {
            OR: [
              { primary_employee_id: session.userId },
              { partner_employee_id: session.userId },
            ],
          }),
    },
    include: {
      shift_profile: { include: { station: true } },
      primary_employee: true,
      partner_employee: true,
      primary_unit: true,
      bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
      chores: true,
    },
    orderBy: [{ service_date: 'desc' }, { created_at: 'asc' }],
    take: 300,
  })

  const sortedLogs = [...logs].sort((a, b) => {
    const dateDiff = b.service_date.getTime() - a.service_date.getTime()
    if (dateDiff !== 0) return dateDiff

    const rankDiff = shiftRank(a) - shiftRank(b)
    if (rankDiff !== 0) return rankDiff

    return a.shift_profile.name.localeCompare(b.shift_profile.name)
  })

  const grouped = new Map<string, typeof sortedLogs>()
  for (const log of sortedLogs) {
    const key = dateKey(log.service_date)
    grouped.set(key, [...(grouped.get(key) ?? []), log])
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-zinc-100">History</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {isSupervisor ? 'Previous shifts across the service.' : 'Previous shifts you were part of.'}
          </p>
        </div>

        {sortedLogs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-500">No previous shifts yet.</p>
          </div>
        ) : (
          <div className="space-y-7">
            {[...grouped.entries()].map(([key, dayLogs]) => (
              <section key={key}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  {formatDate(dayLogs[0].service_date)}
                </h2>
                <div className="space-y-2">
                  {dayLogs.map(log => {
                    const done = log.chores.filter(chore => chore.status === 'completed').length
                    const total = log.chores.length
                    const allDone = total > 0 && done === total
                    const secondUnit = log.bays.find(bay => bay.unit && bay.unit_id !== log.primary_unit_id)?.unit

                    return (
                      <Link key={log.id} href={`/log/${log.id}`} className="block">
                        <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-zinc-100">{log.shift_profile.name}</span>
                                <span className="text-xs text-zinc-600">{log.shift_profile.station.name}</span>
                              </div>
                              <div className="text-zinc-400 text-sm mt-0.5">
                                {formatEmployeeTitle(log.primary_employee)}
                                {log.partner_employee && <span> &amp; {formatEmployeeTitle(log.partner_employee)}</span>}
                                <span className="text-zinc-600 mx-1.5">·</span>
                                {formatTime(log.actual_start)}-{formatTime(log.actual_end)}
                                <span className="text-zinc-600 mx-1.5">·</span>
                                {formatUnit(log.primary_unit, false)}
                                {secondUnit && <span className="text-zinc-600"> ({formatUnit(secondUnit, false)})</span>}
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
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
