import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SUPERVISOR_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const employee = await prisma.employee.findUnique({
    where: { id: Number(id) },
    include: {
      default_partner: { select: { id: true, name: true } },
      default_station: { select: { id: true, name: true } },
      default_post: { select: { id: true, name: true } },
    },
  })

  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(employee)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SUPERVISOR_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const {
    name,
    email,
    email_username,
    licensure_level,
    role,
    status,
    default_station_id,
    default_crew_post_id,
    default_shift_length_hours,
    default_partner_id,
  } = body

  const updated = await prisma.employee.update({
    where: { id: Number(id) },
    data: {
      name,
      email: email || null,
      email_username,
      licensure_level,
      role,
      status,
      default_station_id: default_station_id || null,
      default_crew_post_id: default_crew_post_id || null,
      default_shift_length_hours: Number(default_shift_length_hours),
      default_partner_id: default_partner_id || null,
    },
    include: {
      default_partner: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(updated)
}
