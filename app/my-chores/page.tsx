import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { isSupervisorRole } from '@/lib/roles'
import { todayChicago } from '@/lib/dates'
import { ensureDailySW } from '@/lib/ensure-daily-sw'

export default async function MyChoresPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  // Any login after 5am triggers daily SW generation if it hasn't run yet today
  void ensureDailySW(todayChicago())

  const now = new Date()
  // Find the shift currently in progress: started already, not yet ended.
  // Prefer in-progress over future imports by checking actual_start <= now.
  const myLog = await prisma.operationsLog.findFirst({
    where: {
      actual_start: { lte: now },
      actual_end: { gt: now },
      OR: [
        { primary_employee_id: session.userId },
        { partner_employee_id: session.userId },
      ],
    },
    orderBy: [{ created_at: 'desc' }],
  })

  if (myLog) redirect(`/log/${myLog.id}`)

  // Supervisors/admins clicking the Chores nav (not coming from login) land on Everyone's Chores
  const { from } = await searchParams
  if (from !== 'login' && isSupervisorRole(session.role)) redirect('/chores')
  redirect('/setup')
}
