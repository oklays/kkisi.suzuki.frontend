# IMPLEMENTATION TASK — KOPERASI SMART SUZUKI LANDING PAGE

## ROLE

You are a Senior Frontend Engineer, UI/UX Designer, and Next.js Architect specializing in modern enterprise web applications.

Your task is to implement a production-quality, responsive landing page for **Koperasi Smart Suzuki**, following the provided design reference as closely as possible.

**IMPORTANT: The attached landing page image is the primary visual specification. The expected result is a near pixel-perfect implementation, not a redesign or a loose interpretation.**

The existing application is built using Next.js, React, and TypeScript.

---

# 1. PROJECT CONTEXT

Koperasi Smart Suzuki is a cooperative management platform supporting operational management, POS/Kasir, inventory, reporting, and cooperative member services.

Currently, the platform is undergoing modernization from an existing PHP Laravel application to a Next.js application.

The new landing page will serve as the public entry point for two separate application experiences:

1. **Console Management** — for administrators, operational staff, cashiers, and cooperative management.
2. **Aplikasi Anggota** — a future Progressive Web App (PWA) for cooperative members.

The landing page must represent a professional, trustworthy, modern enterprise platform.

## Existing Project Constraints

Before implementation:

- Inspect the existing Next.js application structure.
- Read relevant documentation inside `docs/` to understand the existing routing, authentication, architecture, and project conventions.
- Reuse existing components, design tokens, utilities, and dependencies whenever appropriate.
- Do not perform another comprehensive legacy PHP audit.
- Do not modify existing business logic, database schemas, queries, or API integrations.
- Do not alter existing authentication flows.
- Do not introduce breaking changes to current Console Management or POS functionality.
- Keep the changes scoped to the landing page and necessary presentation components.

This is primarily a **frontend UI implementation task**.

---

# 2. DESIGN REFERENCE — PIXEL-PERFECT RECREATION

Use the attached landing page reference image as the main source of truth.

Target visual style:

- Modern corporate enterprise SaaS
- Premium, clean, and professional
- Blue and white Suzuki-inspired branding
- Soft gradients and subtle depth
- Large typography with clear visual hierarchy
- Rounded interactive cards
- Elegant background decoration
- Minimal but visually engaging interface
- Responsive and accessible

**Do not create an entirely different layout. Reproduce the original reference design as closely as practical.**

Desktop reference proportions: approximately 1650 × 900 pixels.

The main composition has two areas:

**Left: Branding, hero heading, description, navigation cards, and feature highlights.**

**Right: Suzuki dealership background with overlapping desktop management console and mobile member application mockups.**

The entire composition should feel like one cohesive hero section, not two disconnected columns.

---

# 3. PAGE STRUCTURE

## SECTION A — HEADER / BRANDING

Position the header near the top with generous horizontal padding.

### Left side

Display a compact brand identity:

Logo:
- Blue rounded square
- Text: `KSM`
- White bold lettering
- Subtle rounded corners

Next to the logo:

**Koperasi Smart Suzuki**

Below the brand name, use small uppercase letter-spaced text:

`BERSAMA MEMBANGUN KESEJAHTERAAN`

Typography:
- Brand name: bold, dark navy
- Supporting tagline: muted blue-gray
- Compact, refined spacing

### Right side

Display the tagline:

`Bersama`
`Membangun Kesejahteraan`

Include a small vertical blue accent line.

Keep the header minimal, without unnecessary navigation items.

---

# 4. HERO SECTION — LEFT AREA

Create a visually dominant hero section aligned toward the left side of the page.

### Small eyebrow text

`SELAMAT DATANG DI`

Style:
- Uppercase
- Royal blue
- Bold
- Wide letter spacing
- Approximately 13–15px

### Main heading

Render:

**Koperasi**
**Smart Suzuki**

The heading must occupy two lines.

Styling:
- Very large typography
- Approx. 68–80px on large desktop
- Bold / extra-bold
- Tight line height
- Slightly negative letter spacing

Colors:
- "Koperasi" in dark navy / near black
- "Smart Suzuki" in vivid royal blue

