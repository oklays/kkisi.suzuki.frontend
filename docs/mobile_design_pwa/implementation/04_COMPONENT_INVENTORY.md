# 04 — Component inventory

## Design tokens (`src/styles/tokens.css`)

Brand navy `#0A1F44`, blue `#0B3D91` (+ 600/700/500 shades used by the summary cards), yellow `#FFC400`; surfaces `#FFFFFF`, `#F2F5F9`, `#F0F2F5`; muted text `#526078`; lines `#E5E9F0`; status pairs success `#DDF3E7/#0A5A37`, waiting `#FFF0CC/#7A4300`, neutral `#E4E8F0/#3B4A63`, danger `#FFF0ED/#A02A22`; radii 9/12/16/20/24 px; touch target 44 px; app column 480 px; gutter 20 px (16 px ≤ 350 px); safe-area insets. Fonts: Archivo (display) and IBM Plex Sans (body), self-hosted via `next/font`.

## Shared components

| Component | File | Used by |
|---|---|---|
| `Screen` | components/layout/Screen.tsx | every member screen (frame, nav or footer spacing, `data-screen` scope) |
| `PageHeader` | components/layout/PageHeader.tsx | all secondary screens (back, title, subtitle, symbol, optional tabs) |
| `BottomNavigation` | components/navigation/BottomNavigation.tsx | Beranda, Simpanan, Pinjaman, Saldo, Favorit, Transaksi, Lainnya, Potongan, SHU |
| `BackButton` + `RouteTracker` | components/navigation | PageHeader; focus management |
| `TabLinks` | components/navigation/TabLinks.tsx | Simpanan, Pinjaman, SHU |
| `Sheet`, `SheetTrigger`, `SheetClose` | components/overlay/Sheet.tsx | notices, all services, type picker, loan/transaction details, Lainnya menus, cart, logout, install help |
| `EmptyState`, `UnavailableState`, `Note`, `StatusBadge`, `Skeleton`, `SectionHeading` | components/feedback/States.tsx | all data screens |
| `RetryButton` | components/feedback/RetryButton.tsx | unavailable sections, service-unavailable screen |
| `SubmissionNotice` | components/feedback/SubmissionNotice.tsx | loan application, deduction change, store checkout, PPOB |
| `Icon`, `SearchIcon` | components/ui/Icon.tsx | everywhere (paths copied from the mockup) |
| `ServiceArt` | components/ui/ServiceArt.tsx | service grid, all-services sheet, promo cards |
| `PwaRuntime` | components/pwa/PwaRuntime.tsx | root layout: SW registration, update toast, offline banner |
| `InstallCard`, `InstallMenuRow` | components/pwa/InstallPrompt.tsx | Beranda, Lainnya |
| `PrivacyProvider`, `Sensitive`, `PrivacyToggle` | providers/PrivacyProvider.tsx | every amount; eye buttons on summary cards |
| `CartProvider`, `useCart` | providers/CartProvider.tsx | Belanja, Checkout |

## Feature components

| Feature | Components |
|---|---|
| auth | `LoginForm`, `PinPad`, `PinBackButton` |
| home | `HomeHeader`, `BalanceCard`, `ServicesGrid`, `PromoCarousel`, `CoopGrid`, `Reminders`, `StoreCard` (+ skeletons) |
| savings | `SavingsHero`, `SavingsCards`, `MovementList`, `DeductionPanel`, `WithdrawalPanel`, `ListSkeleton` |
| loans | `ActiveLoanSection`, `LatestApplication`, `ApplicationsPanel`, `LoanApplicationForm` |
| deductions | `DeductionChangeForm` |
| catalog | `CatalogControls`, `AddToCart`, `Stepper`, `CatalogFooter`, `StoreCheckout` |
| transactions | `TransactionFilters` |
| account | `AccountMenu` |
| ppob | `PpobServiceForm` |

## Conventions

Server Components by default; `'use client'` only for interaction (forms, sheets, toggles, filters, carousel, PWA). Browser-only state is read with `useSyncExternalStore` (`src/hooks/browser-store.ts`) so server and first client render match. Amounts are always wrapped in `Sensitive` and formatted by `src/lib/utils/money.ts`; `null` renders "Tidak tersedia", never `Rp0`. Components that were used once and carry no reusable behaviour were deliberately not abstracted.
