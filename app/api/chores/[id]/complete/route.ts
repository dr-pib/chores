import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/chores/[id]/complete'>) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const chore = await prisma.chore.findUnique({ where: { id: Number(id) } })
  if (!chore) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Truck Check duplicate check (same unit + same service date)
  if (chore.unit_id) {
    const template = await prisma.choreTemplate.findUnique({ where: { id: chore.chore_template_id } })
    if (template?.name === 'Truck Check') {
      const log = await prisma.operationsLog.findUnique({ where: { id: chore.operations_log_id } })
      if (log) {
        const duplicate = await prisma.chore.findFirst({
          where: {
            id: { not: chore.id },
            unit_id: chore.unit_id,
            status: 'completed',
            operations_log: { service_date: log.service_date },
          },
          include: { operations_log: true },
        })
        if (duplicate && !['Dom', 'Admin', 'Supervisor'].includes(session.role)) {
          return NextResponse.json({ error: 'Truck Check already completed for this unit today', duplicate_id: duplicate.id }, { status: 409 })
        }
      }
    }
  }

  const updated = await prisma.chore.update({
    where: { id: Number(id) },
    data: { status: 'completed', completed_at: new Date(), completed_by_id: session.userId },
    include: { chore_template: true, completed_by: true },
  })

  return NextResponse.json(updated)
}
