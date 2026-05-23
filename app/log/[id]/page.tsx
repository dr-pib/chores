import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import ChoreItem from '@/components/ChoreItem'
import { formatUnit } from '@/lib/units'
import { sortChores, getStationChoreForPost } from '@/lib/chore-rotation'
import DeleteShiftButton from '@/components/DeleteShiftButton'

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function formatShortDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
}
function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const statusColors: Record<string, string> = {
  unit_present: 'text-green-400',
  empty_bay: 'text-zinc-500',
  unit_at_shop: 'text-yellow-400',
}
const statusLabels: Record<string, string> = {
  unit_present: 'Present',
  empty_bay: 'Empty bay',
  unit_at_shop: 'At shop',
}

const LOG_INCLUDE = {
  crew_post: { include: { station: true } },
  station: true,
  primary_employee: true,
  partner_employee: true,
  primary_unit: true,
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
          && c.chore_template.lifecycle_type === 'daily_reset'
      )
      if (!hasDay2) {
        const templates = await prisma.choreTemplate.findMany()
        const truckCheck = templates.find(t => t.name === 'Truck Check')!
        const day2TruckDue = new Date(day2Date.getTime() + 3600 * 1000) // 01:00 AM

        const day2Chores = [
          ...log.bays
            .filter(b => b.unit_status === 'unit_present' && b.unit_id)
            .map(b => ({
              operations_log_id: log!.id,
              chore_template_id: truckCheck.id,
              unit_id: b.unit_id!,
              bay_label: b.bay_label,
              status: 'pending',
              due_at: day2TruckDue,
              chore_date: day2Date,
            })),
          ...((() => {
            const name = getStationChoreForPost(log!.crew_post.name, day2Date.getUTCMonth() + 1)
            const tmpl = name ? templates.find(t => t.name === name) : null
            return tmpl ? [{ operations_log_id: log!.id, chore_template_id: tmpl.id, status: 'pending', due_at: log!.actual_end, chore_date: day2Date }] : []
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
      chore_template: { lifecycle_type: 'persistent_until_complete' },
      OR: [
        ...(currentUnitIds.length > 0
          ? [{ unit_id: { in: currentUnitIds }, operations_log: { service_date: { lt: log.service_date } } }]
          : []),
        { unit_id: null, operations_log: { service_date: { lt: log.service_date }, crew_post_id: log.crew_post_id } },
      ],
    },
    include: {
      chore_template: true,
      unit: true,
      completed_by: true,
      operations_log: {
        include: {
          crew_post: true,
          primary_employee: { select: { name: true, licensure_level: true } },
          partner_employee: { select: { name: true, licensure_level: true } },
        },
      },
    },
    orderBy: [{ due_at: 'asc' }, { created_at: 'asc' }],
  })

  const sorted = sortChores(log.chores)
  const allDailyChores = sorted.filter(c => c.chore_template.lifecycle_type === 'daily_reset')
  const persistentChores = sorted.filter(c => c.chore_template.lifecycle_type === 'persistent_until_complete')

  // Split daily chores into Day 1 / Day 2 by chore_date
  const day2Date = new Date(log.service_date.getTime() + 24 * 3600 * 1000)
  const day1Chores = allDailyChores.filter(c => !c.chore_date || c.chore_date.getTime() < day2Date.getTime())
  const day2Chores = allDailyChores.filter(c => c.chore_date && c.chore_date.getTime() >= day2Date.getTime())

  const sortedPreviousPersistentChores = sortChores(previousPersistentChores)
  const isMyLog = log.primary_employee_id === session.userId
  const myChoresForProgress = isMyLog
    ? [...allDailyChores, ...persistentChores, ...sortedPreviousPersistentChores]
    : []
  const myChoresDone = myChoresForProgress.filter(c => c.status === 'completed').length

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <Link href="/log" className="text-zinc-500 hover:text-zinc-300 text-sm">← Operations Log</Link>
          {(isMyLog || ['Dom', 'Admin', 'Supervisor'].includes(session.role)) && (
            <DeleteShiftButton logId={log.id} />
          )}
        </div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">{isMyLog ? 'My Chores' : log.crew_post.name}</h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              {isMyLog && <span>{log.crew_post.name} · </span>}
              {log.station.name} · {formatDate(log.service_date)}
            </p>
          </div>
          {log.supervisor_confirmed_at ? (
            <span className="px-2.5 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">Confirmed</span>
          ) : (
            <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full font-medium">Submitted</span>
          )}
        </div>

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

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="text-zinc-500 text-xs mb-1">Primary</div>
            <div className="text-zinc-100 text-sm font-medium">{log.primary_employee.name}</div>
          </div>
          {log.partner_employee && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="text-zinc-500 text-xs mb-1">Partner</div>
              <div className="text-zinc-100 text-sm font-medium">{log.partner_employee.name}</div>
            </div>
          )}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="text-zinc-500 text-xs mb-1">Unit</div>
            <div className="text-zinc-100 text-sm font-medium">{formatUnit(log.primary_unit, false)}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="text-zinc-500 text-xs mb-1">Hours</div>
            <div className="text-zinc-100 text-sm font-medium">{formatTime(log.actual_start)} – {formatTime(log.actual_end)}</div>
          </div>
        </div>

        {/* Bays */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Bays</h2>
          <div className="space-y-2">
            {log.bays.map(bay => (
              <div key={bay.bay_label} className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{bay.bay_label}</span>
                <span className={statusColors[bay.unit_status]}>
                  {bay.unit ? formatUnit(bay.unit) : '—'}
                  {' · '}{statusLabels[bay.unit_status]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chores */}
        <div className="space-y-5">
          {day1Chores.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Daily Chores — {formatShortDate(log.service_date)}
              </h2>
              <div className="space-y-2">
                {day1Chores.map(chore => (
                  <ChoreItem key={chore.id} chore={chore} userRole={session.role} />
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
                  <ChoreItem key={chore.id} chore={chore} userRole={session.role} />
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
                      <ChoreItem chore={chore} userRole={session.role} />
                      <div className="ml-8 text-xs text-zinc-500">
                        From {chore.operations_log.crew_post.name} · {formatDate(chore.operations_log.service_date)}
                        {crew.length > 0 && <span className="text-zinc-600"> · {crew.map(e => e.name).join(' & ')}</span>}
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
                Expires &amp; Persistent
              </h2>
              <div className="space-y-2">
                {persistentChores.map(chore => (
                  <ChoreItem key={chore.id} chore={chore} userRole={session.role} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
