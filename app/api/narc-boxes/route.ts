import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const boxes = await prisma.narcBox.findMany({
    where: { status: 'Active' },
    orderBy: { letter: 'asc' },
    include: {
      operations_logs: {
        where: { actual_end: { gt: now } },
        take: 1,
        select: { id: true, shift_profile: { select: { name: true } } },
      },
    },
  })

  return NextResponse.json(boxes.map(box => ({
    id: box.id,
    letter: box.letter,
    status: box.status,
    active_log_id: box.operations_logs[0]?.id ?? null,
    active_shift_name: box.operations_logs[0]?.shift_profile.name ?? null,
  })))
}
