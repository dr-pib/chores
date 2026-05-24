import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SUPERVISOR_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const post = await prisma.shiftProfile.findUnique({
    where: { id: Number(id) },
    include: {
      station: true,
      default_unit: true,
      bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
    },
  })

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(post)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SUPERVISOR_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { default_start_time, default_unit_id, bays } = body

  const updated = await prisma.shiftProfile.update({
    where: { id: Number(id) },
    data: {
      default_start_time,
      default_unit_id: default_unit_id || null,
      bays: {
        deleteMany: {},
        create: (bays as { bay_label: string; unit_id: number | null; sort_order: number }[])
          .filter(b => b.bay_label)
          .map(b => ({
            bay_label: b.bay_label,
            unit_id: b.unit_id ?? null,
            sort_order: b.sort_order,
          })),
      },
    },
    include: {
      station: true,
      default_unit: true,
      bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
    },
  })

  return NextResponse.json(updated)
}
