import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']
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
  if (!session.isLoggedIn || !SUPERVISOR_ROLES.includes(session.role)) {
    return NextResponse.json({ hasAlert: false, categories: [], text: '' })
  }

  const now = new Date()
  const chores = await prisma.chore.findMany({
    where: {
      status: 'pending',
      chore_template: {
        lifecycle_type: 'persistent_until_complete',
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
    },
  })

  const grouped = new Map<string, Set<number | 'Unassigned'>>()
  for (const chore of chores) {
    const templateName = chore.chore_template.name as (typeof EXPIRE_TEMPLATE_NAMES)[number]
    if (!EXPIRE_TEMPLATE_NAMES.includes(templateName)) continue
    if (!grouped.has(templateName)) grouped.set(templateName, new Set())
    grouped.get(templateName)!.add(chore.unit?.unit_number ?? 'Unassigned')
  }

  const categories = EXPIRE_TEMPLATE_NAMES
    .map(name => {
      const unitSet = grouped.get(name)
      if (!unitSet || unitSet.size === 0) return null
      const units = [...unitSet].sort((a, b) => {
        if (a === 'Unassigned') return 1
        if (b === 'Unassigned') return -1
        return a - b
      })
      return { name: DISPLAY_NAMES[name], units }
    })
    .filter((category): category is { name: string; units: (number | 'Unassigned')[] } => category !== null)

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
