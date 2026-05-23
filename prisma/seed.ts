import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PRIVATE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRIVATE_URL

const adapter = new PrismaPg({ connectionString: dbUrl! })
const prisma = new PrismaClient({ adapter })

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

  // Crew Post Bays — Harrison posts have 2 bays, remote posts have 1
  for (const post of [supervisorPost, post247, post248, swingPost, dcAlsPost, ncAlsPost]) {
    await prisma.crewPostBay.upsert({
      where: { crew_post_id_bay_label: { crew_post_id: post.id, bay_label: 'Bay 1' } },
      update: {},
      create: { crew_post_id: post.id, bay_label: 'Bay 1', sort_order: 1 },
    })
  }
  for (const post of [supervisorPost, post247, post248, swingPost]) {
    await prisma.crewPostBay.upsert({
      where: { crew_post_id_bay_label: { crew_post_id: post.id, bay_label: 'Bay 2' } },
      update: {},
      create: { crew_post_id: post.id, bay_label: 'Bay 2', sort_order: 2 },
    })
  }

  // Rename legacy "Admin" template to "Bathroom" if it exists
  await prisma.choreTemplate.updateMany({ where: { name: 'Admin' }, data: { name: 'Bathroom' } })

  // Chore Templates
  const choreDefs = [
    { name: 'Truck Check', lifecycle_type: 'daily_reset', due_offset_hours: 1 },
    { name: 'Bathroom', lifecycle_type: 'daily_reset', due_offset_hours: null },
    { name: 'Kitchen', lifecycle_type: 'daily_reset', due_offset_hours: null },
    { name: 'Garage', lifecycle_type: 'daily_reset', due_offset_hours: null },
    { name: 'Quarters', lifecycle_type: 'daily_reset', due_offset_hours: null },
    { name: 'Monthly Expires', lifecycle_type: 'persistent_until_complete', due_offset_hours: null },
    { name: 'NARC Expires', lifecycle_type: 'persistent_until_complete', due_offset_hours: null },
    { name: 'Quarterly Expires', lifecycle_type: 'persistent_until_complete', due_offset_hours: null },
    { name: 'Additional Chore', lifecycle_type: 'persistent_until_complete', due_offset_hours: null },
  ]
  for (const c of choreDefs) {
    await prisma.choreTemplate.upsert({
      where: { name: c.name }, update: {},
      create: { name: c.name, lifecycle_type: c.lifecycle_type, due_offset_hours: c.due_offset_hours ?? null },
    })
  }

  // Employees
  const emp = async (data: {
    name: string; email_username: string; emt_number: string
    licensure_level: string; role: string
    default_crew_post_id?: number; default_shift_length_hours?: number
  }) => prisma.employee.upsert({ where: { email_username: data.email_username }, update: {}, create: data })

  await emp({ name: 'Admin User', email_username: 'admin', emt_number: '0001', licensure_level: 'NRP', role: 'Dom' })
  await emp({ name: 'Alex Rivera', email_username: 'arivera', emt_number: '1001', licensure_level: 'NRP', role: 'Supervisor', default_crew_post_id: supervisorPost.id })
  const jones = await emp({ name: 'Jordan Jones', email_username: 'jjones', emt_number: '2001', licensure_level: 'NRP', role: 'Employee', default_crew_post_id: post247.id })
  const smith = await emp({ name: 'Sam Smith', email_username: 'ssmith', emt_number: '2002', licensure_level: 'EMT-A', role: 'Employee', default_crew_post_id: post247.id })
  const davis = await emp({ name: 'Casey Davis', email_username: 'cdavis', emt_number: '3001', licensure_level: 'NRP', role: 'Employee', default_crew_post_id: post248.id })
  const miller = await emp({ name: 'Morgan Miller', email_username: 'mmiller', emt_number: '3002', licensure_level: 'EMT', role: 'Employee', default_crew_post_id: post248.id })
  await emp({ name: 'Riley Wilson', email_username: 'rwilson', emt_number: '4001', licensure_level: 'NRP', role: 'Employee', default_crew_post_id: swingPost.id })
  await emp({ name: 'Taylor Moore', email_username: 'tmoore', emt_number: '5001', licensure_level: 'NRP', role: 'Employee', default_crew_post_id: dcAlsPost.id })
  await emp({ name: 'Drew Taylor', email_username: 'dtaylor', emt_number: '6001', licensure_level: 'EMT-A', role: 'Employee', default_crew_post_id: ncAlsPost.id })

  // Set default partners
  await prisma.employee.update({ where: { id: jones.id }, data: { default_partner_id: smith.id } })
  await prisma.employee.update({ where: { id: davis.id }, data: { default_partner_id: miller.id } })

  console.log('Seed complete.')
  console.log('Login credentials: email_username / emt_number')
  console.log('  admin / 0001 (Dom)')
  console.log('  arivera / 1001 (Supervisor)')
  console.log('  jjones / 2001 (Employee, 24-7)')
  console.log('  cdavis / 3001 (Employee, 24-8)')
}

main().catch(console.error).finally(() => prisma.$disconnect())
