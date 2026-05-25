import { isSupervisorRole } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSupervisorRole(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { name } = await req.json()

  const lastTask = await prisma.choreTemplateTask.findFirst({
    where: { chore_template_id: Number(id) },
    orderBy: { sort_order: 'desc' },
    select: { sort_order: true },
  })
  const sort_order = (lastTask?.sort_order ?? 0) + 1

  const task = await prisma.choreTemplateTask.create({
    data: { chore_template_id: Number(id), name, sort_order },
  })
  return NextResponse.json(task, { status: 201 })
}
