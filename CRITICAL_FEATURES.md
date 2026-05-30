# Critical Features — DO NOT DEPRECATE

This file lists load-bearing behaviors that have been broken or accidentally
removed before. **Do not remove, simplify away, or "clean up" anything in this
file without explicit sign-off from the maintainer (Clay).** If a refactor
appears to make one of these obsolete, stop and ask first.

Each entry states: what the feature does, why it matters operationally, where
it lives in code, the invariants that must hold, and the common ways it breaks.

---

## 1. Persistent chores carry forward to future shifts

### What it does
Unfinished **persistent** chores (Monthly Expires, Quarterly Expires, NARC
Expires, and any persistent crew/station chores) from a *previous* shift are
surfaced on the *current* responsible shift's chore page, in the red
**"Unfinished Chores From Previous Shifts"** section. The current crew can then
complete that carried-over work (legitimate late / make-up completion).

This is the mechanism that makes persistent work actually persistent: the work
follows the asset/crew across shift boundaries until someone completes it, and
it never silently disappears just because the shift that originally generated it
has ended.

### Why it matters
- Expires (Monthly/Quarterly/NARC) remain legally/operationally required until
  done. If a crew misses one, the next responsible crew must see it and be able
  to finish it. Without carry-forward, missed expires would vanish from every
  active view and only a supervisor digging through history would catch them.
- This behavior has been **accidentally deprecated before.** That is the reason
  this file exists.

### Where it lives
- `app/log/[id]/page.tsx` — the `previousPersistentChores` Prisma query and the
  red "Unfinished Chores From Previous Shifts" render block.
- `lib/lifecycle.ts` — `isPersistent()` / `isForfeitable()` decide what carries
  forward. Only **persistent** work carries forward; forfeitable work (Truck
  Checks, NARC Box Checks, station chores) becomes a missed accountability
  record instead and must NOT appear here.

### Invariants that must hold
1. The query matches carried-forward work by **asset/owner**, not by shift id:
   - Monthly/Quarterly Expires → match by truck `unit_id` (current present units).
   - **NARC Expires → match by `narc_box_id`** when the source shift recorded a
     box, with a fallback to `unit_id` for old rows that predate `narc_box_id`.
     NARC follows the **box**, not the truck. (See `PROJECT_CONTEXT.md`.)
   - Persistent crew/station chores → match by `shift_profile_id`.
2. The section renders for the employee whose shift it is (`isMyLog`) **and** for
   supervisors viewing any shift, so command can see what the crew owes.
3. Regular employees — not just supervisors — can complete carried-forward
   persistent chores. The past-shift guard in
   `app/api/chores/[id]/complete/route.ts` must allow non-supervisors through
   **for persistent templates** (`!isPersistent` is the only thing it blocks).
4. A carried-forward chore completed **during the current shift** by the current
   crew stays visible (checked off) for the remainder of that shift instead of
   disappearing. The query therefore includes `status: 'completed'` rows where
   `completed_by_id ∈ current crew` and `completed_at >= shift actual_start`, in
   addition to all `status: 'pending'` rows.
5. Completion credit/lateness is preserved: completing missed persistent work
   sets `is_late_completion` on the linked `ScheduledWork`; the original crew
   keeps the miss, the completer gets normal credit. Do not "fix" this by
   reassigning the miss.

### Common ways it breaks (watch for these in review)
- Adding `status: 'pending'` as the *only* status filter and dropping the
  completed-this-shift branch → completed make-up work vanishes mid-shift
  (regression fixed once already).
- Routing NARC Expires through the generic per-unit matching instead of
  `narc_box_id` → NARC work follows the truck and lands on the wrong crew.
- Re-gating the render or the complete endpoint to supervisors only → regular
  crews can no longer do their own make-up work.
- Treating these as "past shift edits" and blocking them behind the historical
  edit warning → the checkbox disables for the people who are supposed to use it.
