import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const choreTask = await prisma.choreTask.findUnique({
    where: { id: Number(id) },
    include: { chore: { include: { tasks: true } } },
  })
  if (!choreTask) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()
  await prisma.choreTask.update({
    where: { id: Number(id) },
    data: { completed_at: now, completed_by_id: session.userId },
  })

  // Auto-complete parent chore if all tasks are now done
  const allTasksDone = choreTask.chore.tasks.every(t => t.id === Number(id) || t.completed_at !== null)
  if (allTasksDone) {
    await prisma.chore.update({
      where: { id: choreTask.chore_id },
      data: { status: 'completed', completed_at: now, completed_by_id: session.userId },
    })
  }

  return NextResponse.json({ ok: true, parentCompleted: allTasksDone })
}
