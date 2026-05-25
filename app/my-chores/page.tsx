import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { isSupervisorRole } from '@/lib/roles'

export default async function MyChoresPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const now = new Date()
  const myLog = await prisma.operationsLog.findFirst({
    where: {
      actual_end: { gt: now },
      OR: [
        { primary_employee_id: session.userId },
        { partner_employee_id: session.userId },
      ],
    },
    orderBy: [{ service_date: 'desc' }, { created_at: 'desc' }],
  })

  if (myLog) redirect(`/log/${myLog.id}`)

  // Supervisors/admins clicking the Chores nav (not coming from login) land on Everyone's Chores
  const { from } = await searchParams
  if (from !== 'login' && isSupervisorRole(session.role)) redirect('/chores')
  redirect('/setup')
}
