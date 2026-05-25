<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# EMS Chores Project Context

Before making product, data model, date/time, role/permission, chore lifecycle, or navigation changes, read `PROJECT_CONTEXT.md`.

If you learn a new durable domain rule, UI convention, deployment constraint, or architectural decision while working, recommend an update to `PROJECT_CONTEXT.md` before finishing. Do not silently let important project knowledge live only in the chat transcript.

Historical shift detail is a special navigation state: ended shifts may use the same detail route as active shifts, but the UI should clearly read as `Historical Shift Record` and link back to Roster History instead of looking like the live My Chores work view.
