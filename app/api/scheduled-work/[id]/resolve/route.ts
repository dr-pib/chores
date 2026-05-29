import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { isSupervisorRole } from '@/lib/roles'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isSupervisorRole(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: idStr } = await params
  const id = parseInt(idStr)
  const body = await request.json()
  const { action, note } = body // action: 'complete' | 'not_applicable'

  if (!['complete', 'not_applicable'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const sw = await prisma.scheduledWork.findUnique({
    where: { id },
    include: { chore_template: true }
  })

  if (!sw) {
    return NextResponse.json({ error: 'Scheduled work not found' }, { status: 404 })
  }

  const now = new Date()
  const previousStatus = sw.status

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSw = await tx.scheduledWork.update({
      where: { id },
      data: {
        status: action === 'complete' ? 'complete' : 'not_applicable',
        resolution_note: note || null,
        completed_at: action === 'complete' ? now : null,
        completed_by_id: action === 'complete' ? session.userId : null,
      }
    })

    await tx.changeLog.create({
      data: {
        scheduled_work_id: id,
        changed_by_employee_id: session.userId,
        action: action === 'complete' ? 'supervisor_complete' : 'supervisor_mark_na',
        previous_status: previousStatus,
        new_status: updatedSw.status,
      }
    })

    return updatedSw
  })

  return NextResponse.json(updated)
}
