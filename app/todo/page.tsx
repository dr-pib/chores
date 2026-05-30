import { isSupervisorRole } from '@/lib/roles'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import NavBar from '@/components/NavBar'

// ---------------------------------------------------------------------------
// In-app To-Do / roadmap board.
//
// This is a hand-maintained list so supervisors can review what was recently
// shipped and what is still open, without digging through git history or
// AI_WORKPLAN.md. When work lands or a new item comes up, edit the arrays
// below. Keep AI_WORKPLAN.md as the detailed engineering source of truth;
// this page is the human-readable summary.
// ---------------------------------------------------------------------------

type Status = 'done' | 'in_progress' | 'todo'

interface TodoItem {
  title: string
  status: Status
  note?: string
}

interface TodoSection {
  heading: string
  items: TodoItem[]
}

const LAST_UPDATED = 'May 30, 2026'

const SECTIONS: TodoSection[] = [
  {
    heading: 'Recently shipped',
    items: [
      { status: 'done', title: 'Everyone’s Chores section order: red Overdue/Unfinished → amber Unassigned → yellow Missed Truck Checks' },
      { status: 'done', title: 'Supervisor nav: config pages collapsed into an Admin dropdown so the bar stops sprawling' },
      { status: 'done', title: 'Admin menu labels: Performance Report, Shift Templates, Employee Profiles, Chore Console' },
      { status: 'done', title: 'Darker green dotted app background with wider dot spacing' },
      { status: 'done', title: 'Nav bar uses solid dark green (no dots)' },
      { status: 'done', title: 'NARC Expires shows the box letter only (no unit number) on every screen and in the overdue ticker' },
      { status: 'done', title: 'Deleting a shift purges its data; completed claimed work is erased, pending claimed work reverts to unassigned so it still shows as needing to be done' },
      { status: 'done', title: 'Auto-generate NARC Expires for boxes sitting in the safe' },
    ],
  },
  {
    heading: 'Open / to review',
    items: [
      { status: 'todo', title: 'On shift delete, a COMPLETED NARC Expires must reappear as UNDONE, not vanish', note: 'Today completed claimed ScheduledWork is deleted with the shift. Instead, revert it to unassigned AND clear the completion (status pending, completed_by/at null) so the box’s NARC Expires shows as still needing to be done. Same likely applies to other completed persistent expires.' },
      { status: 'todo', title: 'Cron job for the mark-missed forfeitable transition', note: 'Endpoint exists; needs scheduling.' },
      { status: 'todo', title: 'Performance report: date-range filtering, employee/crew/supervisor/station views, trend lines, printable/email-all-supervisors' },
      { status: 'todo', title: 'SMS notifications (10am supervisor, 12pm Brent)', note: 'Design captured; deferred until a provider is chosen.' },
    ],
  },
]

const STATUS_STYLE: Record<Status, { dot: string; label: string; labelClass: string }> = {
  done: { dot: 'bg-green-500 border-green-500', label: 'Done', labelClass: 'text-green-400' },
  in_progress: { dot: 'bg-amber-400 border-amber-400', label: 'In progress', labelClass: 'text-amber-400' },
  todo: { dot: 'border-zinc-600', label: 'To do', labelClass: 'text-zinc-500' },
}

export default async function TodoPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')
  if (!isSupervisorRole(session.role)) redirect('/')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar userName={session.name ?? ''} userRole={session.role ?? ''} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-xl font-bold tracking-tight">To-Do</h1>
          <span className="text-xs text-zinc-500">Updated {LAST_UPDATED}</span>
        </div>

        <div className="space-y-6">
          {SECTIONS.map(section => (
            <div key={section.heading}>
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {section.heading}
              </h2>
              <div className="space-y-2">
                {section.items.map((item, i) => {
                  const style = STATUS_STYLE[item.status]
                  return (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                      <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${style.dot}`}>
                        {item.status === 'done' && (
                          <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm ${item.status === 'done' ? 'text-zinc-300' : 'text-zinc-100'}`}>
                            {item.title}
                          </span>
                          <span className={`text-[11px] font-medium ${style.labelClass}`}>{style.label}</span>
                        </div>
                        {item.note && <p className="text-xs text-zinc-500 mt-1">{item.note}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
