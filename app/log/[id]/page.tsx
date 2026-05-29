import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import ChoreItem from '@/components/ChoreItem'
import { formatUnit } from '@/lib/units'
import { sortChores, getStationChoreForPost } from '@/lib/chore-rotation'
import { isPastShift, todayChicago } from '@/lib/dates'
import { computePerformanceStats, trendArrow, formatRate } from '@/lib/performance'
import DeleteShiftButton from '@/components/DeleteShiftButton'
import ConfirmShiftButton from '@/components/ConfirmShiftButton'
import LiveClock from '@/components/LiveClock'
import { formatEmployeeTitle } from '@/lib/employees'
import SegmentedNav from '@/components/SegmentedNav'
import { isSupervisorRole } from '@/lib/roles'
import { isPersistent, isForfeitable } from '@/lib/lifecycle'

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
function formatShortDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
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


const LOG_INCLUDE = {
  shift_profile: { include: { station: true } },
  station: true,
  primary_employee: true,
  partner_employee: true,
  primary_unit: true,
  narc_box: true,
  supervisor_confirmed_by: true,
  bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } as const },
  chores: {
    include: {
      chore_template: true,
      unit: true,
      completed_by: true,
      tasks: {
        include: { chore_template_task: true, completed_by: true },
        orderBy: { chore_template_task: { sort_order: 'asc' } } as const,
      },
    },
  },
} as const

