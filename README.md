# EMS Chores

Internal EMS operations app for shift setup, roster visibility, chore tracking, persistent overdue work, employee defaults, and supervisor/admin configuration.

## Local Development

```bash
npm install
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Railway builds with `npm run build` (includes `prisma generate`). The start command in `railway.json` runs `prisma db push && tsx prisma/seed.ts && npm start` — schema changes apply automatically on deploy.

**Never run `railway run npx prisma db push` manually** — the Railway CLI context may point to a shared Supabase instance used by another app.

## AI / Contributor Context

Read `AGENTS.md` first. It explains which docs to consult and when.
