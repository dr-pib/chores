import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PRIVATE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRIVATE_URL

if (!dbUrl) throw new Error('No database URL found')

const adapter = new PrismaPg({ connectionString: dbUrl })
const prisma = new PrismaClient({ adapter })

// Parse a minimal CSV (quoted fields, comma-delimited)
function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.trim().split('\n')
  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim() })
    return row
  })
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { result.push(cur); cur = '' }
    else { cur += ch }
  }
  result.push(cur)
  return result
}

// "Last, First" → "First Last"
function normalizeEsoName(eso: string): string {
  const [last, first] = eso.split(',').map(s => s.trim())
  return first && last ? `${first} ${last}` : eso.trim()
}

async function main() {
  const csvPath = '/Users/chendrix/chores/imports/eso_shift_seed_2026-05-28_to_2026-05-31.csv'
  const rows = parseCsv(readFileSync(csvPath, 'utf8'))

  // Load lookup data
  const [employees, shiftProfiles] = await Promise.all([
    prisma.employee.findMany({ select: { id: true, name: true, email_username: true, schedule_import_first_name: true } }),
    prisma.shiftProfile.findMany({ select: { id: true, name: true, station_id: true, default_start_time: true, default_unit_id: true } }),
  ])

  // Employee lookup by display name and optional schedule import first-name alias.
  const empByName = new Map<string, typeof employees[0]>()
  for (const e of employees) {
    empByName.set(e.name.toLowerCase(), e)
    if (e.schedule_import_first_name) {
      const parts = e.name.trim().split(/\s+/)
      const lastName = parts[parts.length - 1]
      empByName.set(`${e.schedule_import_first_name} ${lastName}`.toLowerCase(), e)
    }
  }

  // Shift profile lookup by name
  const profileByName = new Map(shiftProfiles.map(p => [p.name, p]))

  // Check existing operations logs for the date+profile pairs in the CSV
  const serviceDates = [...new Set(rows.map(r => r.service_date))]
  const existingLogs = await prisma.operationsLog.findMany({
    where: { service_date: { in: serviceDates.map(d => new Date(d + 'T00:00:00.000Z')) } },
    include: {
      shift_profile: { select: { name: true } },
      primary_employee: { select: { name: true } },
    },
  })

  const existingKey = (date: string, profileName: string) => `${date}|${profileName}`
  const existingSet = new Set(
    existingLogs.map(l => existingKey(
      l.service_date.toISOString().slice(0, 10),
      l.shift_profile.name
    ))
  )

  // --- Preflight report ---

  const unmatchedEmployees: string[] = []
  const unmatchedProfiles: string[] = []
  const needsReview: string[] = []
  const duplicates: string[] = []
  const ok: string[] = []

  for (const row of rows) {
    const primaryName = normalizeEsoName(row.primary_employee)
    const partnerName = row.partner_employee ? normalizeEsoName(row.partner_employee) : null

    const primaryEmp = empByName.get(primaryName.toLowerCase())
    const partnerEmp = partnerName ? empByName.get(partnerName.toLowerCase()) : null
    const profile = profileByName.get(row.shift_profile)

    const rowId = `${row.service_date} ${row.shift_profile}`

    if (!primaryEmp) unmatchedEmployees.push(`  ${rowId} — primary: "${row.primary_employee}" → "${primaryName}"`)
    if (partnerName && !partnerEmp) unmatchedEmployees.push(`  ${rowId} — partner: "${row.partner_employee}" → "${partnerName}"`)
    if (!profile) unmatchedProfiles.push(`  ${rowId} — profile: "${row.shift_profile}"`)
    if (row.needs_review === 'true') needsReview.push(`  ${rowId} — ${row.notes}`)
    if (existingSet.has(existingKey(row.service_date, row.shift_profile))) {
      duplicates.push(`  ${rowId}`)
    }

    if (primaryEmp && profile && !existingSet.has(existingKey(row.service_date, row.shift_profile))) {
      ok.push(`  ✓ ${rowId}  primary=${primaryEmp.name}${partnerEmp ? `  partner=${partnerEmp.name}` : partnerName ? ` [partner UNMATCHED: ${partnerName}]` : ''}`)
    }
  }

  console.log(`\n=== ESO Shift Seed Preflight ===`)
  console.log(`CSV rows: ${rows.length}`)

  console.log(`\n--- needs_review=true (${needsReview.length}) ---`)
  if (needsReview.length === 0) console.log('  (none)')
  else needsReview.forEach(l => console.log(l))

  console.log(`\n--- Unmatched employees (${unmatchedEmployees.length}) ---`)
  if (unmatchedEmployees.length === 0) console.log('  (none)')
  else unmatchedEmployees.forEach(l => console.log(l))

  console.log(`\n--- Unmatched shift profiles (${unmatchedProfiles.length}) ---`)
  if (unmatchedProfiles.length === 0) console.log('  (none)')
  else unmatchedProfiles.forEach(l => console.log(l))

  console.log(`\n--- Existing shifts (would be skipped) (${duplicates.length}) ---`)
  if (duplicates.length === 0) console.log('  (none)')
  else duplicates.forEach(l => console.log(l))

  console.log(`\n--- Ready to insert (${ok.length}) ---`)
  ok.forEach(l => console.log(l))

  console.log(`\n=== Summary ===`)
  console.log(`  Ready to insert: ${ok.length}`)
  console.log(`  Would skip (existing): ${duplicates.length}`)
  console.log(`  Unmatched employees: ${unmatchedEmployees.length}`)
  console.log(`  Unmatched profiles: ${unmatchedProfiles.length}`)
  console.log(`  needs_review: ${needsReview.length}`)
  console.log()
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
