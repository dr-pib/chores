import { isSupervisorRole } from '@/lib/roles'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

// One-shot endpoint: sets due_offset_hours=1 and lock_offset_hours=31 on every chore template.
// Safe to call multiple times. Dom/Admin/Supervisor only.
export async function POST() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSupervisorRole(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await prisma.choreTemplate.updateMany({
    data: { due_offset_hours: 1, lock_offset_hours: 31 },
  })

  return NextResponse.json({ updated: result.count })
}
