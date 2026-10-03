# Requirements

Goal: make cashier cart review practical and provide authenticated Warehouse/Stock Opname workflows based on actual legacy storage.

| ID | EARS acceptance criterion |
| --- | --- |
| REQ-001 | WHEN a valid member is resolved through NIK, ID card, member ID or supported QR, THE SYSTEM SHALL default payment to Kredit Anggota and allow a subsequent Cash choice; failed/released lookup SHALL reset Cash. |
| REQ-002 | WHEN POS opens, THE SYSTEM SHALL offer exactly Product and Keranjang tabs in place of category chips; initial/search reads SHALL return at most 25 products, retaining name/code/barcode search. |
| REQ-003 | WHEN a barcode adds a product, THE SYSTEM SHALL show Keranjang in the center with full product names, quantity controls, unit price, discount, line total, removal and confirmed clear-all; transaction panel SHALL contain member/discount/totals/payment without a duplicate item list. |
| REQ-004 | WHILE payment is processing or uncertain, THE SYSTEM SHALL disable cart/member/payment mutation and preserve the existing retry key, register/branch cart isolation and receipt behavior. |
| REQ-005 | WHEN an authorized user opens Warehouse & Stock Opname, THE SYSTEM SHALL provide live company-scoped SO list, detail and item search, with empty/loading/error/retry states and functioning navigation. |
| REQ-006 | WHEN a global administrator with inventory_view accesses Warehouse, THE SYSTEM SHALL list/create/edit/activate/deactivate global warehouse names/contact details; branch-only users SHALL not read or mutate this global master. |
| REQ-007 | WHEN an authorized user creates a count, THE SYSTEM SHALL persist a draft with valid dates/period/remarks, a unique stable document number and actor, with retry-safe creation using a UUID request key. |
| REQ-008 | WHEN an item/count is added or edited in an owned draft, THE SYSTEM SHALL snapshot current stock/cost/name/barcode, mark the product under SO, accept explicit nonnegative integer physical counts including zero, and calculate adjustment/cost server-side. Competing drafts SHALL be rejected. |
| REQ-009 | WHEN an owned nonempty draft is approved, THE SYSTEM SHALL atomically replace item stock with physical counts, append one signed Penyesuaian audit per line, unlock items and mark approved; duplicate approval SHALL not repeat changes; stock drift SHALL reject the entire approval. |
| REQ-010 | WHEN an owned draft is canceled, THE SYSTEM SHALL atomically release its locks and remove its header/details without changing stock; approved/legacy documents SHALL remain immutable. |
| BR-001 | Inventory stock uses signed legacy INT storage; physical count is 0..2147483647; adjustment must fit signed INT; only active finished products excluding SALDOPPOB may be counted. |
| BR-002 | Warehouse is organization-wide; SO always uses selected session company. This phase introduces no warehouse stock allocation or transfer rules. |
| VAL-001 | Dates are real ISO dates with start <= end; period <=50, remarks/note <=1000; name 1..100, mobile <=20, email <=100 and valid if nonempty; IDs positive signed INT, UUID request key, duplicate items rejected; list/detail bounded. |
| SEC-001 | Every page/API SHALL fail closed on missing/expired session or permission; writes SHALL require same-origin JSON/CSRF and revalidate active company/user/role/permission in their transaction; branch/user IDs and snapshot/cost/status are never trusted from requests. |
| SEC-002 | Only a dedicated non-root inventory writer, distinct from read/POS/register users, SHALL write to matching loopback named local staging targets when explicitly enabled. Existing local/operational grants or ownership SHALL not change. |
| NFR-001 | The feature SHALL reuse installed dependencies and the domain/application/web layering, bound lists to 50 and product search to 25, use InnoDB atomic transactions and deterministic lock ordering. |
| OBS-001 | Successful mutations SHALL record a safe event with actor/company/document or warehouse ID; database failures SHALL return code-only responses without SQL/secrets/member details. Persisted SO creator and stock adjustments SHALL be retained. |
| MIG-001 | The feature SHALL reuse verified tables without destructive/schema changes and leave operational tables legacy-owned; new managed SO document prefix separates writable records from legacy read-only documents. |
