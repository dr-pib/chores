# ESO Shift Seed Handoff

Use `/Users/chendrix/chores/imports/eso_shift_seed_2026-05-28_to_2026-05-31.csv` as a one-time testing seed source.

## Goal

Seed roster/shift data from ESO exports for May 28 through May 31, 2026 so the app has realistic test shifts. This is not the permanent importer yet.

## Import Rules

- Import only rows in the CSV. Ignore dispatch, maintenance, admin, light duty, time off, special events, and notes from the original ESO exports.
- Match employees by normalized name from `Last, First` against the employee table.
- Match shift profiles by `shift_profile`: `Supervisor`, `Swing`, `24-7`, `24-8`, `DC-ALS`, `NC-ALS`.
- Preflight before inserting:
  - List unmatched employees.
  - List unmatched shift profiles.
  - List rows where `needs_review=true`.
  - List any existing operation log for the same `service_date + shift_profile`.
- Employee matching should allow either the display first name from `employees.name` or the optional `employees.schedule_import_first_name`. For example, ESO may show `Ketterman, James` for Jim Ketterman or `Halliday, Jerry` for Dale Halliday.
- Do not overwrite existing shifts without explicit user confirmation.
- For normal 24-hour rows, build `actual_start` from `service_date + start_time` and `actual_end` as the following day at `end_time`.
- Use shift profile defaults for station, default bays, default units, and primary unit placeholders. The user will correct bay/truck/NARC details after import.
- If the app route/API can safely create these shifts and trigger existing chore/ScheduledWork logic, prefer that path. If using a script, preserve current creation semantics so chores and ScheduledWork are generated/claimed consistently.
- Report inserted, skipped, existing, unmatched, and needs-review rows after the run.

## Seed Interpretation

For this testing seed, the goal is to find the 12 recognizable field names for each date: two employees for each of the six app shift profiles.

If ESO lists one partner with a slightly different start time, or shows partial coverage where one person worked only part of the shift and another person covered the rest, still import the app shift under the shift profile shown in the CSV. The imported app shift should use the shift profile's normal start/end. These timing differences are coverage details, not blockers and not a reason to split the app shift. The employees listed for that shift still carry the shift's chore responsibility unless the user explicitly flags that row for manual handling.

## Longer-Term Importer Notes

A permanent ESO importer should eventually:

- Accept the exported HTML/XLS report directly.
- Preview parsed shifts before committing.
- Let the user map/ignore ESO shift names.
- Detect duplicates by date and shift profile.
- Show unmatched employees with suggested matches.
- Create draft/prebuilt shifts when the app has a draft shift model, instead of always creating live OperationsLog rows.
- Preserve current asset-work rules: imported shifts should claim matching ScheduledWork for trucks/NARC boxes only when the shift asset selections are known or later edited in.
