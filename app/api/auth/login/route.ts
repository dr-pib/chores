import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const { email_username, emt_number } = await req.json()

  if (!email_username || !emt_number) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
  }

  const employee = await prisma.employee.findFirst({
    where: { email_username: email_username.toLowerCase().trim(), emt_number: emt_number.trim() },
    include: { default_post: true },
  })

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
