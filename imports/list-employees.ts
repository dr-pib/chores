import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) throw new Error('No DATABASE_URL')
const adapter = new PrismaPg({ connectionString: dbUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
  const emps = await prisma.employee.findMany({ select: { name: true }, orderBy: { name: 'asc' } })
  emps.forEach(e => console.log(e.name))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
