import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import DeleteChangeLogButton from '@/components/DeleteChangeLogButton'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']

function formatDateTime(d: Date | string) {
  const dt = new Date(d)
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/Chicago',
  }).formatToParts(dt)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  let hour = get('hour')
  if (hour === '24') hour = '00'
  return `${get('month')}/${get('day')}/${get('year')} ${hour}${get('minute')}`
}

function formatShiftDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function actionLabel(action: string) {
  if (action === 'complete_chore') return 'Completed'
  if (action === 'uncomplete_chore') return 'Uncompleted'
  return action
}

export default async function ChangeLogPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')
  if (!SUPERVISOR_ROLES.includes(session.role)) redirect('/')

  const logs = await prisma.changeLog.findMany({
    include: {
      changed_by_employee: { select: { name: true } },
      chore: { include: { chore_template: { select: { name: true } } } },
      operations_log: {
        include: { shift_profile: { select: { name: true } } },
      },
    },
    orderBy: { created_at: 'desc' },
    take: 500,
  })

  const isDom = session.role === 'Dom'

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-zinc-100 mb-6">Change Log</h1>

        {logs.length === 0 ? (
          <p className="text-zinc-500 text-sm">No audit records yet.</p>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">When</th>
                  <th className="text-left px-4 py-3">By</th>
                  <th className="text-left px-4 py-3">Shift</th>
                  <th className="text-left px-4 py-3">Shift Profile</th>
                  <th className="text-left px-4 py-3">Chore</th>
                  <th className="text-left px-4 py-3">Change</th>
                  {isDom && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {logs.map((entry, i) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-zinc-800/50 ${i % 2 === 0 ? '' : 'bg-zinc-900/40'}`}
                  >
                    <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">{formatDateTime(entry.created_at)}</td>
                    <td className="px-4 py-2.5 text-zinc-200">{entry.changed_by_employee.name}</td>
                    <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">{formatShiftDate(entry.operations_log.service_date)}</td>
                    <td className="px-4 py-2.5 text-zinc-300">{entry.operations_log.shift_profile.name}</td>
                    <td className="px-4 py-2.5 text-zinc-200">{entry.chore.chore_template.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-zinc-500">{entry.previous_status}</span>
                      <span className="text-zinc-600 mx-1">→</span>
                      <span className={entry.new_status === 'completed' ? 'text-green-400' : 'text-yellow-400'}>
                        {entry.new_status}
                      </span>
                      <span className="text-zinc-600 ml-1.5 text-xs">({actionLabel(entry.action)})</span>
                    </td>
                    {isDom && (
                      <td className="px-4 py-2.5 text-right">
                        <DeleteChangeLogButton id={entry.id} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
