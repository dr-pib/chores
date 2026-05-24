import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { nextServiceDate } from '@/lib/dates'

export default async function MyChoresPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const today = new Date()
  const serviceDate = new Date(
    today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) + 'T00:00:00Z'
  )
  const nextDate = nextServiceDate(serviceDate)
  const myLog = await prisma.operationsLog.findFirst({
    where: {
      actual_start: { lt: nextDate },
      actual_end: { gt: today },
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
