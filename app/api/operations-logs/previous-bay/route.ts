import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

// Returns the most recent bay/unit data for a given crew_post_id before a given date
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const crewPostId = searchParams.get('crew_post_id')
  const beforeDate = searchParams.get('before_date')

  if (!crewPostId) return NextResponse.json({ bays: [] })

  const cutoff = beforeDate ? new Date(beforeDate) : new Date()

  const prevLog = await prisma.operationsLog.findFirst({
    where: { crew_post_id: Number(crewPostId), service_date: { lt: cutoff } },
    orderBy: { service_date: 'desc' },
    include: { bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } } },
  })

  return NextResponse.json({ bays: prevLog?.bays ?? [] })
}
