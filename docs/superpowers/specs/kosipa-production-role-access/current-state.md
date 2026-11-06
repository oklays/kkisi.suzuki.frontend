# Production KOSIPA role access — current state

Verified 6 November 2026. Live .178 runs 2aa8ed5e on master-dev. Console and KOSIPA read flags are on, but the separate console store is absent. KOSIPA reads currently require a one-to-one console/legacy identity link and active legacy menu permissions. All read/API gates resolve through resolveConsoleAccess; readers audit using the console actor id. Master writes additionally need a legacy actor, explicit grant, ownership and a synthetic-only writer.

Production roles: 1 Administrator (active), 2 Admin Koperasi (active), 3 Kepala Toko (inactive), 4 Kasir Toko (active). Sessions re-read user/role/branch activity on each request. Roles 1/2 can switch branches. Admin Koperasi has the management permissions needed by the requested monitoring account. monitor_admin does not exist. No existing role or account will be reactivated.

The hosting UAPI can list databases/users via the existing SSH identity through .178. A dedicated console database/user must be provisioned. The existing console-store SQL supplies two tables and four enforcement triggers. Production backup/replication remains a separate incomplete task.
