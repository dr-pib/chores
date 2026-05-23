import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ user: null })

  const employee = await prisma.employee.findUnique({
    where: { id: session.userId },
    include: {
      default_post: { include: { station: true, default_unit: true, bays: { orderBy: { sort_order: 'asc' } } } },
      default_partner: true,
    },
  })

  return NextResponse.json({ user: employee })
}
