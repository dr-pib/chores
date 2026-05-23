import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import type { SetShiftInput } from '@/lib/types'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date')
  const date = dateStr ? new Date(dateStr) : new Date()
  const serviceDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const logs = await prisma.operationsLog.findMany({
    where: { service_date: serviceDate },
    include: {
      crew_post: { include: { station: true } },
      station: true,
      primary_employee: true,
      partner_employee: true,
      primary_unit: true,
      bays: { include: { unit: true }, orderBy: { sort_order: 'asc' } },
      chores: { include: { chore_template: true, unit: true, completed_by: true } },
    },
    orderBy: { created_at: 'asc' },
  })

  return NextResponse.json(logs)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: SetShiftInput = await req.json()
  const { crew_post_id, partner_employee_id, primary_unit_id, actual_start, actual_end, bays } = body

  const crewPost = await prisma.crewPost.findUnique({ where: { id: crew_post_id } })
  if (!crewPost) return NextResponse.json({ error: 'Crew post not found' }, { status: 404 })

  const startDate = new Date(actual_start)
  const serviceDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())

  // Check if this employee already has a log today for this post
  const existing = await prisma.operationsLog.findFirst({
    where: { service_date: serviceDate, crew_post_id, primary_employee_id: session.userId },
  })
  if (existing) {
    // Update instead of create
    const updated = await prisma.operationsLog.update({
      where: { id: existing.id },
      data: {
        partner_employee_id,
        primary_unit_id,
        actual_start: new Date(actual_start),
        actual_end: new Date(actual_end),
        bays: {
          deleteMany: {},
          create: bays.map((b) => ({ bay_label: b.bay_label, unit_id: b.unit_id, unit_status: b.unit_status, sort_order: b.sort_order })),
        },
      },
      include: { bays: true, chores: { include: { chore_template: true } } },
    })
    return NextResponse.json(updated)
  }

  // Get chore templates
  const templates = await prisma.choreTemplate.findMany()
  const truckCheck = templates.find((t) => t.name === 'Truck Check')!
  const dailyTemplates = templates.filter((t) => t.lifecycle_type === 'daily_reset' && t.name !== 'Truck Check')
  const persistentTemplates = templates.filter((t) => t.lifecycle_type === 'persistent_until_complete' && t.name !== 'Additional Chore')

  const startDt = new Date(actual_start)
  const endDt = new Date(actual_end)

  // Build chores
  const choresToCreate: {
    chore_template_id: number; unit_id?: number | null; bay_label?: string | null
    status: string; due_at?: Date | null
  }[] = []

  // Truck Check per unit present
  for (const bay of bays) {
    if (bay.unit_status === 'unit_present' && bay.unit_id) {
      choresToCreate.push({
        chore_template_id: truckCheck.id,
        unit_id: bay.unit_id,
        bay_label: bay.bay_label,
        status: 'pending',
        due_at: new Date(startDt.getTime() + 60 * 60 * 1000),
      })
    }
  }

  // Daily reset chores
  for (const t of dailyTemplates) {
    choresToCreate.push({ chore_template_id: t.id, status: 'pending', due_at: endDt })
  }

  // Persistent chores
  for (const t of persistentTemplates) {
    choresToCreate.push({ chore_template_id: t.id, status: 'pending', due_at: endDt })
  }

  const log = await prisma.operationsLog.create({
    data: {
      service_date: serviceDate,
      crew_post_id,
      station_id: crewPost.station_id,
      primary_employee_id: session.userId,
      partner_employee_id,
      primary_unit_id,
      actual_start: startDt,
      actual_end: endDt,
      status: 'confirmed',
      bays: { create: bays.map((b) => ({ bay_label: b.bay_label, unit_id: b.unit_id, unit_status: b.unit_status, sort_order: b.sort_order })) },
      chores: { create: choresToCreate },
    },
    include: {
      crew_post: { include: { station: true } },
      bays: { include: { unit: true } },
      chores: { include: { chore_template: true, unit: true } },
      primary_employee: true,
      partner_employee: true,
      primary_unit: true,
    },
  })

  return NextResponse.json(log, { status: 201 })
}
