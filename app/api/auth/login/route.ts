import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const { email_username, emt_number } = await req.json()
  const emailUsername = typeof email_username === 'string' ? email_username.toLowerCase().trim() : ''
  const emtNumber = typeof emt_number === 'string' ? emt_number.trim() : ''

  if (!emtNumber) {
    return NextResponse.json({ error: 'Enter your EMT number' }, { status: 400 })
  }

  let employee
  try {
    employee = await prisma.employee.findFirst({
      where: {
        ...(emailUsername ? { email_username: emailUsername } : {}),
        emt_number: emtNumber,
        status: { not: 'Inactive' },
      },
      include: { default_shift_profile: true },
    })
  } catch (error) {
    console.error('Login lookup failed', error)
    return NextResponse.json({ error: 'Unable to verify credentials right now' }, { status: 503 })
  }

  if (!employee) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const session = await getSession()
  session.userId = employee.id
  session.name = employee.name
  session.role = employee.role
  session.isLoggedIn = true
  await session.save()

  return NextResponse.json({ ok: true, employee: { id: employee.id, name: employee.name, role: employee.role } })
}
