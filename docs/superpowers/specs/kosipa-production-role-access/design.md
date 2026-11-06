# Design

The user authorized production activation for all roles except KASIR, a separate admin login and any necessary redeployment on 6 November 2026. Apply that scope as read access; financial and master command cutover remains outside this release.

REQ-001/REQ-002: Add the optional kosipaRoleAccess(roleId) permission-source port, implemented by PrismaPermissionRepository under KOSIPA_READ_ACCESS_MODE=non-cashier. Read the current role by parameterized primary key. An active, nonblank role whose normalized name contains neither kasir nor cashier is allowed. Missing/disabled roles and malformed policy values deny; lookup failure returns unavailable through the shared resolver.

REQ-003: resolveConsoleAccess checks the role result before identity links. Allowed adds exactly KOSIPA_CAPABILITIES, returns state role and a null legacy actor; denied returns restricted with no KOSIPA caps. Unset/linked mode follows the existing identity/grant path. TOKO capabilities remain unchanged. Role access does not grant exports, write capabilities or write-grant administration.

REQ-004: Add role/restricted access states to notices, master-page read gates and dashboard metrics. Existing use cases still require capabilities and audit before sensitive reads. Provision the existing console schema without mixing stores, relaxing trigger checks or bypassing startup guards.

REQ-005: Insert monitor_admin into db_users with role 2, the active role-2 home company and explicit legacy defaults, bcrypt cost 12, a unique username collision check and transaction. Record its new id and a private credential handoff. Do not copy or reset existing passwords.

REQ-006: Back up configuration and record objects/grants before mutation. Provision dedicated console runtime and schema-owner accounts with only the required privileges; create two tables and four triggers using the reviewed production SQL. Validate append-only/revoke-only behavior, dedicated grants and reader failure to mutate. Configure a single console connection and budget 12. Build tested code and recreate only genesis-web. Roll back image/configuration on failed health checks; retain new schema/audit rows and disable the new login if requested.

Alternatives considered: individual legacy links cannot cover all non-cashier roles because links are one-to-one; sharing a legacy identity would weaken attribution. Server role policy preserves the real console actor and avoids fake legacy identities.
