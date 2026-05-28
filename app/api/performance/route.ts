import { isSupervisorRole } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { computePerformanceStats } from '@/lib/performance'


const LOG_SELECT = {
  id: true,
  service_date: true,
  actual_end: true,
  chores: {
    select: {
      status: true,
      chore_template: { select: { name: true } },
    },
  },
} as const

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const rawId = params.get('employee_id')
  const employeeId = rawId ? Number(rawId) : session.userId

  if (employeeId !== session.userId && !isSupervisorRole(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, licensure_level: true },
  })
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()
  const cutoff = new Date(now.getTime() - 60 * 24 * 3600 * 1000)

  const [logs, late_sw_60d] = await Promise.all([
    prisma.operationsLog.findMany({
      where: {
        service_date: { gte: cutoff },
        OR: [
          { primary_employee_id: employeeId },
          { partner_employee_id: employeeId },
        ],
      },
      select: LOG_SELECT,
    }),
    prisma.scheduledWork.count({
      where: {
        completed_by_id: employeeId,
        is_late_completion: true,
        completed_at: { gte: cutoff },
      },
    }),
  ])

  const isNRP = employee.licensure_level === 'NRP'
  const windows = computePerformanceStats(isNRP, logs, now)

  return NextResponse.json({ employee_id: employeeId, licensure_level: employee.licensure_level, windows, late_sw_60d })
}
