# Database backup, activation and rollback controls

**No activation occurred.** The current `kkisi_staging` schema and its 328 objects remain in place. Today's immediate rollback is simply stopping the two dedicated UAT servers; there is no baseline replacement to undo.

## Recovery material already verified

Protected directory: `/Users/macbookprom2/KKISI-Backups/kosipa-20261030/` (700; files 600; FileVault ON).

- `kkisi_staging-before.sql.gz`: full old baseline backup, 90,114,940 bytes; hash in the refresh/validation report.
- `local-before-metadata.json`, `local-backup.json`, `kkisi_recovery_check_20261030-restored.json`: version/object/count/aggregate evidence and successful independent restore rehearsal.
- `.env.local.before`, `.env.staging.before`: relevant pre-preparation configuration backups; contain secrets, never print/commit.
- `local-grants-before.sql`: the five local principals' original grants, including column/table grants; sensitive, never print/commit. No grant revocation was performed in this preparation.
- `baseline-after-preparation.json`: original baseline counts/aggregates/object inventory preserved.
- `production-20261030.sql.gz`: current candidate data/view export, **missing all 10 required procedures**. Never use it as a complete replacement.

The scratch recovery check restored the old dump into a new schema, validated it, then removed only that new scratch schema. Existing Docker volumes, raw baseline and auxiliary auth/console/test databases were not reset.

## Before any future cutover

1. Obtain the authorized real procedure definitions and a **fresh** full data/object snapshot. Re-inventory tables, engines, views, functions, procedures, triggers and events; do not assume today's 283/45/10 counts remain current.
2. Take and verify a new pre-cutover local backup, configuration snapshot and exact grants. Existing :3000 and other consumers must be mapped again; identify active sessions using metadata, without logging SQL/member data.
3. Restore the complete export into a **new** candidate schema/instance. Never reuse an incomplete candidate blindly. Keep event scheduler OFF; remap schema-qualified definitions/DEFINERs locally without modifying INSERT payloads; never import production account/grant tables.
4. Compare object names, table/index/FK definitions, routine bodies/SQL modes/charsets/security metadata, cross-schema dependencies, selected source/snapshot counts/aggregates and all view checks. Rehearse target-version routine creation without invoking operational procedures. Keep a full original dump and record deliberate local definition remapping.
5. Prove recovery from the pre-cutover backup in an isolated scratch target. A valid gzip/checksum alone is insufficient.
6. Choose a reviewed **controlled local maintenance window**, or a separate instance with explicit consumer redirection. MariaDB does not provide atomic database rename; cross-schema table moves do not safely migrate every view/trigger/routine/event. Do not publish an unreviewed multi-step rename as an atomic cutover.
7. Quiesce affected local consumers and disable/revoke baseline mutation access at its exact schema/table/column scope, preserving original grants. Apply only the complete reviewed restore/redirect. No current instruction authorizes changing production privileges or schema.
8. Verify established `kkisi_staging` access, read-only application grants, object inventory, aggregates, views and read UAT before resuming consumers. Keep writes confined to the synthetic UAT endpoint. If any object is missing, stop and roll back; do not silently proceed with fewer objects.

## Rollback after a future completed replacement

Keep consumers quiesced. Restore/redirect to the retained old verified instance or restore the **pre-cutover local backup** into an isolated recovery target first, with event scheduling disabled. Verify its complete original inventory and aggregates, then switch consumers back during the maintenance window. Restore only the deliberately changed **local** configuration/grants from the protected recovery files, preserving unrelated auth/console/DEV LOCAL databases. Do not execute a production dump directly against an active schema or blindly restore grant statements into production.

The exact cutover commands depend on the final complete object/dependency inventory and chosen maintenance/instance method; they are deliberately not issued while the routine export is missing. The available private one-off preparation script `.local/kosipa-manual-uat/refresh.mjs` has no activation action and refuses overwriting an existing shadow schema. It is not a production tool.

## Safe shutdown / cleanup now

```bash
node integration/kosipa-full-access/app-server.mjs stop
node integration/kosipa-full-access/app-server.mjs stop --profile uatread
```

These stop only recorded dedicated processes. Do not stop `kkisi-staging`, remove `kkisi-staging-data`, restart unrelated dev servers, run broad Docker cleanup, or delete the original baseline. Retain the incomplete candidate as explicitly labeled evidence until the owner decides its retention. To remove a newly created overlay/candidate later, first stop its server, preserve its local evidence and confirm exact schema names; never treat cleanup as permission to drop `kkisi_staging`.
