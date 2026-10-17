-- schema-evidence-bundle-json.sql
-- TASK-003 — READ-ONLY. Run by an authorised OPERATOR (never by the application or an agent). Reads information_schema only: no business rows,
-- no SELECT on application tables, no CALL. Produces ONE row / ONE column: a JSON document ("evidence bundle", version 1) that
-- apps/web/scripts/validate-schema-evidence.mjs turns into a non-sensitive readiness report.
--
-- Handling: save the output OUTSIDE version control (docs/migration/_baseline/ is gitignored). The bundle contains view/routine BODIES, which can hold
-- credentials, hosts or e-mail addresses written by whoever authored them: run the validator with --scan first (it prints counts only) and
-- review before the bundle is shared. The READINESS REPORT never contains definition text and is safe to attach to a ticket.
--
-- Uses JSON_OBJECT + GROUP_CONCAT (MariaDB >= 10.2) rather than JSON_ARRAYAGG so it also runs on older cPanel servers.
-- Example (CLI):  mysql --batch --raw --skip-column-names -e "source schema-evidence-bundle-json.sql" > bundle.json
-- Replace the schema name below when production differs.

SET @s = 'n1608204_smart_kopkar';
SET SESSION group_concat_max_len = 67108864;   -- 64 MiB: view/routine bodies are long; a truncated bundle is refused by the validator only if it is no longer valid JSON

SELECT CONCAT('{"version":1,"schema":', JSON_QUOTE(@s),
  ',"capturedAt":', JSON_QUOTE(DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ')),
  ',"columns":[', COALESCE((SELECT GROUP_CONCAT(JSON_OBJECT('table', TABLE_NAME, 'column', COLUMN_NAME, 'type', COLUMN_TYPE, 'nullable', IS_NULLABLE = 'YES') ORDER BY TABLE_NAME, ORDINAL_POSITION SEPARATOR ',')
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @s), ''), ']',
  ',"indexes":[', COALESCE((SELECT GROUP_CONCAT(j ORDER BY k SEPARATOR ',') FROM (
        SELECT CONCAT(TABLE_NAME, '.', INDEX_NAME) AS k,
               JSON_OBJECT('table', TABLE_NAME, 'index', INDEX_NAME, 'unique', MIN(NON_UNIQUE) = 0, 'columns', JSON_COMPACT(CONCAT('["', REPLACE(GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX), ',', '","'), '"]'))) AS j
        FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @s GROUP BY TABLE_NAME, INDEX_NAME) i), ''), ']',
  ',"views":[', COALESCE((SELECT GROUP_CONCAT(JSON_OBJECT('name', TABLE_NAME, 'definition', VIEW_DEFINITION) ORDER BY TABLE_NAME SEPARATOR ',')
        FROM information_schema.VIEWS WHERE TABLE_SCHEMA = @s), ''), ']',
  ',"routines":[', COALESCE((SELECT GROUP_CONCAT(JSON_OBJECT('name', ROUTINE_NAME, 'type', ROUTINE_TYPE, 'definition', ROUTINE_DEFINITION) ORDER BY ROUTINE_NAME SEPARATOR ',')
        FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = @s), ''), ']',
  ',"triggers":[', COALESCE((SELECT GROUP_CONCAT(JSON_OBJECT('name', TRIGGER_NAME, 'table', EVENT_OBJECT_TABLE, 'event', EVENT_MANIPULATION, 'timing', ACTION_TIMING) ORDER BY TRIGGER_NAME SEPARATOR ',')
        FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = @s), ''), ']',
  ',"server":', JSON_OBJECT('version', VERSION(), 'sqlMode', @@sql_mode, 'maxUserConnections', @@max_user_connections),
  '}') AS evidence_bundle;
