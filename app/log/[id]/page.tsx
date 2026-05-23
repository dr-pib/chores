import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import ChoreItem from '@/components/ChoreItem'
import { formatUnit } from '@/lib/units'
import { sortChores, getStationChoreForPost } from '@/lib/chore-rotation'
import DeleteShiftButton from '@/components/DeleteShiftButton'
import ConfirmShiftButton from '@/components/ConfirmShiftButton'

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toUpperCase()
}
function fmtShortDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' }).toUpperCase()
}
function fmtTime(d: Date | string) {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const BAY_STATUS_COLOR: Record<string, string> = {
  unit_present: 'text-cyan-400',
  empty_bay: 'text-zinc-600',
  unit_at_shop: 'text-amber-400',
}
const BAY_STATUS_LABEL: Record<string, string> = {
  unit_present: 'PRESENT',
  empty_bay: 'EMPTY',
  unit_at_shop: 'AT SHOP',
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

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="op-section mb-2">
      <span className="op-section-label">{label}</span>
      <div className="op-section-rule" />
    </div>
  )
}

export default async function LogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const { id } = await params
  let log = await prisma.operationsLog.findUnique({ where: { id: Number(id) }, include: LOG_INCLUDE })
  if (!log) notFound()

  // Lazy Day 2 generation (fallback for older shifts)
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
        const day2TruckDue = new Date(day2Date.getTime() + 3600 * 1000)
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
    .filter(b => b.unit_status === 'unit_present' && b.unit_id !== null)
    .map(b => b.unit_id!)

  const previousPersistentChores = await prisma.chore.findMany({
    where: {
      status: 'pending',
      chore_template: { lifecycle_type: 'persistent_until_complete' },
      operations_log: { service_date: { lt: log.service_date } },
      OR: [
        ...(currentUnitIds.length > 0
          ? [
              { unit_id: { in: currentUnitIds } },
              { unit_id: null, operations_log: { bays: { some: { unit_id: { in: currentUnitIds } } } } },
            ]
          : []),
        { unit_id: null, operations_log: { crew_post_id: log.crew_post_id } },
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
  const day2Date = new Date(log.service_date.getTime() + 24 * 3600 * 1000)
  const day1Chores = allDailyChores.filter(c => !c.chore_date || c.chore_date.getTime() < day2Date.getTime())
  const day2Chores = allDailyChores.filter(c => c.chore_date && c.chore_date.getTime() >= day2Date.getTime())
  const sortedPreviousPersistentChores = sortChores(previousPersistentChores)

  const isMyLog = log.primary_employee_id === session.userId
  const canManage = isMyLog || ['Dom', 'Admin', 'Supervisor'].includes(session.role)
  const isSupervisor = ['Dom', 'Admin', 'Supervisor'].includes(session.role)

  const allChores = [...allDailyChores, ...persistentChores, ...sortedPreviousPersistentChores]
  const doneCount = allChores.filter(c => c.status === 'completed').length
  const totalCount = allChores.length
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const secondUnit = log.bays.find(b => b.unit && b.unit_id !== log.primary_unit_id)?.unit

  return (
    <div className="min-h-screen bg-[#09090b]">
      <NavBar userName={session.name} userRole={session.role} />

      <div className="max-w-[900px] mx-auto px-4 py-4 space-y-3">

        {/* ── Page header ───────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-0.5">
              <Link href="/log" className="font-mono text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-300 transition-colors">
                ← ROSTER
              </Link>
              <span className="text-zinc-700">│</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {log.crew_post.name} · {log.station.name}
              </span>
            </div>
            <h1 className="font-mono text-sm font-bold text-zinc-100 uppercase tracking-wide">
              {isMyLog ? 'MY CHORES' : log.crew_post.name}
            </h1>
            <div className="font-mono text-[10px] text-zinc-600 mt-0.5">{fmtDate(log.service_date)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isSupervisor && <ConfirmShiftButton logId={log.id} confirmed={!!log.supervisor_confirmed_at} />}
            {canManage && <DeleteShiftButton logId={log.id} />}
          </div>
        </div>

        {/* ── Progress bar ──────────────────────────────────────────── */}
        {totalCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] text-zinc-600">
                {doneCount}/{totalCount} COMPLETE
                {sortedPreviousPersistentChores.length > 0 && (
                  <span className="text-amber-600 ml-2">▲ {sortedPreviousPersistentChores.length} OVERDUE</span>
                )}
              </span>
              <span className="font-mono text-[10px] text-zinc-600">{pct}%</span>
            </div>
            <div className="h-px bg-zinc-800">
              <div className="h-px bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* ── Shift summary ─────────────────────────────────────────── */}
        <div className="op-panel">
          <div className="px-3 py-1 border-b border-[#1e2028] bg-[#0a0b0d]">
            <span className="op-section-label">SHIFT SUMMARY</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-[#1e2028]">
            {[
              { label: 'PRIMARY', value: log.primary_employee.name },
              { label: 'PARTNER', value: log.partner_employee?.name ?? '—' },
              {
                label: 'UNIT(S)',
                value: formatUnit(log.primary_unit, false) + (secondUnit ? ` · ${formatUnit(secondUnit, false)}` : ''),
              },
              { label: 'SHIFT', value: `${fmtTime(log.actual_start)}–${fmtTime(log.actual_end)}` },
            ].map(({ label, value }) => (
              <div key={label} className="px-3 py-2">
                <div className="op-label mb-0.5">{label}</div>
                <div className="font-mono text-xs text-zinc-200 truncate">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bays ──────────────────────────────────────────────────── */}
        <div className="op-panel">
          <div className="px-3 py-1 border-b border-[#1e2028] bg-[#0a0b0d]">
            <span className="op-section-label">BAYS</span>
          </div>
          {log.bays.map(bay => (
            <div key={bay.bay_label} className="flex items-center gap-4 px-3 py-1.5 op-row">
              <span className="font-mono text-[10px] text-zinc-500 w-14 uppercase">{bay.bay_label}</span>
              <span className="font-mono text-xs text-zinc-300 flex-1">
                {bay.unit ? formatUnit(bay.unit) : '—'}
              </span>
              <span className={`font-mono text-[9px] tracking-wider ${BAY_STATUS_COLOR[bay.unit_status]}`}>
                {BAY_STATUS_LABEL[bay.unit_status]}
              </span>
            </div>
          ))}
        </div>

        {/* ── Chore sections ────────────────────────────────────────── */}
        {day1Chores.length > 0 && (
          <div>
            <SectionHeader label={`DAILY CHORES · ${fmtShortDate(log.service_date)}`} />
            <div className="op-panel px-3 pt-0.5 pb-0.5">
              {day1Chores.map(chore => (
                <ChoreItem key={chore.id} chore={chore} userRole={session.role} />
              ))}
            </div>
          </div>
        )}

        {day2Chores.length > 0 && (
          <div>
            <SectionHeader label={`DAY 2 CHORES · ${fmtShortDate(day2Date)}`} />
            <div className="op-panel px-3 pt-0.5 pb-0.5">
              {day2Chores.map(chore => (
                <ChoreItem key={chore.id} chore={chore} userRole={session.role} />
              ))}
            </div>
          </div>
        )}

        {sortedPreviousPersistentChores.length > 0 && (
          <div>
            <SectionHeader label="OVERDUE — PREVIOUS SHIFTS" />
            <div className="op-panel border-amber-800/30 px-3 pt-0.5 pb-0.5">
              {sortedPreviousPersistentChores.map(chore => {
                const isNarc = chore.chore_template.name === 'NARC Expires'
                const crew = [chore.operations_log.primary_employee, chore.operations_log.partner_employee]
                  .filter((e): e is { name: string; licensure_level: string } =>
                    e !== null && (!isNarc || e.licensure_level === 'NRP'))
                return (
                  <div key={chore.id}>
                    <ChoreItem chore={chore} userRole={session.role} />
                    <div className="ml-5 pb-0.5 font-mono text-[9px] text-zinc-700">
                      FROM {chore.operations_log.crew_post.name} · {fmtDate(chore.operations_log.service_date)}
                      {crew.length > 0 && <span className="ml-2">{crew.map(e => e.name.split(' ').at(-1)).join(' / ')}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {persistentChores.length > 0 && (
          <div>
            <SectionHeader label="PERSISTENT / EXPIRES" />
            <div className="op-panel px-3 pt-0.5 pb-0.5">
              {persistentChores.map(chore => (
                <ChoreItem key={chore.id} chore={chore} userRole={session.role} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
