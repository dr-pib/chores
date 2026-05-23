import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRIVATE_URL
if (!dbUrl) throw new Error('No database URL found')
const adapter = new PrismaPg({ connectionString: dbUrl })
const prisma = new PrismaClient({ adapter })

// default_shift_length_hours by email_username, from employee_list_clean-2.csv
const updates: Record<string, number> = {
  'makenzie.biggers': 48,
  'david.binford': 48,
  'teddy.burkitt': 48,
  'timothy.cooper': 48,
  'joe.deaton': 24,
  'nathan.harris': 48,
  'melissa.henderson': 48,
  'rebekah.moore': 48,
  'Jaqueline.rowton': 48,
  'katelynn.jones': 24,
  'jamie.mathis': 48,
  'donovan.armstrong': 48,
  'dillon.bearden': 48,
  'wesley.crowley': 48,
  'stormy.farrell': 48,
  'jerry.halliday': 48,
  'cathy.harris': 48,
  'jason.horton': 48,
  'jasmin.logan': 48,
  'melanie.meyer': 24,
  'kendred.thompson': 48,
  'richard.hinson': 48,
  'david.duncan': 48,
  'shaun.egger': 48,
  'james.hendrix': 48,
  'donald.remer': 48,
  'john.robinson': 48,
  'zachary.campbell': 48,
  'wallace.crowley': 48,
  'brian.duncan': 48,
  'mary.hickman': 48,
  'gina.ray': 48,
  'marcus.reynolds': 48,
}

async function main() {
  let updated = 0
  let notFound = 0
  for (const [username, hours] of Object.entries(updates)) {
    const result = await prisma.employee.updateMany({
      where: { email_username: username },
      data: { default_shift_length_hours: hours },
    })
    if (result.count > 0) {
      console.log(`  ${username}: ${hours}h`)
      updated++
    } else {
      console.warn(`  NOT FOUND: ${username}`)
      notFound++
    }
  }
  console.log(`\nDone: ${updated} updated, ${notFound} not found`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
