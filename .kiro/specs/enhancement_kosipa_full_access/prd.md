# MASTER PROMPT — KOSIPA FULL ACCESS MODERNIZATION
## Legacy CodeIgniter Audit → Native Next.js CRUD & Financial Operations

### ROLE & MISSION

You are acting as a **Principal Software Architect, Senior Full-Stack Engineer, Legacy System Modernization Specialist, Database Performance Engineer, and Financial Systems Auditor**.

Your mission is to conduct an in-depth, evidence-based audit of the existing legacy KOSIPA application and design the complete implementation of its business functionality in the new unified Next.js application.

The ultimate goal is to transform KOSIPA from a **Read-Only Integration** into a **Fully Functional Management System** with all legitimate business capabilities available in the legacy application.

This includes:

- Read and view
- Create and add
- Update and edit
- Delete, cancel, void, or reverse, according to financial business semantics
- Approval and rejection workflows
- Financial transaction processing
- Administrative and configuration functions
- Reporting, searching, filtering, and exporting
- All additional business operations discovered in the legacy application

**IMPORTANT: Audit first. Do not start implementing write features until the audit, design, and implementation backlog have been completed.**

Do not merely copy the legacy implementation. Reconstruct its business capabilities using a clean, optimized, maintainable, and secure architecture.

---

# 1. PROJECT CONTEXT

## 1.1 New Application

The current application is a modernized Unified Console built with Next.js, TypeScript, and the architecture already established in this repository.

Its KOSIPA module already supports read-only access.

Existing capabilities may include:

- Dashboard and summary
- Member information
- Loan information
- Financial summaries
- Search and filters
- CSV export
- Identity linking and management
- Existing role-based access controls

These capabilities must be verified from the actual code.

**Do not assume that the existing read-only implementation is incorrect or requires a complete rewrite.**

Preserve working functionality and existing contracts unless concrete evidence shows that an adjustment is necessary.

## 1.2 Legacy Application Location

The legacy application is located at:

`/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/kosipa`

This directory contains the previous KOSIPA implementation using CodeIgniter/PHP.

You MUST inspect the actual source code in this directory.

Treat this legacy application as the primary reference for:

- Existing functional coverage
- Business rules
- User workflows
- Financial operations
- Validation logic
- Database relationships
- Authorization behavior
- Approval and rejection processes
- Reporting and exports
- Operational edge cases

However:

**The legacy application is a behavioral reference, not the target technical architecture.**

## 1.3 Existing Documentation

Before inspecting legacy code, read the existing project documentation, especially:

`docs/`

Include relevant architecture, migration, database, domain, authentication, RBAC, and KOSIPA specifications.

Previous auditing and modernization work has already been documented.

Do not repeat a full discovery audit of the entire Suzuki Koperasi application.

Instead:

1. Read existing documentation.
2. Identify what is already documented.
3. Verify existing conclusions against relevant legacy code.
4. Focus investigation on missing KOSIPA write capabilities.
5. Update documentation where evidence differs.

Avoid unnecessary duplicate research.

## 1.4 Existing Database

The current read-only implementation has been validated against `kkisi_staging`, which contains real member-related data.

Known dataset characteristics include approximately:

- 9,276 members
- 32,631 loans

Verify current schema and row counts if authorized and accessible.

Treat all member records as sensitive, even in staging.

Do not expose personal information in audit reports, log files, screenshots, test output, or generated fixtures.

Distinguish clearly between:

- Staging database
- Production database
- Legacy application's database
- New application's runtime connection
- Any replicas or copies

Never assume that staging and production have identical schemas or data.

---

# 2. NON-NEGOTIABLE ARCHITECTURE REQUIREMENTS

## 2.1 No Legacy Runtime Dependency

The new KOSIPA implementation MUST NOT depend on legacy PHP/CodeIgniter APIs or controllers.

PROHIBITED implementation patterns:

