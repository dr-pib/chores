import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import ChoreItem from '@/components/ChoreItem'
import { formatUnit } from '@/lib/units'
import { sortChores } from '@/lib/chore-rotation'

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

  const sorted = sortChores(log.chores)
  const dailyChores = sorted.filter(c => c.chore_template.lifecycle_type === 'daily_reset')
  const persistentChores = sorted.filter(c => c.chore_template.lifecycle_type === 'persistent_until_complete')

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <Link href="/log" className="text-zinc-500 hover:text-zinc-300 text-sm">← Operations Log</Link>
        </div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">{log.crew_post.name}</h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              {log.station.name} · {formatDate(log.service_date)}
            </p>
          </div>
          {log.supervisor_confirmed_at ? (
            <span className="px-2.5 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">Confirmed</span>
          ) : (
            <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full font-medium">Submitted</span>
          )}
        </div>

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
