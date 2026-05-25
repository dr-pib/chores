# EMS Chores

Internal EMS operations app for shift setup, roster/history views, chore completion, persistent overdue chores, employee defaults, and supervisor/admin configuration.

## Local Development

```bash
npm install
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Product Notes

- `Setup` creates a new shift. If the logged-in employee is already on an active shift, the nav label becomes `Edit Current Shift`.
- `Roster` contains `Today` and `History`.
- A shift stays on Today's Roster until its actual end date/time, including 48-hour shifts that cross midnight.
- History opens the same underlying shift detail screen, but ended shifts should display as `Historical Shift Record` with a back link to Roster History.
- `Chores` contains `My Chores` and `Everyone's Chores`.
- `My Chores` is the active work view for the logged-in employee's current shift.
- `Everyone's Chores` lists the same active shifts as Today's Roster, plus a separate section for open persistent chores from past shifts.

## Deployment

Railway should use:

```bash
npm run build
```

The build script runs `prisma generate`; keep that in place unless the deployment strategy changes.

## AI / Contributor Context

Before making product, data model, date/time, role/permission, chore lifecycle, or navigation changes, read `PROJECT_CONTEXT.md`.
