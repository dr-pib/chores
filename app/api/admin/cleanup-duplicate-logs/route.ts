import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { isSupervisorRole } from '@/lib/roles'

export async function POST() {
  const session = await getSession()
  if (!session.isLoggedIn || !isSupervisorRole(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Find all currently active logs (shift not yet ended)
  const activeLogs = await prisma.operationsLog.findMany({
    where: { actual_end: { gt: now } },
    include: {
      chores: { where: { status: 'completed' }, select: { id: true } },
    },
    orderBy: { created_at: 'asc' },
  })

  // Group by employee (primary or partner)
  const byEmployee = new Map<number, typeof activeLogs>()
  for (const log of activeLogs) {
    for (const empId of [log.primary_employee_id, log.partner_employee_id].filter(Boolean) as number[]) {
      if (!byEmployee.has(empId)) byEmployee.set(empId, [])
      byEmployee.get(empId)!.push(log)
    }
  }

  let deleted = 0
  let skipped = 0
  const skippedDetails: string[] = []

  for (const [, logs] of byEmployee) {
    if (logs.length <= 1) continue

    // Sort oldest first; keep the most recently created (last in array)
    const sorted = [...logs].sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
    const extras = sorted.slice(0, -1)

    for (const extra of extras) {
      if (extra.chores.length > 0) {
        skipped++
        skippedDetails.push(`Log ${extra.id} (service_date ${extra.service_date.toISOString().slice(0, 10)}) has ${extra.chores.length} completed chore(s) — not deleted`)
        continue
      }
      // Safe to delete: no completed chores
      await prisma.operationsLog.delete({ where: { id: extra.id } })
      deleted++
    }
  }

  return NextResponse.json({ deleted, skipped, skippedDetails })
}
