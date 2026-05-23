import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'

function formatTime(dt: Date | string) {
  return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
function formatDate(dt: Date | string) {
  return new Date(dt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const statusColors: Record<string, string> = {
  unit_present: 'text-green-400',
  empty_bay: 'text-zinc-500',
  unit_at_shop: 'text-yellow-400',
}
const statusLabels: Record<string, string> = {
  unit_present: 'present',
  empty_bay: 'empty',
  unit_at_shop: 'at shop',
}

export default async function RosterPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const today = new Date()
  const serviceDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const allPosts = await prisma.crewPost.findMany({
    include: { station: true, default_unit: true },
    orderBy: { name: 'asc' },
  })

  const logs = await prisma.operationsLog.findMany({
    where: { service_date: serviceDate },
    include: {
      crew_post: { include: { station: true } },
      primary_employee: true,
      partner_employee: true,
      primary_unit: true,
      bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
      chores: { include: { chore_template: true } },
    },
    orderBy: { created_at: 'asc' },
  })

  const confirmedPostIds = new Set(logs.map(l => l.crew_post_id))
  const rosterStatus = logs.length === 0 ? 'Not Started' : confirmedPostIds.size >= allPosts.length ? 'Confirmed' : 'In Progress'

  const statusBadge: Record<string, string> = {
    'Not Started': 'bg-zinc-800 text-zinc-400',
    'In Progress': 'bg-yellow-500/20 text-yellow-400',
    'Confirmed': 'bg-green-500/20 text-green-400',
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Daily Roster</h1>
            <p className="text-zinc-400 text-sm mt-0.5">{formatDate(serviceDate)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge[rosterStatus]}`}>
              {rosterStatus}
            </span>
            <Link href="/setup" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors">
              Set My Shift
            </Link>
          </div>
        </div>

        {/* Confirmed crews */}
        {logs.length > 0 && (
          <div className="space-y-3 mb-8">
            {logs.map(log => {
              const pendingChores = log.chores.filter(c => c.status === 'pending').length
              const doneChores = log.chores.filter(c => c.status === 'completed').length
              return (
                <Link key={log.id} href={`/log/${log.id}`} className="block">
                  <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-zinc-100">{log.crew_post.name}</span>
                          <span className="text-zinc-500 text-sm">·</span>
                          <span className="text-zinc-400 text-sm">{log.crew_post.station.name}</span>
                          <span className="ml-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">Confirmed</span>
                        </div>
                        <div className="text-zinc-400 text-sm">
                          {log.primary_employee.name}
                          {log.partner_employee && <span> &amp; {log.partner_employee.name}</span>}
                          <span className="text-zinc-600 mx-1.5">·</span>
                          {formatTime(log.actual_start)} – {formatTime(log.actual_end)}
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          {log.bays.map(bay => (
                            <span key={bay.bay_label} className="text-xs text-zinc-500">
                              {bay.bay_label}:{' '}
                              {bay.unit ? (
                                <span className={statusColors[bay.unit_status]}>
                                  Unit {bay.unit.unit_number} ({statusLabels[bay.unit_status]})
                                </span>
                              ) : (
                                <span className={statusColors[bay.unit_status]}>{statusLabels[bay.unit_status]}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-zinc-500">
                          {doneChores}/{log.chores.length} chores
                        </div>
                        {pendingChores > 0 && (
                          <div className="text-xs text-yellow-400 mt-0.5">{pendingChores} pending</div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Unconfirmed posts */}
        {allPosts.filter(p => !confirmedPostIds.has(p.id)).length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">Unconfirmed</h2>
            <div className="space-y-2">
              {allPosts.filter(p => !confirmedPostIds.has(p.id)).map(post => (
                <div key={post.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-zinc-400">{post.name}</span>
                    <span className="text-zinc-600 mx-2">·</span>
                    <span className="text-zinc-600 text-sm">{post.station.name}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-zinc-800 text-zinc-500 text-xs rounded-full">Unconfirmed</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {logs.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-500 mb-4">No shifts confirmed yet for today.</p>
            <Link href="/setup" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
              Set up your shift
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
