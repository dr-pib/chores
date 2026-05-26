# Copilot Performance & Architecture Review

## Overview
EMS Chores is a new Next.js + React + TypeScript web application for managing shift operations, rosters, and task tracking. The following are potential performance and architectural concerns identified before production rollout.

---

## 🔴 Critical Concerns

### 1. N+1 Query Pattern Risk
**Issue:** The Prisma schema has extensive relationships that can easily trigger N+1 queries if not carefully managed.

**Problem Areas:**
- `Employee` model has 8 relations (supervisor, partner, logs, chores, etc.)
- `OperationsLog` has 6 relations (employees, station, shift profile, bays, chores, change logs)
- `Chore` has 4 relations (template, tasks, operations log, completed by employee)
- Views like "Everyone's Chores" and Roster likely need to fetch related data deeply

**Impact:** Loading a shift roster could trigger dozens of individual queries instead of one or two optimized queries.

**Recommendation:**
- Audit all API routes and data fetching functions for explicit Prisma `.include()` or `.select()` usage
- Avoid implicit relation loading; always specify what related data is needed
- Test with database query logging enabled to spot N+1 patterns early

**Example Problem:**
```typescript
// ❌ BAD - Will trigger multiple queries
const chores = await prisma.chore.findMany();
chores.forEach(chore => console.log(chore.completed_by.name)); // N queries for employees

// ✅ GOOD - Single query with relations
const chores = await prisma.chore.findMany({
  include: { completed_by: true }
});
```

---

### 2. Unbounded Query Results
**Issue:** No explicit pagination or result limits for large datasets.

**Problem Areas:**
- "Everyone's Chores" lists all active shifts + persistent chores (could grow rapidly)
- "Roster History" may load all historical shifts without pagination
- Employee relationships (supervised_employees, partner_of) have no query limits
- Change logs accumulate over time with no cleanup strategy

**Impact:** As the system grows, endpoints will become slower and memory usage will spike.

**Recommendation:**
- Implement pagination on all list endpoints (limit + offset or cursor-based)
- Set sensible defaults (e.g., 50-100 items per page)
- Add date range filtering (e.g., "History from last 90 days")
- Consider archiving old chores/change logs

---

### 3. Missing Database Indexes
**Issue:** The Prisma schema doesn't specify indexes for frequently queried fields.

**Problem Areas:**
- `OperationsLog`: Queries likely filter by `service_date`, `status`, `shift_profile_id`, or `primary_employee_id`
- `Chore`: Queries likely filter by `status`, `due_at`, or `operations_log_id`
- `Employee`: Queries likely filter by `email_username`, `role`, or `status`
- `ChangeLog`: Queries likely filter by `created_at` or `changed_by_employee_id`

**Impact:** Without indexes, queries become full table scans as data grows, degrading performance exponentially.

**Recommendation:**
- Add database indexes to `prisma/schema.prisma`:
  ```prisma
  model OperationsLog {
    // ... existing fields
    @@index([service_date])
    @@index([status])
    @@index([shift_profile_id])
    @@index([primary_employee_id])
  }
  
  model Chore {
    // ... existing fields
    @@index([status])
    @@index([due_at])
    @@index([operations_log_id])
  }
  
  model Employee {
    // ... existing fields
    @@index([role])
    @@index([status])
  }
  
  model ChangeLog {
    // ... existing fields
    @@index([created_at])
  }
  ```

---

### 4. Deep Relationship Traversal in Views
**Issue:** Complex views require traversing multiple relationship levels, which multiplies query complexity.

**Problem Areas:**
- "Everyone's Chores" needs: OperationsLog → Chore → ChoreTask → Employee + ChoreTemplate
- "Roster Today" needs: OperationsLog → OperationsLogBay → Chore → Chore.tasks → Employee + ChoreTemplate
- Each level of nesting increases data transfer and serialization overhead

**Impact:** Pages with many shifts/chores will load slowly and consume significant bandwidth.

**Recommendation:**
- Profile data fetching with tools like Prisma Studio or query logging
- Consider denormalizing commonly accessed data (e.g., storing shift status summary on OperationsLog)
- Implement query result caching for expensive operations (Redis or in-memory)
- Lazy-load related data on the frontend instead of eagerly loading everything

---

### 5. DateTime and Date Field Handling
**Issue:** Heavy reliance on DateTime/Date filtering without clear timezone strategy or optimization.

**Problem Areas:**
- `service_date`, `chore_date`: Used for filtering by day (could be inefficient with DateTime fields)
- `actual_start`, `actual_end`: Time range queries without index support
- Shifts crossing midnight (48-hour shifts) require complex date logic
- No explicit timezone handling visible in schema

**Impact:** Date range queries could perform poorly, especially without proper indexes.

