import { isSupervisorRole } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'


export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await prisma.choreTemplate.findMany({
    include: { tasks: { orderBy: { sort_order: 'asc' } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSupervisorRole(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, lifecycle_type, due_offset_hours } = body

  const template = await prisma.choreTemplate.create({
    data: { name, lifecycle_type, due_offset_hours: due_offset_hours ?? null },
    include: { tasks: true },
  })
  return NextResponse.json(template, { status: 201 })
}
