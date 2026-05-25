import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { shouldGenerateScheduledChore } from '@/lib/chore-rotation'
import { isSupervisorRole } from '@/lib/roles'
import { resolvePresentTruckTargets, resolvePrimaryUnitTarget, targetKey } from '@/lib/chore-targeting'
import { buildChoreRows, type ChoreCreateManyData } from '@/lib/chore-generation'

export async function POST() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSupervisorRole(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()

  const [activeLogs, templates] = await Promise.all([
    prisma.operationsLog.findMany({
      where: { actual_end: { gt: now } },
      select: {
        id: true,
        actual_start: true,
        actual_end: true,
        service_date: true,
        primary_unit_id: true,
        bays: {
          where: { unit_status: 'unit_present', unit_id: { not: null } },
          select: { bay_label: true, unit_id: true, unit_status: true },
        },
        chores: { select: { chore_template_id: true, chore_date: true, unit_id: true } },
      },
    }),
    prisma.choreTemplate.findMany(),
  ])

  let created = 0

  for (const log of activeLogs) {
    const choreDates = [log.service_date]
    const span = log.actual_end.getTime() - log.actual_start.getTime()
    if (span >= 48 * 3600 * 1000) {
      choreDates.push(new Date(log.service_date.getTime() + 24 * 3600 * 1000))
    }

    // Dedup key: template + chore_date + unit_id — matches targetKey format
    const existingKeys = new Set(
      log.chores.map(c => `${c.chore_template_id}-${c.chore_date?.getTime() ?? 0}-${c.unit_id ?? 'shift'}`)
    )

    const truckTargets = resolvePresentTruckTargets(log.bays)
    const narcTargets = resolvePrimaryUnitTarget(log.primary_unit_id)

    for (const choreDate of choreDates) {
      const day2 = choreDate.getTime() !== log.service_date.getTime()
      const dayOffsetMs = day2 ? 24 * 3600 * 1000 : 0

      // Scheduled persistent chores only (NARC, Monthly, Quarterly Expires).
      // Truck Check and station rotation are not backfilled here.
      const applicable = templates.filter(t =>
        t.lifecycle_type === 'persistent_until_complete'
        && t.name !== 'Additional Chore'
        && shouldGenerateScheduledChore(t.name, choreDate)
      )
      const narcTemplates = applicable.filter(t => t.name === 'NARC Expires')
      const nonNarcTemplates = applicable.filter(t => t.name !== 'NARC Expires')

      const toCreate: ChoreCreateManyData[] = [
        // Monthly/Quarterly: one per present truck
        ...buildChoreRows(nonNarcTemplates, truckTargets, choreDate, log.actual_start, dayOffsetMs),
        // NARC: primary unit only — separate target group, never merged with above
        ...buildChoreRows(narcTemplates, narcTargets, choreDate, log.actual_start, dayOffsetMs),
      ]
        .filter(row => !existingKeys.has(targetKey(row.chore_template_id, row.chore_date, row)))
        .map(row => ({ ...row, operations_log_id: log.id }))

      if (toCreate.length > 0) {
        await prisma.chore.createMany({ data: toCreate })
        created += toCreate.length
      }
    }
  }

  return NextResponse.json({ created, logs: activeLogs.length })
}
