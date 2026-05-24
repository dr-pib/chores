import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export default async function MyChoresPage() {
  const session = await getSession()
  if (!session.isLoggedIn) redirect('/login')

  const today = new Date()
  const serviceDate = new Date(
    today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) + 'T00:00:00Z'
  )
  const myLog = await prisma.operationsLog.findFirst({
    where: { service_date: serviceDate, primary_employee_id: session.userId },
    orderBy: { created_at: 'desc' },
  })

  if (myLog) redirect(`/log/${myLog.id}`)
  redirect('/setup')
}
