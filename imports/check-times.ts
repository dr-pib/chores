import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
async function main() {
  const logs = await prisma.operationsLog.findMany({
    where: { service_date: new Date('2026-05-28T00:00:00.000Z') },
    select: { id: true, shift_profile: { select: { name: true } }, actual_start: true, actual_end: true },
    orderBy: { id: 'asc' },
  })
  logs.forEach(l => {
    const startCDT = l.actual_start.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago' })
    console.log(l.id, l.shift_profile.name.padEnd(12), l.actual_start.toISOString(), `(${startCDT} CDT)`)
  })
}
main().catch(console.error).finally(() => prisma.$disconnect())
