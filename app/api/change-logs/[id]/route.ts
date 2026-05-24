import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'Dom') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  await prisma.changeLog.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
