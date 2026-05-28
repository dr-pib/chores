import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { isSupervisorRole } from '@/lib/roles'
import { isPersistent } from '@/lib/lifecycle'
import { shouldGenerateScheduledChore } from '@/lib/chore-rotation'

const ELIGIBLE_UNIT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 20]

// Returns the UTC Date representing 08:00 America/Chicago on the given work_date.
// workDate is expected to be midnight UTC for the Chicago calendar date.
function chicago0800(workDate: Date): Date {
  for (const tzOffsetH of [5, 6]) {
    const candidateMidnight = new Date(workDate.getTime() + tzOffsetH * 3_600_000)
    const hhmm = candidateMidnight.toLocaleString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'America/Chicago',
    })
    if (hhmm.startsWith('00:')) {
      return new Date(candidateMidnight.getTime() + 8 * 3_600_000)
    }
  }
  return new Date(workDate.getTime() + 13 * 3_600_000) // CDT fallback
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSupervisorRole(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { start_date?: string; end_date?: string }

  // Default to today in Chicago time
  const todayChicago = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const startDate = new Date((body.start_date ?? todayChicago) + 'T00:00:00.000Z')
  const endDate = new Date((body.end_date ?? body.start_date ?? todayChicago) + 'T00:00:00.000Z')

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  // Collect all calendar dates in range (midnight UTC each)
  const dates: Date[] = []
  const cur = new Date(startDate)
  while (cur <= endDate) {
    dates.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  const [templates, units, narcBoxes] = await Promise.all([
    prisma.choreTemplate.findMany({ where: { generates_independently: true } }),
    prisma.unit.findMany({
      where: { unit_number: { in: ELIGIBLE_UNIT_NUMBERS } },
      select: { id: true, unit_number: true },
    }),
    prisma.narcBox.findMany({ select: { id: true, letter: true } }),
  ])

  // Only persistent independently-generated templates produce ScheduledWork rows.
  // Truck Check is generates_independently but forfeitable — excluded here.
  const eligibleTemplates = templates.filter(isPersistent)

  const toCreate: {
    chore_template_id: number
    unit_id: number | null
    narc_box_id: number | null
    asset_type: string
    asset_key: string
    work_date: Date
    due_at: Date
    status: string
  }[] = []

  for (const date of dates) {
    const due_at = chicago0800(date)
    for (const template of eligibleTemplates) {
      if (!shouldGenerateScheduledChore(template.name, date)) continue

      if (template.asset_scope === 'truck') {
        for (const unit of units) {
          toCreate.push({
            chore_template_id: template.id,
            unit_id: unit.id,
            narc_box_id: null,
            asset_type: 'unit',
            asset_key: String(unit.id),
            work_date: date,
            due_at,
            status: 'pending',
          })
        }
      } else if (template.asset_scope === 'narc_box') {
        for (const narcBox of narcBoxes) {
          toCreate.push({
            chore_template_id: template.id,
            unit_id: null,
            narc_box_id: narcBox.id,
            asset_type: 'narc_box',
            asset_key: String(narcBox.id),
            work_date: date,
            due_at,
            status: 'pending',
          })
        }
      }
    }
  }

  if (toCreate.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, dates: dates.length })
  }

  const result = await prisma.scheduledWork.createMany({
    data: toCreate,
    skipDuplicates: true,
  })

  return NextResponse.json({
    created: result.count,
    skipped: toCreate.length - result.count,
    dates: dates.length,
  })
}
