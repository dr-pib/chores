import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

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
  const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']
  if (from !== 'login' && SUPERVISOR_ROLES.includes(session.role)) redirect('/chores')
  redirect('/setup')
}
