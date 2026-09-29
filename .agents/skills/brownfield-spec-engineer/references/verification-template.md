# Traceable Verification Plan: `<feature-slug>`

## 1. Requirement Traceability Matrix

| Req ID | Description | Design Element | Task ID | Verification Method |
|---|---|---|---|---|
| `REQ-001` | [Functional requirement] | Endpoint `POST /api/...` | `TASK-002` | Automated API Test & Manual Curl |
| `SEC-001` | Enforce tenant isolation | Middleware & DB `tenant_id` clause | `TASK-002` | Multi-Tenant Authorization Test |
| `MIG-001` | Non-destructive schema migration | Migration DDL | `TASK-001` | Migration dry-run on DEV DB |

---

## 2. Automated Test Commands
```bash
# Lint check
pnpm lint:admin

# Typecheck & Build validation
pnpm build:admin

# Targeted test execution
pnpm --filter @lumina/admin exec tsc --noEmit
```

---

## 3. Manual Verification & Smoke Test Protocol
1. **DEV Environment Verification**:
   - Deploy to `/opt/apps/nadivo-dev` on `.28`.
   - Run `pnpm build:admin` and restart admin + worker processes.
   - Execute HTTP smoke check: `curl -sS -o /dev/null -w '%{http_code}\n' http://103.52.146.28/login`
2. **Feature Smoke Test**:
   - Perform end-to-end user action on DEV dashboard.
   - Verify DB records in Supabase DEV instance.
3. **Rollback Verification**:
   - Verify rollback SQL script executes cleanly without leaving orphaned records.
