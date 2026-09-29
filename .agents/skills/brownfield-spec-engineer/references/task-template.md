# Implementation Task Breakdown: `<feature-slug>`

## Phase 1: Database & Schema Migrations
- [ ] `TASK-001`: Create database migration file
  - **Files**: `apps/admin/drizzle/xxxx_migration.sql`, `apps/admin/src/lib/db/schema.ts`
  - **Goal**: Add new columns/tables safely without breaking existing records.
  - **Requirements Addressed**: `MIG-001`, `REQ-001`
  - **Verification**: `pnpm db:generate` or manual DDL test against DEV Supabase.

---

## Phase 2: API & Core Logic Implementation
- [ ] `TASK-002`: Implement API endpoint and validation handler
  - **Files**: `apps/admin/src/app/api/.../route.ts`, `apps/admin/src/lib/services/...ts`
  - **Goal**: Handle request payload, enforce tenant isolation, and update DB state.
  - **Requirements Addressed**: `REQ-001`, `VAL-001`, `SEC-001`
  - **Verification**: Local API request test / automated route test.

---

## Phase 3: Background Worker & Integrations
- [ ] `TASK-003`: Update BullMQ worker job handler
  - **Files**: `apps/admin/scripts/worker.ts`, `apps/admin/src/lib/queue/...`
  - **Goal**: Process background queue jobs for the new feature.
  - **Requirements Addressed**: `REQ-002`, `NFR-001`
  - **Verification**: Run `pnpm worker` and verify job processing logs.

---

## Phase 4: Frontend & UI Components
- [ ] `TASK-004`: Update UI dashboard components
  - **Files**: `apps/admin/src/components/...tsx`
  - **Goal**: Render new feature inputs and display updated state.
  - **Requirements Addressed**: `REQ-001`
  - **Verification**: Visual verification & component render test.

---

## Phase 5: Verification & Deployment
- [ ] `TASK-005`: Run full test suite and verify DEV deployment
  - **Verification**: Execute `pnpm lint:admin` and `pnpm build:admin`.
