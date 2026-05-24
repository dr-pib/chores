import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

type BadgeColor = 'blue' | 'amber' | 'red' | null

function getChicagoServiceDate() {
  const today = new Date()
  return new Date(
    today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) + 'T00:00:00Z'
  )
}

function nextServiceDate(serviceDate: Date) {
  return new Date(serviceDate.getTime() + 24 * 3600 * 1000)
}

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return NextResponse.json({
      myChores: { count: 0, color: null as BadgeColor },
      everyoneChores: { count: 0, color: null as BadgeColor },
    })
  }

  const serviceDate = getChicagoServiceDate()
  const nextDate = nextServiceDate(serviceDate)
  const now = new Date()

  const everyonePersistentCount = await prisma.chore.count({
    where: {
      status: 'pending',
      chore_template: { lifecycle_type: 'persistent_until_complete' },
      operations_log: { actual_end: { lt: now } },
    },
  })

  const myLog = await prisma.operationsLog.findFirst({
    where: {
      actual_start: { lt: nextDate },
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
    orderBy: { created_at: 'desc' },
  })

  let myCount = 0
  let myColor: BadgeColor = null

  if (myLog) {
    const currentUnitIds = myLog.bays
      .filter(bay => bay.unit_status === 'unit_present' && bay.unit_id !== null)
      .map(bay => bay.unit_id!)

    const dayOneDailyCount = myLog.chores.filter(chore =>
      chore.status === 'pending'
      && chore.chore_template.lifecycle_type === 'daily_reset'
      && (!chore.chore_date || chore.chore_date.getTime() <= serviceDate.getTime())
    ).length

    const currentPersistentCount = myLog.chores.filter(chore =>
      chore.status === 'pending'
      && chore.chore_template.lifecycle_type === 'persistent_until_complete'
      && (!chore.chore_date || chore.chore_date.getTime() <= serviceDate.getTime())
    ).length

    const previousPersistentCount = await prisma.chore.count({
      where: {
        status: 'pending',
        chore_template: { lifecycle_type: 'persistent_until_complete' },
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

    myCount = previousPersistentCount + currentPersistentCount + dayOneDailyCount
    myColor = previousPersistentCount > 0
      ? 'red'
      : currentPersistentCount > 0
        ? 'amber'
        : dayOneDailyCount > 0
          ? 'blue'
          : null
  }

  return NextResponse.json({
    myChores: { count: myCount, color: myColor },
    everyoneChores: {
      count: everyonePersistentCount,
      color: everyonePersistentCount > 0 ? 'red' as BadgeColor : null,
    },
  })
}
