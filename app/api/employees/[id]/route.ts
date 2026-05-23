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

  const employeeId = Number(id)
  const newPartnerId: number | null = default_partner_id || null

  // Read the current partner before updating so we can unlink them if needed
  const current = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { default_partner_id: true },
  })
  const oldPartnerId = current?.default_partner_id ?? null

  const updated = await prisma.employee.update({
    where: { id: employeeId },
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
      default_partner_id: newPartnerId,
    },
    include: {
      default_partner: { select: { id: true, name: true } },
    },
  })

  // Mirror the partner relationship bidirectionally
  if (newPartnerId !== oldPartnerId) {
    // If there was a previous partner who pointed back at this employee, clear them
    if (oldPartnerId) {
      await prisma.employee.updateMany({
        where: { id: oldPartnerId, default_partner_id: employeeId },
        data: { default_partner_id: null },
      })
    }
    // Point the new partner back at this employee
    if (newPartnerId) {
      await prisma.employee.update({
        where: { id: newPartnerId },
        data: { default_partner_id: employeeId },
      })
    }
  }

  return NextResponse.json(updated)
}
