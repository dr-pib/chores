import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { isForfeitable } from '@/lib/lifecycle'

function chicagoMidnight(d: Date): Date {
  for (const h of [5, 6]) {
    const candidate = new Date(d.getTime() + h * 3600 * 1000)
    const hhmm = candidate.toLocaleString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'America/Chicago',
    })
    if (hhmm.startsWith('00:')) return candidate
  }
  return new Date(d.getTime() + 5 * 3600 * 1000)
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const choreTask = await prisma.choreTask.findUnique({
    where: { id: Number(id) },
    include: {
      chore: {
        include: {
          tasks: true,
          chore_template: true,
          operations_log: { select: { service_date: true } },
        },
      },
    },
  })
  if (!choreTask) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Daily chores: enforce the same availability window as the parent chore route
  if (isForfeitable(choreTask.chore.chore_template)) {
    const choreDay = new Date(choreTask.chore.chore_date ?? choreTask.chore.operations_log.service_date)
    const now = new Date()
    if (now < chicagoMidnight(choreDay)) {
      return NextResponse.json(
        { error: 'These chores are not available until midnight' },
        { status: 403 },
      )
    }
    const lockHours = choreTask.chore.chore_template.lock_offset_hours ?? 31
    if (now > new Date(choreDay.getTime() + lockHours * 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Daily chores lock at 2:00 AM — ask a supervisor to mark this complete' },
        { status: 403 },
      )
    }
  }

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
