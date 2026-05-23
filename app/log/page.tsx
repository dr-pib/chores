import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import NavBar from '@/components/NavBar'
import { formatUnit } from '@/lib/units'

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default async function LogListPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const logs = await prisma.operationsLog.findMany({
    include: {
      crew_post: { include: { station: true } },
      primary_employee: true,
      partner_employee: true,
      primary_unit: true,
      chores: true,
    },
    orderBy: [{ service_date: 'desc' }, { created_at: 'desc' }],
    take: 60,
  })

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={session.name} userRole={session.role} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-100">Operations Log</h1>
          <Link href="/setup" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors">
            New Entry
          </Link>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">No operations logged yet.</div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => {
              const done = log.chores.filter(c => c.status === 'completed').length
              return (
                <Link key={log.id} href={`/log/${log.id}`} className="block">
                  <div className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-zinc-100">{log.crew_post.name}</span>
                          <span className="text-zinc-500 text-sm">·</span>
                          <span className="text-zinc-400 text-sm">{log.crew_post.station.name}</span>
                          <span className="text-zinc-600 text-sm">·</span>
                          <span className="text-zinc-500 text-sm">{formatDate(log.service_date)}</span>
                        </div>
                        <div className="text-zinc-400 text-sm mt-0.5">
                          {log.primary_employee.name}
                          {log.partner_employee && <span> &amp; {log.partner_employee.name}</span>}
                          <span className="text-zinc-600 mx-1.5">·</span>
                          {formatTime(log.actual_start)} – {formatTime(log.actual_end)}
                          <span className="text-zinc-600 mx-1.5">·</span>
                          {formatUnit(log.primary_unit, false)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-zinc-500">{done}/{log.chores.length} chores</div>
                        <svg className="w-4 h-4 text-zinc-600 mt-1 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
