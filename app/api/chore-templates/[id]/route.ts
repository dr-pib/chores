import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const template = await prisma.choreTemplate.findUnique({
    where: { id: Number(id) },
    include: { tasks: { orderBy: { sort_order: 'asc' } } },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(template)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SUPERVISOR_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { name, lifecycle_type, due_offset_hours, lock_offset_hours } = body

  const template = await prisma.choreTemplate.update({
    where: { id: Number(id) },
    data: {
      name,
      lifecycle_type,
      due_offset_hours: due_offset_hours != null ? Number(due_offset_hours) : null,
      lock_offset_hours: lock_offset_hours != null ? Number(lock_offset_hours) : null,
    },
    include: { tasks: { orderBy: { sort_order: 'asc' } } },
  })
  return NextResponse.json(template)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SUPERVISOR_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.choreTemplate.delete({ where: { id: Number(id) } })
  return new NextResponse(null, { status: 204 })
}