Use responsive typography with CSS `clamp()`.

Suggested color palette:

- Primary navy: `#101828`
- Royal blue: `#0747D9`
- Deep blue: `#073AA9`
- Light blue: `#EAF2FF`
- Background: `#F7FAFF`
- Secondary text: `#566277`

Adjust values slightly when needed to match the visual reference more accurately.

### Hero description

Use the following text:

`Platform koperasi modern untuk mendukung operasional usaha dan layanan anggota secara lebih cepat, aman, dan terintegrasi.`

Styling:
- Approximately 18–20px
- Medium gray / blue-gray
- Comfortable line height
- Maximum width approximately 600px

Maintain spacing and hierarchy consistent with the reference.

---

# 5. PRIMARY NAVIGATION — TWO ACCESS CARDS

Below the hero description, create two prominent side-by-side clickable access cards.

These are the most important interactive elements on the landing page.

## CARD 1 — CONSOLE MANAGEMENT

Design:
- Premium royal blue to deep navy gradient
- White text
- Rounded corners approximately 16–20px
- Subtle blue shadow
- Spacious inner padding
- Desktop/monitor icon inside a translucent rounded square
- Arrow icon aligned toward the right

Content:

Small text:
`Masuk ke`

Main title:
`Console Management`

Description:
`Untuk pengelola, kasir, dan operasional`

Interaction:
- Entire card must be clickable.
- Provide hover elevation, subtle transform, and smoother shadow.
- Include keyboard focus states.
- Use the existing Console Management authentication or application entry route.

**Do not assume a new URL. Discover the existing route first.**

## CARD 2 — APLIKASI ANGGOTA

Design:
- White/light blue background
- Subtle blue border
- Soft shadow
- Rounded corners matching Card 1
- Blue member/group icon
- Blue arrow on the right
- Dark blue title

Content:

Small text:
`Masuk ke`

Main title:
`Aplikasi Anggota`

Description:
`Cek saldo, transaksi, simpanan, pinjaman, dan layanan lainnya`

Interaction:
- Entire card should appear interactive.
- If the Member PWA already exists, connect to its actual route.
- If the PWA has not been implemented, show an elegant **"Segera Hadir"** experience.
- Do not create a fake member authentication flow.
- Do not route members to Console Management.
- Keep its destination easy to configure for future PWA integration.

### Card behavior

Desktop:
- Display both cards horizontally.
- Maintain similar heights.
- Console card should have stronger visual emphasis.

Mobile:
- Stack both cards vertically.
- Use full available width.
- Preserve icon, text hierarchy, and arrow alignment.

---

# 6. HERO VISUALIZATION — RIGHT AREA

This section is essential for matching the reference.

Build a layered visual composition consisting of:

1. Suzuki dealership/building backdrop.
2. Desktop management console mockup.
3. Smartphone showing the member PWA.
4. Abstract blue gradient decorative shapes.

All visual elements should form a single professionally composed hero illustration.

## A. Suzuki Dealership Background

Use a soft, bright dealership/building photograph or appropriate illustration similar to the reference.

Characteristics:
- Modern automotive dealership architecture
- White/gray building
- Suzuki branding where an appropriately licensed official asset is available
- Bright daylight
- Pale blue sky
- Reduced contrast behind the UI mockups

The background must blend naturally into the page.

Apply a subtle white/blue gradient overlay so it does not compete with the heading and navigation cards.

Do not use an unlicensed third-party image.

## B. Desktop Console Mockup

Create a realistic desktop monitor mockup with a dark display bezel.

Inside the monitor, display a visual preview of the cooperative management platform.

Suggested layout:

Sidebar:
- KSM branding
- POS / Kasir
- Produk
- Stok
- Member
- Laporan
- Pengaturan

Main area:
- Search bar
- Product cards with thumbnails
- Transaction list
- Payment summary
- Primary payment action

UI styling:
- White/light gray content area
- Dark navy sidebar
- Blue selected navigation item
- Rounded product cards
- Subtle dividers
- Small shadows
- Clean, structured tables or lists

