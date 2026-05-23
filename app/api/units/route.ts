import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const units = await prisma.unit.findMany({ orderBy: { unit_number: 'asc' } })
  return NextResponse.json(units)
}
