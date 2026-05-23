import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/operations-logs/[id]/confirm'>) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['Dom', 'Admin', 'Supervisor'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const log = await prisma.operationsLog.findUnique({ where: { id: Number(id) } })
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.operationsLog.update({
    where: { id: Number(id) },
    data: {
      supervisor_confirmed_at: new Date(),
      supervisor_confirmed_by_id: session.userId,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/operations-logs/[id]/confirm'>) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['Dom', 'Admin', 'Supervisor'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const log = await prisma.operationsLog.findUnique({ where: { id: Number(id) } })
  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.operationsLog.update({
    where: { id: Number(id) },
    data: { supervisor_confirmed_at: null, supervisor_confirmed_by_id: null },
  })

  return NextResponse.json(updated)
}
