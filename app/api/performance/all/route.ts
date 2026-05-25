import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { computePerformanceStats } from '@/lib/performance'

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!SUPERVISOR_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const cutoff = new Date(now.getTime() - 60 * 24 * 3600 * 1000)

  const employees = await prisma.employee.findMany({
    where: { status: { not: 'Inactive' } },
    select: { id: true, name: true, licensure_level: true, role: true, status: true },
    orderBy: { name: 'asc' },
  })

  const employeeIds = employees.map(e => e.id)

  const logs = await prisma.operationsLog.findMany({
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
  })

  const results = employees.map(emp => {
    const empLogs = logs.filter(
      l => l.primary_employee_id === emp.id || l.partner_employee_id === emp.id
    )
    const isNRP = emp.licensure_level === 'NRP'
    const windows = computePerformanceStats(isNRP, empLogs, now)
    return { employee_id: emp.id, name: emp.name, licensure_level: emp.licensure_level, role: emp.role, status: emp.status, windows }
  })

  return NextResponse.json(results)
}
