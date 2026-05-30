import { isSupervisorRole } from '@/lib/roles'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(_req: Request, ctx: RouteContext<'/api/operations-logs/[id]'>) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const log = await prisma.operationsLog.findUnique({
    where: { id: Number(id) },
    include: {
      shift_profile: { include: { station: true } },
      station: true,
      primary_employee: true,
      partner_employee: true,
      primary_unit: true,
      bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
      chores: { include: { chore_template: true, unit: true, completed_by: true }, orderBy: { due_at: 'asc' } },
    },
  })

  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(log)
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/operations-logs/[id]'>) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const log = await prisma.operationsLog.findUnique({ where: { id: Number(id) } })
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only the primary employee or Dom/Admin/Supervisor can delete
  const canDelete = log.primary_employee_id === session.userId || isSupervisorRole(session.role)
  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const logId = Number(id)

  // Deleting a shift purges ALL of its data. Chores and bays cascade via the
  // schema. ScheduledWork claimed by this shift and ChangeLog rows tied to the
  // shift/its chores/its claimed work only SetNull on delete, so remove them
  // explicitly — otherwise unclaimed ScheduledWork resurfaces as "unassigned"
  // and orphaned change-log rows linger. (Simple full purge for now.)
  await prisma.$transaction(async (tx) => {
    const chores = await tx.chore.findMany({
      where: { operations_log_id: logId },
      select: { id: true },
    })
    const choreIds = chores.map((c) => c.id)

    // Pending claimed work is still genuinely needed: revert it to unassigned
    // so supervisors still see it. Completed/resolved claimed work goes away
    // with the shift (completions/performance are erased on purpose).
    await tx.scheduledWork.updateMany({
      where: { claimed_by_log_id: logId, status: 'pending' },
      data: { claimed_by_log_id: null, claimed_at: null },
    })
    const swToDelete = await tx.scheduledWork.findMany({
      where: { claimed_by_log_id: logId },
      select: { id: true },
    })
    const swIds = swToDelete.map((s) => s.id)

    const changeLogOr = [
      { operations_log_id: logId },
      ...(choreIds.length ? [{ chore_id: { in: choreIds } }] : []),
      ...(swIds.length ? [{ scheduled_work_id: { in: swIds } }] : []),
    ]
    await tx.changeLog.deleteMany({ where: { OR: changeLogOr } })
    await tx.scheduledWork.deleteMany({ where: { claimed_by_log_id: logId } })
    await tx.operationsLog.delete({ where: { id: logId } })
  })

  return NextResponse.json({ ok: true })
}
