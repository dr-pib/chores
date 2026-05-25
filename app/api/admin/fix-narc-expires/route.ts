import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { isSupervisorRole } from '@/lib/roles'

export async function POST() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSupervisorRole(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const narcTemplate = await prisma.choreTemplate.findFirst({ where: { name: 'NARC Expires' } })
  if (!narcTemplate) return NextResponse.json({ deleted: 0 })

  // Find all NARC Expires chores that are wrong:
  // - unit_id IS NULL (pre-Codex records with no unit)
  // - unit_id doesn't match the shift's primary_unit_id (backup/secondary trucks)
  const all = await prisma.chore.findMany({
    where: { chore_template_id: narcTemplate.id },
    select: {
      id: true,
      unit_id: true,
      operations_log: { select: { primary_unit_id: true } },
    },
  })

  const wrongIds = all
    .filter(c => c.unit_id === null || c.unit_id !== c.operations_log.primary_unit_id)
    .map(c => c.id)

  if (wrongIds.length === 0) return NextResponse.json({ deleted: 0 })

  await prisma.chore.deleteMany({ where: { id: { in: wrongIds } } })

  return NextResponse.json({ deleted: wrongIds.length })
}
