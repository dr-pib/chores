import { prisma } from '@/lib/db'
import type { MakeupCounts } from '@/lib/performance'

// A "make-up" is a persistent chore an employee personally completed on a shift
// they were NOT crew on (carried-forward work done for another crew). It credits
// the completer's "overall" performance (numerator + denominator) without moving
// the original crew's miss. See CRITICAL_FEATURES.md #1.
//
// Counts are returned per 30d / 60d window, keyed by employee id. NARC Expires
// only count toward NRP employees, matching the performance denominator rule.
export async function makeupCountsForEmployees(
  employeeIds: number[],
  isNRPById: Map<number, boolean>,
  now: Date = new Date(),
): Promise<Map<number, MakeupCounts>> {
  const result = new Map<number, MakeupCounts>()
  if (employeeIds.length === 0) return result

  const cutoff60 = new Date(now.getTime() - 60 * 24 * 3600 * 1000)
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000)

  const rows = await prisma.chore.findMany({
    where: {
      status: 'completed',
      completed_by_id: { in: employeeIds },
      completed_at: { gte: cutoff60 },
      chore_template: { lifecycle: 'persistent' },
    },
    select: {
      completed_by_id: true,
      completed_at: true,
      chore_template: { select: { name: true } },
      operations_log: { select: { primary_employee_id: true, partner_employee_id: true } },
    },
  })

  for (const row of rows) {
    const empId = row.completed_by_id
    if (empId == null) continue
    // Only work done for ANOTHER crew counts as a make-up.
    if (empId === row.operations_log.primary_employee_id) continue
    if (empId === row.operations_log.partner_employee_id) continue
    // NARC Expires only count for NRP employees.
    if (row.chore_template.name === 'NARC Expires' && !isNRPById.get(empId)) continue

    const counts = result.get(empId) ?? { d30: 0, d60: 0 }
    counts.d60 += 1
    if (row.completed_at && row.completed_at.getTime() >= cutoff30.getTime()) counts.d30 += 1
    result.set(empId, counts)
  }

  return result
}

// Convenience for a single employee.
export async function makeupCountsForEmployee(
  employeeId: number,
  isNRP: boolean,
  now: Date = new Date(),
): Promise<MakeupCounts> {
  const map = await makeupCountsForEmployees([employeeId], new Map([[employeeId, isNRP]]), now)
  return map.get(employeeId) ?? { d30: 0, d60: 0 }
}
