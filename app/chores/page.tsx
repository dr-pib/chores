import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import ChoreItem from '@/components/ChoreItem'
import { sortChores } from '@/lib/chore-rotation'

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase()
}

interface ChoreTemplate { name: string; lifecycle_type: string; due_offset_hours: number | null }
interface Unit { unit_number: number; unit_type: string; unit_name?: string | null }
interface Employee { name: string }
interface ChoreTemplateTask { id: number; name: string; sort_order: number }
interface ChoreTask {
  id: number
  chore_template_task: ChoreTemplateTask
  completed_at: Date | string | null
  completed_by: Employee | null
}
interface Chore {
  id: number
  status: string
  due_at: Date | string | null
  completed_at: Date | string | null
  completed_by: Employee | null
  chore_template: ChoreTemplate
  unit: Unit | null
  bay_label: string | null
  tasks?: ChoreTask[]
  [key: string]: unknown
}
interface LogWithChores {
  id: number
  primary_employee_id: number
  crew_post: { name: string }
  primary_employee: { name: string }
  chores: Chore[]
}

function LogBlock({ log, isMe, userRole }: { log: LogWithChores; isMe: boolean; userRole: string }) {
  const sorted = sortChores(log.chores)
  const done = sorted.filter(c => c.status === 'completed').length
  const total = sorted.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className={`op-panel ${isMe ? 'border-cyan-800/40' : ''}`}>
      {/* Crew header */}
      <div className={`flex items-center justify-between px-3 py-1.5 border-b border-[#1e2028] ${isMe ? 'bg-cyan-950/20' : 'bg-[#0a0b0d]'}`}>
        <div className="flex items-center gap-3">
          <Link href={`/log/${log.id}`} className="font-mono text-xs font-semibold text-zinc-200 hover:text-cyan-400 transition-colors uppercase tracking-wide">
            {log.crew_post.name}
          </Link>
          <span className="font-mono text-[10px] text-zinc-600">{log.primary_employee.name}</span>
          {isMe && <span className="font-mono text-[9px] text-cyan-600 border border-cyan-800/50 px-1">ME</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-600">{done}/{total}</span>
          {total > 0 && (
            <div className="w-16 h-px bg-zinc-800">
              <div className="h-px bg-cyan-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
      {/* Chores */}
      <div className="px-3 pt-0.5 pb-0.5">
        {sorted.map(chore => (
          <ChoreItem key={chore.id} chore={chore} userRole={userRole} />
        ))}
        {sorted.length === 0 && (
          <p className="font-mono text-[10px] text-zinc-700 py-2">NO CHORES</p>
        )}
      </div>
    </div>
  )
}

export default async function ChoresPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const today = new Date()
  const serviceDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const logs = await prisma.operationsLog.findMany({
    where: { service_date: serviceDate },
    include: {
      crew_post: true,
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

  const openPersistent = await prisma.chore.findMany({
    where: {
      status: 'pending',
      chore_template: { lifecycle_type: 'persistent_until_complete' },
      operations_log: { service_date: { lt: serviceDate } },
    },
    include: {
      chore_template: true,
      unit: true,
      completed_by: true,
      tasks: {
        include: { chore_template_task: true, completed_by: true },
        orderBy: { chore_template_task: { sort_order: 'asc' } } as const,
      },
      operations_log: { include: { crew_post: true } },
    },
    orderBy: { due_at: 'asc' },
    take: 20,
  })

  const myLog = logs.find(l => l.primary_employee_id === session.userId) ?? null
  const otherLogs = logs.filter(l => l.primary_employee_id !== session.userId)

  const totalToday = logs.reduce((s, l) => s + l.chores.length, 0)
  const doneToday = logs.reduce((s, l) => s + l.chores.filter(c => c.status === 'completed').length, 0)
  const pct = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0

  return (
    <div className="min-h-screen bg-[#09090b]">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-[900px] mx-auto px-4 py-4 space-y-3">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-bold uppercase tracking-wide text-zinc-100">ALL CHORES</h1>
            <div className="font-mono text-[10px] text-zinc-600 mt-0.5">
              {fmtDate(serviceDate)} · {doneToday}/{totalToday} COMPLETE
            </div>
          </div>
          {totalToday > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-600">{pct}%</span>
              <div className="w-24 h-px bg-zinc-800">
                <div className="h-px bg-cyan-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Overdue persistent */}
        {openPersistent.length > 0 && (
          <div>
            <div className="op-section mb-2">
              <span className="op-section-label text-amber-600">OVERDUE PERSISTENT</span>
              <div className="op-section-rule" />
            </div>
            <div className="op-panel border-amber-800/30 px-3 pt-0.5 pb-0.5">
              {openPersistent.map(chore => (
                <div key={chore.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <ChoreItem chore={chore} userRole={session.role} />
                  </div>
                  <Link href={`/log/${chore.operations_log_id}`} className="font-mono text-[9px] text-zinc-700 hover:text-zinc-400 uppercase tracking-wider mt-1.5 shrink-0">
                    {chore.operations_log.crew_post.name}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {logs.length === 0 ? (
          <div className="op-panel px-4 py-8 text-center">
            <p className="font-mono text-xs text-zinc-600 mb-3">NO SHIFTS CONFIRMED TODAY</p>
            <Link href="/setup" className="op-btn op-btn-primary">+ SETUP SHIFT</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myLog && <LogBlock log={myLog} isMe userRole={session.role} />}
            {otherLogs.map(log => (
              <LogBlock key={log.id} log={log} isMe={false} userRole={session.role} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