export default async function LogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const { id } = await params
  let log = await prisma.operationsLog.findUnique({ where: { id: Number(id) }, include: LOG_INCLUDE })
  if (!log) notFound()

  // Auto-generate Day 2 daily chores once midnight of service_date+1 has passed
  const shiftMs = log.actual_end.getTime() - log.actual_start.getTime()
  if (shiftMs >= 48 * 3600 * 1000) {
    const day2Date = new Date(log.service_date.getTime() + 24 * 3600 * 1000)
    if (new Date() >= day2Date) {
      const hasDay2 = log.chores.some(
        c => c.chore_date && c.chore_date.getTime() === day2Date.getTime()
          && isForfeitable(c.chore_template)
      )
      if (!hasDay2) {
        const templates = await prisma.choreTemplate.findMany()
        const truckCheck = templates.find(t => t.name === 'Truck Check')!

        // Compute due_at from template's due_offset_hours (hours after shift start + 24h for day 2).
        // Defaults to 1h when the template has no offset set.
        function day2DueAt(tmpl: { due_offset_hours: number | null }): Date {
          const offsetHours = tmpl.due_offset_hours ?? 1
          return new Date(log!.actual_start.getTime() + (24 + offsetHours) * 3600 * 1000)
        }

        const day2Chores = [
          ...log.bays
            .filter(b => b.unit_status === 'unit_present' && b.unit_id)
            .map(b => ({
              operations_log_id: log!.id,
              chore_template_id: truckCheck.id,
              unit_id: b.unit_id!,
              bay_label: b.bay_label,
              status: 'pending',
              due_at: day2DueAt(truckCheck),
              chore_date: day2Date,
            })),
          ...((() => {
            const name = getStationChoreForPost(log!.shift_profile.name, day2Date.getUTCMonth() + 1)
            const tmpl = name ? templates.find(t => t.name === name) : null
            return tmpl ? [{ operations_log_id: log!.id, chore_template_id: tmpl.id, status: 'pending', due_at: day2DueAt(tmpl), chore_date: day2Date }] : []
          })()),
        ]
        if (day2Chores.length > 0) {
          await prisma.chore.createMany({ data: day2Chores })
          log = (await prisma.operationsLog.findUnique({ where: { id: Number(id) }, include: LOG_INCLUDE }))!
        }
      }
    }
  }

  const currentUnitIds = log.bays
    .filter(bay => bay.unit_status === 'unit_present' && bay.unit_id !== null)
    .map(bay => bay.unit_id!)

  const previousPersistentChores = await prisma.chore.findMany({
    where: {
      status: 'pending',
      chore_template: { lifecycle: 'persistent' },
      operations_log: { service_date: { lt: log.service_date } },
      OR: [
        ...(currentUnitIds.length > 0
          ? [
              { unit_id: { in: currentUnitIds } },
              { unit_id: null, operations_log: { bays: { some: { unit_id: { in: currentUnitIds } } } } },
            ]
          : []),
        { unit_id: null, operations_log: { shift_profile_id: log.shift_profile_id } },
      ],
    },
    include: {
      chore_template: true,
      unit: true,
      completed_by: true,
      operations_log: {
        include: {
          shift_profile: true,
          primary_employee: { select: { name: true, licensure_level: true } },
          partner_employee: { select: { name: true, licensure_level: true } },
          narc_box: true,
        },
      },
    },
    orderBy: [{ due_at: 'asc' }, { created_at: 'asc' }],
  })

  const sorted = sortChores(log.chores)
  const allDailyChores = sorted.filter(c => isForfeitable(c.chore_template))
  const persistentChores = sorted.filter(c => isPersistent(c.chore_template))

  // Split daily chores into Day 1 / Day 2 by chore_date
  const day2Date = new Date(log.service_date.getTime() + 24 * 3600 * 1000)
  const day1Chores = allDailyChores.filter(c => !c.chore_date || c.chore_date.getTime() < day2Date.getTime())
  const day2Chores = allDailyChores.filter(c => c.chore_date && c.chore_date.getTime() >= day2Date.getTime())

  const sortedPreviousPersistentChores = sortChores(previousPersistentChores)
  const isMyLog = log.primary_employee_id === session.userId || log.partner_employee_id === session.userId
  const pastShift = isPastShift(log.service_date, log.actual_end)
  const historicalShift = pastShift

  // Detect pending truck checks already completed by another crew for the same unit on the same day
  const pendingTruckChecks = allDailyChores.filter(
    c => c.chore_template.name === 'Truck Check' && c.status === 'pending' && c.unit_id && c.chore_date
  )
  const completedElsewhereIds = new Set<number>()
  if (pendingTruckChecks.length > 0) {
    const uniqueUnitIds = [...new Set(pendingTruckChecks.map(c => c.unit_id!))]
    const uniqueDates = [...new Set(pendingTruckChecks.map(c => c.chore_date!.getTime()))].map(t => new Date(t))
    const otherCompleted = await prisma.chore.findMany({
      where: {
        operations_log_id: { not: log.id },
        chore_template: { name: 'Truck Check' },
        unit_id: { in: uniqueUnitIds },
        status: 'completed',
        chore_date: { in: uniqueDates },
      },
      select: { unit_id: true, chore_date: true },
    })
    for (const tc of pendingTruckChecks) {
      const match = otherCompleted.find(
        o => o.unit_id === tc.unit_id && o.chore_date?.getTime() === tc.chore_date!.getTime()
      )
      if (match) completedElsewhereIds.add(tc.id)
    }
  }

  // Birthday check + performance stats — only relevant on "My Chores" view
  let isBirthday = false
  let perfStats = null
  let nowDone = 0
  let nowTotal = 0
  let nowRate: number | null = null
  if (isMyLog) {
    const [me, perfLogs] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: session.userId },
        select: { birthday_month: true, birthday_day: true, licensure_level: true },
      }),
      prisma.operationsLog.findMany({
        where: {
          service_date: { gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) },
          OR: [
            { primary_employee_id: session.userId },
            { partner_employee_id: session.userId },
          ],
        },
        select: {
          id: true,
          service_date: true,
          actual_end: true,
          chores: {
            select: {
              status: true,
              chore_template: { select: { name: true } },
            },
          },
        },
      }),
    ])
    if (me?.birthday_month != null && me?.birthday_day != null) {
      const today = todayChicago()
      isBirthday = me.birthday_month === today.getUTCMonth() + 1 && me.birthday_day === today.getUTCDate()
    }
    if (me) {
      const isNRP = me.licensure_level === 'NRP'
      perfStats = computePerformanceStats(isNRP, perfLogs)
      if (!pastShift) {
        const eligible = [...allDailyChores, ...persistentChores].filter(
          c => isNRP || c.chore_template.name !== 'NARC Expires'
        )
        nowDone = eligible.filter(c => c.status === 'completed' || completedElsewhereIds.has(c.id)).length
        nowTotal = eligible.length
        nowRate = nowTotal > 0 ? nowDone / nowTotal : null
      }
    }
  }
  const myChoresForProgress = isMyLog
    ? [...allDailyChores, ...persistentChores, ...sortedPreviousPersistentChores]
    : []
  const myChoresDone = myChoresForProgress.filter(c => c.status === 'completed' || completedElsewhereIds.has(c.id)).length

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className={`flex items-center mb-1 ${(historicalShift || !isMyLog) ? 'justify-between' : 'justify-end'}`}>
          {historicalShift ? (
            <Link href="/history" className="text-zinc-500 hover:text-zinc-300 text-sm">← Roster History</Link>
          ) : !isMyLog && (
            <Link href="/log" className="text-zinc-500 hover:text-zinc-300 text-sm">← Today&apos;s Roster</Link>
          )}
          <div className="flex items-center gap-2">
            {isSupervisorRole(session.role) && (
              <Link
                href={`/setup?logId=${log.id}`}
                className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
              >
                Edit shift
              </Link>
            )}
            {(isMyLog || isSupervisorRole(session.role)) && (
              <DeleteShiftButton logId={log.id} />
            )}
          </div>
        </div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">
              {historicalShift ? (
                <>Historical Shift Record <span className="font-normal text-zinc-400">— {formatDate(log.service_date)}</span></>
              ) : isMyLog ? (
                <>My Chores <span className="font-normal text-zinc-400">— {formatDate(log.service_date)} <LiveClock /></span></>
              ) : log.shift_profile.name}
            </h1>
            {(historicalShift || !isMyLog) && (
              <p className="text-zinc-400 text-sm mt-0.5">
                {log.shift_profile.name} · {log.station.name} · {formatDate(log.service_date)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {isMyLog && !historicalShift && (
              <SegmentedNav
                segments={[
                  { href: '/my-chores', label: 'My Chores', active: true },
                  { href: '/chores', label: "Everyone's Chores", active: false },
                ]}
              />
            )}
            {isSupervisorRole(session.role) ? (
              <ConfirmShiftButton logId={log.id} confirmed={!!log.supervisor_confirmed_at} />
            ) : log.supervisor_confirmed_at ? (
              <span className="px-2.5 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">Confirmed</span>
            ) : null}
          </div>
        </div>

        {historicalShift && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            This shift ended {formatShiftMil(log.actual_end)}. You are viewing the historical record.
          </div>
        )}

        {isBirthday && (
          <div className="mb-4 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm text-center">
            Happy Birthday, {session.name}!
          </div>
        )}

        {(nowDone > 0 || (perfStats && (perfStats.d60.total > 0 || perfStats.d30.total > 0 || perfStats.last_shift !== null))) && (
          <div className="mb-4 flex items-center gap-5 text-xs">
            {perfStats && perfStats.d60.total > 0 && (
              <span className="text-zinc-500">60d <span className="text-base text-zinc-200 font-medium">{formatRate(perfStats.d60.rate)}</span></span>
            )}
            {perfStats && perfStats.d30.total > 0 && (
              <span className="text-zinc-500">30d <span className="text-base text-zinc-200 font-medium">{formatRate(perfStats.d30.rate)}</span></span>
            )}
            {perfStats && perfStats.last_shift !== null && (
              <>
                <span className="text-zinc-500">Last <span className="text-base text-zinc-200 font-medium">{formatRate(perfStats.last_shift.rate)}</span></span>
                <span className={`text-base font-medium ${
                  trendArrow(perfStats.d60.rate, perfStats.d30.rate) === '↑' ? 'text-green-400' :
                  trendArrow(perfStats.d60.rate, perfStats.d30.rate) === '↓' ? 'text-red-400' :
                  'text-zinc-600'
                }`}>{trendArrow(perfStats.d60.rate, perfStats.d30.rate)}</span>
              </>
            )}
            {nowDone > 0 && (
              <span className="text-zinc-500">Now <span className="text-base text-zinc-200 font-medium">{formatRate(nowRate)}</span></span>
            )}
          </div>
        )}

        {isMyLog && myChoresForProgress.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
              <span>{myChoresDone}/{myChoresForProgress.length} chores complete</span>
              {sortedPreviousPersistentChores.length > 0 && (
                <span className="text-red-400">{sortedPreviousPersistentChores.length} previous unfinished</span>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800">
              <div
                className="h-1.5 rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.round((myChoresDone / myChoresForProgress.length) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Shift summary */}
        {(() => {
          const sb = log.bays.find(b => b.unit_id !== log.primary_unit_id)
          const secondaryDisplay = (() => {
            if (!sb) return null
            if (sb.unit_status === 'unit_present' && sb.unit)
              return <span className="font-normal text-zinc-500"> ({formatUnit(sb.unit, false)})</span>
            if (sb.unit_status === 'empty_bay')
              return <span className="font-normal text-zinc-500"> (Bay {sb.bay_label} Empty)</span>
            if (sb.unit_status === 'unit_at_shop')
              return <span className="font-normal text-zinc-500"> (Bay {sb.bay_label} At Shop)</span>
            if (isSupervisorRole(session.role))
              return <span className="text-amber-500/80"> (Bay {sb.bay_label} Missing Truck)</span>
            return null
          })()
          return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
              <div className="font-semibold text-zinc-100">
                {formatEmployeeTitle(log.primary_employee)}
                {log.partner_employee && (
                  <> | {formatEmployeeTitle(log.partner_employee)}</>
                )}
              </div>
              <div className="text-sm font-semibold text-zinc-100 mt-0.5">
                {log.shift_profile.name} {log.station.name}{' | '}
                {formatUnit(log.primary_unit, false)}
                {secondaryDisplay}
              </div>
              <div className="text-sm text-zinc-500 mt-0.5">
                {formatShiftMil(log.actual_start)} → {formatShiftMil(log.actual_end)}
              </div>
            </div>
          )
        })()}

        {/* Chores */}
        <div className="space-y-5">
          {day1Chores.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Daily Chores — {formatShortDate(log.service_date)}
              </h2>
              <div className="space-y-2">
                {day1Chores.map(chore => (
                  <ChoreItem key={chore.id} chore={chore} userRole={session.role} isPastShift={pastShift} completedElsewhere={completedElsewhereIds.has(chore.id)} narcBoxLetter={log.narc_box?.letter ?? null} />
                ))}
              </div>
            </div>
          )}

          {day2Chores.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Day 2 Chores — {formatShortDate(day2Date)}
              </h2>
              <div className="space-y-2">
                {day2Chores.map(chore => (
                  <ChoreItem key={chore.id} chore={chore} userRole={session.role} isPastShift={pastShift} completedElsewhere={completedElsewhereIds.has(chore.id)} narcBoxLetter={log.narc_box?.letter ?? null} />
                ))}
              </div>
            </div>
          )}

          {isMyLog && sortedPreviousPersistentChores.length > 0 && (
            <div className="bg-zinc-900 border border-red-500/60 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">
                Unfinished Chores From Previous Shifts
              </h2>
              <div className="space-y-2">
                {sortedPreviousPersistentChores.map(chore => {
                  const isNarc = chore.chore_template.name === 'NARC Expires'
                  const crew = [
                    chore.operations_log.primary_employee,
                    chore.operations_log.partner_employee,
                  ].filter((e): e is { name: string; licensure_level: string } =>
                    e !== null && (!isNarc || e.licensure_level === 'NRP')
                  )
                  return (
                    <div key={chore.id}>
                      <ChoreItem chore={chore} userRole={session.role} isPastShift={true} narcBoxLetter={chore.operations_log.narc_box?.letter ?? null} />
                      <div className="ml-8 text-xs text-zinc-500">
                        From {chore.operations_log.shift_profile.name} · {formatDate(chore.operations_log.service_date)}
                        {crew.length > 0 && <span className="text-zinc-600"> · {crew.map(formatEmployeeTitle).join(' & ')}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {persistentChores.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Expires &amp; Other Scheduled Chores
              </h2>
              <div className="space-y-2">
                {persistentChores.map(chore => (
                  <ChoreItem key={chore.id} chore={chore} userRole={session.role} isPastShift={pastShift} narcBoxLetter={log.narc_box?.letter ?? null} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
