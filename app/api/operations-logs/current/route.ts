import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const log = await prisma.operationsLog.findFirst({
    where: {
      actual_end: { gt: now },
      OR: [
        { primary_employee_id: session.userId },
        { partner_employee_id: session.userId },
      ],
    },
    select: {
      id: true,
      shift_profile_id: true,
      partner_employee_id: true,
      actual_start: true,
      actual_end: true,
      bays: {
        select: { bay_label: true, unit_id: true, unit_status: true, sort_order: true },
        orderBy: { sort_order: 'asc' },
      },
    },
    orderBy: [{ service_date: 'desc' }, { created_at: 'desc' }],
  })

  return NextResponse.json({ log })
}
