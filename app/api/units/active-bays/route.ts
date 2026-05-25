import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const bays = await prisma.operationsLogBay.findMany({
    where: {
      unit_id: { not: null },
      unit_status: 'unit_present',
      operations_log: { actual_end: { gt: now } },
    },
    select: {
      unit_id: true,
      operations_log_id: true,
      operations_log: {
        select: { shift_profile: { select: { name: true } } },
      },
    },
  })

  return NextResponse.json(bays)
}
