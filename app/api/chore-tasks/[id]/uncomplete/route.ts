import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const choreTask = await prisma.choreTask.findUnique({
    where: { id: Number(id) },
    select: { id: true, chore_id: true },
  })
  if (!choreTask) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.choreTask.update({
    where: { id: Number(id) },
    data: { completed_at: null, completed_by_id: null },
  })

  // Revert parent chore to pending if it was auto-completed
  await prisma.chore.update({
    where: { id: choreTask.chore_id, status: 'completed' },
    data: { status: 'pending', completed_at: null, completed_by_id: null },
  }).catch(() => {/* already pending */})

  return NextResponse.json({ ok: true })
}
