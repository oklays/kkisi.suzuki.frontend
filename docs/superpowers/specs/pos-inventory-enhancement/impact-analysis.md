# Impact analysis

| Area | Change / risk / mitigation |
| --- | --- |
| POS presentation | Replace category strip with Product/Keranjang tabs and one large center cart. Keep one cart state and existing persistence/idempotency locks; responsive verification includes 320px and short desktops. |
| Catalog | Change shared cap 24 → 25. Exact barcode lookup remains independent; catalog category API compatibility remains available although category buttons disappear. |
| Payment | Successful member selection defaults Kredit; explicit Cash remains enabled. Removing/invalidating member resets Cash. Server member/credit checks remain authoritative. |
| Inventory application | New pure validation/contracts and use cases with app-owned Prisma adapter. API/page adapters remain thin. |
| Database | Reuse actual tables without DDL. Stock count mutations use transactions and stable company/item lock order, snapshot drift checks and signed Penyesuaian entries. Global warehouse master cannot be presented as company-owned stock. |
| Auth / security | Session scope, inventory_so for SO; global warehouse requires inventory_view and role <= 2. All mutations require same-origin JSON and CSRF, with permission revalidation inside the transaction. SQL values parameterized. |
| Writer ownership | New dedicated inventory writer, loopback named staging only, distinct from reader/POS/register writers. No grant/provisioning on existing staging/operational DB. An isolated synthetic fixture is used for write acceptance. |
| Legacy compatibility | Legacy drafts are readable but cannot be mutated by this phase. New owned document prefix differentiates safer counting lifecycle. Stock helper and concurrent PHP writers require separate operational cutover acceptance. |
| Observability | Safe code-only errors and actor/company/document audit events; no member details, SQL, DSNs or credentials in logs. |
| Deployment / recovery | No deployment requested. Disable INVENTORY_WRITES_ENABLED to stop new mutations; finish/cancel open counts before reverting feature code. No destructive rollback SQL, no schema migration. |
| Mock / real data | Real SELECT-backed pages, no fixture fallback. Synthetic transactional proof is reported separately from historical data and PHP writer parity. |

Alternatives considered: (1) read-only menu would leave requested workflow incomplete; (2) new warehouse-level stock schema would invent unsupported ownership/location relationships; (3) selected approach reuses actual legacy tables with an isolated staging writer and safe lifecycle. It fulfills this phase without schema cutover.