- Calling existing CodeIgniter endpoints from Next.js
- Forwarding mutations to legacy PHP controllers
- Reusing PHP sessions as the new application's authorization mechanism
- Importing or executing PHP business functions
- Creating proxy endpoints that simply delegate mutations to legacy services
- Requiring the old KOSIPA application to remain online for new CRUD operations

Instead, create native business capabilities using the current repository's established architecture.

Expected layers, adapted to the actual project conventions:

`Next.js Presentation → Application Use Cases → Domain Services → Repository Interfaces → Database Adapters → MariaDB`

The new code must be independently maintainable.

Legacy PHP remains available only for auditing, behavioral comparison, and operational continuity during transition.

## 2.2 Database Compatibility

The initial target should be compatible with the existing authoritative KOSIPA database schema.

Do not immediately redesign or migrate all legacy tables.

Identify and preserve:

- Primary keys
- Foreign keys and implicit relations
- Historical records
- Financial balances
- Transaction relationships
- Existing operational identifiers
- Existing integration contracts
- Write semantics that must remain compatible with legacy consumers

If schema improvements are necessary, provide a separate migration proposal including compatibility impact, rollback strategy, and deployment sequence.

Do not execute DDL or introduce triggers during this audit.

## 2.3 Business Behavior Preservation

Preserve verified business behavior unless it is:

- Incorrect
- Insecure
- Inconsistent
- Financially unsafe
- Logically contradictory
- Technically inefficient without a business reason

Distinguish between:

**A. Business behavior that must remain equivalent**

Examples: eligibility rules, approval policy, installment formulas, rounding policy, accounting treatment, transaction dates, and member restrictions.

**B. Implementation deficiencies that should be improved**

Examples: N+1 queries, missing transactions, unsafe SQL concatenation, missing server validation, inefficient pagination, redundant calculations, and poor error handling.

**C. Ambiguous or defective legacy behavior**

Document the evidence, proposed correction, compatibility impact, and exact acceptance tests.

Do not silently introduce new financial business rules.

Use existing approved business rules and relevant repository documentation as the decision baseline. Record decisions that are already authorized. Only genuine unresolved business-policy changes should require an explicit decision.

---

# 3. PHASE A — LEGACY FUNCTIONAL INVENTORY

Conduct a systematic audit of the legacy KOSIPA codebase.

Inspect relevant:

- Routes
- Controllers
- Models
- Database query builders
- Raw SQL statements
- Views
- JavaScript handlers
- Form submissions
- Validation routines
- Session and authorization mechanisms
- Service and helper functions
- Batch operations
- Report generators
- Export/import routines
- Database migrations and schema references

Identify every meaningful KOSIPA operation exposed through the legacy application.

## 3.1 Complete Functional Coverage

Discover the actual modules rather than assuming that the following examples are exhaustive.

Investigate whether the system contains functionality related to:

1. Member registration and management
2. Member activation, suspension, and termination
3. Member profile updates
4. Member identity and employment information
5. Savings and deposits
6. Mandatory savings
7. Principal savings
8. Voluntary savings
9. Savings adjustments and withdrawals
10. Loan applications
11. Loan approval and rejection
12. Loan disbursements
13. Loan installments and repayments
14. Loan balances and outstanding amounts
15. Interest, service fees, and deductions
16. Loan settlement and closing
17. Financial corrections and reversals
18. Operational configuration
19. User and branch authorization
20. Reports, statements, and exports
21. Batch operations
22. Other financial and administrative operations found in the source

For each discovered operation, determine whether it is:

- Read
- Create
- Update
- Delete
- Approve
- Reject
- Cancel
- Reverse
- Import
- Export
- Calculate
- Reconcile
- Other custom action

Do not assume that all these operations exist in the legacy application. Mark unsupported capabilities explicitly.

## 3.2 Required Function Inventory Matrix

Produce a complete matrix with these columns:

| Field | Description |
|---|---|
| Module | Functional domain |
| Feature | Business operation |
| Legacy route | Original entry point |
| Controller/method | Executed handler |
| Model/function | Business or data logic |
| Database tables | All affected tables |
| SQL operations | SELECT/INSERT/UPDATE/DELETE |
| Validation | Client and server rules |
| Authorization | Required permissions and scope |
| Side effects | Additional writes or integrations |
| Transaction boundary | Atomicity requirements |
| New app status | Existing/Missing/Partial |
| Migration priority | P0/P1/P2 |
| Complexity | Low/Medium/High |
| Risk | Financial, security, data, operational |
| Source evidence | File path and line references |

Use real source references, not assumptions.

Determine the exact difference between the legacy functional surface and the currently implemented Next.js module.

---

# 4. PHASE B — DATABASE WRITE-PATH AUDIT

This is a critical audit requirement.

For every legacy operation capable of changing data, reconstruct the complete execution path:

**User Action → Route → Controller → Validation → Business Logic → SQL Statements → Database Changes → Secondary Effects → Response**

Analyze ALL database writes, including indirect ones.

For every write operation, document:

1. Input parameters and types
2. Mandatory fields
3. Default values
4. Validation conditions
5. Authorization checks
6. Referenced database tables
7. Insert/update/delete order
8. Transaction handling
9. Generated identifiers
10. Dependent records
11. Balance calculation effects
12. Financial journal effects, where applicable
13. Approval state transitions
14. Error handling
15. Duplicate-submission behavior
16. Concurrent-operation behavior
17. Rollback behavior
18. Historical and audit effects

Particularly investigate hidden writes that occur outside the primary controller, such as helpers, triggers, scheduled jobs, or downstream application processes.

## 4.1 Write Ownership and Legacy Coexistence

Determine whether the legacy application and the new application will access the same authoritative database.

Build a **Write Ownership Matrix** identifying which system owns each operation during migration.

Do not permit uncontrolled dual writers.

A feature must not be activated in the new system merely because an INSERT or UPDATE query works.

Before enabling writes, determine:

- Whether the old application still writes the same records
- Which system is authoritative
- Whether both systems can act on the same pending transaction
- Whether conflicting approvals are possible
- How duplicate submissions are prevented
- How rollback and cutover will work
- Whether any external systems depend on legacy writes

Recommend a safe feature-by-feature ownership transfer, with explicit activation and rollback gates.

Do not create a parallel financial source of truth.

---

# 5. PHASE C — FINANCIAL BUSINESS LOGIC AUDIT

Review all financial calculations and transaction-related business rules.

Pay special attention to:

- Savings balances
- Loan principal
- Interest
- Administrative fees
- Installment schedules
- Remaining balances
- Payment allocation
- Rounding
- Historical corrections
- Approval timing
- Transaction effective dates
- Period closing
- Canceled or reversed transactions

For every financial formula, trace its source and demonstrate its behavior through reproducible examples.

Compare:

1. Legacy implementation
2. Documented expected behavior
3. Reconstructed domain rule
4. Proposed Next.js implementation

Find and document:

- Off-by-one calculations
- Floating-point arithmetic errors
- Inconsistent rounding
- Missing validation
- Duplicated calculations
- Non-atomic balance updates
- Incorrect transaction ordering
- Unexpected negative balances
- Duplicate installment postings
- Incorrect status transitions
- Orphaned financial records
- Missing reversal relationships

Use decimal-safe financial arithmetic according to the approved currency policy.

Do not use unsafe floating-point operations for money.

## 5.1 Delete Semantics

Audit all legacy deletion operations carefully.

Distinguish between:

- Deleting a draft
- Canceling an unposted request
- Voiding an approved transaction
- Reversing a posted financial transaction
- Deactivating an entity
- Deleting an unused configuration record

Do not apply generic hard deletion to financial history.

For posted financial transactions, prefer an appropriate, auditable reversal mechanism when compatible with approved business policy and the accounting model.

Evaluate referential integrity, reporting impact, and compatibility with legacy consumers.

Document the required permission and confirmation process for destructive actions.

---

# 6. PHASE D — DATABASE PERFORMANCE AUDIT

The new KOSIPA system must be substantially more efficient than the old implementation while preserving functional correctness.