**This is a decorative product preview, not a functional POS application.**

Prefer actual existing application screenshots or reusable visual components if suitable assets already exist.

If no existing assets are suitable, build a lightweight, polished HTML/CSS mockup or use a purpose-made transparent illustration asset.

Do not make unnecessary API calls or connect the mockup to production data.

## C. Member PWA Smartphone Mockup

Place a realistic smartphone partially overlapping the right side of the desktop monitor.

The phone should appear slightly larger and visually prominent in the foreground.

Display a member dashboard preview.

Phone screen content:

Header:
`Halo, Anggota Koperasi`

Primary balance card:
`Saldo Simpanan`
`Rp 2.500.000`

Quick access features:
- Simpanan
- Pinjaman
- Transaksi
- Pembelian
- Promo
- Lainnya

Bottom promotional banner:
`Bersama Membangun Kesejahteraan`

UI characteristics:
- Blue gradient header
- White financial summary card
- Rounded feature icons
- Modern mobile banking/cooperative dashboard look
- Proper safe-area and screen alignment

This is a **concept visualization of the future PWA**, not an assertion that these services are currently available.

Use static illustrative data only.

## D. Decorative Elements

Add layered blue abstract shapes near the bottom-right portion of the illustration.

Use:
- Soft blue gradient ribbons
- Curved shapes
- Gentle shadow
- Subtle atmospheric glow

The goal is to create depth without excessive visual noise.

Avoid distracting animations.

---

# 7. FEATURE HIGHLIGHTS — BOTTOM LEFT

Below the primary access cards, display four feature highlights horizontally.

Each feature should contain:
- Rounded light blue icon container
- Blue icon
- Short bold title

Features:

**1. Transaksi Lebih Cepat**
Icon: Shopping bag

**2. Data Terintegrasi dan Akurat**
Icon: Database

**3. Aman dan Terpercaya**
Icon: Shield check

**4. Layanan untuk Anggota**
Icon: Users

Use Lucide icons if the library is already installed.

Maintain even spacing, consistent icon sizes, and aligned labels.

Mobile:
- Convert the feature highlights into a 2 × 2 grid.
- Maintain sufficient touch-friendly spacing.
- Prevent text clipping or awkward wrapping.

---

# 8. RESPONSIVE DESIGN REQUIREMENTS

The implementation must work correctly on desktop, tablet, and mobile.

## Desktop — 1440px and above

- Full-width premium hero layout
- Left content and right illustration side by side
- Large two-line heading
- Horizontal access cards
- Four-column feature highlights
- Right hero illustration with layered monitor and smartphone
- Adequate whitespace

## Laptop — 1024px to 1439px

- Reduce heading and mockup sizes proportionally.
- Preserve the split layout wherever practical.
- Avoid overlapping primary text or cards with the illustration.
- Prevent horizontal overflow.

## Tablet — 768px to 1023px

- Adapt proportions to available width.
- Stack the hero sections when necessary.
- Ensure the device mockups remain recognizable.
- Keep navigation cards highly visible.

## Mobile — below 768px

Use this content order:

1. Brand/header
2. Welcome label
3. Hero heading
4. Hero description
5. Console Management card
6. Aplikasi Anggota card
7. Product illustration, appropriately simplified
8. Feature highlights

Important:
- Ensure both application entry cards appear early on the page.
- Use approximately 32–44px for the main heading, depending on viewport width.
- Maintain readable text sizes.
- Avoid excessive empty space.
- Do not allow horizontal scrolling.
- Avoid overlapping the phone and monitor in a way that hides important content.

Mobile must look intentionally designed rather than simply being a compressed desktop version.

---

# 9. VISUAL DESIGN SYSTEM

Follow a consistent design system.

## Typography

Prefer the application's existing font if appropriate.

Otherwise, use:
- Inter
- Geist
- Or another comparable modern sans-serif

Typography hierarchy:
- Hero: Extra Bold
- Branding: Bold
- Card title: Semibold/Bold
- Body: Regular/Medium
- Eyebrow: Bold uppercase

## Spacing

Use a consistent spacing system based on 4px or 8px increments.

