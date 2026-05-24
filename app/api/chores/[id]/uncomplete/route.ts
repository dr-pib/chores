import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { isPastShift } from '@/lib/dates'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/chores/[id]/uncomplete'>) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const chore = await prisma.chore.findUnique({
    where: { id: Number(id) },
    include: { operations_log: { select: { service_date: true, actual_end: true, id: true } } },
  })
  if (!chore) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (chore.status !== 'completed') return NextResponse.json({ error: 'Chore is not completed' }, { status: 400 })

  const isSupervisor = SUPERVISOR_ROLES.includes(session.role)
  const serviceDate = new Date(chore.operations_log.service_date)
  const pastShift = isPastShift(serviceDate, chore.operations_log.actual_end)

  if (pastShift && !isSupervisor) {
    return NextResponse.json(
      { error: 'Past shift chores can only be edited by a supervisor' },
      { status: 403 },
    )
  }

  const updated = await prisma.chore.update({
    where: { id: Number(id) },
    data: { status: 'pending', completed_at: null, completed_by_id: null },
    include: { chore_template: true },
  })

  if (pastShift) {
    await prisma.changeLog.create({
      data: {
        operations_log_id: chore.operations_log.id,
        chore_id: chore.id,
        changed_by_employee_id: session.userId,
        action: 'uncomplete_chore',
        previous_status: 'completed',
        new_status: 'pending',
      },
    })
  }

  return NextResponse.json(updated)
}
