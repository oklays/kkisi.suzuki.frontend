-- READ-ONLY verification of the auth store (only SELECTs on information_schema / mysql). Run as root by
-- scripts/verify-auth-store.sh after provisioning. Placeholder: __AUTH_HOST__. One row per check: name, ok (1/0).
SELECT 'database kkisi_auth_staging is utf8mb4/utf8mb4_bin' AS check_name, COUNT(*) = 1 AS ok
  FROM information_schema.schemata
 WHERE schema_name = 'kkisi_auth_staging' AND default_character_set_name = 'utf8mb4' AND default_collation_name = 'utf8mb4_bin'
UNION ALL
SELECT 'exactly two InnoDB tables: auth_session, auth_throttle', COUNT(*) = 2 AND GROUP_CONCAT(table_name ORDER BY table_name) = 'auth_session,auth_throttle' AND MIN(engine) = 'InnoDB' AND MAX(engine) = 'InnoDB'
  FROM information_schema.tables WHERE table_schema = 'kkisi_auth_staging'
UNION ALL
SELECT 'auth_session columns match the approved DDL', GROUP_CONCAT(CONCAT(column_name, ':', column_type, ':', is_nullable) ORDER BY ordinal_position SEPARATOR ',') =
  'sid_hash:binary(32):NO,user_id:int(10) unsigned:NO,company_id:int(10) unsigned:NO,pwf:binary(8):NO,created_at:datetime:NO,last_seen_at:datetime:NO,idle_expires_at:datetime:NO,abs_expires_at:datetime:NO,revoked_at:datetime:YES,revoked_reason:enum(''logout'',''forced'',''user_disabled'',''password_changed'',''superseded''):YES,purge_after:datetime:NO'
  FROM information_schema.columns WHERE table_schema = 'kkisi_auth_staging' AND table_name = 'auth_session'
UNION ALL
SELECT 'auth_throttle columns match the approved DDL', GROUP_CONCAT(CONCAT(column_name, ':', column_type, ':', is_nullable) ORDER BY ordinal_position SEPARATOR ',') =
  'key_hash:binary(32):NO,kind:enum(''user'',''pair'',''ip''):NO,failures:int(10) unsigned:NO,first_failure_at:datetime:NO,last_failure_at:datetime:NO,locked_until:datetime:YES,purge_after:datetime:NO'
  FROM information_schema.columns WHERE table_schema = 'kkisi_auth_staging' AND table_name = 'auth_throttle'
UNION ALL
SELECT 'indexes match (PK + user + purge; PK + purge)', GROUP_CONCAT(CONCAT(table_name, '.', index_name, '(', cols, ')') ORDER BY BINARY table_name, BINARY index_name SEPARATOR ';') =
  'auth_session.PRIMARY(sid_hash);auth_session.ix_auth_session_purge(purge_after);auth_session.ix_auth_session_user(user_id,revoked_at);auth_throttle.PRIMARY(key_hash);auth_throttle.ix_auth_throttle_purge(purge_after)'
  FROM (SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols FROM information_schema.statistics WHERE table_schema = 'kkisi_auth_staging' GROUP BY table_name, index_name) i
UNION ALL
SELECT 'CHECK constraints present (times, revoke)', GROUP_CONCAT(constraint_name ORDER BY constraint_name) = 'ck_auth_session_revoke,ck_auth_session_times'
  FROM information_schema.check_constraints WHERE constraint_schema = 'kkisi_auth_staging'
UNION ALL
SELECT 'account kkisi_auth exists at exactly one host, the detected one (never %)', COUNT(*) = 1 AND MIN(host) = '__AUTH_HOST__' AND MIN(host) <> '%' AND MIN(host) NOT LIKE '%\%%'
  FROM mysql.global_priv WHERE user = 'kkisi_auth'
UNION ALL
SELECT 'account has MAX_USER_CONNECTIONS 10 and a password', COUNT(*) = 1 AND MIN(JSON_VALUE(priv, '$.max_user_connections')) = '10' AND MIN(COALESCE(JSON_VALUE(priv, '$.authentication_string'), '')) <> ''
  FROM mysql.global_priv WHERE user = 'kkisi_auth' AND host = '__AUTH_HOST__'
UNION ALL
SELECT 'no global or schema-level privileges for kkisi_auth (USAGE only)', (SELECT COUNT(*) FROM information_schema.user_privileges WHERE grantee = '''kkisi_auth''@''__AUTH_HOST__''' AND privilege_type <> 'USAGE') = 0
   AND (SELECT COUNT(*) FROM information_schema.schema_privileges WHERE grantee = '''kkisi_auth''@''__AUTH_HOST__''') = 0
UNION ALL
SELECT 'table privileges are exactly DELETE,INSERT,SELECT on the two auth tables', GROUP_CONCAT(CONCAT(table_schema, '.', table_name, '=', p) ORDER BY table_name SEPARATOR ';') =
  'kkisi_auth_staging.auth_session=DELETE,INSERT,SELECT;kkisi_auth_staging.auth_throttle=DELETE,INSERT,SELECT'
  FROM (SELECT table_schema, table_name, GROUP_CONCAT(privilege_type ORDER BY privilege_type) AS p FROM information_schema.table_privileges WHERE grantee = '''kkisi_auth''@''__AUTH_HOST__''' GROUP BY table_schema, table_name) t
UNION ALL
SELECT 'column privileges are exactly the approved UPDATE columns', GROUP_CONCAT(CONCAT(table_name, '.', privilege_type, '=', c) ORDER BY table_name SEPARATOR ';') =
  'auth_session.UPDATE=company_id,idle_expires_at,last_seen_at,revoked_at,revoked_reason;auth_throttle.UPDATE=failures,first_failure_at,last_failure_at,locked_until,purge_after'
  FROM (SELECT table_name, privilege_type, GROUP_CONCAT(column_name ORDER BY column_name) AS c FROM information_schema.column_privileges WHERE grantee = '''kkisi_auth''@''__AUTH_HOST__''' AND table_schema = 'kkisi_auth_staging' GROUP BY table_name, privilege_type) t
UNION ALL
SELECT 'nobody except kkisi_auth holds table/column/schema privileges on the auth schema', COUNT(*) = 0
  FROM (SELECT grantee FROM information_schema.table_privileges WHERE table_schema = 'kkisi_auth_staging'
        UNION SELECT grantee FROM information_schema.column_privileges WHERE table_schema = 'kkisi_auth_staging'
        UNION SELECT grantee FROM information_schema.schema_privileges WHERE table_schema = 'kkisi_auth_staging') g
 WHERE grantee <> '''kkisi_auth''@''__AUTH_HOST__'''
UNION ALL
SELECT 'kkisi_read still SELECT-only on kkisi_staging and nothing on the auth schema', (SELECT GROUP_CONCAT(privilege_type) FROM information_schema.schema_privileges WHERE grantee LIKE '''kkisi_read''@%' AND table_schema = 'kkisi_staging') = 'SELECT'
   AND (SELECT COUNT(*) FROM information_schema.schema_privileges WHERE grantee LIKE '''kkisi_read''@%' AND table_schema = 'kkisi_auth_staging') = 0
UNION ALL
SELECT 'kkisi_app has no access to the auth schema', (SELECT COUNT(*) FROM information_schema.schema_privileges WHERE grantee LIKE '''kkisi_app''@%' AND table_schema = 'kkisi_auth_staging') = 0
UNION ALL
SELECT 'legacy schema kkisi_staging is present (object count is compared by the script)', COUNT(*) > 0 FROM information_schema.tables WHERE table_schema = 'kkisi_staging';
