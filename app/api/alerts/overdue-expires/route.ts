import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

import { isSupervisorRole } from '@/lib/roles'
const EXPIRE_TEMPLATE_NAMES = ['Monthly Expires', 'Quarterly Expires', 'NARC Expires'] as const
const DISPLAY_NAMES: Record<(typeof EXPIRE_TEMPLATE_NAMES)[number], string> = {
  'Monthly Expires': 'MONTHLY EXPIRES',
  'Quarterly Expires': 'QUARTERLY EXPIRES',
  'NARC Expires': 'NARC EXPIRES',
}

function formatList(values: string[]) {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn || !isSupervisorRole(session.role)) {
    return NextResponse.json({ hasAlert: false, categories: [], text: '' })
  }

  const now = new Date()
  const [chores, unassignedSw] = await Promise.all([
    prisma.chore.findMany({
      where: {
        status: 'pending',
        chore_template: {
          lifecycle: 'persistent',
          name: { in: [...EXPIRE_TEMPLATE_NAMES] },
        },
        OR: [
          { due_at: { lt: now } },
          { operations_log: { actual_end: { lt: now } } },
        ],
      },
      select: {
        chore_template: { select: { name: true } },
        unit: { select: { unit_number: true } },
        operations_log: {
          select: {
            primary_unit: { select: { unit_number: true } },
            bays: {
              where: { unit_status: 'unit_present', unit_id: { not: null } },
              select: { unit: { select: { unit_number: true } } },
            },
          },
        },
      },
    }),
    // Unclaimed pending persistent SW past due — no shift has claimed this work yet
    prisma.scheduledWork.findMany({
      where: {
        status: 'pending',
        claimed_by_log_id: null,
        due_at: { lt: now },
        chore_template: {
          lifecycle: 'persistent',
          is_critical: true,
          name: { in: [...EXPIRE_TEMPLATE_NAMES] },
        },
      },
      select: {
        chore_template: { select: { name: true } },
        unit: { select: { unit_number: true } },
        narc_box: { select: { letter: true } },
      },
    }),
  ])

  const grouped = new Map<string, Set<number | string>>()

  for (const chore of chores) {
    const templateName = chore.chore_template.name as (typeof EXPIRE_TEMPLATE_NAMES)[number]
    if (!EXPIRE_TEMPLATE_NAMES.includes(templateName)) continue
    if (!grouped.has(templateName)) grouped.set(templateName, new Set())
    const unitNumbers = chore.unit
      ? [chore.unit.unit_number]
      : chore.operations_log.bays.map(bay => bay.unit?.unit_number).filter((n): n is number => n != null)
    const fallbackUnitNumbers = unitNumbers.length > 0
      ? unitNumbers
      : chore.operations_log.primary_unit
        ? [chore.operations_log.primary_unit.unit_number]
        : ['Unassigned']
    for (const unitNumber of fallbackUnitNumbers) grouped.get(templateName)!.add(unitNumber)
  }

  // Merge unassigned SW — truck scope adds unit number, narc_box scope adds "Box X"
  for (const sw of unassignedSw) {
    const templateName = sw.chore_template.name as (typeof EXPIRE_TEMPLATE_NAMES)[number]
    if (!EXPIRE_TEMPLATE_NAMES.includes(templateName)) continue
    if (!grouped.has(templateName)) grouped.set(templateName, new Set())
    if (sw.unit) {
      grouped.get(templateName)!.add(sw.unit.unit_number)
    } else if (sw.narc_box) {
      grouped.get(templateName)!.add(`Box ${sw.narc_box.letter}`)
    } else {
      grouped.get(templateName)!.add('Unassigned')
    }
  }

  const categories = EXPIRE_TEMPLATE_NAMES
    .map(name => {
      const unitSet = grouped.get(name)
      if (!unitSet || unitSet.size === 0) return null
      const units = [...unitSet].sort((a, b) => {
        if (a === 'Unassigned') return 1
        if (b === 'Unassigned') return -1
        if (typeof a === 'number' && typeof b === 'number') return a - b
        if (typeof a === 'number') return -1
        if (typeof b === 'number') return 1
        return String(a).localeCompare(String(b))
      })
      return { name: DISPLAY_NAMES[name], units }
    })
    .filter((category): category is { name: string; units: (number | string)[] } => category !== null)

  const text = categories.length > 0
    ? `Overdue: ${categories
        .map(category => `${category.name}: Unit(s) ${formatList(category.units.map(String))}`)
        .join(' | ')}.`
    : ''

  return NextResponse.json({
    hasAlert: categories.length > 0,
    categories,
    text,
  })
}
