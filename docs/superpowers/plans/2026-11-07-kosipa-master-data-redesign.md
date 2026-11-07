# KOSIPA Master Data redesign

Goal: implement the supplied desktop reference on the existing landing page, with working local filtering and responsive views. The user authorizes implementation and verification without another design approval.

## Confirmed scope and design

- Keep `requireConsoleSession`, linked/role identity and `kosipa.member.view` gates on the server. Reference and product destinations enforce these same read permissions and their own write gates.
- Derive the directory from `MASTER_TYPES` / `MASTER_DEFINITIONS` and `PRODUCT_MASTER_TYPES` / `PRODUCT_MASTER_DEFINITIONS`. Move existing reference descriptions into presentation metadata; reuse `PRODUCT_PURPOSE`. Do not duplicate route registrations.
- Module lifecycle is absent. Record-level active flags describe records, not module readiness. Replace unsupported active/review KPIs with the reference/product group counts and omit lifecycle badges/filter.
- Preserve the existing eight FD-33 retirements, documented in `kosipa-full-access/12_DECISION_REGISTER.md` and `fa-03b/PRODUCT_MASTERS.md`. Their separate historical count is not part of the nine available modules. Show their names and existing explanation without archive/restore links.
- There is no audit-history page. Omit that action. A `Kelola` directory menu can link to existing master pages only for the same `hasWriteCapability` check used by those pages; destination gates remain authoritative.
- Reuse `PageBreadcrumbs`, native select/button/link conventions, existing Lucide icons, console font and `--c-*` tokens. Use a page CSS module so other screens and shell styles do not change.
- Design Read: KOSIPA administrative directory, calm enterprise layout; ENERGY 1 / RHYTHM 1 / MOTION 1. Blue identifies navigable masters; 12px cards and 10px controls follow the reference. Uniform cards allow scanning nine equivalent destinations. Existing typography preserves shell continuity. Compact section spacing reproduces the supplied image. Content-specific icons distinguish module types; chevrons identify navigation. Hover-only motion confirms interaction, with reduced motion support.

## Implementation and verification sequence

- [x] Add and run a focused browser scenario against the existing synthetic local server; establish the missing new UI before implementation.
- [x] Add presentation catalog generated from authoritative domain registries, and client directory with immediate normalized title/description search, native group select, grid/list controls, result announcements and reset/clear behavior.
- [x] Replace only the landing-page presentation, preserving all server gates. Render truthful four-card summary and FD-33 retirement information.
- [x] Style the header, summary, toolbar, sections and links against the supplied 1672×941 image. Four columns at >=1440, two at tablet widths, one on mobile. Preserve shell and synthetic environment notices.
- [x] Verify all nine read destinations, denied/unlinked accounts, reader write restrictions, menu permissions, filtering, both layouts, empty/reset, keyboard, reduced motion and no persistent overflow at 320/375/768/1024/1440/1672. A temporary synthetic viewer grant was requested and approved through the existing two-admin UI, then revoked and checked absent. No master or transaction records changed.
- [x] Run lint, TypeScript, relevant master/navigation/access tests and a production build with isolated output. Record screenshot evidence and any existing failures separately.
- [x] Review the final diff and publish a report covering every requested acceptance area and the four antislop gate blocks. No commit/push/merge/deploy or business-data writes.

## Follow-up: 90% contents

The owner reviewed the page and requested every Master Data component at the equivalent of browser zoom 90%. Apply native CSS `zoom: .9` only to the page root. Keep the shell and environment notice at their existing size. Verify physical icon/title dimensions, unchanged shell dimensions, all six viewport widths and existing interactions. Evidence and baseline quality limitations are recorded in the implementation report.

The subsequent Chrome/Arc comparison exposed a separate responsive issue: CSS zoom does not change the viewport used by media queries. At 1439px the scaled page still chose the two-column layout. Adjust the desktop grid threshold to 1296px (1440 × 0.9), and cover 1295/1296, 1349 and 1439px in the existing browser regression. Keep the mobile breakpoint and list layout intact.
