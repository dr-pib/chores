import { isSupervisorRole } from '@/lib/roles'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'


export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSupervisorRole(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const logs = await prisma.changeLog.findMany({
    include: {
      changed_by_employee: { select: { name: true } },
      chore: { include: { chore_template: { select: { name: true } } } },
      operations_log: { include: { shift_profile: { select: { name: true } } } },
      target_employee: { select: { name: true, licensure_level: true } },
    },
    orderBy: { created_at: 'desc' },
    take: 500,
  })

  return NextResponse.json(logs)
}