Inspect query patterns in both legacy and current Next.js implementations.

Identify:

- N+1 queries
- Full table scans
- Missing or ineffective indexes
- Excessive joins
- Correlated subqueries
- Redundant aggregations
- Repeated count queries
- Unbounded result sets
- Expensive OFFSET pagination
- SELECT *
- Query-in-loop patterns
- Non-sargable predicates
- Unnecessary database round trips
- Inconsistent transaction isolation
- Long-running write transactions
- Lock contention and deadlock risks
- Inefficient report generation

For each significant issue:

1. Show the original query or trace.
2. Explain why it is inefficient.
3. Provide supporting evidence.
4. Propose an optimized query or strategy.
5. Explain index requirements.
6. Describe business compatibility concerns.
7. Define verification and performance benchmarks.

Use appropriate query-plan analysis where available.

Only run potentially expensive execution plans or benchmarks in an approved, isolated environment.

Do not execute production-impacting load tests.

## 6.1 Performance Targets

Propose measurable targets for:

- Member list loading
- Member detail loading
- Loan list loading
- Loan detail loading
- Dashboard summaries
- Search and filtering
- Create and update operations
- Approval operations
- Financial reports
- Large CSV exports

Include p50/p95 latency, database query count, rows examined, and error rates where measurable.

Establish baselines before claiming improvements.

Performance requirements must not compromise financial correctness, transactional integrity, or authorization.

---

# 7. PHASE E — NEXT.JS TARGET ARCHITECTURE

Review the established monorepo architecture and reuse its existing conventions.

Do not create a second competing architecture.

Design reusable domain and application capabilities for all missing KOSIPA operations.

Recommended separation:

### Presentation Layer

- Unified Console pages
- Reusable forms
- Data tables
- Detail views
- Confirmation dialogs
- Loading and error states
- Approval workflows
- Accessible action controls

### Application Layer

- Use cases
- Input validation
- Authorization enforcement
- Transaction orchestration
- Idempotency handling
- Error mapping

### Domain Layer

- Financial calculations
- Business invariants
- Approval state machines
- Transaction eligibility
- Balance rules
- Reversal rules
- Domain-specific policies

### Infrastructure Layer

- Repository implementations
- MariaDB access
- Transaction management
- Query optimization
- Audit event persistence
- Integration adapters where necessary

Reuse the existing design system, reusable components, currency handling, error conventions, authentication, and project testing practices.

Do not add a new ORM or framework unless the current technical stack genuinely cannot satisfy the requirements.

## 7.1 Consistent Read/Write Behavior

Ensure each mutation has a clear effect on existing read views.

Analyze:

- Cache invalidation
- Data refresh
- Search visibility
- Dashboard aggregation
- Report consistency
- Pagination consistency
- Concurrent updates
- Stale UI state

A successful mutation must produce an accurate subsequent read.

---

# 8. PHASE F — AUTHORIZATION AND SECURITY

Audit current KOSIPA authorization and legacy permission behavior.

Propose server-enforced permissions for every sensitive operation.

At minimum evaluate capability-level authorization for:

- Viewing members
- Creating members
- Editing members
- Deactivating members
- Viewing financial records
- Creating financial transactions
- Editing permitted records
- Canceling requests
- Approving/rejecting requests
- Reversing posted transactions
- Exporting sensitive data
- Modifying system configurations

Include branch/organizational scope where applicable.

All permissions must be enforced server-side.

Hiding a UI button is not authorization.

Test:

- Unauthorized endpoint access
- Privilege escalation
- Cross-branch access
- Cross-member access
- Forged request parameters
- SQL injection
- Duplicate submission
- Concurrent approval
- Session expiration
- Sensitive information disclosure

Review whether existing identity linking should grant read access, write access, or neither automatically.

Never equate identity linkage with unrestricted mutation privileges.

Create a dedicated authorization matrix for the new KOSIPA capabilities.

---

# 9. PHASE G — DATA INTEGRITY & AUDIT TRAIL

Every sensitive mutation must be traceable.

