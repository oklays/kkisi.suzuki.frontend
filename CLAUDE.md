# KKISI Toko Web — Project Context

## System Overview

**Application:** KKISI Toko — Multi-tenant Cooperative POS & Inventory Management  
**Framework:** CodeIgniter 3.1.11 (PHP)  
**App Version:** 2.0.1  
**Domain:** `tokonew.kkisitb2.id`  
**Root:** `tokonew.kkisitb2.id/`

## Current Next.js Application

The revamp application lives in `apps/web/`. From the repository root, use `pnpm install --frozen-lockfile`, `pnpm db:generate`, and `pnpm dev`. See `README.md` for workspace commands. The legacy source remains outside the refactor scope.

## Detailed Documentation

All reverse-engineering documentation is in `docs/legacy-reference/`:

| File | Contents |
|------|----------|
| `docs/legacy-reference/01-discovery.md` | Stack, deps, session vars, config |
| `docs/legacy-reference/02-modules.md` | All controllers, models, helpers |
| `docs/legacy-reference/03-routes.md` | Full URL route inventory |
| `docs/legacy-reference/04-database.md` | All DB tables with columns |
| `docs/legacy-reference/05-data-flow.md` | SQL patterns & data flows |
| `docs/legacy-reference/06-business-rules.md` | Business logic & validations |
| `docs/legacy-reference/07-integrations.md` | IAK API, PHPMailer, SMS, Excel |
| `docs/legacy-reference/08-background-jobs.md` | No cron — all synchronous |
| `docs/legacy-reference/09-security.md` | Vulnerabilities & fixes |
| `docs/legacy-reference/10-diagrams.md` | Architecture & flow diagrams |

## Key Facts for Every Task

- **No Laravel** — this is CodeIgniter 3, not Laravel. No Eloquent, no Artisan, no facades.
- **Base controller:** `MY_Controller` — all authenticated controllers extend it
- **Auth gate:** `$this->load_global()` + `$this->permission_check('perm_slug')`
- **Multi-company:** Every query must be scoped to `company_id` from session (except role_id ≤ 2)
- **Timezone:** `Asia/Bangkok` (UTC+7)
- **Table prefixes:** `db_` (app tables), `m_` (member/anggota tables), `trans_` (loan tables)
- **DataTable pattern:** All list pages use server-side DataTables via `ajax_list()` → JSON

## Critical Known Issues

1. **SQL injection** in `Login_model.php` (username), `Pos_ppob.php`, `custom_helper.php` — use `$this->db->where()` for all new queries
2. **`encrypt_url()` always returns `false`** — the `$output = base64_encode($result)` line is commented out in `mysecurity_helper.php`
3. **`Api_c`** controller has **no authentication** — open to anyone
4. **`SMTPDebug = SMTP::DEBUG_SERVER`** is on in `sendmail()` — never copy this in new code

## Agents Available

| Agent | Triggers on |
|-------|------------|
| `kkisi-pos-engineer` | POS, kasir sessions, cart, invoice, payment, receipts |
| `kkisi-purchase-inventory` | Purchasing, suppliers, stock opname, items, import |
| `kkisi-member-loan` | Members (anggota), credit limits, loans, installments |
| `kkisi-reports-dashboard` | Reports, dashboard KPIs, Excel exports, P&L |
| `kkisi-security-fixer` | SQL injection, auth, RBAC, encryption, API security |
| `kkisi-integrations` | IAK API (PPOB), PHPMailer, SMS gateway, PhpSpreadsheet |
| `kkisi-admin-config` | Users, roles, permissions, site settings, master data |
| `kkisi-debugger` | Bug traces, root cause analysis, unexpected behavior |

## Code Style

- PHP: tabs for indentation, CodeIgniter conventions
- Comments: mix of English and Indonesian (match surrounding file style)
- Models: use CodeIgniter Query Builder (`$this->db->where()`, `->get()`, etc.)
- Never use raw `$this->db->query("... $variable ...")` — parameterize all values
- Views: Bootstrap-based AdminLTE theme
