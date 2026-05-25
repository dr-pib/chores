import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { shouldGenerateScheduledChore } from '@/lib/chore-rotation'

const ALLOWED_ROLES = ['Dom', 'Admin', 'Supervisor']

export async function POST() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()

  const [activeLogs, templates] = await Promise.all([
    prisma.operationsLog.findMany({
      where: { actual_end: { gt: now } },
      select: {
        id: true,
        actual_start: true,
        actual_end: true,
        service_date: true,
        bays: {
          where: { unit_status: 'unit_present', unit_id: { not: null } },
          select: { bay_label: true, unit_id: true },
        },
        chores: { select: { chore_template_id: true, chore_date: true, unit_id: true } },
      },
    }),
    prisma.choreTemplate.findMany(),
  ])

  let created = 0

  for (const log of activeLogs) {
    // Each log covers service_date (day 1) and optionally day 2 for 48h shifts
    const choreDates = [log.service_date]
    const span = log.actual_end.getTime() - log.actual_start.getTime()
    if (span >= 48 * 3600 * 1000) {
      choreDates.push(new Date(log.service_date.getTime() + 24 * 3600 * 1000))
    }

    // Track existing chores by template+date+unit to avoid duplicates.
    const existingPairs = new Set(
      log.chores.map(c => `${c.chore_template_id}-${c.chore_date?.getTime() ?? 0}-${c.unit_id ?? 'shift'}`)
    )

    for (const choreDate of choreDates) {
      const day2 = choreDate.getTime() !== log.service_date.getTime()
      const dayOffset = day2 ? 24 * 3600 * 1000 : 0

      const applicable = templates.filter(t =>
        t.lifecycle_type === 'persistent_until_complete'
        && t.name !== 'Additional Chore'
        && shouldGenerateScheduledChore(t.name, choreDate)
      )

      const toCreate = applicable
        .flatMap(t => log.bays.map(bay => ({ template: t, bay })))
        .filter(({ template, bay }) => !existingPairs.has(`${template.id}-${choreDate.getTime()}-${bay.unit_id ?? 'shift'}`))
        .map(({ template, bay }) => {
          const offsetHours = template.due_offset_hours ?? 1
          return {
            operations_log_id: log.id,
            chore_template_id: template.id,
            unit_id: bay.unit_id,
            bay_label: bay.bay_label,
            status: 'pending' as const,
            due_at: new Date(log.actual_start.getTime() + dayOffset + offsetHours * 3600 * 1000),
            chore_date: choreDate,
          }
        })

      if (toCreate.length > 0) {
        await prisma.chore.createMany({ data: toCreate })
        created += toCreate.length
      }
    }
  }

  return NextResponse.json({ created, logs: activeLogs.length })
}
