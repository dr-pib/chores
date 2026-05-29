import { prisma } from '@/lib/db'
import { chicago0800 } from '@/lib/dates'

const ELIGIBLE_UNIT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 20]

// Called on first supervisor page load after 5am Chicago time.
// Generates Truck Check ScheduledWork for all eligible units if none exist yet for serviceDate.
// skipDuplicates makes this safe to call concurrently or repeatedly.
export async function ensureDailySW(serviceDate: Date): Promise<void> {
  const chicagoHour = parseInt(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Chicago' }).slice(0, 2)
  )
  if (chicagoHour < 5) return

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
