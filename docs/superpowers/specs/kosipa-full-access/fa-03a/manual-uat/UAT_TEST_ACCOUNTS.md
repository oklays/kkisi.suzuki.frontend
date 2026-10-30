# Manual UAT accounts — 30 October 2026

Passwords are intentionally absent. Retrieve them locally from `.local/kosipa-fa01/accounts.json` (mode 600, gitignored): each entry has `username` and `password`. Do not paste this file into chat, screenshots, tickets or Git. The synthetic identities are reused for the isolated write console and read-only overlay; production credentials are never used for browser login.

| Role | Login | Credential entry | Purpose |
|---|---|---|---|
| Administrator A | `synth_kfa_admin` | `admin` | Request/revoke operator master grants |
| Administrator B | `synth_kfa_second` | `second` | Approve a request from A |
| Operator | `synth_kfa_operator` | `operator` | Five native masters after explicit approval |
| Read-only viewer | `synth_kfa_viewer` | `viewer` | Read pages; mutations refused |
| Unlinked negative case | `synth_kfa_unlinked` | `unlinked` | KOSIPA access refused |

Use separate browser profiles/private contexts for A, B, operator and viewer. Logging in again as the same account can supersede its prior session. The write console uses `127.0.0.1`; the read console uses `localhost` so their host-only cookies stay separate. Never use production usernames/passwords in either console.

The write operator's actual initial grant status is recorded in [UAT_ENVIRONMENT_SETUP](UAT_ENVIRONMENT_SETUP.md). Grant administrators have no implicit master mutation bypass. If testing their own CRUD, use the operator account instead; self-grant and self-approval are refused.
