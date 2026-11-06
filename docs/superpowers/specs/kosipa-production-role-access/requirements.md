# Requirements

- REQ-001: WHEN non-cashier read mode is enabled and a session has an active non-cashier role, THE SYSTEM SHALL grant the five existing KOSIPA view capabilities without requiring a legacy identity link.
- REQ-002: WHEN the role name contains KASIR or CASHIER, is blank, unknown or inactive, THE SYSTEM SHALL deny KOSIPA access on pages and APIs even if a legacy link exists. Role lookup failures fail closed.
- REQ-003: WHEN role read access is granted, THE SYSTEM SHALL keep kosipaUserId null and grant neither writes, export nor grant administration through that policy. Linked mode remains unchanged when the mode is unset.
- REQ-004: WHEN authorized reads execute, THE SYSTEM SHALL use the isolated console audit store and existing bounded readers; reference-master lists and dashboard metrics SHALL support role access.
- REQ-005: THE SYSTEM SHALL provide monitor_admin as an active Admin Koperasi account with a random bcrypt password stored in a private handoff file; existing users/roles/permissions SHALL be preserved.
- REQ-006: THE RELEASE SHALL back up configuration, provision and validate the console store, keep the total connection budget at 12 or lower, deploy only genesis-web, verify authenticated access and retain rollback evidence.

BR-001: Inactive Kepala Toko remains inactive; if subsequently activated, the role rule applies on the next validated request. New active non-cashier roles follow the same rule.
SEC-001: Session role comes from the database, never request parameters. KASIR denial takes precedence over links. Personal fields, passwords and database credentials are absent from logs, Git and screenshots.
MIG-001: Console changes are additive; rollback disables KOSIPA and restores the prior image/configuration. Retain audit tables and disable the new account if retiring it; do not delete audit history.