Design an audit strategy recording, as appropriate:

- Actor identity
- Operation type
- Target entity
- Relevant record identifiers
- Timestamp
- Authorized scope
- Previous and new state
- Change reason
- Approval metadata
- Request correlation ID
- Transaction outcome

Protect sensitive personal data and financial information.

Use transactional consistency for related mutations.

Define:

- Idempotency boundaries
- Unique operation identifiers
- Optimistic or pessimistic concurrency control
- Transaction isolation
- Retry behavior
- Deadlock recovery
- Rollback guarantees
- Partial-failure prevention
- Invariant validation

Avoid designs where the system reports success when only part of a financial transaction was committed.

---

# 10. PHASE H — TESTING & VALIDATION STRATEGY

Design an executable validation plan before implementation.

Required test categories:

### Characterization Tests

Verify actual legacy behavior for every financial and administrative operation.

### Domain Unit Tests

Verify calculations, validations, state transitions, rounding, and business invariants.

### Application Tests

Verify use cases, permissions, transaction boundaries, and error handling.

### Repository Integration Tests

Verify database writes, relationships, rollbacks, idempotency, and concurrent updates against an isolated test database.

### End-to-End Tests

Verify complete operator workflows from the Unified Console.

### Regression Tests

Verify that existing KOSIPA read-only functionality remains correct.

### Performance Tests

Compare equivalent workloads under reproducible conditions.

Use synthetic fixtures and isolated databases for destructive testing.

Define a reconciliation methodology that compares legacy-equivalent expected results with new application results.

Never use real member records for destructive tests.

---

# 11. PHASE I — IMPLEMENTATION AND CUTOVER ROADMAP

Produce a prioritized implementation plan.

Recommended priority framework:

**P0 — Foundation**

- Shared domain and repository foundations
- Transaction safety
- Authorization
- Audit trail
- Idempotency
- Critical financial invariants
- Database compatibility

**P1 — Core Business Operations**

- High-priority missing CRUD capabilities
- Existing member and financial workflows
- Core approval/rejection operations
- Required transactional side effects

**P2 — Advanced Operations**

- Complex adjustments
- Reversals
- Advanced configuration
- Batch operations
- Additional reports and administrative workflows

Use discovered real dependencies to determine the final implementation sequence.

Do not assume that the sample categories above are exact feature boundaries.

For each work item provide:

- Feature and intended user
- Current legacy behavior
- Expected native behavior
- Dependency list
- Required files or modules
- Repository and database interactions
- Validation rules
- Authorization rules
- Required tests
- Acceptance criteria
- Estimated complexity
- Migration/cutover risk
- Rollback strategy

## 11.1 Cutover Principles

Prefer gradual, feature-based migration.

A feature can be switched to the new implementation only after:

1. Functional parity is verified.
2. Financial invariants are verified.
3. Permissions are tested.
4. Database compatibility is validated.
5. Write ownership is established.
6. Legacy/new coexistence is safe.
7. Reconciliation criteria are met.
8. Rollback is demonstrably possible.

Never assume that a passing build is sufficient for production readiness.

No production deployment or production write access is authorized by this audit prompt.

---

# 12. REQUIRED DELIVERABLES

Create the following documents under a suitable new location, for example:

`docs/kosipa-full-access/`

### 01 — EXECUTIVE_AUDIT_SUMMARY.md

Summary of functional gaps, architecture, risks, critical findings, and modernization recommendations.

### 02 — LEGACY_FUNCTION_INVENTORY.md

Exhaustive list of all legacy KOSIPA capabilities and their source references.

### 03 — CRUD_GAP_ANALYSIS.md

Side-by-side comparison of legacy capabilities and existing Next.js capabilities.

### 04 — DATABASE_WRITE_MAPPING.md

Detailed write paths, affected tables, data dependencies, and transaction boundaries.

### 05 — BUSINESS_RULES_AND_FINANCIAL_LOGIC.md

Verified domain rules, formulas, validation behavior, and financial invariants.

