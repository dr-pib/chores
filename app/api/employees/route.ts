import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const all = new URL(req.url).searchParams.get('all') === 'true'

  if (all && !SUPERVISOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const employees = await prisma.employee.findMany({
    where: all ? undefined : { status: { not: 'Inactive' } },
    select: {
      id: true,
      name: true,
      email: true,
      email_username: true,
      emt_number: true,
      licensure_level: true,
      role: true,
      status: true,
      default_station_id: true,
      default_crew_post_id: true,
      default_shift_length_hours: true,
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(employees)
}
