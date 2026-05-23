import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import ChoreItem from '@/components/ChoreItem'
import { formatUnit } from '@/lib/units'
import { sortChores } from '@/lib/chore-rotation'
import DeleteShiftButton from '@/components/DeleteShiftButton'

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
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

export default async function LogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const { id } = await params
  const log = await prisma.operationsLog.findUnique({
    where: { id: Number(id) },
    include: {
      crew_post: { include: { station: true } },
      station: true,
      primary_employee: true,
      partner_employee: true,
      primary_unit: true,
      supervisor_confirmed_by: true,
      bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
      chores: {
        include: { chore_template: true, unit: true, completed_by: true },
      },
    },
  })

  if (!log) notFound()

  const currentUnitIds = log.bays
    .filter((bay) => bay.unit_status === 'unit_present' && bay.unit_id !== null)
    .map((bay) => bay.unit_id!)

  // Find overdue persistent chores from earlier shifts at this crew post.
  // Two cases: chores tied to a specific unit (match by unit_id) and chores
  // with no unit (Monthly/NARC/Quarterly Expires — match by same crew post).
  const previousPersistentChores = await prisma.chore.findMany({
    where: {
      status: 'pending',
      chore_template: { lifecycle_type: 'persistent_until_complete' },
      OR: [
        ...(currentUnitIds.length > 0
          ? [{ unit_id: { in: currentUnitIds }, operations_log: { service_date: { lt: log.service_date } } }]
          : []),
        {
          unit_id: null,
          operations_log: {
            service_date: { lt: log.service_date },
            crew_post_id: log.crew_post_id,
          },
        },
      ],
    },
    include: {
      chore_template: true,
      unit: true,
      completed_by: true,
      operations_log: { include: { crew_post: true } },
    },
    orderBy: [
      { due_at: 'asc' },
      { created_at: 'asc' },
    ],
  })

  const sorted = sortChores(log.chores)
  const dailyChores = sorted.filter(c => c.chore_template.lifecycle_type === 'daily_reset')
  const persistentChores = sorted.filter(c => c.chore_template.lifecycle_type === 'persistent_until_complete')
  const sortedPreviousPersistentChores = sortChores(previousPersistentChores)
  const isMyLog = log.primary_employee_id === session.userId
  const myChoresForProgress = isMyLog
    ? [...dailyChores, ...persistentChores, ...sortedPreviousPersistentChores]
    : []
  const myChoresDone = myChoresForProgress.filter((chore) => chore.status === 'completed').length

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
          {dailyChores.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Daily Chores</h2>
              <div className="space-y-2">
                {dailyChores.map(chore => (
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
                {sortedPreviousPersistentChores.map(chore => (
                  <div key={chore.id}>
                    <ChoreItem chore={chore} userRole={session.role} />
                    <div className="ml-8 text-xs text-zinc-500">
                      From {chore.operations_log.crew_post.name} · {formatDate(chore.operations_log.service_date)}
                    </div>
                  </div>
                ))}
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