### 06 — LEGACY_ANOMALIES_AND_PERFORMANCE.md

Evidence-based bug findings, correctness issues, slow query patterns, and optimization recommendations.

### 07 — TARGET_ARCHITECTURE.md

Proposed native Next.js architecture, domain boundaries, repository contracts, and dependency design.

### 08 — AUTHORIZATION_AND_AUDIT_DESIGN.md

Permission model, branch scope, security rules, and mutation audit trail design.

### 09 — IMPLEMENTATION_BACKLOG.md

Dependency-ordered implementation tasks, priorities, complexity, and acceptance criteria.

### 10 — TESTING_AND_RECONCILIATION_PLAN.md

Characterization tests, integration tests, E2E coverage, financial validation, and performance benchmarks.

### 11 — CUTOVER_AND_ROLLBACK_PLAN.md

Write ownership strategy, coexistence risks, feature activation steps, and rollback requirements.

### 12 — DECISION_REGISTER.md

Document verified facts, approved rules, recommended changes, assumptions, and unresolved decisions.

Each document must distinguish verified evidence from proposals.

Provide file paths, source references, and reproducible observations.

Avoid speculative claims presented as facts.

---

# 13. EXECUTION RULES

During this audit:

**ALLOWED**

- Read project documentation
- Inspect new application source code
- Inspect legacy PHP/CodeIgniter source code
- Inspect existing tests
- Inspect database schema and metadata through authorized access
- Execute safe, bounded read-only queries
- Analyze SQL and execution plans safely
- Run existing non-destructive tests
- Create audit and design documentation
- Produce implementation examples or pseudocode

**NOT ALLOWED**

- Modify legacy application behavior
- Implement or activate production write features
- Execute INSERT/UPDATE/DELETE against real operational data
- Change production schema
- Add database triggers
- Deploy database migrations
- Disable authorization controls
- Expose personal member information
- Copy production personal data into fixtures
- Replace working Next.js read functionality without evidence
- Create runtime dependencies on legacy PHP
- Deploy new KOSIPA functionality
- Commit, push, or merge without explicit authorization

If database access is unavailable, continue the code-based audit and identify the exact evidence that still requires database verification.

Do not invent schema structures, query results, or successful validation.

Do not treat missing infrastructure access as a reason to abandon the remainder of the audit.

---

# 14. DEFINITION OF DONE — AUDIT PHASE

The audit is complete only when:

- All discoverable legacy routes and business actions are inventoried.
- Existing Next.js functionality is mapped against the legacy capability matrix.
- All significant write paths and related database tables are identified.
- Financial business rules and critical invariants are documented.
- Destructive and reversal semantics are understood.
- Legacy bugs and query-performance anomalies are documented with evidence.
- A native architecture exists for all missing critical operations.
- Authorization and audit requirements are defined.
- Data ownership and coexistence risks are analyzed.
- Implementation tasks have explicit dependencies and acceptance criteria.
- The testing, reconciliation, and cutover plans are actionable.
- Outstanding uncertainties are clearly differentiated from verified findings.

## REQUIRED FINAL RESPONSE

At the end, provide:

1. Executive summary of the audit
2. Legacy feature coverage counts, supported by the inventory
3. Current Next.js feature coverage and missing capabilities
4. Critical financial and technical risks
5. Database write-path findings
6. Significant legacy logic defects
7. Database performance opportunities
8. Recommended native Next.js architecture
9. Prioritized implementation roadmap
10. Production migration and cutover considerations
11. List of documents created
12. Exact evidence gaps and decisions, if any

End with a clear recommendation for the first implementation checkpoint.

**FINAL OBJECTIVE**

Deliver an evidence-backed blueprint that allows the existing KOSIPA module to become a complete native Next.js management system, replacing legacy operational capabilities without depending on CodeIgniter/PHP at runtime.

The new implementation must preserve correct business behavior while improving architecture, maintainability, security, transactional safety, user experience, and measurable performance.

Do not begin implementation in this audit execution. Complete the audit and implementation plan first.