import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { isPersistent, isForfeitable } from '@/lib/lifecycle'

type BadgeColor = 'blue' | 'amber' | 'red' | null
type ActiveBadgeColor = Exclude<BadgeColor, null>

function getChicagoServiceDate() {
  const today = new Date()
  return new Date(
    today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) + 'T00:00:00Z'
  )
}

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({
      chores: [],
      hasActiveShift: false,
    })
  }

  const serviceDate = getChicagoServiceDate()
  const now = new Date()

  const everyonePersistentCount = await prisma.chore.count({
    where: {
      status: 'pending',
      chore_template: { lifecycle: 'persistent' },
      operations_log: { actual_end: { lt: now } },
    },
  })

  const myLog = await prisma.operationsLog.findFirst({
    where: {
      actual_end: { gt: now },
      OR: [
        { primary_employee_id: session.userId },
        { partner_employee_id: session.userId },
      ],
    },
    include: {
      bays: true,
      chores: { include: { chore_template: true } },
    },
    orderBy: [{ service_date: 'desc' }, { created_at: 'desc' }],
  })

  let myOverdueCount = 0
  let myCurrentCount = 0

  if (myLog) {
    const currentUnitIds = myLog.bays
      .filter(bay => bay.unit_status === 'unit_present' && bay.unit_id !== null)
      .map(bay => bay.unit_id!)

    const currentPersistentCount = myLog.chores.filter(chore =>
      chore.status === 'pending'
      && isPersistent(chore.chore_template)
    ).length

    // Daily chores that are actionable right now: date has passed and not yet locked
    const pendingDailyChores = myLog.chores.filter(chore => {
      if (chore.status !== 'pending') return false
      if (!isForfeitable(chore.chore_template)) return false
      if (chore.chore_date && chore.chore_date.getTime() > serviceDate.getTime()) return false
      if (chore.chore_date) {
        const lockHours = chore.chore_template.lock_offset_hours ?? 31
        const lockAfter = new Date(chore.chore_date.getTime() + lockHours * 3600 * 1000)
        if (now > lockAfter) return false
      }
      return true
    })

    // Exclude truck checks already completed by another crew for the same unit
    const pendingTruckChecks = pendingDailyChores.filter(
      c => c.chore_template.name === 'Truck Check' && c.unit_id && c.chore_date
    )
    let completedElsewhereCount = 0
    if (pendingTruckChecks.length > 0) {
      const uniqueUnitIds = [...new Set(pendingTruckChecks.map(c => c.unit_id!))]
      const uniqueDates = [...new Set(pendingTruckChecks.map(c => c.chore_date!.getTime()))].map(t => new Date(t))
      const otherCompleted = await prisma.chore.findMany({
        where: {
          operations_log_id: { not: myLog.id },
          chore_template: { name: 'Truck Check' },
          unit_id: { in: uniqueUnitIds },
          status: 'completed',
          chore_date: { in: uniqueDates },
        },
        select: { unit_id: true, chore_date: true },
      })
      for (const tc of pendingTruckChecks) {
        const match = otherCompleted.find(
          o => o.unit_id === tc.unit_id && o.chore_date?.getTime() === tc.chore_date!.getTime()
        )
        if (match) completedElsewhereCount++
      }
    }

    myOverdueCount = await prisma.chore.count({
      where: {
        status: 'pending',
        chore_template: { lifecycle: 'persistent' },
        operations_log: { actual_end: { lt: now } },
        OR: currentUnitIds.length > 0
          ? [
              { unit_id: { in: currentUnitIds } },
              { unit_id: null, operations_log: { bays: { some: { unit_id: { in: currentUnitIds } } } } },
              { unit_id: null, operations_log: { shift_profile_id: myLog.shift_profile_id } },
            ]
          : [
              { unit_id: null, operations_log: { shift_profile_id: myLog.shift_profile_id } },
            ],
      },
    })

    myCurrentCount = currentPersistentCount + (pendingDailyChores.length - completedElsewhereCount)
  }

  const choreBadgeCandidates: { count: number; color: ActiveBadgeColor }[] = [
    { count: myOverdueCount, color: 'red' },
    { count: myCurrentCount, color: 'blue' },
    { count: everyonePersistentCount, color: 'amber' },
  ]
  const choreBadges = choreBadgeCandidates.filter(badge => badge.count > 0)

  return NextResponse.json({
    chores: choreBadges,
    hasActiveShift: Boolean(myLog),
  })
}
