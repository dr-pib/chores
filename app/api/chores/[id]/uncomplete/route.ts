import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { isPastShift } from '@/lib/dates'
import { isSupervisorRole } from '@/lib/roles'

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

  const isSupervisor = isSupervisorRole(session.role)
  const serviceDate = new Date(chore.operations_log.service_date)
  const pastShift = isPastShift(serviceDate, chore.operations_log.actual_end)

  if (pastShift && !isSupervisor) {
    return NextResponse.json(
      { error: 'Past shift chores can only be edited by a supervisor' },
      { status: 403 },
    )
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedChore = await tx.chore.update({
      where: { id: Number(id) },
      data: { status: 'pending', completed_at: null, completed_by_id: null },
      include: { chore_template: true },
    })
    if (chore.scheduled_work_id) {
      const sw = await tx.scheduledWork.findUnique({
        where: { id: chore.scheduled_work_id },
        select: { is_late_completion: true },
      })
      // If this was a late completion (persistent work completed after the lock window),
      // restore to 'missed' so the miss record is preserved. Otherwise restore to 'pending'.
      await tx.scheduledWork.update({
        where: { id: chore.scheduled_work_id },
        data: {
          status: sw?.is_late_completion ? 'missed' : 'pending',
          completed_at: null,
          completed_by_id: null,
          is_late_completion: false,
        },
      })
    }
    return updatedChore
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
