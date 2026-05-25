import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import type { SetShiftInput } from '@/lib/types'
import { getStationChoreForPost, shouldGenerateScheduledChore } from '@/lib/chore-rotation'

// Creates ChoreTask rows for any chore on this log that has template tasks but no instance tasks yet
async function seedChoreTasks(operationsLogId: number) {
  const chores = await prisma.chore.findMany({
    where: { operations_log_id: operationsLogId },
    include: {
      chore_template: { include: { tasks: { orderBy: { sort_order: 'asc' } } } },
      tasks: { select: { chore_template_task_id: true } },
    },
  })
  const toCreate: { chore_id: number; chore_template_task_id: number }[] = []
  for (const chore of chores) {
    const existingTaskIds = new Set(chore.tasks.map(t => t.chore_template_task_id))
    for (const tmplTask of chore.chore_template.tasks) {
      if (!existingTaskIds.has(tmplTask.id)) {
        toCreate.push({ chore_id: chore.id, chore_template_task_id: tmplTask.id })
      }
    }
  }
  if (toCreate.length > 0) await prisma.choreTask.createMany({ data: toCreate })
}

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
      shift_profile: { include: { station: true } },
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
  const { shift_profile_id, partner_employee_id, primary_unit_id, actual_start, actual_end, bays } = body

  const shiftProfile = await prisma.shiftProfile.findUnique({ where: { id: shift_profile_id } })
  if (!shiftProfile) return NextResponse.json({ error: 'Shift profile not found' }, { status: 404 })

  const startDt = new Date(actual_start)
  const endDt = new Date(actual_end)
  const serviceDate = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate())
  const is48h = endDt.getTime() - startDt.getTime() >= 48 * 3600 * 1000

  const templates = await prisma.choreTemplate.findMany()
  const truckCheck = templates.find((t) => t.name === 'Truck Check')!

  // Compute due_at from template's due_offset_hours (hours after shift start).
  // day2 = true adds 24h for the second day of a 48h shift.
  // Defaults to 1h when the template has no offset set.
  function templateDueAt(tmpl: { due_offset_hours: number | null }, day2 = false): Date {
    const dayOffset = day2 ? 24 * 3600 * 1000 : 0
    const offsetHours = tmpl.due_offset_hours ?? 1
    return new Date(startDt.getTime() + dayOffset + offsetHours * 3600 * 1000)
  }

  function buildTruckChecks(choreDate: Date, day2 = false) {
    return bays
      .filter((b) => b.unit_status === 'unit_present' && b.unit_id)
      .map((b) => ({
        chore_template_id: truckCheck.id,
        unit_id: b.unit_id,
        bay_label: b.bay_label,
        status: 'pending',
        due_at: templateDueAt(truckCheck, day2),
        chore_date: choreDate,
      }))
  }

  function buildScheduledUnitChores(
    scheduledTemplates: { id: number; due_offset_hours: number | null }[],
    choreDate: Date,
    day2 = false,
  ) {
    return scheduledTemplates.flatMap((t) =>
      bays
        .filter((b) => b.unit_status === 'unit_present' && b.unit_id)
        .map((b) => ({
          chore_template_id: t.id,
          unit_id: b.unit_id,
          bay_label: b.bay_label,
          status: 'pending' as const,
          due_at: templateDueAt(t, day2),
          chore_date: choreDate,
        }))
    )
  }

  const day1TruckChecks = buildTruckChecks(serviceDate)

  // Find any active shift this user is on, regardless of role
  const existing = await prisma.operationsLog.findFirst({
    where: {
      actual_end: { gt: new Date() },
      OR: [
        { primary_employee_id: session.userId },
        { partner_employee_id: session.userId },
      ],
    },
    orderBy: [{ service_date: 'desc' }, { created_at: 'desc' }],
  })
  if (existing) {
    // Update — replace all truck check chores (day 1 + day 2) to match current bays
    const day2Date = is48h ? new Date(serviceDate.getTime() + 24 * 3600 * 1000) : null
    const day2TruckChecks = day2Date ? buildTruckChecks(day2Date, true) : []

    await prisma.operationsLog.update({
      where: { id: existing.id },
      data: {
        shift_profile_id,
        station_id: shiftProfile.station_id,
        partner_employee_id,
        primary_unit_id,
        actual_start: startDt,
        actual_end: endDt,
        bays: {
          deleteMany: {},
          create: bays.map((b) => ({ bay_label: b.bay_label, unit_id: b.unit_id, unit_status: b.unit_status, sort_order: b.sort_order })),
        },
        chores: {
          deleteMany: { chore_template_id: truckCheck.id },
          create: [...day1TruckChecks, ...day2TruckChecks],
        },
      },
    })

    // Also create any Day 2 scheduled persistent chores not yet on this log
    if (day2Date) {
      const scheduledDay2 = templates.filter((t) =>
        t.lifecycle_type === 'persistent_until_complete'
        && t.name !== 'Additional Chore'
        && shouldGenerateScheduledChore(t.name, day2Date)
      )
      if (scheduledDay2.length > 0) {
        const existingInLog = await prisma.chore.findMany({
          where: {
            operations_log_id: existing.id,
            chore_template_id: { in: scheduledDay2.map((t) => t.id) },
          },
          select: { chore_template_id: true, chore_date: true, unit_id: true },
        })
        const existingKeys = new Set(existingInLog.map((c) => `${c.chore_template_id}-${c.chore_date?.getTime() ?? 0}-${c.unit_id ?? 'shift'}`))
        const toCreate = buildScheduledUnitChores(scheduledDay2, day2Date, true)
          .filter((chore) => !existingKeys.has(`${chore.chore_template_id}-${day2Date.getTime()}-${chore.unit_id ?? 'shift'}`))
          .map((chore) => ({ ...chore, operations_log_id: existing.id }))
        if (toCreate.length > 0) await prisma.chore.createMany({ data: toCreate })
      }
    }

    await seedChoreTasks(existing.id)

    const updated = await prisma.operationsLog.findUnique({
      where: { id: existing.id },
      include: { bays: true, chores: { include: { chore_template: true } } },
    })
    return NextResponse.json(updated)
  }

  // --- New shift creation ---
  const serviceMonth = serviceDate.getMonth() + 1
  const stationChoreName = getStationChoreForPost(shiftProfile.name, serviceMonth)
  const stationTemplate = stationChoreName ? templates.find((t) => t.name === stationChoreName) ?? null : null

  // All scheduled persistent chores are per-shift — each crew checks their own truck/narcs
  const scheduledPersistentTemplates = templates.filter((t) =>
    t.lifecycle_type === 'persistent_until_complete'
    && t.name !== 'Additional Chore'
    && shouldGenerateScheduledChore(t.name, serviceDate)
  )

  const choresToCreate = [
    ...day1TruckChecks,
    ...(stationTemplate ? [{ chore_template_id: stationTemplate.id, status: 'pending', due_at: templateDueAt(stationTemplate), chore_date: serviceDate }] : []),
    ...buildScheduledUnitChores(scheduledPersistentTemplates, serviceDate),
  ]

  // Day 2 chores for 48h shifts — created immediately so they're visible from the start
  if (is48h) {
    const day2Date = new Date(serviceDate.getTime() + 24 * 3600 * 1000)
    const day2TruckChecks = buildTruckChecks(day2Date, true)

    const day2StationChoreName = getStationChoreForPost(shiftProfile.name, day2Date.getMonth() + 1)
    const day2StationTemplate = day2StationChoreName ? templates.find((t) => t.name === day2StationChoreName) ?? null : null

    // Day 2 scheduled persistent chores — per-shift, no dedup needed
    const scheduledDay2Templates = templates.filter((t) =>
      t.lifecycle_type === 'persistent_until_complete'
      && t.name !== 'Additional Chore'
      && shouldGenerateScheduledChore(t.name, day2Date)
    )

    choresToCreate.push(
      ...day2TruckChecks,
      ...(day2StationTemplate ? [{ chore_template_id: day2StationTemplate.id, status: 'pending', due_at: templateDueAt(day2StationTemplate, true), chore_date: day2Date }] : []),
      ...buildScheduledUnitChores(scheduledDay2Templates, day2Date, true),
    )
  }

  const log = await prisma.operationsLog.create({
    data: {
      service_date: serviceDate,
      shift_profile_id,
      station_id: shiftProfile.station_id,
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
      shift_profile: { include: { station: true } },
      bays: { include: { unit: true } },
      chores: { include: { chore_template: true, unit: true } },
      primary_employee: true,
      partner_employee: true,
      primary_unit: true,
    },
  })

  await seedChoreTasks(log.id)

  return NextResponse.json(log, { status: 201 })
}
