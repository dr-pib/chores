import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getStationChoreForPost, shouldGenerateScheduledChore } from '../lib/chore-rotation'
import { chicagoLocalToUtc } from '../lib/dates'
import { resolvePresentTruckTargets, resolveCrewTarget } from '../lib/chore-targeting'
import { buildChoreRows } from '../lib/chore-generation'
import { isPersistent } from '../lib/lifecycle'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) throw new Error('No DATABASE_URL')
const adapter = new PrismaPg({ connectionString: dbUrl })
const prisma = new PrismaClient({ adapter })

// --- CSV helpers ---
function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.trim().split('\n')
  const headers = splitLine(lines[0])
  return lines.slice(1).map(line => {
    const values = splitLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim() })
    return row
  })
}
function splitLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') inQ = !inQ
    else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
    else cur += ch
  }
  result.push(cur)
  return result
}

// --- Name aliases ---
const NAME_ALIASES: Record<string, string> = {
  'James Ketterman':   'Jim Ketterman',
  'Jerry Halliday':    'Dale Halliday',
  'Donald Remer':      'Don Remer',
  'Melissa Remer':     'Melissa Henderson',
  'Joe Deaton':        'Vince Deaton',
  'Jacqueline Rowton': 'Paige Rowton',
}
function normalizeEsoName(eso: string): string {
  const [last, first] = eso.split(',').map(s => s.trim())
  const n = first && last ? `${first} ${last}` : eso.trim()
  return NAME_ALIASES[n] ?? n
}

// --- ChoreTask seeder ---
async function seedChoreTasks(logId: number) {
  const chores = await prisma.chore.findMany({
    where: { operations_log_id: logId },
    include: {
      chore_template: { include: { tasks: { orderBy: { sort_order: 'asc' } } } },
      tasks: { select: { chore_template_task_id: true } },
    },
  })
  const toCreate: { chore_id: number; chore_template_task_id: number }[] = []
  for (const chore of chores) {
    const existing = new Set(chore.tasks.map(t => t.chore_template_task_id))
    for (const tmplTask of chore.chore_template.tasks) {
      if (!existing.has(tmplTask.id)) toCreate.push({ chore_id: chore.id, chore_template_task_id: tmplTask.id })
    }
  }
  if (toCreate.length > 0) await prisma.choreTask.createMany({ data: toCreate })
}

async function main() {
  const csvPath = '/Users/chendrix/chores/imports/eso_shift_seed_2026-05-28_to_2026-05-31.csv'
  const rows = parseCsv(readFileSync(csvPath, 'utf8'))

  // Load all reference data
  const [employees, shiftProfiles, templates, units] = await Promise.all([
    prisma.employee.findMany({ select: { id: true, name: true } }),
    prisma.shiftProfile.findMany({
      include: { bays: { orderBy: { sort_order: 'asc' } } },
    }),
    prisma.choreTemplate.findMany(),
    prisma.unit.findMany({ select: { id: true, unit_number: true } }),
  ])

  const empByName = new Map(employees.map(e => [e.name.toLowerCase(), e]))
  const profileByName = new Map(shiftProfiles.map(p => [p.name, p]))
  const templateByName = new Map(templates.map(t => [t.name, t]))
  const fallbackUnitId = units.find(u => u.unit_number === 1)!.id

  const truckCheck = templateByName.get('Truck Check')!

  const results = { inserted: 0, skipped: 0, errors: [] as string[] }

  for (const row of rows) {
    const rowId = `${row.service_date} ${row.shift_profile}`
    try {
      const primaryEmp = empByName.get(normalizeEsoName(row.primary_employee).toLowerCase())
      const partnerEmp = row.partner_employee ? empByName.get(normalizeEsoName(row.partner_employee).toLowerCase()) : null
      const profile = profileByName.get(row.shift_profile)

      if (!primaryEmp || !profile) {
        results.errors.push(`${rowId}: missing primary employee or profile`)
        results.skipped++
        continue
      }

      // Check for existing shift to avoid duplicates
      const [year, month, day] = row.service_date.split('-').map(Number)
      const serviceDate = new Date(Date.UTC(year, month - 1, day))
      const existing = await prisma.operationsLog.findFirst({
        where: { service_date: serviceDate, shift_profile_id: profile.id },
      })
      if (existing) {
        results.errors.push(`${rowId}: already exists (log ${existing.id}), skipped`)
        results.skipped++
        continue
      }

      // Build actual_start / actual_end as Chicago local times converted to UTC
      const actualStart = chicagoLocalToUtc(row.service_date, row.start_time)
      const actualEnd = new Date(actualStart.getTime() + 24 * 3600 * 1000)

      const primaryUnitId = profile.default_unit_id ?? fallbackUnitId

      // Bays from shift profile defaults
      const bays = profile.bays.map(b => ({
        bay_label: b.bay_label,
        unit_id: b.unit_id,
        unit_status: 'unit_present' as const,
        sort_order: b.sort_order,
      }))

      const truckTargets = resolvePresentTruckTargets(bays)

      // Station chore (Harrison profiles only)
      const serviceMonth = month
      const stationChoreName = getStationChoreForPost(profile.name, serviceMonth)
      const stationTemplate = stationChoreName ? templateByName.get(stationChoreName) ?? null : null

      // Scheduled persistent chores (NARC/Monthly/Quarterly) — none for May 28-31
      const scheduledPersistentTemplates = templates.filter(t =>
        isPersistent(t)
        && t.name !== 'Additional Chore'
        && shouldGenerateScheduledChore(t.name, serviceDate)
      )
      // No NARC template needed for this date range (no 25th, no 3rd Tuesday, no quarterly)
      const narcTemplate = scheduledPersistentTemplates.find(t => t.name === 'NARC Expires')
      const nonNarcTemplates = scheduledPersistentTemplates.filter(t => t.name !== 'NARC Expires')

      const choresToCreate = [
        ...buildChoreRows([truckCheck], truckTargets, serviceDate, actualStart),
        ...(stationTemplate ? buildChoreRows([stationTemplate], resolveCrewTarget(), serviceDate, actualStart) : []),
        ...buildChoreRows(nonNarcTemplates, truckTargets, serviceDate, actualStart),
        ...buildChoreRows(narcTemplate ? [narcTemplate] : [], truckTargets, serviceDate, actualStart),
      ]

      const log = await prisma.operationsLog.create({
        data: {
          service_date: serviceDate,
          shift_profile_id: profile.id,
          station_id: profile.station_id,
          primary_employee_id: primaryEmp.id,
          partner_employee_id: partnerEmp?.id ?? null,
          primary_unit_id: primaryUnitId,
          actual_start: actualStart,
          actual_end: actualEnd,
          status: 'confirmed',
          bays: { create: bays },
          chores: { create: choresToCreate },
        },
      })

      await seedChoreTasks(log.id)

      console.log(`  ✓ inserted  ${rowId}  (log ${log.id})  ${primaryEmp.name}${partnerEmp ? ` & ${partnerEmp.name}` : ''}  ${choresToCreate.length} chores`)
      results.inserted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.errors.push(`${rowId}: ${msg}`)
      results.skipped++
      console.log(`  ✗ error     ${rowId}: ${msg}`)
    }
  }

  console.log(`\n=== Seed Result ===`)
  console.log(`  Inserted: ${results.inserted}`)
  console.log(`  Skipped:  ${results.skipped}`)
  if (results.errors.length > 0) {
    console.log(`  Errors/notes:`)
    results.errors.forEach(e => console.log(`    ${e}`))
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
