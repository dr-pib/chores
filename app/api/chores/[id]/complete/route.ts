import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/chores/[id]/complete'>) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const chore = await prisma.chore.findUnique({
    where: { id: Number(id) },
    include: {
      chore_template: true,
      operations_log: { select: { service_date: true } },
    },
  })
  if (!chore) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isSupervisor = SUPERVISOR_ROLES.includes(session.role)

  // Daily chores: enforce both an early-availability and a late-lockout window
  if (chore.chore_template.lifecycle_type === 'daily_reset' && !isSupervisor) {
    const choreDay = new Date(chore.chore_date ?? chore.operations_log.service_date)
    const now = new Date()

    // Find the UTC time that is midnight Chicago time on the chore's calendar date.
    // choreDay is midnight UTC; Chicago is UTC-5 (CDT) or UTC-6 (CST), so midnight
    // Chicago = choreDay + 5h or + 6h depending on DST.
    function chicagoMidnight(d: Date): Date {
      for (const h of [5, 6]) {
        const candidate = new Date(d.getTime() + h * 3600 * 1000)
        const hhmm = candidate.toLocaleString('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: false,
          timeZone: 'America/Chicago',
        })
        if (hhmm.startsWith('00:')) return candidate
      }
      return new Date(d.getTime() + 5 * 3600 * 1000) // fallback CDT
    }

    // Can't complete before midnight Chicago time of the chore date
    if (now < chicagoMidnight(choreDay)) {
      return NextResponse.json(
        { error: 'These chores are not available until midnight' },
        { status: 403 },
      )
    }

    // Lock at 02:00 AM CDT the following day (chore date + 31h in UTC)
    const lockAfter = new Date(choreDay.getTime() + 31 * 60 * 60 * 1000)
    if (now > lockAfter) {
      return NextResponse.json(
        { error: 'Daily chores lock at 2:00 AM — ask a supervisor to mark this complete' },
        { status: 403 },
      )
    }
  }

  // Truck Check: flag if another crew already completed it for this unit today
  if (chore.unit_id && chore.chore_template.name === 'Truck Check') {
    const duplicate = await prisma.chore.findFirst({
      where: {
        id: { not: chore.id },
        unit_id: chore.unit_id,
        chore_date: chore.chore_date,
        status: 'completed',
        operations_log: { service_date: chore.operations_log.service_date },
      },
    })
    if (duplicate && !isSupervisor) {
      return NextResponse.json(
        { error: 'Truck Check already completed for this unit today', duplicate_id: duplicate.id },
        { status: 409 },
      )
    }
  }

  const updated = await prisma.chore.update({
    where: { id: Number(id) },
    data: { status: 'completed', completed_at: new Date(), completed_by_id: session.userId },
    include: { chore_template: true, completed_by: true },
  })

  return NextResponse.json(updated)
}
