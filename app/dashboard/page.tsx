import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import { isSupervisorRole } from '@/lib/roles'
import { todayChicago } from '@/lib/dates'
import { ensureDailySW } from '@/lib/ensure-daily-sw'
import { formatEmployeeTitle } from '@/lib/employees'
import { choreStats } from '@/lib/performance'

const ELIGIBLE_UNIT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 20]
const SHIFT_ORDER = ['Supervisor', '24-7', '24-8', 'Swing']

function shortDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })
}

function assetLabel(sw: { unit?: { unit_number: number } | null; narc_box?: { letter: string } | null }) {
  if (sw.unit) return `Unit ${sw.unit.unit_number}`
  if (sw.narc_box) return `Box ${sw.narc_box.letter}`
  return '—'
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')
  if (!isSupervisorRole(session.role)) redirect('/my-chores')

  const now = new Date()
  const serviceDate = todayChicago()

  // Lazy-generate Truck Check SW for today on first load after 5am
  await ensureDailySW(serviceDate)

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000)

  const [activeShifts, allUnits, todaySW, unresolvedCriticals, coverageGaps] = await Promise.all([
    prisma.operationsLog.findMany({
      where: { actual_start: { lte: now }, actual_end: { gt: now } },
      include: {
        shift_profile: { include: { station: true } },
        primary_employee: true,
        partner_employee: true,
        primary_unit: true,
        bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
        chores: { include: { chore_template: true } },
      },
    }),
    prisma.unit.findMany({
      where: { unit_number: { in: ELIGIBLE_UNIT_NUMBERS } },
      orderBy: { unit_number: 'asc' },
    }),
    prisma.scheduledWork.findMany({
      where: { work_date: serviceDate, asset_type: 'unit' },
      select: { unit_id: true, location_note: true, status: true },
    }),
    prisma.scheduledWork.findMany({
      where: {
        status: 'pending',
        work_date: { lt: serviceDate },
        chore_template: { is_critical: true, lifecycle: 'persistent' },
      },
      include: { chore_template: true, unit: true, narc_box: true },
      orderBy: { work_date: 'asc' },
      take: 50,
    }),
    prisma.scheduledWork.findMany({
      where: {
        status: 'missed',
        work_date: { gte: thirtyDaysAgo },
        chore_template: { lifecycle: 'forfeitable', is_critical: true },
      },
      include: {
        chore_template: true,
        unit: true,
        claimed_by_log: { include: { shift_profile: true } },
      },
      orderBy: { work_date: 'desc' },
      take: 50,
    }),
  ])

  // Collect unit IDs claimed by active shifts
  const claimedUnitIds = new Set<number>()
  for (const shift of activeShifts) {
    if (shift.primary_unit_id) claimedUnitIds.add(shift.primary_unit_id)
    for (const bay of shift.bays) {
      if (bay.unit_id && bay.unit_status === 'unit_present') claimedUnitIds.add(bay.unit_id)
    }
  }

  // SW map by unit_id for location notes
  const swByUnit = new Map(todaySW.filter(s => s.unit_id).map(s => [s.unit_id!, s]))

  const unassignedUnits = allUnits.filter(u => !claimedUnitIds.has(u.id))

  const sortedShifts = [...activeShifts].sort((a, b) => {
    const ra = SHIFT_ORDER.indexOf(a.shift_profile.name)
    const rb = SHIFT_ORDER.indexOf(b.shift_profile.name)
    return (ra === -1 ? 100 : ra) - (rb === -1 ? 100 : rb)
  })

  const today = serviceDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-screen-2xl mx-auto px-4 py-6">

        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h1 className="text-xl font-bold text-zinc-100">Operations Chief Dashboard</h1>
          <span className="text-zinc-500 text-sm">{today}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">

          {/* Column 1: Unresolved Criticals from Previous Days */}
          <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                Unresolved Criticals
              </h2>
              {unresolvedCriticals.length > 0 && (
                <span className="bg-red-500 text-white text-[11px] font-semibold rounded-full px-1.5 py-0.5 leading-none">
                  {unresolvedCriticals.length}
                </span>
              )}
            </div>
            <p className="text-zinc-600 text-xs mb-3">Overdue persistent expires from prior days</p>
            {unresolvedCriticals.length === 0 ? (
              <p className="text-zinc-500 text-sm">All clear.</p>
            ) : (
              <div className="space-y-2.5">
                {unresolvedCriticals.map(sw => (
                  <div key={sw.id} className="text-sm border-l-2 border-red-700/50 pl-2">
                    <div className="text-zinc-100 font-medium">{sw.chore_template.name}</div>
                    <div className="text-zinc-400 text-xs">{assetLabel(sw)} · {shortDate(sw.work_date)}</div>
                  </div>
                ))}
              </div>
            )}
            {unresolvedCriticals.length > 0 && (
              <Link href="/chores" className="mt-3 block text-xs text-red-400 hover:text-red-300 transition-colors">
                Resolve in Everyone&apos;s Chores →
              </Link>
            )}
          </div>

          {/* Column 2: Unassigned Trucks Today */}
          <div className="bg-amber-950/30 border border-amber-700/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Unassigned Trucks Today
              </h2>
              {unassignedUnits.length > 0 && (
                <span className="bg-amber-400 text-zinc-950 text-[11px] font-semibold rounded-full px-1.5 py-0.5 leading-none">
                  {unassignedUnits.length}
                </span>
              )}
            </div>
            <p className="text-zinc-600 text-xs mb-3">Eligible units not added to any active shift</p>
            {unassignedUnits.length === 0 ? (
              <p className="text-zinc-500 text-sm">All trucks assigned.</p>
            ) : (
              <div className="space-y-1.5">
                {unassignedUnits.map(unit => {
                  const sw = swByUnit.get(unit.id)
                  const note = sw?.location_note
                  return (
                    <div key={unit.id} className="flex items-baseline gap-2 text-sm">
                      <span className="text-zinc-100 font-medium shrink-0">Unit {unit.unit_number}</span>
                      {note
                        ? <span className="text-zinc-400 text-xs truncate">{note}</span>
                        : <span className="text-zinc-600 text-xs">—</span>
                      }
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Column 3: Coverage Gaps */}
          <div className="bg-zinc-900 border border-yellow-700/25 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xs font-semibold text-yellow-500/80 uppercase tracking-wider">
                Coverage Gaps
              </h2>
              {coverageGaps.length > 0 && (
                <span className="bg-yellow-700/50 text-yellow-200 text-[11px] font-semibold rounded-full px-1.5 py-0.5 leading-none">
                  {coverageGaps.length}
                </span>
              )}
            </div>
            <p className="text-zinc-600 text-xs mb-3">Missed forfeitable work — last 30 days</p>
            {coverageGaps.length === 0 ? (
              <p className="text-zinc-500 text-sm">No missed forfeitable work.</p>
            ) : (
              <div className="space-y-2.5">
                {coverageGaps.map(sw => (
                  <div key={sw.id} className="text-sm border-l-2 border-zinc-700 pl-2">
                    <div className="text-zinc-300 font-medium">{sw.chore_template.name}</div>
                    <div className="text-zinc-500 text-xs">
                      {assetLabel(sw)} · {shortDate(sw.work_date)}
                      {sw.claimed_by_log && <span className="ml-1">· {sw.claimed_by_log.shift_profile.name}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {coverageGaps.length > 0 && (
              <Link href="/chores" className="mt-3 block text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Document in Everyone&apos;s Chores →
              </Link>
            )}
          </div>

          {/* Column 4: Shift Status */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Shift Status
            </h2>
            {sortedShifts.length === 0 ? (
              <p className="text-zinc-500 text-sm">No active shifts.</p>
            ) : (
              <div className="space-y-3">
                {sortedShifts.map(shift => {
                  const isNRP = shift.primary_employee?.licensure_level === 'NRP'
                  const stats = choreStats(shift.chores, isNRP)
                  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : null
                  const allDone = stats.total > 0 && stats.done === stats.total
                  const crew = [
                    shift.primary_employee ? formatEmployeeTitle(shift.primary_employee) : null,
                    shift.partner_employee ? formatEmployeeTitle(shift.partner_employee) : null,
                  ].filter(Boolean).join(' & ')
                  return (
                    <Link
                      key={shift.id}
                      href={`/log/${shift.id}`}
                      className="block hover:bg-zinc-800/60 -mx-2 px-2 py-2 rounded-lg transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-zinc-100 text-sm font-semibold leading-tight">{shift.shift_profile.name}</div>
                          <div className="text-zinc-500 text-xs leading-snug mt-0.5 truncate">{crew || '—'}</div>
                          {shift.primary_unit && (
                            <div className="text-zinc-600 text-xs">Unit {shift.primary_unit.unit_number}</div>
                          )}
                        </div>
                        <div className={`text-sm font-bold shrink-0 tabular-nums ${allDone ? 'text-green-400' : pct !== null && pct > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
                          {pct !== null ? `${pct}%` : '—'}
                        </div>
                      </div>
                      {stats.total > 0 && (
                        <div className="mt-1.5 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${pct ?? 0}%` }}
                          />
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
