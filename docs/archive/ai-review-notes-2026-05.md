> Archived from AI_WORKPLAN.md during documentation cleanup. This file is historical reference, not active instructions.

# AI Review Notes — May 2026

---

## Gemini Review — May 28, 2026

### Operations Chief Dashboard & Gerald Bays
- `location_note String?` on `ScheduledWork` is well-aligned with the asset-centric model. Since Truck Check SW is now generated daily for all eligible units, this field provides the anchor for tracking unassigned trucks without a separate Location table.
- **Gap:** Dashboard design calls for "Assigned at 11:14 by [Name]" context. Currently `OperationsLog` updates replace bays in bulk, destroying the specific "assignment event" timestamp. To support this: add `created_at` to `OperationsLogBay`, or explicitly log `bay_added` actions in `ChangeLog` during the shift edit transaction.
- **Ambiguity:** For "Unassigned Trucks" column, define color logic for "Unconfirmed" shifts (check `supervisor_confirmed_at` null on active log).
- **Positive:** TV/Large Screen focus for Brent's dashboard is excellent for status-at-a-glance monitoring.

### Shift Phone Numbers & SMS
- `phone_number` on `ShiftProfile` is the correct durable home. Decouples communication channel from specific employee.
- Deferred SMS implementation is the right call. The "all clear" message rule prevents ambiguity.
- **Gap:** When Brent sees a phone number on dashboard, it should be a `tel:` link for one-tap dialing on tablet/phone.

### Performance Reporting
- Biweekly meeting focus is a strong North Star for the reporting UI. `late_sw_60d` metric provides necessary nuance for persistent work.
- **Ambiguity:** "Trend lines" need a defined bucket size (e.g., biweekly to match meeting cycle).
- Date-range filtering is the most critical next step for biweekly meeting use case.

### Step 10 & Future Console
- Wednesday/Thursday All Crews example confirms future console needs `weekday_pattern` or `recurrence_rule` field.
- No conflicts found. The matrix model (`asset_scope × lifecycle × is_critical`) is robust enough for the variety of chores described.
- Step 10 (Direct Action) is the key to making the dashboard actionable. `not_applicable` status is critical for keeping "Unassigned" list clean when trucks are at the shop.

---

## Overnight Pin — May 25, 2026

Preserved for historical reference only.

State at pin:
- Step 1 complete (commit e174a5b): `ChoreTemplate` has `asset_scope`, `lifecycle`, `is_critical`, `generates_independently`, `station_scope`.
- `prisma/seed.ts` updated with template matrix values.
- No `ScheduledWork` table yet. No behavior changes. No UI changes.
- Next: Step 2 (ScheduledWork schema).
