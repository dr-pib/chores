import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ user: null })

  const employee = await prisma.employee.findUnique({
    where: { id: session.userId },
    include: {
      default_post: { include: { station: true, default_unit: true, bays: { orderBy: { sort_order: 'asc' } } } },
      default_partner: true,
    },
  })

  return NextResponse.json({ user: employee })
}

// Employees may update only their own profile/default fields — never role, status, name, etc.
const ALLOWED_FIELDS = new Set([
  'default_crew_post_id',
  'default_partner_id',
  'default_shift_length_hours',
  'birthday_month',
  'birthday_day',
  'personal_cell',
  'notification_preference',
  'reminder_hours_before_shift_end',
])

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const employeeId = session.userId

  // Strip any fields the employee isn't allowed to touch
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) data[key] = value
  }

  // Null-coerce optional FK fields so empty string → null
  for (const fk of ['default_crew_post_id', 'default_partner_id', 'reminder_hours_before_shift_end', 'birthday_month', 'birthday_day']) {
    if (fk in data) data[fk] = data[fk] || null
  }
  if ('default_shift_length_hours' in data) {
    data.default_shift_length_hours = data.default_shift_length_hours != null ? Number(data.default_shift_length_hours) : null
  }

  // Handle partner mirroring when default_partner_id changes
  const partnerProvided = 'default_partner_id' in data
  if (partnerProvided) {
    const current = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { default_partner_id: true },
    })
    const oldPartnerId = current?.default_partner_id ?? null
    const newPartnerId = (data.default_partner_id as number | null)

    if (newPartnerId !== oldPartnerId) {
      if (oldPartnerId) {
        await prisma.employee.updateMany({
          where: { id: oldPartnerId, default_partner_id: employeeId },
          data: { default_partner_id: null },
        })
      }
      if (newPartnerId) {
        await prisma.employee.update({
          where: { id: newPartnerId },
          data: { default_partner_id: employeeId },
        })
      }
    }
  }

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data,
    include: { default_post: { include: { station: true } }, default_partner: true },
  })

  return NextResponse.json({ user: updated })
}
