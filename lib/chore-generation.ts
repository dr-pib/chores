import type { ChoreTarget } from '@/lib/chore-targeting'

// Minimal template shape — only what generation needs. Callers pull this
// from the full Prisma ChoreTemplate and pass only these fields.
export interface GenerationTemplate {
  id: number
  name: string
  due_offset_hours: number | null
}

// The data shape for nested shift creation: chores: { create: ChoreCreateData[] }
// Does NOT include operations_log_id — Prisma infers it from the parent create.
export interface ChoreCreateData {
  chore_template_id: number
  unit_id: number | null
  bay_label: string | null
  status: 'pending'
  due_at: Date
  chore_date: Date
}

// The data shape for prisma.chore.createMany() in backfill/admin contexts.
// Caller adds operations_log_id after calling buildChoreRows().
export type ChoreCreateManyData = ChoreCreateData & { operations_log_id: number }

// Pure cross-product: every template × every target → one ChoreCreateData row.
//
// Caller is responsible for passing only templates that belong with these targets:
//   - Truck Check + resolvePresentTruckTargets()
//   - Monthly/Quarterly Expires + resolvePresentTruckTargets()
//   - NARC Expires + resolvePrimaryUnitTarget()          ← separate call, never mixed
//   - Station chore + resolveCrewTarget()
//
// dayOffsetMs: 0 for Day 1 (default), 24 * 3600 * 1000 for Day 2 of a 48h shift.
export function buildChoreRows(
  templates: GenerationTemplate[],
  targets: ChoreTarget[],
  choreDate: Date,
  shiftStart: Date,
  dayOffsetMs = 0,
): ChoreCreateData[] {
  const rows: ChoreCreateData[] = []
  for (const template of templates) {
    const due_at = new Date(
      shiftStart.getTime() + dayOffsetMs + (template.due_offset_hours ?? 1) * 3_600_000
    )
    for (const target of targets) {
      rows.push({
        chore_template_id: template.id,
        unit_id: target.unit_id,
        bay_label: target.bay_label,
        status: 'pending',
        due_at,
        chore_date: choreDate,
      })
    }
  }
  return rows
}