Ensure:
- Spacious header
- Clear separation between hero elements
- Balanced alignment
- Comfortable card padding
- No unnecessary empty containers

## Shadows and borders

Use:
- Soft blue-tinted shadows
- Thin gray-blue borders
- Rounded edges
- Smooth transitions

Avoid overly strong shadows, excessive gradients, and heavy glassmorphism.

## Interaction

Provide:
- Card hover effects
- Arrow movement on hover
- Visible keyboard focus
- Appropriate cursor behavior
- Responsive active/tap states
- Reduced-motion compatibility

Animations must be subtle and should never interfere with navigation or readability.

---

# 10. NEXT.JS IMPLEMENTATION GUIDELINES

Use the existing project technology stack and conventions.

Expected technologies:
- Next.js App Router
- React
- TypeScript
- Existing styling system (Tailwind CSS if already configured)
- Existing icon library

Suggested component separation:

```text
src/
  app/
    page.tsx

  components/
    landing/
      LandingPage.tsx
      LandingHeader.tsx
      HeroContent.tsx
      AccessCards.tsx
      FeatureHighlights.tsx
      HeroVisualization.tsx
      ConsolePreview.tsx
      MemberPwaPreview.tsx
```

Adapt this structure to the actual repository.

Do not create duplicate component systems if a suitable structure already exists.

Implementation principles:
- Use reusable components.
- Prefer React Server Components for static sections.
- Add client components only where interaction genuinely requires them.
- Use semantic HTML.
- Use `next/link` for internal navigation.
- Use `next/image` for appropriate image assets.
- Avoid unnecessary dependencies.
- Optimize for performance and maintainability.
- Avoid hydration mismatch.
- Avoid layout shift.
- Keep decorative visuals separate from functional controls.
- Ensure proper image loading and asset dimensions.

IMPORTANT: Do not use the provided entire screenshot as a single background image.

All headings, descriptions, icons, and entry cards must be real HTML/React elements.

The right-side product visualization may use layered image assets, CSS compositions, or mockup components.

---

# 11. ROUTING AND FUTURE PWA READINESS

The landing page must support two distinct application destinations.

### Console Management

- Identify and reuse the existing authentication route.
- Maintain current authentication middleware and security behavior.
- Do not modify login/session handling.
- Ensure existing authenticated and unauthenticated behavior remains valid.

### Aplikasi Anggota

- Inspect whether a member application or PWA route already exists.
- If implemented, use that entry point.
- If not implemented, provide an intentional "Segera Hadir" route or UI experience.
- Keep member routing logically separate from management routing.
- Do not implement PWA infrastructure, service workers, manifests, or new authentication as part of this task unless already present and needed for existing functionality.

The landing page must be ready for the future member PWA without unnecessarily implementing it now.

---

# 12. PERFORMANCE AND ACCESSIBILITY

Ensure:

- Responsive layout
- No horizontal overflow
- Accessible navigation links
- Keyboard usability
- Visible focus indicators
- Appropriate text contrast
- Proper heading hierarchy
- Meaningful image alt text
- Decorative elements hidden from assistive technologies
- Reduced-motion support
- Reasonable image file sizes
- No external image dependency at runtime if avoidable
- No unnecessary client-side JavaScript

Optimize visual performance and avoid a large collection of uncompressed assets.

---

# 13. IMPLEMENTATION WORKFLOW

Execute the task in the following sequence.

### Phase 1 — Inspect

1. Read relevant project documentation in `docs/`.
2. Inspect current landing page.
3. Identify existing routing and authentication entry points.
4. Review available brand assets and dependencies.
5. Determine the minimal required implementation changes.

Do not perform a complete re-audit of the legacy application.

### Phase 2 — Implement

1. Build the brand header.
2. Build the hero heading and description.
3. Build both application access cards.
4. Build the right-side layered product visualization.
5. Build the feature highlights.
6. Implement responsive behavior.
7. Implement hover and accessibility states.
8. Integrate actual existing routes.

### Phase 3 — Visual Validation

Compare the implemented result directly against the provided reference image.

