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
  const canDelete = log.primary_employee_id === session.userId || ['Dom', 'Admin', 'Supervisor'].includes(session.role)
  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.operationsLog.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
