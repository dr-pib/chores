import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const boxes = await prisma.narcBox.findMany({
    where: { status: 'Active' },
    orderBy: { letter: 'asc' },
  })

  return NextResponse.json(boxes)
}