**Recommendation:**
- Ensure DateTime fields have indexes (see #3 above)
- Document timezone strategy (UTC storage with timezone conversion on the frontend)
- Use database native date/time functions for filtering to avoid application-level computation
- Test performance of date range queries (e.g., "All shifts for a specific week")

---

## 🟡 Medium-Priority Concerns

### 6. No Query Result Limits in API Routes
**Issue:** If API routes don't implement `take()` limits, large result sets will be fetched and serialized.

**Recommendation:**
- Add default limits to all Prisma queries (e.g., `take: 100`)
- Return total count and pagination info in API responses
- Use cursor-based pagination for better performance on large datasets

---

### 7. Cascade Deletes Could Trigger Large Operations
**Issue:** `onDelete: Cascade` on OperationsLog and Chore will delete related records recursively.

**Problem Areas:**
- Deleting an OperationsLog cascades to OperationsLogBay, Chore, ChoreTask, ChangeLog
- Large operations could be slow without proper indexing

**Recommendation:**
- Test deletion of a shift with many chores to ensure performance is acceptable
- Consider soft deletes (adding `deleted_at` field) instead of hard deletes for audit trails

---

### 8. Change Log Accumulation
**Issue:** ChangeLog records are never cleaned up and will grow indefinitely.

**Recommendation:**
- Implement a cleanup strategy (e.g., archive logs older than 1 year)
- Add indexes on `created_at` for efficient time-range queries

---

## 🟢 Questions Before Production

- **How many employees** do you expect in the system?
- **How many shifts per day** and **chores per shift**?
- **What's the expected concurrent user count?**
- **Are there any reported slow pages or operations?**
- **Have you profiled the database queries** (e.g., with Prisma Studio)?
- **Is query result caching considered** (Redis, in-memory cache)?

---

## Suggested Next Steps

1. **Enable Prisma Query Logging:** Add `log: ['query']` to datasource in `prisma.config.ts` and watch console for N+1 patterns
2. **Add Database Indexes:** Update `prisma/schema.prisma` with recommended indexes and run `prisma db push`
3. **Profile Critical Paths:** Test "Everyone's Chores", "Roster Today", and "History" views with realistic data volumes
4. **Implement Pagination:** Audit all API routes and add pagination limits
5. **Load Testing:** Simulate realistic user counts and data volumes to identify bottlenecks

---

**Review Status:** Pending code audit of API routes and database query patterns.

---

## Codex Feedback - May 25, 2026

Reviewed against the current local codebase. This review is directionally useful, but much of it is generic pre-production scaling advice rather than evidence of current breakage.

### Most Valid Near-Term Concern

**Missing database indexes is the strongest actionable finding.**

The current Prisma schema has unique constraints but very few explicit `@@index` entries. The app now frequently queries active shifts, historical shifts, overdue chores, badge counts, and change logs. Before real production rollout, add indexes for the actual query patterns.

Recommended first-pass indexes:

```prisma
model OperationsLog {
  @@index([actual_end])
  @@index([service_date])
  @@index([primary_employee_id])
  @@index([partner_employee_id])
  @@index([shift_profile_id])
}

model OperationsLogBay {
  @@index([unit_id])
  @@index([operations_log_id])
}

model Chore {
  @@index([operations_log_id])
  @@index([chore_template_id])
  @@index([unit_id])
  @@index([status])
  @@index([due_at])
  @@index([chore_date])
}

model ChoreTask {
  @@index([chore_id])
  @@index([chore_template_task_id])
}

model ChangeLog {
  @@index([created_at])
  @@index([changed_by_employee_id])
  @@index([target_employee_id])
}
```

Composite indexes may be even better after query review, especially:

```prisma
@@index([actual_end, actual_start])
@@index([status, due_at])
@@index([operations_log_id, chore_template_id, chore_date, unit_id])
```

But do not add every possible index blindly. Match indexes to the real query patterns.

### Partly Valid, But Not A Launch Blocker

**Unbounded queries:** Some routes already have practical limits:

- History uses `take: 300`.
- Change Log uses `take: 500`.
- Everyone's Chores overdue persistent section uses `take: 20`.

Other admin/reference lists remain unbounded, but expected data size is small for initial rollout. Pagination is good later; not urgent before a small internal launch.

**N+1 query risk:** The main pages mostly use explicit Prisma `include` trees rather than classic lazy relation access. The bigger current risk is large payloads from deep includes, not obvious N+1 behavior. Query logging can confirm this later.

**Deep relationship traversal:** Valid as a future performance watch item. Not worth adding Redis/cache or denormalized summary tables yet.

**Change log accumulation:** Valid long-term. Current list is capped at 500, so the immediate issue is indexing and eventual archive policy, not UI failure.

### Lower Priority Right Now

Do not let this review derail the current backend cleanup sequence:

1. Role helper extraction.
2. Chore targeting helper.
3. Chore generation helper.
4. Route integration one route at a time.
5. Index review before rollout.

The helper cleanup addresses correctness and maintainability bugs we are already seeing. The index work should happen before production rollout, but after the core domain logic is stable enough that we know the final query shapes.

### Suggested Addition To AI Workplan

Add a backend maintenance item:

```text
Before rollout, perform an index review based on actual Prisma query patterns. Prioritize active shift queries, history queries, chore status/due queries, unit conflict checks, and change log ordering.
```

### Bottom Line

Valid review, but severity should be adjusted:

- **Indexes:** real and near-term.
- **Pagination/caching/denormalization:** later scaling work.
- **N+1:** worth checking with query logging, but not proven from current code.
- **Current priority:** finish helper-based backend cleanup, then add targeted indexes before rollout.
