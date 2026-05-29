import { prisma } from '@/lib/db'
import { chicago0800 } from '@/lib/dates'
import { isForfeitable } from '@/lib/lifecycle'

const ELIGIBLE_UNIT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 20]

// Called on first login after 5am. Generates today's Truck Check SW if missing,
// and transitions any forfeitable SW past its lock window to 'missed'.
// Both operations are idempotent — safe to call concurrently or repeatedly.
export async function ensureDailySW(serviceDate: Date): Promise<void> {
  const chicagoHour = parseInt(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Chicago' }).slice(0, 2)
  )
  if (chicagoHour < 5) return

  // Run both in parallel — independent operations
  await Promise.all([
    generateTruckCheckSW(serviceDate),
    markMissedForfeitable(),
  ])
}

async function generateTruckCheckSW(serviceDate: Date): Promise<void> {
  const existing = await prisma.scheduledWork.count({
    where: { work_date: serviceDate, chore_template: { name: 'Truck Check' } },
  })
  if (existing > 0) return

  const [template, units] = await Promise.all([
    prisma.choreTemplate.findFirst({ where: { name: 'Truck Check' } }),
    prisma.unit.findMany({
      where: { unit_number: { in: ELIGIBLE_UNIT_NUMBERS } },
      select: { id: true },
    }),
  ])
  if (!template) return

  const due_at = chicago0800(serviceDate)
  await prisma.scheduledWork.createMany({
    data: units.map(unit => ({
      chore_template_id: template.id,
      unit_id: unit.id,
      narc_box_id: null,
      asset_type: 'unit',
      asset_key: String(unit.id),
      work_date: serviceDate,
      due_at,
      status: 'pending',
    })),
    skipDuplicates: true,
  })
}

async function markMissedForfeitable(): Promise<void> {
  const now = new Date()
  const pending = await prisma.scheduledWork.findMany({
    where: { status: 'pending', chore_template: { lifecycle: 'forfeitable' } },
    include: {
      chore_template: true,
      claimed_by_log: { select: { actual_start: true } },
    },
  })

  const missIds = pending
    .filter(sw => {
      if (!isForfeitable(sw.chore_template)) return false
      const lockH = sw.chore_template.lock_offset_hours ?? 31
      const anchor = sw.claimed_by_log?.actual_start ?? sw.work_date
      return new Date(anchor.getTime() + lockH * 3_600_000) < now
    })
    .map(sw => sw.id)

  if (missIds.length === 0) return
  await prisma.scheduledWork.updateMany({
    where: { id: { in: missIds } },
    data: { status: 'missed' },
  })
}
