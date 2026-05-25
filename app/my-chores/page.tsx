import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export default async function MyChoresPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const now = new Date()
  const myLog = await prisma.operationsLog.findFirst({
    where: {
      actual_start: { lte: now },
      actual_end: { gt: now },
      OR: [
        { primary_employee_id: session.userId },
        { partner_employee_id: session.userId },
      ],
    },
    orderBy: [{ service_date: 'desc' }, { created_at: 'desc' }],
  })

  if (myLog) redirect(`/log/${myLog.id}`)
  redirect('/setup')
}
