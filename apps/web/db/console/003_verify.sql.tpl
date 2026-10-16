-- READ-ONLY verification of the console store (SELECTs on information_schema / mysql only). Placeholder: __AUTH_HOST__.
SELECT 'database kkisi_console_staging is utf8mb4/utf8mb4_bin' AS check_name, COUNT(*) = 1 AS ok
  FROM information_schema.schemata WHERE schema_name = 'kkisi_console_staging' AND default_character_set_name = 'utf8mb4' AND default_collation_name = 'utf8mb4_bin'
UNION ALL
SELECT 'exactly two InnoDB tables: console_audit_event, console_identity_link', COUNT(*) = 2 AND GROUP_CONCAT(table_name ORDER BY table_name) = 'console_audit_event,console_identity_link' AND MIN(engine) = 'InnoDB' AND MAX(engine) = 'InnoDB'
  FROM information_schema.tables WHERE table_schema = 'kkisi_console_staging'
UNION ALL
SELECT 'unique active-link keys present', COUNT(DISTINCT index_name) = 2
  FROM information_schema.statistics WHERE table_schema = 'kkisi_console_staging' AND table_name = 'console_identity_link' AND non_unique = 0 AND index_name LIKE 'ux_link_active_%'
UNION ALL
SELECT 'CHECK constraints present (incl. MariaDB''s implicit JSON check `detail`)', GROUP_CONCAT(constraint_name ORDER BY BINARY constraint_name) = 'ck_audit_action,ck_audit_detail,ck_link_not_self,ck_link_revocation,detail'
  FROM information_schema.check_constraints WHERE constraint_schema = 'kkisi_console_staging'
UNION ALL
SELECT 'append-only / revoke-only triggers present', GROUP_CONCAT(trigger_name ORDER BY trigger_name) = 'trg_console_audit_no_delete,trg_console_audit_no_update,trg_console_link_no_delete,trg_console_link_revoke_only'
  FROM information_schema.triggers WHERE trigger_schema = 'kkisi_console_staging'
UNION ALL
SELECT 'account kkisi_console exists at exactly one host, the detected one (never %)', COUNT(*) = 1 AND MIN(host) = '__AUTH_HOST__' AND MIN(host) NOT LIKE '%\%%'
  FROM mysql.global_priv WHERE user = 'kkisi_console'
UNION ALL
SELECT 'account has MAX_USER_CONNECTIONS 2 and a password', COUNT(*) = 1 AND MIN(JSON_VALUE(priv, '$.max_user_connections')) = '2' AND MIN(COALESCE(JSON_VALUE(priv, '$.authentication_string'), '')) <> ''
  FROM mysql.global_priv WHERE user = 'kkisi_console' AND host = '__AUTH_HOST__'
UNION ALL
SELECT 'no global or schema-level privileges (USAGE only)', (SELECT COUNT(*) FROM information_schema.user_privileges WHERE grantee = '''kkisi_console''@''__AUTH_HOST__''' AND privilege_type <> 'USAGE') = 0
   AND (SELECT COUNT(*) FROM information_schema.schema_privileges WHERE grantee = '''kkisi_console''@''__AUTH_HOST__''') = 0
UNION ALL
SELECT 'table privileges are exactly INSERT,SELECT on the two console tables', GROUP_CONCAT(CONCAT(table_schema, '.', table_name, '=', p) ORDER BY table_name SEPARATOR ';') =
  'kkisi_console_staging.console_audit_event=INSERT,SELECT;kkisi_console_staging.console_identity_link=INSERT,SELECT'
  FROM (SELECT table_schema, table_name, GROUP_CONCAT(privilege_type ORDER BY privilege_type) AS p FROM information_schema.table_privileges WHERE grantee = '''kkisi_console''@''__AUTH_HOST__''' GROUP BY table_schema, table_name) t
UNION ALL
SELECT 'column privileges are exactly the revocation columns', GROUP_CONCAT(CONCAT(table_name, '.', privilege_type, '=', c) SEPARATOR ';') =
  'console_identity_link.UPDATE=revoke_reason,revoked_at,revoked_by,status'
  FROM (SELECT table_name, privilege_type, GROUP_CONCAT(column_name ORDER BY BINARY column_name) AS c FROM information_schema.column_privileges WHERE grantee = '''kkisi_console''@''__AUTH_HOST__''' AND table_schema = 'kkisi_console_staging' GROUP BY table_name, privilege_type) t;
