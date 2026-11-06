# Verification

REQ-001: Domain/application tests allow active Administrator, Admin Koperasi, Kepala Toko and a future non-cashier role; role access works without an identity link. Live monitor account capabilities must contain exactly the five KOSIPA view capabilities for this policy.

REQ-002: Test case-insensitive KASIR/CASHIER names, blank/inactive/missing role, invalid mode, linked cashier and database outage. Verify the repository query remains parameterized. Live role-4 resolution must contain zero KOSIPA capabilities; anonymous APIs remain protected.

REQ-003: Assert null legacy actor and no write/export/grant caps in role mode, including supplied stale grants/export allowlist; run existing linked identity/grant suites unchanged. Production KOSIPA write flags and writer credential stay absent/disabled.

REQ-004: Build/typecheck validates complete access-state handling. Authenticated browser opens console, members, savings, loans, payroll, report center and master-reference screens. Observe audit rows for the real console actor without logging personal records.

REQ-005: Read back username, active role/home branch and bcrypt validation result. Log in through the normal production API/browser using the protected credential file. Preserve baseline existing account/role/permission state; never print plaintext password or hash.

REQ-006: Verify two console tables/four triggers, required runtime privileges only, append-only/revoke-only refusal, schema separation and budget <=12. Record tested commit/image, clean local/server trees, readiness, configuration changes, rollback backups and unchanged unrelated containers. Distinguish public smoke from authenticated verification and full financial-flow acceptance, which is not claimed.
