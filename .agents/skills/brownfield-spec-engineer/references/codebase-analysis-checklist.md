# Codebase Analysis Checklist

Use this checklist during **Phase 3: Investigate the Existing Codebase** to ensure exhaustive coverage of the existing brownfield system before writing specifications.

---

## 1. Domain & Terminology
- [ ] Search for domain terms, acronyms, and business concepts across code and existing docs.
- [ ] Identify discrepancies between product terminology and database/code variable naming.

## 2. Frontend & User Interface
- [ ] Locate UI pages, components, and layout files related to the feature.
- [ ] Check state management, client validation, form schemas, and error boundary handling.
- [ ] Verify accessibility attributes, localized strings, and user roles mapped in the UI.

## 3. Routes & API Layer
- [ ] List all API endpoints, HTTP methods, path params, query params, and payload schemas.
- [ ] Inspect middleware (authentication, CORS, rate limiting, request validation).
- [ ] Identify route handlers, controllers, and response transformers.

## 4. Business Logic & Services
- [ ] Locate service files, use cases, or domain logic modules handling the business operations.
- [ ] Map internal event emitters, webhooks, or pub/sub message dispatching.

## 5. Data Access & Database Layer
- [ ] Map database entities, ORM schemas (Drizzle, Prisma, TypeORM, etc.), and raw DDL tables.
- [ ] Inspect foreign keys, indexes, unique constraints, nullability, and default values.
- [ ] Review existing database migrations for pattern consistency.

## 6. Authentication, Authorization & Multi-Tenancy
- [ ] Identify session/JWT authentication mechanisms.
- [ ] Check Role-Based Access Control (RBAC) or attribute permissions for the endpoints.
- [ ] Verify tenant isolation logic (e.g. `tenant_id` filtering on all DB queries).

## 7. Background Jobs, Queues & Workers
- [ ] Identify queue producers, message schemas, and BullMQ/Redis/RabbitMQ topics.
- [ ] Inspect background worker scripts, concurrency settings, retry policies, and dead-letter queues.

## 8. Integrations & External Services
- [ ] List third-party APIs, webhooks, TTS engines, SIP gateways, or payment providers.
- [ ] Inspect secret environment variables (`.env`) and configuration files.

## 9. Testing & Quality Assurance
- [ ] Locate unit tests, integration tests, and E2E test suites for the affected modules.
- [ ] Record test command executions and expected coverage baseline.
