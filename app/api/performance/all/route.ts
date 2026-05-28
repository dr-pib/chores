import { isSupervisorRole } from '@/lib/roles'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { computePerformanceStats, choreStats } from '@/lib/performance'


export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSupervisorRole(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const cutoff = new Date(now.getTime() - 60 * 24 * 3600 * 1000)

  const employees = await prisma.employee.findMany({
    where: { status: { not: 'Inactive' } },
    select: { id: true, name: true, licensure_level: true, role: true, status: true },
    orderBy: { name: 'asc' },
  })

  const employeeIds = employees.map(e => e.id)

  const [logs, lateSw] = await Promise.all([
    prisma.operationsLog.findMany({
      where: {
        service_date: { gte: cutoff },
        OR: [
          { primary_employee_id: { in: employeeIds } },
          { partner_employee_id: { in: employeeIds } },
        ],
      },
      select: {
        id: true,
        service_date: true,
        actual_start: true,
        actual_end: true,
        primary_employee_id: true,
        partner_employee_id: true,
        chores: {
          select: {
            status: true,
            chore_template: { select: { name: true } },
          },
        },
      },
    }),
    prisma.scheduledWork.findMany({
      where: {
        completed_by_id: { in: employeeIds },
        is_late_completion: true,
        completed_at: { gte: cutoff },
      },
      select: { completed_by_id: true },
    }),
  ])

  const lateSwByEmployee = new Map<number, number>()
  for (const sw of lateSw) {
    if (sw.completed_by_id == null) continue
    lateSwByEmployee.set(sw.completed_by_id, (lateSwByEmployee.get(sw.completed_by_id) ?? 0) + 1)
  }

  const results = employees.map(emp => {
    const empLogs = logs.filter(
      l => l.primary_employee_id === emp.id || l.partner_employee_id === emp.id
    )
    const isNRP = emp.licensure_level === 'NRP'
    const windows = computePerformanceStats(isNRP, empLogs, now)
    const activeLog = empLogs.find(
      l => l.actual_start.getTime() <= now.getTime() && l.actual_end.getTime() > now.getTime()
    )
    const nowData = activeLog ? choreStats(activeLog.chores, isNRP) : null
    const late_sw_60d = lateSwByEmployee.get(emp.id) ?? 0
    return { employee_id: emp.id, name: emp.name, licensure_level: emp.licensure_level, role: emp.role, status: emp.status, windows, now: nowData, late_sw_60d }
  })

  return NextResponse.json(results)
}
