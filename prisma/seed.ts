import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { existsSync, readFileSync } from 'node:fs'

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PRIVATE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRIVATE_URL

if (!dbUrl) {
  throw new Error('No database URL found for seeding')
}

const adapter = new PrismaPg({ connectionString: dbUrl! })
const prisma = new PrismaClient({ adapter })

type EmployeeCsvRow = {
  name: string
  email: string
  email_username: string
  emt_number: string
  licensure_level: string
  role: string
  status: string
  default_station: string
  default_shift: string
  default_shift_length_hours: string
  default_partner_email_username: string
}

function parseCsv(text: string): EmployeeCsvRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  if (cell || row.length > 0) {
    row.push(cell)
    if (row.some((value) => value.length > 0)) rows.push(row)
  }

  const [headers, ...dataRows] = rows
  return dataRows.map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ''])
  ) as EmployeeCsvRow)
}

function loadEmployees() {
  const employeeCsv = new URL('./data/employees.csv', import.meta.url)
  if (!existsSync(employeeCsv)) {
    console.warn('No prisma/data/employees.csv found; skipping employee import.')
    return []
  }
  const csv = readFileSync(employeeCsv, 'utf8')
  return parseCsv(csv)
}

async function main() {
  console.log('Seeding...')

  // Stations
  const harrison = await prisma.station.upsert({ where: { name: 'Harrison' }, update: {}, create: { name: 'Harrison' } })
  const diamondCity = await prisma.station.upsert({ where: { name: 'Diamond City' }, update: {}, create: { name: 'Diamond City' } })
  const newtonCounty = await prisma.station.upsert({ where: { name: 'Newton County' }, update: {}, create: { name: 'Newton County' } })

  // Units
  const unitDefs: { n: number; t: string; name?: string }[] = [
    { n: 1, t: 'ALS' }, { n: 2, t: 'ALS' }, { n: 3, t: 'ALS' }, { n: 4, t: 'ALS' },
    { n: 5, t: 'ALS' }, { n: 6, t: 'ALS' }, { n: 7, t: 'BLS' }, { n: 8, t: 'ALS' },
    { n: 9, t: 'ALS' }, { n: 10, t: 'ALS' }, { n: 11, t: 'ALS' }, { n: 14, t: 'ALS' },
    { n: 20, t: 'SUV', name: 'Explorer' },
  ]
  const units: Record<number, { id: number }> = {}
  for (const { n, t, name } of unitDefs) {
    units[n] = await prisma.unit.upsert({
      where: { unit_number: n }, update: {},
      create: { unit_number: n, unit_type: t, ...(name ? { unit_name: name } : {}) },
    })
  }

  // Crew Posts
  const supervisorPost = await prisma.crewPost.upsert({
    where: { name: 'Supervisor' }, update: {},
    create: { name: 'Supervisor', station_id: harrison.id, default_start_time: '06:00', default_shift_length_hours: 24, default_unit_id: units[14].id },
  })
  const post247 = await prisma.crewPost.upsert({
    where: { name: '24-7' }, update: {},
    create: { name: '24-7', station_id: harrison.id, default_start_time: '07:00', default_shift_length_hours: 24, default_unit_id: units[4].id },
  })
  const post248 = await prisma.crewPost.upsert({
    where: { name: '24-8' }, update: {},
    create: { name: '24-8', station_id: harrison.id, default_start_time: '08:00', default_shift_length_hours: 24, default_unit_id: units[11].id },
  })
  const swingPost = await prisma.crewPost.upsert({
    where: { name: 'Swing' }, update: {},
    create: { name: 'Swing', station_id: harrison.id, default_start_time: '07:00', default_shift_length_hours: 24, default_unit_id: units[9].id },
  })
  const dcAlsPost = await prisma.crewPost.upsert({
    where: { name: 'DC-ALS' }, update: {},
    create: { name: 'DC-ALS', station_id: diamondCity.id, default_start_time: '07:00', default_shift_length_hours: 24, default_unit_id: units[10].id },
  })
  const ncAlsPost = await prisma.crewPost.upsert({
    where: { name: 'NC-ALS' }, update: {},
    create: { name: 'NC-ALS', station_id: newtonCounty.id, default_start_time: '07:00', default_shift_length_hours: 24, default_unit_id: units[2].id },
  })

  // Crew Post Bays — only seed on first run; skip if crew already has bays (preserves admin edits)
  const twoBayPosts = [supervisorPost, post247, post248, swingPost]
  const oneBayPosts = [dcAlsPost, ncAlsPost]
  for (const post of [...twoBayPosts, ...oneBayPosts]) {
    const existing = await prisma.crewPostBay.count({ where: { crew_post_id: post.id } })
    if (existing === 0) {
      await prisma.crewPostBay.create({
        data: { crew_post_id: post.id, bay_label: 'Bay 1', unit_id: post.default_unit_id, sort_order: 1 },
      })
    }
  }
  for (const post of twoBayPosts) {
    const existing = await prisma.crewPostBay.count({ where: { crew_post_id: post.id } })
    if (existing < 2) {
      await prisma.crewPostBay.create({
        data: { crew_post_id: post.id, bay_label: 'Bay 2', sort_order: 2 },
      })
    }
  }

  // Rename legacy "Admin" template to "Bathroom" if it exists
  await prisma.choreTemplate.updateMany({ where: { name: 'Admin' }, data: { name: 'Bathroom' } })

  // Chore Templates
  const choreDefs = [
    { name: 'Truck Check', lifecycle_type: 'daily_reset', due_offset_hours: 1, lock_offset_hours: 31 },
    { name: 'Bathroom', lifecycle_type: 'daily_reset', due_offset_hours: 1, lock_offset_hours: 31 },
    { name: 'Kitchen', lifecycle_type: 'daily_reset', due_offset_hours: 1, lock_offset_hours: 31 },
    { name: 'Garage', lifecycle_type: 'daily_reset', due_offset_hours: 1, lock_offset_hours: 31 },
    { name: 'Quarters', lifecycle_type: 'daily_reset', due_offset_hours: 1, lock_offset_hours: 31 },
    { name: 'Monthly Expires', lifecycle_type: 'persistent_until_complete', due_offset_hours: 1, lock_offset_hours: 31 },
    { name: 'NARC Expires', lifecycle_type: 'persistent_until_complete', due_offset_hours: 1, lock_offset_hours: 31 },
    { name: 'Quarterly Expires', lifecycle_type: 'persistent_until_complete', due_offset_hours: 1, lock_offset_hours: 31 },
    { name: 'Additional Chore', lifecycle_type: 'persistent_until_complete', due_offset_hours: 1, lock_offset_hours: 31 },
  ]
  const choreTemplates: Record<string, { id: number }> = {}
  for (const c of choreDefs) {
    choreTemplates[c.name] = await prisma.choreTemplate.upsert({
      where: { name: c.name }, update: {},
      create: { name: c.name, lifecycle_type: c.lifecycle_type, due_offset_hours: c.due_offset_hours, lock_offset_hours: c.lock_offset_hours },
    })
  }

  // Chore Template Sub-Tasks — only seed if template has no tasks yet
  const defaultSubTasks: Record<string, string[]> = {
    'Bathroom': ['Admin Bathroom', 'Bathroom 1', 'Bathroom 2'],
    'Kitchen': ['Wipe down everything', 'Sweep', 'Mop'],
    'Garage': ['Sweep', 'Take out trash', 'Take linens to ER'],
    'Quarters': ['Sweep', 'Mop', 'Trash'],
  }
  for (const [templateName, subTasks] of Object.entries(defaultSubTasks)) {
    const tmpl = choreTemplates[templateName]
    if (!tmpl) continue
    const existingCount = await prisma.choreTemplateTask.count({ where: { chore_template_id: tmpl.id } })
    if (existingCount === 0) {
      await prisma.choreTemplateTask.createMany({
        data: subTasks.map((name, i) => ({ chore_template_id: tmpl.id, name, sort_order: i + 1 })),
      })
    }
  }

  // Employees
  const postsByName = new Map([
    [supervisorPost.name, supervisorPost.id],
    [post247.name, post247.id],
    [post248.name, post248.id],
    [swingPost.name, swingPost.id],
    [dcAlsPost.name, dcAlsPost.id],
    [ncAlsPost.name, ncAlsPost.id],
  ])
  const stationsByName = new Map([
    [harrison.name, harrison.id],
    [diamondCity.name, diamondCity.id],
    [newtonCounty.name, newtonCounty.id],
  ])
  const employeeRows = loadEmployees()

  if (employeeRows.length > 0) {
    for (const employee of employeeRows) {
      await prisma.employee.upsert({
        where: { email_username: employee.email_username },
        update: {
          name: employee.name,
          email: employee.email || null,
          emt_number: employee.emt_number,
          licensure_level: employee.licensure_level,
          role: employee.role,
          status: employee.status || 'Active',
          default_station_id: employee.default_station ? stationsByName.get(employee.default_station) ?? null : null,
          default_crew_post_id: employee.default_shift ? postsByName.get(employee.default_shift) ?? null : null,
          default_shift_length_hours: Number(employee.default_shift_length_hours) || 48,
        },
        create: {
          name: employee.name,
          email: employee.email || null,
          email_username: employee.email_username,
          emt_number: employee.emt_number,
          licensure_level: employee.licensure_level,
          role: employee.role,
          status: employee.status || 'Active',
          default_station_id: employee.default_station ? stationsByName.get(employee.default_station) ?? null : null,
          default_crew_post_id: employee.default_shift ? postsByName.get(employee.default_shift) ?? null : null,
          default_shift_length_hours: Number(employee.default_shift_length_hours) || 48,
        },
      })
    }

    await prisma.employee.updateMany({
      where: {
        email_username: { notIn: employeeRows.map((employee) => employee.email_username) },
      },
      data: { status: 'Inactive' },
    })

    for (const employee of employeeRows.filter((row) => row.default_partner_email_username)) {
      const partner = await prisma.employee.findUnique({ where: { email_username: employee.default_partner_email_username } })
      if (partner) {
        await prisma.employee.update({
          where: { email_username: employee.email_username },
          data: { default_partner_id: partner.id },
        })
      }
    }
  }

  console.log('Seed complete.')
  console.log('Login credentials: email_username / emt_number')
  console.log(`Imported ${employeeRows.length} employees.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
