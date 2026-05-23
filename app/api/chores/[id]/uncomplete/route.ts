import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/chores/[id]/uncomplete'>) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const chore = await prisma.chore.findUnique({ where: { id: Number(id) } })
  if (!chore) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (chore.status !== 'completed') return NextResponse.json({ error: 'Chore is not completed' }, { status: 400 })

  const updated = await prisma.chore.update({
    where: { id: Number(id) },
    data: { status: 'pending', completed_at: null, completed_by_id: null },
    include: { chore_template: true },
  })

  return NextResponse.json(updated)
}
