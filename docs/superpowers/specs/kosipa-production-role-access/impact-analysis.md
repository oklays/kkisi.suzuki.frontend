# Impact

Authorization: introduce an explicit server deployment mode for active non-cashier roles. This intentionally supersedes individual identity links for read access in that mode. Keep linked mode as the default and rollback. Cashier/unknown/inactive roles receive no KOSIPA capabilities, including when a historical link exists. All pages/APIs share the resolver.

UI: recognize role-authorized reads without inventing a legacy identity; master reference lists and dashboard metrics accept that state. No new screen or visual design.

Database: add an isolated console store with the reviewed schema and enforcement triggers; use a dedicated runtime account, connection limit 1 and aggregate budget 12. Add one production db_users account using existing role 2 and its active home company. Supply every non-null legacy field explicitly. No financial data, existing password, role permission or role status changes.

Deployment: test the access matrix and previous linked mode, commit/promote master to master-dev, build and activate only genesis-web with backed-up configuration and retained image. Browser verification uses the new account; cashier exclusion is checked without changing real cashier credentials.
