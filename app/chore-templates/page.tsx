import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import { getStationChoreForPost } from '@/lib/chore-rotation'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']
const LIFECYCLE_LABELS: Record<string, string> = {
  daily_reset: 'Daily Reset',
  persistent_until_complete: 'Persistent',
}

const HARRISON_CREWS = ['Supervisor', '24-7', '24-8', 'Swing']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default async function ChoreTemplatesPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')
  if (!SUPERVISOR_ROLES.includes(session.role)) redirect('/setup')

  const templates = await prisma.choreTemplate.findMany({
    include: { tasks: { orderBy: { sort_order: 'asc' } } },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-100">Chore Templates</h1>
          <Link
            href="/chore-templates/new"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors"
          >
            + New
          </Link>
        </div>

        {/* Template list */}
        <div className="space-y-2 mb-10">
          {templates.map(t => (
            <Link key={t.id} href={`/chore-templates/${t.id}`} className="block">
              <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-zinc-100">{t.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        t.lifecycle_type === 'daily_reset'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {LIFECYCLE_LABELS[t.lifecycle_type] ?? t.lifecycle_type}
                      </span>
                    </div>
                    <div className="text-zinc-500 text-xs mt-0.5">
                      {t.due_offset_hours != null && <span>Due +{t.due_offset_hours}h · </span>}
                      {t.tasks.length > 0
                        ? `${t.tasks.length} sub-task${t.tasks.length === 1 ? '' : 's'}: ${t.tasks.map(s => s.name).join(', ')}`
                        : 'No sub-tasks'}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Harrison Rotation Grid */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Harrison Station Chore Rotation
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-zinc-500 font-medium pb-2 pr-4">Month</th>
                  {HARRISON_CREWS.map(crew => (
                    <th key={crew} className="text-left text-zinc-400 font-semibold pb-2 pr-4">{crew}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((month, i) => {
                  const monthNum = i + 1
                  return (
                    <tr key={month} className="border-t border-zinc-800">
                      <td className="text-zinc-500 py-1.5 pr-4">{month}</td>
                      {HARRISON_CREWS.map(crew => {
                        const chore = getStationChoreForPost(crew, monthNum)
                        return (
                          <td key={crew} className="py-1.5 pr-4 text-zinc-300">{chore ?? '—'}</td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