Validate screenshots at approximately:
- 1650 × 900 desktop (primary reference)
- 1440 × 900 desktop
- 1024 × 768 tablet/compact laptop
- 768 × 1024 tablet
- 390 × 844 mobile
- 375 × 812 mobile

Where browser/screenshot tooling is available, render the page and inspect it visually.

Check:
- Main layout proportions
- Positioning
- Typography
- Colors
- Card dimensions
- Shadows
- Spacing
- Mockup composition
- Responsive behavior

Correct meaningful visual differences before declaring the implementation complete.

### Phase 4 — Technical Validation

Run relevant existing project checks:
- TypeScript validation
- ESLint
- Production build
- Route/navigation verification
- Responsive overflow checks

Do not fix unrelated issues unless they block the requested work. Document such blockers separately.

---

# 14. ACCEPTANCE CRITERIA

The task is completed only when:

- [ ] The landing page visually resembles the supplied reference as closely as practical.
- [ ] Branding reads "Koperasi Smart Suzuki".
- [ ] The main hero heading and description match the specification.
- [ ] Both application entry cards are clearly visible.
- [ ] Console Management links to the correct existing application route.
- [ ] Member PWA entry is appropriately connected or presented as coming soon.
- [ ] The desktop console visualization is included.
- [ ] The smartphone member dashboard visualization is included.
- [ ] The four feature highlights are included.
- [ ] Layout works on desktop, tablet, and mobile.
- [ ] No horizontal overflow occurs.
- [ ] Accessibility basics are satisfied.
- [ ] Existing operational functionality remains unchanged.
- [ ] No business logic, API behavior, or database changes are introduced.
- [ ] Relevant project validation passes.

---

# 15. FINAL DELIVERABLES

At completion, provide:

1. **Implementation summary** — what was changed and why.
2. **Files changed** — list of created and modified files.
3. **Component architecture** — how the landing page is organized.
4. **Navigation behavior** — resolved Console Management and Member PWA destinations.
5. **Visual verification** — screenshot comparison results, if screenshot tooling is available.
6. **Validation results** — TypeScript, lint, build, and relevant functionality checks.
7. **Remaining considerations** — anything intentionally deferred, especially future PWA integration.

Do not report visual or technical validations as successful unless they were actually executed.

---

# FINAL INSTRUCTION

**Prioritize visual fidelity, responsive quality, and implementation simplicity.**

This task is not an opportunity to redesign the landing page, restructure the entire repository, or refactor unrelated application modules.

Follow the reference image faithfully.

The resulting page should feel like a premium corporate landing page for a modern digital cooperative platform.

The two main entry points, **Console Management** and **Aplikasi Anggota**, must be immediately recognizable.

Make the result visually polished, production-ready, maintainable, and consistent with the existing Next.js application architecture.

Proceed with the implementation after reviewing the necessary existing project context.

```Text
Assalamu'alaikum pak, mau update terkait progress maintenance website koperasi, 
saat ini sudah UP ke google hasil dari maintenance nya bisa dilihat di link berikut ini ``https://smart.kkisitb2.id``.

Dan juga disitu saya sedikit touch up untuk desain User Interface nya, dan dari sisi performance TOKO sudah bertambah lebih dari 5x dari website sebelumnya.

Rencana besok saya mau lanjut implementasi ke satu TOKO koperasi dulu utk suzuki tambun, sebelum di implementasikan ke seluruh TOKO koperasi.
```

# NEW ACCOUNT PERMISSION FOR RETUR, INV, PRODUCT

## AKUN
nxret
nxinv
nxprd

## PASSWORD
kopkar-nxret123
kopkar-nxinv123
kopkar-nxprd123

ssh -t -p 1980 root@117.54.42.178 /opt/apps/genesis.web/set-writer.sh return n1608204_nxret
ssh -t -p 1980 root@117.54.42.178 /opt/apps/genesis.web/set-writer.sh inventory n1608204_nxinv
ssh -t -p 1980 root@117.54.42.178 /opt/apps/genesis.web/set-writer.sh products n1608204_nxprd