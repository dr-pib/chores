import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']
const DOM_ONLY = ['Dom']

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
      default_shift_profile: { select: { id: true, name: true } },
      direct_supervisor: { select: { id: true, name: true } },
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

  const employeeId = Number(id)

  // EMT number change — Dom only, logged to change log
  if ('emt_number' in body) {
    if (!DOM_ONLY.includes(session.role)) {
      return NextResponse.json({ error: 'Only Dom can change EMT numbers' }, { status: 403 })
    }
    const newEmtNumber = String(body.emt_number).trim()
    if (!newEmtNumber) return NextResponse.json({ error: 'EMT number cannot be blank' }, { status: 400 })

    const current = await prisma.employee.findUnique({ where: { id: employeeId }, select: { emt_number: true } })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: { emt_number: newEmtNumber },
    })
    await prisma.changeLog.create({
      data: {
        target_employee_id: employeeId,
        changed_by_employee_id: session.userId,
        action: 'emt_number_change',
        previous_status: current.emt_number,
        new_status: newEmtNumber,
      },
    })
    return NextResponse.json(updated)
  }

  const {
    name,
    email,
    email_username,
    licensure_level,
    role,
    status,
    default_station_id,
    default_shift_profile_id,
    default_shift_length_hours,
    default_partner_id,
    direct_supervisor_id,
  } = body

  // Only update default_partner_id if the partner field is explicitly present in the body.
  // This lets the partner grid send a partial body without blanking unrelated fields.
  const partnerProvided = 'default_partner_id' in body
  const newPartnerId: number | null = partnerProvided ? (default_partner_id || null) : undefined!

  // Read the current partner before updating so we can unlink them if needed
  const current = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { default_partner_id: true },
  })
  const oldPartnerId = current?.default_partner_id ?? null

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      // Only include fields that were explicitly sent in the request body
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email: email || null }),
      ...(email_username !== undefined && { email_username }),
      ...(licensure_level !== undefined && { licensure_level }),
      ...(role !== undefined && { role }),
      ...(status !== undefined && { status }),
      ...(default_station_id !== undefined && { default_station_id: default_station_id || null }),
      ...(default_shift_profile_id !== undefined && { default_shift_profile_id: default_shift_profile_id || null }),
      ...(default_shift_length_hours !== undefined && { default_shift_length_hours: default_shift_length_hours != null ? Number(default_shift_length_hours) : null }),
      ...(partnerProvided && { default_partner_id: newPartnerId }),
      ...(direct_supervisor_id !== undefined && { direct_supervisor_id: direct_supervisor_id || null }),
    },
    include: {
      default_partner: { select: { id: true, name: true } },
      direct_supervisor: { select: { id: true, name: true } },
    },
  })

  // Mirror the partner relationship bidirectionally (only when partner was part of the request)
  if (partnerProvided && newPartnerId !== oldPartnerId) {
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
