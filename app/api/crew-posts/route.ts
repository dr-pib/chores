import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const posts = await prisma.crewPost.findMany({
    include: {
      station: true,
      default_unit: true,
      bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(posts)
}
