> Archived from AI_WORKPLAN.md during documentation cleanup. This file is historical reference, not active instructions.

# ScheduledWork Ownership Model — Design & Implementation History, May 2026

This file captures the full design discussion and step-by-step implementation notes for the ScheduledWork ownership model (Steps 1–10). All steps are complete. The active workplan only needs the summary.

---

## Domain Model Summary (settled)

### ChoreTemplate classification matrix

| Template | asset_scope | lifecycle | is_critical | generates_independently |
|---|---|---|---|---|
| Truck Check | `truck` | `forfeitable` | true | true |
| Monthly Expires | `truck` | `persistent` | true | true |
| Quarterly Expires | `truck` | `persistent` | true | true |
| NARC Expires | `narc_box` | `persistent` | true | true |
| NARC Box Check | `narc_box` | `forfeitable` | true | true |
| Station rotation chores | `crew` | `forfeitable` | false | false |

### ScheduledWork model key fields

- `asset_type + asset_key` — non-nullable dedup fields avoiding Postgres nullable-unique issues
- `asset_key = String(unit.id)` for trucks; `String(narcBox.id)` for NARC boxes
- `claimed_by_log_id` — tracks shift ownership (not a status; presence indicates claim)
- `status`: `pending | complete | missed | not_applicable | voided`
- `resolution_note String?` — supervisor note for not_applicable/voided
- `due_at DateTime` — non-nullable; defaults to 08:00 Chicago for unclaimed rows; updated to `actual_start + due_offset_hours` when claimed
- `is_late_completion Boolean` — set true when persistent work is completed after `missed`

### Lifecycle vocabulary (settled)

- **Forfeitable**: if the window closes without action, the opportunity is gone. Becomes a missed accountability record. Examples: Truck Check, NARC Box Check.
- **Persistent**: obligation remains until completed regardless of date. Examples: Monthly/Quarterly/NARC Expires.
- These are two values of `ChoreTemplate.lifecycle`, not three. `daily_reset` retired; station chores use `crew` scope + `forfeitable` lifecycle + `is_critical: false`.

### Key design decisions

- `claimed` is NOT a status — it is the presence of `claimed_by_log_id`. Status tracks completion state; claim FK tracks ownership.
- Completing already-complete SW: do not create a new pending Chore. Set `claimed_by_log_id` to record audit chain. Show "already completed by [name]" in My Chores.
- `not_applicable` (with `resolution_note`) = asset was at shop / OOS / not applicable — not the same as complete.
- Performance: `not_applicable` does not count against completion rate. `missed` is the true miss.
- `due_offset_hours` and `lock_offset_hours` are per-template admin values — never hardcoded. Default fallbacks: `+1h` due, `+31h` lock.

### Two supervisor surfaces (not one)

1. **Compliance/Safety (persistent + critical + unclaimed):** "needs to be done, act now" — supervisor can complete.
2. **Coverage Gap Record (forfeitable + critical + missed):** "was not done, window closed, document it" — supervisor documents with `not_applicable` + note; cannot retroactively complete.

---

## Implementation Sequence — All Steps Complete

### Step 1 ✅ — ChoreTemplate metadata fields (commit e174a5b)
Added `asset_scope`, `lifecycle`, `is_critical`, `generates_independently`, `station_scope` to `ChoreTemplate`. Seeded existing templates per matrix above.

### Step 2 ✅ — ScheduledWork table + Chore FK
Added `ScheduledWork` model with `asset_type + asset_key` dedup. Added `Chore.scheduled_work_id Int? @unique`. Added back-relations to `ChoreTemplate`, `Unit`, `NarcBox`, `Employee` (`ScheduledWorkCompletedBy`), `OperationsLog` (`ClaimedScheduledWork`).

Deployment note: required temporary `--accept-data-loss` for the unique constraint on `chores.scheduled_work_id`; removed in cleanup commit `309c3ff`.

### Step 2.5 ✅ — lifecycle_type cleanup (commit ce3099e)
Added `lib/lifecycle.ts` with `isPersistent()` and `isForfeitable()` reading `ChoreTemplate.lifecycle`. Migrated 10 files from old `lifecycle_type` values. `lifecycle_type` intentionally preserved for Chore Admin form and API routes.

### Step 3 ✅ — Completion route sync (commit d69e13d)
In complete/uncomplete routes: when `chore.scheduled_work_id` is set, sync `ScheduledWork.status` in the same `$transaction`.

### Step 4 ✅ — Admin generation endpoint (commit 769551c)
`/api/admin/generate-scheduled-work` POST. Generates SW rows for all `generates_independently=true` templates on qualifying dates for all eligible assets. Idempotent via `skipDuplicates`. No claiming. Admin-only. Also surfaced in Admin Utilities panel with date picker.

