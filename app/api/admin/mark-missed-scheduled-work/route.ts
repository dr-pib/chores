import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { isSupervisorRole } from '@/lib/roles'
import { isForfeitable } from '@/lib/lifecycle'

// Transitions forfeitable ScheduledWork rows from 'pending' to 'missed' once their
// lock window has closed. The lock window is work_date (midnight UTC) + lock_offset_hours.
// This mirrors the lockAfter check in the Chore complete route.
//
// Overdue != missed: overdue means due_at has passed but the window is still open.
// Missed means the window is closed and the work can no longer be meaningfully done.

export async function POST() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSupervisorRole(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()

  const pending = await prisma.scheduledWork.findMany({
    where: { status: 'pending' },
    select: {
      id: true,
      work_date: true,
      chore_template: { select: { lifecycle: true, lock_offset_hours: true } },
    },
  })

  const missIds = pending
    .filter(sw => {
      if (!isForfeitable(sw.chore_template)) return false
      const lockHours = sw.chore_template.lock_offset_hours ?? 31
      const lockAfter = new Date(sw.work_date.getTime() + lockHours * 3_600_000)
      return now > lockAfter
    })
    .map(sw => sw.id)

  if (missIds.length === 0) return NextResponse.json({ marked: 0 })

  await prisma.scheduledWork.updateMany({
    where: { id: { in: missIds } },
    data: { status: 'missed' },
  })

  return NextResponse.json({ marked: missIds.length })
}
