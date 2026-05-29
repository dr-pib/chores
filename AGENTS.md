<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# EMS Chores — AI Contributor Guide

## Documentation Routing

**Always start with:**
- `AGENTS.md` — AI contributor rules and routing (this file).
- `README.md` — local setup, build, deployment basics.

**Read `PROJECT_CONTEXT.md` before changing:**
- Product behavior or user-facing workflows
- Data model or Prisma schema
- Date/time handling (Chicago timezone rules are non-trivial)
- Shift lifecycle or chore lifecycle
- ScheduledWork claiming, generation, or status
- Roles or permissions
- Navigation behavior
- Audit or performance logic

**Read `BUSINESS_RULES.md` before changing:**
- Human-facing chore rules or wording
- Supervisor/admin workflows
- Persistent vs forfeitable behavior
- Due/overdue/missed/late terminology
- Asset responsibility rules (bays, trucks, NARC boxes)
- Unassigned or unclaimed work rules

**Read `AI_WORKPLAN.md` when:**
- Continuing the current active implementation or design task
- Checking current blockers, next steps, files to avoid, or handoff notes

**Read `docs/archive/*` only when:**
- `AI_WORKPLAN.md` links to a specific archive file
- Investigating why an old decision was made
- Reviewing completed implementation history
- Comparing current behavior against an older plan

Do not treat archive files as active instructions unless `AI_WORKPLAN.md` explicitly says to.

---

## Durable Rules

If you learn a new durable domain rule, UI convention, deployment constraint, or architectural decision while working, recommend an update to `PROJECT_CONTEXT.md` before finishing. Do not let important project knowledge live only in the chat transcript.

If you learn a new plain-language operating rule (how work is tracked, what counts as a miss, supervisor responsibilities), recommend an update to `BUSINESS_RULES.md`.

Do not add temporary task notes or implementation details to `PROJECT_CONTEXT.md` or `BUSINESS_RULES.md`. Those belong in `AI_WORKPLAN.md` or `docs/archive/`.

---

## Navigation State Note

Historical shift detail is a special navigation state: ended shifts may use the same detail route as active shifts, but the UI should clearly read as `Historical Shift Record` and link back to Roster History instead of looking like the live My Chores work view.