### Step 5 ✅ — Window-bound miss transition (commit 6baaa42, fixed a2b671b)
`/api/admin/mark-missed-scheduled-work` POST. Transitions pending forfeitable SW past lock window to `status: 'missed'`. Lock anchor: unclaimed rows use `work_date`; claimed rows use `claimed_by_log.actual_start`. Safe to call repeatedly.

### Step 6 ✅ — Claiming in shift creation (commit ab009a2)
New-shift creation path in `operations-logs/route.ts`: queries unclaimed pending SW for shift assets + dates, annotates chore rows with `scheduled_work_id`, updates claims after log creation. Uses `asset_type + asset_key` matching. Race guard: on P2002 unique conflict, falls back to unlinked chore creation.

### Step 7 ✅ — Unclaiming + re-claiming in shift edit (commit 28d609d)
Edit path: Phase 1 releases pending claims for removed assets (deletes linked pending Chores, resets SW to unclaimed). Phase 3 claims newly available SW for added assets. Completed SW never touched.

**Integrity fixes (commit 333b1eb):**
- Retained-asset TC SW preservation: `tcSwByKey` carries SW link through the `deleteMany/create` cycle.
- New-shift query: added `claimed_by_log_id: null` guard.
- Race guard on `operationsLog.create`.
- `chicago0800` moved to `lib/dates.ts`.

**Late completion tracking (commit 29e0997):**
- `is_late_completion Boolean` added to `ScheduledWork`.
- Set `true` when SW was `missed` at completion time. Performance endpoints return `late_sw_60d`.

### Step 8 ✅ — Monthly/Quarterly/NARC generation + claiming (commit 608d3fb)
`ensureScheduledWork()` helper in `operations-logs/route.ts`: called on both new-shift and edit paths. Creates SW for the shift's specific persistent assets before the claim query — shift-specific only, not service-wide. `skipDuplicates` safe.

**Edge case fix (commit edda355):** Widened SW query to `status IN ['pending', 'complete']` to build `completedSwKeys` and suppress duplicate standalone chore creation when another crew already completed the work.

### Step 9 ✅ — Supervisor unassigned/missed UI (commit dd06dea)
Two supervisor-only sections in `app/chores/page.tsx`:
1. **Unassigned — Needs Completion (amber):** unclaimed pending persistent critical SW.
2. **Coverage Gaps (yellow/zinc):** missed forfeitable critical SW, last 30 days.

Overdue ticker extended for unclaimed pending persistent SW.

### Step 10 ✅ — Supervisor direct-complete / not-applicable (commits c68855d, 9aac0e2)
`/api/scheduled-work/[id]/resolve` POST. Supervisor marks SW `complete` or `not_applicable` with optional note. Writes `ChangeLog` with `scheduled_work_id`. `ScheduledWorkActionButtons` component added to Everyone's Chores sections. `scheduled_work_id` added to `ChangeLog` schema.

---

## ESO Shift Seed — 2026-05-28

One-time seed from `imports/eso_shift_seed_2026-05-28_to_2026-05-31.csv`. Scripts: `preflight-eso-shifts.ts`, `seed-eso-shifts.ts`, `list-employees.ts`. 24 shifts inserted. `schedule_import_first_name String?` added to `Employee` to handle ESO first-name mismatches.

Name aliases: James→Jim Ketterman, Jerry→Dale Halliday, Donald→Don Remer, Melissa Remer→Melissa Henderson, Joe→Vince Deaton, Jacqueline→Paige Rowton.

---

## Pre-Implementation Design Discussions

The following captures key design decisions made before implementation. Preserved for reference if questions arise about why things were built a certain way.

### Why asset_type + asset_key instead of nullable unit_id/narc_box_id for dedup

Postgres nullable unique indexes allow multiple rows where nullable fields are `NULL`. Two NARC rows with the same template/date/narc_box_id and `unit_id = NULL` would not be deduped. Non-nullable `asset_type String` + `asset_key String` avoids this entirely.

### Why claimed_by_log_id is not a status

`claimed` as a status would conflict with `pending` (still actionable). The claim FK describes responsibility; `status` describes completion state. Two orthogonal dimensions.

### Why due_at is non-nullable with a default of 08:00 Chicago

Making it nullable would require null guards everywhere due_at is compared. Defaulting to 08:00 Chicago gives unclaimed work a predictable, visible due time. When a shift claims, due_at is updated to `actual_start + due_offset_hours`.

### Why generates_independently is an explicit field

Avoids deriving it from `asset_scope + is_critical`. Future templates may deviate from the expected correlation. Chore Admin exposes it as a direct toggle.

### Why lifecycle_type was not retired

Chore Admin form and its API routes still use it for display/editing. Retiring it would require UI changes outside the ScheduledWork scope. `lib/lifecycle.ts` helpers insulate runtime code from the old field values.
