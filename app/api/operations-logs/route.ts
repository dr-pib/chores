import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import type { SetShiftInput } from '@/lib/types'
import { getStationChoreForPost, shouldGenerateScheduledChore } from '@/lib/chore-rotation'
import { resolvePresentTruckTargets, resolvePrimaryUnitTarget, resolveCrewTarget } from '@/lib/chore-targeting'
import { buildChoreRows, ChoreCreateData, ChoreCreateManyData } from '@/lib/chore-generation'
import { isPersistent } from '@/lib/lifecycle'
import { chicago0800 } from '@/lib/dates'

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
  const { shift_profile_id, partner_employee_id, primary_unit_id, actual_start, actual_end, narc_box_id, bays } = body

  const shiftProfile = await prisma.shiftProfile.findUnique({ where: { id: shift_profile_id } })
  if (!shiftProfile) return NextResponse.json({ error: 'Shift profile not found' }, { status: 404 })

  const startDt = new Date(actual_start)
  const endDt = new Date(actual_end)
  const serviceDate = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate())
  const is48h = endDt.getTime() - startDt.getTime() >= 48 * 3600 * 1000

  const templates = await prisma.choreTemplate.findMany()
  const truckCheck = templates.find((t) => t.name === 'Truck Check')!

  // Targets derived from submitted bays and primary unit — used in both creation and update paths
  const truckTargets = resolvePresentTruckTargets(bays)
  const narcTargets = resolvePrimaryUnitTarget(primary_unit_id)
  const DAY_2_OFFSET_MS = 24 * 3600 * 1000

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

  const templateById = new Map(templates.map(t => [t.id, t]))

  // Validate NARC box uniqueness across active shifts
  if (narc_box_id) {
    const boxConflict = await prisma.operationsLog.findFirst({
      where: {
        narc_box_id,
        actual_end: { gt: new Date() },
        // When editing, exclude the current shift from the conflict check
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      select: { shift_profile: { select: { name: true } } },
    })
    if (boxConflict) {
      const box = await prisma.narcBox.findUnique({ where: { id: narc_box_id }, select: { letter: true } })
      return NextResponse.json(
        { error: `NARC Box ${box?.letter} is already assigned to ${boxConflict.shift_profile.name}.` },
        { status: 409 }
      )
    }
  }

  if (existing) {
    const now = new Date()
    const day2Date = is48h ? new Date(serviceDate.getTime() + DAY_2_OFFSET_MS) : null

    // Phase 1: Release pending claims for assets no longer on this shift.
    // Completed SW is never touched — credit stays with the original completer.
    const currentClaims = await prisma.scheduledWork.findMany({
      where: { claimed_by_log_id: existing.id, status: 'pending' },
      select: { id: true, asset_type: true, unit_id: true, narc_box_id: true, work_date: true },
    })

    const newUnitIdSet = new Set(
      truckTargets.map(t => t.unit_id).filter((id): id is number => id != null)
    )
    const newNarcBoxId = narc_box_id ?? null

    const swsToUnclaim = currentClaims.filter(sw =>
      (sw.asset_type === 'unit' && !newUnitIdSet.has(sw.unit_id!)) ||
      (sw.asset_type === 'narc_box' && sw.narc_box_id !== newNarcBoxId)
    )

    if (swsToUnclaim.length > 0) {
      await prisma.chore.deleteMany({
        where: {
          operations_log_id: existing.id,
          scheduled_work_id: { in: swsToUnclaim.map(s => s.id) },
          status: 'pending',
        },
      })
      for (const sw of swsToUnclaim) {
        await prisma.scheduledWork.update({
          where: { id: sw.id },
          data: { claimed_by_log_id: null, claimed_at: null, due_at: chicago0800(sw.work_date) },
        })
      }
    }

    // Main update: replace truck checks and update shift metadata.
    // Preserve any SW links from existing Truck Check chores on retained trucks so the
    // ScheduledWork stays claimed and visible after the chore rows are recreated.
    const existingTcSwLinks = await prisma.chore.findMany({
      where: {
        operations_log_id: existing.id,
        chore_template_id: truckCheck.id,
        scheduled_work_id: { not: null },
      },
      select: { chore_date: true, unit_id: true, scheduled_work_id: true },
    })
    const tcSwByKey = new Map(
      existingTcSwLinks.map(c => [
        `${c.chore_date?.getTime() ?? 0}-${c.unit_id ?? 'none'}`,
        c.scheduled_work_id!,
      ])
    )
    const withTcSw = (rows: ChoreCreateData[]) =>
      rows.map(row => {
        const swId = tcSwByKey.get(`${row.chore_date.getTime()}-${row.unit_id ?? 'none'}`)
        return swId != null ? { ...row, scheduled_work_id: swId } : row
      })
    const day1TruckChecks = withTcSw(buildChoreRows([truckCheck], truckTargets, serviceDate, startDt))
    const day2TruckChecks = day2Date
      ? withTcSw(buildChoreRows([truckCheck], truckTargets, day2Date, startDt, DAY_2_OFFSET_MS))
      : []

    await prisma.operationsLog.update({
      where: { id: existing.id },
      data: {
        shift_profile_id,
        station_id: shiftProfile.station_id,
        partner_employee_id,
        primary_unit_id,
        narc_box_id: newNarcBoxId,
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

    // Phase 3: Claim pending unclaimed SW for current assets, and create any Day 2
    // standalone chores that don't yet exist on this log.
    const choreDatesEdit = [serviceDate]
    if (day2Date) choreDatesEdit.push(day2Date)

    const swAssetConditionsEdit: { asset_type: string; asset_key: string }[] = [
      ...truckTargets.filter(t => t.unit_id != null).map(t => ({ asset_type: 'unit', asset_key: String(t.unit_id!) })),
      ...(newNarcBoxId != null ? [{ asset_type: 'narc_box', asset_key: String(newNarcBoxId) }] : []),
    ]

    const unclaimedSw = swAssetConditionsEdit.length > 0
      ? await prisma.scheduledWork.findMany({
          where: {
            status: 'pending',
            claimed_by_log_id: null,
            work_date: { in: choreDatesEdit },
            OR: swAssetConditionsEdit,
          },
          select: {
            id: true,
            chore_template_id: true,
            asset_type: true,
            unit_id: true,
            narc_box_id: true,
            work_date: true,
          },
        })
      : []

    // Load chores currently on this log for dedup (post-Phase-1 + post-main-update state).
    const existingChores = await prisma.chore.findMany({
      where: { operations_log_id: existing.id },
      select: { chore_template_id: true, chore_date: true, unit_id: true, scheduled_work_id: true },
    })
    const existingChoreKeys = new Set(
      existingChores.map(c => `${c.chore_template_id}-${c.chore_date?.getTime() ?? 0}-${c.unit_id ?? 'shift'}`)
    )
    const existingSwIds = new Set(
      existingChores.filter(c => c.scheduled_work_id != null).map(c => c.scheduled_work_id!)
    )

    const choresToAdd: ChoreCreateManyData[] = []
    const handledChoreKeys = new Set<string>()
    const matchedEditSwIds = new Set<number>()

    for (const sw of unclaimedSw) {
      if (existingSwIds.has(sw.id)) continue
      const tmpl = templateById.get(sw.chore_template_id)
      if (!tmpl) continue
      const choreUnitId = sw.asset_type === 'narc_box' ? primary_unit_id : sw.unit_id
      const choreKey = `${sw.chore_template_id}-${sw.work_date.getTime()}-${choreUnitId ?? 'shift'}`
      if (existingChoreKeys.has(choreKey)) continue
      const dayOffsetMs = sw.work_date.getTime() - serviceDate.getTime()
      const bayLabel = sw.asset_type === 'unit'
        ? (truckTargets.find(t => t.unit_id === sw.unit_id)?.bay_label ?? null)
        : null
      choresToAdd.push({
        operations_log_id: existing.id,
        chore_template_id: sw.chore_template_id,
        unit_id: choreUnitId,
        bay_label: bayLabel,
        status: 'pending',
        due_at: new Date(startDt.getTime() + dayOffsetMs + (tmpl.due_offset_hours ?? 1) * 3_600_000),
        chore_date: sw.work_date,
        scheduled_work_id: sw.id,
      })
      handledChoreKeys.add(choreKey)
      matchedEditSwIds.add(sw.id)
    }

    // Day 2 standalone chores for persistent templates not yet covered by a SW claim.
    if (day2Date) {
      const scheduledDay2 = templates.filter((t) =>
        isPersistent(t)
        && t.name !== 'Additional Chore'
        && shouldGenerateScheduledChore(t.name, day2Date)
      )
      const day2NarcTemplate = scheduledDay2.find(t => t.name === 'NARC Expires')
      const day2NonNarcTemplates = scheduledDay2.filter(t => t.name !== 'NARC Expires')

      for (const row of [
        ...buildChoreRows(day2NonNarcTemplates, truckTargets, day2Date, startDt, DAY_2_OFFSET_MS),
        ...buildChoreRows(day2NarcTemplate ? [day2NarcTemplate] : [], narcTargets, day2Date, startDt, DAY_2_OFFSET_MS),
      ]) {
        const choreKey = `${row.chore_template_id}-${row.chore_date.getTime()}-${row.unit_id ?? 'shift'}`
        if (existingChoreKeys.has(choreKey) || handledChoreKeys.has(choreKey)) continue
        choresToAdd.push({ ...row, operations_log_id: existing.id })
      }
    }

    if (choresToAdd.length > 0) await prisma.chore.createMany({ data: choresToAdd })

    // Claim the matched unclaimed SW rows.
    for (const sw of unclaimedSw) {
      if (!matchedEditSwIds.has(sw.id)) continue
      const tmpl = templateById.get(sw.chore_template_id)!
      const dueOffsetMs = (tmpl.due_offset_hours ?? 1) * 3_600_000
      const dayOffsetMs = sw.work_date.getTime() - serviceDate.getTime()
      await prisma.scheduledWork.update({
        where: { id: sw.id },
        data: {
          claimed_by_log_id: existing.id,
          claimed_at: now,
          due_at: new Date(startDt.getTime() + dayOffsetMs + dueOffsetMs),
        },
      })
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
    isPersistent(t)
    && t.name !== 'Additional Chore'
    && shouldGenerateScheduledChore(t.name, serviceDate)
  )
  const day1NarcTemplate = scheduledPersistentTemplates.find(t => t.name === 'NARC Expires')
  const day1NonNarcTemplates = scheduledPersistentTemplates.filter(t => t.name !== 'NARC Expires')

  const choresToCreate = [
    ...buildChoreRows([truckCheck], truckTargets, serviceDate, startDt),
    ...(stationTemplate ? buildChoreRows([stationTemplate], resolveCrewTarget(), serviceDate, startDt) : []),
    ...buildChoreRows(day1NonNarcTemplates, truckTargets, serviceDate, startDt),
    ...buildChoreRows(day1NarcTemplate ? [day1NarcTemplate] : [], narcTargets, serviceDate, startDt),
  ]

  // Day 2 chores for 48h shifts — created immediately so they're visible from the start
  if (is48h) {
    const day2Date = new Date(serviceDate.getTime() + DAY_2_OFFSET_MS)

    const day2StationChoreName = getStationChoreForPost(shiftProfile.name, day2Date.getMonth() + 1)
    const day2StationTemplate = day2StationChoreName ? templates.find((t) => t.name === day2StationChoreName) ?? null : null

    const scheduledDay2Templates = templates.filter((t) =>
      isPersistent(t)
      && t.name !== 'Additional Chore'
      && shouldGenerateScheduledChore(t.name, day2Date)
    )
    const day2NarcTemplate = scheduledDay2Templates.find(t => t.name === 'NARC Expires')
    const day2NonNarcTemplates = scheduledDay2Templates.filter(t => t.name !== 'NARC Expires')

    choresToCreate.push(
      ...buildChoreRows([truckCheck], truckTargets, day2Date, startDt, DAY_2_OFFSET_MS),
      ...(day2StationTemplate ? buildChoreRows([day2StationTemplate], resolveCrewTarget(), day2Date, startDt, DAY_2_OFFSET_MS) : []),
      ...buildChoreRows(day2NonNarcTemplates, truckTargets, day2Date, startDt, DAY_2_OFFSET_MS),
      ...buildChoreRows(day2NarcTemplate ? [day2NarcTemplate] : [], narcTargets, day2Date, startDt, DAY_2_OFFSET_MS),
    )
  }

  const now = new Date()

  // Find pending ScheduledWork rows for this shift's assets on each chore date.
  // Truck-scoped SW is keyed by unit DB id; NARC-scoped SW is keyed by narc_box DB id.
  const choreDates = [serviceDate]
  if (is48h) choreDates.push(new Date(serviceDate.getTime() + DAY_2_OFFSET_MS))

  const swAssetConditions: { asset_type: string; asset_key: string }[] = [
    ...truckTargets
      .filter(t => t.unit_id != null)
      .map(t => ({ asset_type: 'unit', asset_key: String(t.unit_id!) })),
    ...(narc_box_id != null
      ? [{ asset_type: 'narc_box', asset_key: String(narc_box_id) }]
      : []),
  ]

  const pendingSw = swAssetConditions.length > 0
    ? await prisma.scheduledWork.findMany({
        where: {
          status: 'pending',
          claimed_by_log_id: null,
          work_date: { in: choreDates },
          OR: swAssetConditions,
        },
        select: {
          id: true,
          chore_template_id: true,
          asset_type: true,
          unit_id: true,
          narc_box_id: true,
          work_date: true,
        },
      })
    : []

  // Build a lookup map so annotation is O(1) per chore row.
  // Key: `${template_id}-unit-${unit_id}-${date_ms}` for truck-scoped rows
  //      `${template_id}-narc-${narc_box_id}-${date_ms}` for NARC-box rows
  const swByKey = new Map(
    pendingSw.map(sw => [
      sw.asset_type === 'unit'
        ? `${sw.chore_template_id}-unit-${sw.unit_id}-${sw.work_date.getTime()}`
        : `${sw.chore_template_id}-narc-${sw.narc_box_id}-${sw.work_date.getTime()}`,
      sw,
    ])
  )

  const matchedSwIds = new Set<number>()

  // Annotate chore rows with scheduled_work_id where a pending SW exists.
  // For truck-scoped templates, match by unit_id. For NARC-box templates, match by
  // the shift's narc_box_id (the chore itself carries unit_id, not narc_box_id).
  const annotatedChores = choresToCreate.map(chore => {
    const tmpl = templateById.get(chore.chore_template_id)
    if (!tmpl) return chore
    const dateMs = chore.chore_date.getTime()
    let key: string | null = null
    if (tmpl.asset_scope === 'truck' && chore.unit_id != null) {
      key = `${chore.chore_template_id}-unit-${chore.unit_id}-${dateMs}`
    } else if (tmpl.asset_scope === 'narc_box' && narc_box_id != null) {
      key = `${chore.chore_template_id}-narc-${narc_box_id}-${dateMs}`
    }
    const sw = key ? swByKey.get(key) : undefined
    if (sw) {
      matchedSwIds.add(sw.id)
      return { ...chore, scheduled_work_id: sw.id }
    }
    return chore
  })

  const createLogWithChores = (chores: ChoreCreateData[]) =>
    prisma.operationsLog.create({
      data: {
        service_date: serviceDate,
        shift_profile_id,
        station_id: shiftProfile.station_id,
        primary_employee_id: session.userId,
        partner_employee_id,
        primary_unit_id,
        narc_box_id: narc_box_id ?? null,
        actual_start: startDt,
        actual_end: endDt,
        status: 'confirmed',
        bays: { create: bays.map((b) => ({ bay_label: b.bay_label, unit_id: b.unit_id, unit_status: b.unit_status, sort_order: b.sort_order })) },
        chores: { create: chores },
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

  let log: Awaited<ReturnType<typeof createLogWithChores>>
  let claimMatchedSw = true
  try {
    log = await createLogWithChores(annotatedChores)
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'P2002') throw e
    // Concurrent SW claim: another shift won the race. Create the log without SW links.
    claimMatchedSw = false
    log = await createLogWithChores(choresToCreate)
  }

  await seedChoreTasks(log.id)

  // Claim matched ScheduledWork rows: record shift ownership and update due_at.
  // due_at = actual_start + template.due_offset_hours (per-template, not hardcoded).
  // For 48h Day 2 rows, add DAY_2_OFFSET_MS to match how buildChoreRows computes due_at.
  // Skipped when claimMatchedSw is false (concurrent race: log was created without SW links).
  if (claimMatchedSw) {
    for (const sw of pendingSw) {
      if (!matchedSwIds.has(sw.id)) continue
      const tmpl = templateById.get(sw.chore_template_id)!
      const dueOffsetMs = (tmpl.due_offset_hours ?? 1) * 3_600_000
      const dayOffsetMs = sw.work_date.getTime() - serviceDate.getTime() // 0 or DAY_2_OFFSET_MS
      await prisma.scheduledWork.update({
        where: { id: sw.id },
        data: {
          claimed_by_log_id: log.id,
          claimed_at: now,
          due_at: new Date(startDt.getTime() + dayOffsetMs + dueOffsetMs),
        },
      })
    }
  }

  return NextResponse.json(log, { status: 201 })
}
