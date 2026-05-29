// One-time repair: adds 5 hours to actual_start/actual_end for logs 50-73
// and adjusts their chore due_at values by the same offset.
// These shifts were seeded with UTC times instead of CDT (UTC-5) times.
import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const OFFSET_MS = 5 * 3600 * 1000 // CDT is UTC-5
const LOG_IDS = Array.from({ length: 24 }, (_, i) => i + 50) // 50..73

async function main() {
  const logs = await prisma.operationsLog.findMany({
    where: { id: { in: LOG_IDS } },
    include: { chores: { select: { id: true, due_at: true } }, shift_profile: { select: { name: true } } },
    orderBy: { id: 'asc' },
  })

  console.log(`Found ${logs.length} logs to repair`)

  for (const log of logs) {
    const newStart = new Date(log.actual_start.getTime() + OFFSET_MS)
    const newEnd = new Date(log.actual_end.getTime() + OFFSET_MS)

    await prisma.operationsLog.update({
      where: { id: log.id },
      data: { actual_start: newStart, actual_end: newEnd },
    })

    let choreFixed = 0
    for (const chore of log.chores) {
      if (chore.due_at) {
        await prisma.chore.update({
          where: { id: chore.id },
          data: { due_at: new Date(chore.due_at.getTime() + OFFSET_MS) },
        })
        choreFixed++
      }
    }

    const startCDT = newStart.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago' })
    console.log(`  log ${log.id} ${log.shift_profile.name.padEnd(12)} → ${newStart.toISOString()} (${startCDT} CDT)  ${choreFixed} chores`)
  }

  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
