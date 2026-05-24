import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import ChoreItem from '@/components/ChoreItem'
import { sortChores } from '@/lib/chore-rotation'
import { nextServiceDate } from '@/lib/dates'

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

interface ChoreTemplate { name: string; lifecycle_type: string; due_offset_hours: number | null }
interface Unit { unit_number: number; unit_type: string; unit_name?: string | null }
interface Employee { name: string }
interface Chore {
  id: number
  status: string
  due_at: Date | string | null
  completed_at: Date | string | null
  completed_by: Employee | null
  chore_template: ChoreTemplate
  unit: Unit | null
  bay_label: string | null
  [key: string]: unknown
}
interface LogWithChores {
  id: number
  shift_profile: { name: string }
  primary_employee: { name: string }
  chores: Chore[]
}

function LogBox({ log, highlight, userRole }: { log: LogWithChores; highlight?: boolean; userRole: string }) {
  const sorted = sortChores(log.chores)
  const done = sorted.filter(c => c.status === 'completed').length
  const borderClass = highlight
    ? 'border-blue-600 bg-blue-950/20'
    : 'border-zinc-800 bg-zinc-900'
  return (
    <div className={`border rounded-xl p-4 ${borderClass}`}>
      <div className="flex items-center justify-between mb-3">
        <Link href={`/log/${log.id}`} className="flex items-center gap-2 hover:text-blue-400 transition-colors">
          <span className="font-semibold text-zinc-100">{log.shift_profile.name}</span>
          <span className="text-zinc-500 text-sm">— {log.primary_employee.name}</span>
        </Link>
        <span className="text-xs text-zinc-500">{done}/{sorted.length}</span>
      </div>
      <div className="space-y-1">
        {sorted.map(chore => (
          <ChoreItem key={chore.id} chore={chore} userRole={userRole} />
        ))}
      </div>
    </div>
  )
}

export default async function ChoresPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const today = new Date()
  const serviceDate = new Date(
    today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) + 'T00:00:00Z'
  )
  const nextDate = nextServiceDate(serviceDate)

  const logs = await prisma.operationsLog.findMany({
    where: {
      actual_start: { lt: nextDate },
      actual_end: { gt: serviceDate },
    },
    include: {
      shift_profile: true,
      primary_employee: true,
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
    },
    orderBy: { created_at: 'asc' },
  })

  // Persistent chores still open from previous days
  const openPersistent = await prisma.chore.findMany({
    where: {
      status: 'pending',
      chore_template: { lifecycle_type: 'persistent_until_complete' },
      operations_log: { actual_end: { lt: today } },
    },
    include: {
      chore_template: true,
      unit: true,
      completed_by: true,
      tasks: {
        include: { chore_template_task: true, completed_by: true },
        orderBy: { chore_template_task: { sort_order: 'asc' } } as const,
      },
      operations_log: { include: { shift_profile: true } },
    },
    orderBy: { due_at: 'asc' },
    take: 20,
  })

  const myLog = logs.find(l => l.primary_employee_id === session.userId || l.partner_employee_id === session.userId) ?? null
  const otherLogs = logs.filter(l => l.id !== myLog?.id)

  const totalToday = logs.reduce((s, l) => s + l.chores.length, 0)
  const doneToday = logs.reduce((s, l) => s + l.chores.filter(c => c.status === 'completed').length, 0)

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Everyone&apos;s Chores</h1>
            <p className="text-zinc-400 text-sm mt-0.5">{formatDate(serviceDate)} — {doneToday}/{totalToday} complete</p>
          </div>
        </div>

        {/* Progress bar */}
        {totalToday > 0 && (
          <div className="bg-zinc-800 rounded-full h-1.5 mb-6">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.round((doneToday / totalToday) * 100)}%` }}
            />
          </div>
        )}

        {/* Overdue persistent from previous days */}
        {openPersistent.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">
              Overdue / Incomplete Persistent
            </h2>
            <div className="space-y-2">
              {openPersistent.map(chore => (
                <div key={chore.id} className="flex items-center gap-3">
                  <ChoreItem chore={chore} userRole={session.role} />
                  <Link href={`/log/${chore.operations_log_id}`} className="text-xs text-zinc-500 hover:text-zinc-300 shrink-0">
                    {chore.operations_log.shift_profile.name}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {logs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-500 mb-4">No shifts confirmed today yet.</p>
            <Link href="/setup" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
              Set up your shift
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Current user's shift — highlighted first */}
            {myLog && (
              <>
                <h2 className="text-xs font-semibold text-blue-400 uppercase tracking-wider">My Chores</h2>
                <LogBox log={myLog} highlight userRole={session.role} />
              </>
            )}

            {/* Other crews */}
            {otherLogs.length > 0 && (
              <>
                {myLog && (
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider pt-1">Other Crews</h2>
                )}
                {otherLogs.map(log => (
                  <LogBox key={log.id} log={log} userRole={session.role} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
