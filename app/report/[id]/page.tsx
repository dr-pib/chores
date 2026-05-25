import { isSupervisorRole } from '@/lib/roles'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import { lastFirstName } from '@/lib/employees'
import { computePerformanceStats, perShiftStats, trendArrow, formatRate } from '@/lib/performance'


function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function rateColor(rate: number | null) {
  if (rate === null) return 'text-zinc-500'
  if (rate >= 0.9) return 'text-green-400'
  if (rate >= 0.7) return 'text-yellow-400'
  return 'text-red-400'
}

export default async function EmployeeReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')
  if (!isSupervisorRole(session.role)) redirect('/setup')

  const { id } = await params
  const employeeId = Number(id)
  if (isNaN(employeeId)) notFound()

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, licensure_level: true, role: true, status: true },
  })
  if (!employee) notFound()

  const now = new Date()
  const cutoff = new Date(now.getTime() - 60 * 24 * 3600 * 1000)

  const logs = await prisma.operationsLog.findMany({
    where: {
      service_date: { gte: cutoff },
      OR: [
        { primary_employee_id: employeeId },
        { partner_employee_id: employeeId },
      ],
    },
    select: {
      id: true,
      service_date: true,
      actual_end: true,
      shift_profile: { select: { name: true } },
      chores: {
        select: {
          status: true,
          chore_template: { select: { name: true } },
        },
      },
    },
    orderBy: { service_date: 'desc' },
  })

  const isNRP = employee.licensure_level === 'NRP'
  const stats = computePerformanceStats(isNRP, logs, now)
  const arrow = trendArrow(stats.d60.rate, stats.d30.rate)

  const completedLogs = logs.filter(l => new Date(l.actual_end).getTime() < now.getTime())

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/report" className="text-zinc-500 hover:text-zinc-300 text-sm mb-4 block">
            ← Performance Report
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-zinc-100">{lastFirstName(employee.name)}</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{employee.licensure_level} · {employee.role} · {employee.status}</p>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        {(stats.d60.total > 0 || stats.d30.total > 0 || stats.last_shift !== null) ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Last 60 days</p>
                <p className={`text-2xl font-semibold ${rateColor(stats.d60.rate)}`}>{formatRate(stats.d60.rate)}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{stats.d60.shifts} shift{stats.d60.shifts !== 1 ? 's' : ''}, {stats.d60.done}/{stats.d60.total} chores</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Last 30 days</p>
                <p className={`text-2xl font-semibold ${rateColor(stats.d30.rate)}`}>{formatRate(stats.d30.rate)}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{stats.d30.shifts} shift{stats.d30.shifts !== 1 ? 's' : ''}, {stats.d30.done}/{stats.d30.total} chores</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Last shift</p>
                <div className="flex items-baseline gap-1.5">
                  <p className={`text-2xl font-semibold ${rateColor(stats.last_shift?.rate ?? null)}`}>{formatRate(stats.last_shift?.rate ?? null)}</p>
                  <span className={`text-base font-medium ${arrow === '↑' ? 'text-green-400' : arrow === '↓' ? 'text-red-400' : 'text-zinc-600'}`}>{arrow}</span>
                </div>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {stats.last_shift ? `${stats.last_shift.done}/${stats.last_shift.total} chores` : ''}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6 text-zinc-500 text-sm">
            No completed shift history in the last 60 days.
          </div>
        )}

        {/* Shift-by-shift breakdown */}
        {completedLogs.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Shift History</h2>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
              {completedLogs.map(log => {
                const s = perShiftStats(log, isNRP)
                const pct = rateColor(s.rate)
                return (
                  <Link
                    key={log.id}
                    href={`/log/${log.id}`}
                    className="flex items-center gap-4 px-4 py-2.5 hover:bg-zinc-800/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-100">{formatDate(log.service_date)}</span>
                      <span className="ml-3 text-xs text-zinc-500">{log.shift_profile.name}</span>
                    </div>
                    <span className="text-xs text-zinc-500 shrink-0">{s.done}/{s.total}</span>
                    <span className={`text-sm font-semibold shrink-0 w-10 text-right ${pct}`}>{formatRate(s.rate)}</span>
                    <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
