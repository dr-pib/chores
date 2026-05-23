import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const employees = await prisma.employee.findMany({
    where: { status: { not: 'Inactive' } },
    select: {
      id: true,
      name: true,
      email: true,
      email_username: true,
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
