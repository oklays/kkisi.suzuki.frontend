-- role-config-export-readonly.sql — READ-ONLY (checkpoint 12). Run by an authorised OPERATOR on staging or production; never by the application or an agent.
-- Produces ONE JSON document describing the REAL role configuration for apps/web/scripts/validate-role-config.mjs:
--   TOKO roles (id, name, active, permission slugs), branches (id, active), TOKO users as (pseudonym, role, branch, active),
--   KOSIPA groups (id, name, active, menu URLs) and KOSIPA users as (pseudonym, active, group memberships).
-- NO usernames, full names, e-mails, passwords or member data. User ids are replaced by a salted SHA-256 pseudonym: choose a random @salt,
-- keep it with the operator, never share it (the same salt across exports lets you compare two exports; a new salt makes them unlinkable).
-- Save the output outside version control (docs/migration/_baseline/ is gitignored).
SET @salt = 'REPLACE_WITH_A_RANDOM_OPERATOR_SECRET';
SET SESSION group_concat_max_len = 16777216;
SET NAMES utf8mb4;   -- legacy tables mix collations; every text value below is converted to utf8mb4
SELECT CONCAT('{"version":1,"capturedAt":', JSON_QUOTE(DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ')),
  ',"tokoRoles":[', COALESCE((SELECT GROUP_CONCAT(JSON_OBJECT('roleId', r.id, 'name', CONVERT(r.role_name USING utf8mb4), 'active', r.status = 1,
        'slugs', JSON_COMPACT(COALESCE((SELECT CONCAT('[', GROUP_CONCAT(DISTINCT JSON_QUOTE(CONVERT(p.permissions USING utf8mb4))), ']') FROM db_permissions p WHERE p.role_id = r.id), '[]'))) ORDER BY r.id SEPARATOR ',') FROM db_roles r), ''), ']',
  ',"branches":[', COALESCE((SELECT GROUP_CONCAT(JSON_OBJECT('companyId', c.id, 'active', c.status = 1) ORDER BY c.id SEPARATOR ',') FROM db_company c), ''), ']',
  ',"tokoUsers":[', COALESCE((SELECT GROUP_CONCAT(JSON_OBJECT('u', CONVERT(LEFT(SHA2(CONCAT(@salt, ':toko:', u.id), 256), 12) USING utf8mb4), 'roleId', u.role_id, 'companyId', u.company_id, 'active', u.status = 1) SEPARATOR ',') FROM db_users u), ''), ']',
  ',"kosipaGroups":[', COALESCE((SELECT GROUP_CONCAT(JSON_OBJECT('groupId', g.id, 'name', CONVERT(g.nama_group USING utf8mb4), 'active', g.status = 1,
        'menus', JSON_COMPACT(COALESCE((SELECT CONCAT('[', GROUP_CONCAT(DISTINCT JSON_QUOTE(CONVERT(LOWER(TRIM(m.url)) USING utf8mb4))), ']') FROM ref_menu_akses ma JOIN ref_menu m ON m.id = ma.id_menu WHERE ma.id_group = g.id AND ma.status = 1 AND m.status = 1 AND m.url IS NOT NULL AND TRIM(m.url) <> ''), '[]'))) ORDER BY g.id SEPARATOR ',') FROM ref_group g), ''), ']',
  ',"kosipaUsers":[', COALESCE((SELECT GROUP_CONCAT(JSON_OBJECT('u', CONVERT(LEFT(SHA2(CONCAT(@salt, ':kosipa:', ru.id_ref_user), 256), 12) USING utf8mb4), 'active', ru.status = 1,
        'groups', JSON_COMPACT(COALESCE((SELECT CONCAT('[', GROUP_CONCAT(JSON_OBJECT('groupId', ga.id_group, 'membershipActive', ga.status = 1)), ']') FROM ref_group_akses ga WHERE ga.id_user = ru.id_ref_user), '[]'))) SEPARATOR ',') FROM ref_users ru), ''), ']',
  '}') AS role_config;
