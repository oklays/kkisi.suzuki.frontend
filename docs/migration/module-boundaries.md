# Target Module Boundaries — Next.js Architecture

> **Hard rule:** React components and Next.js route handlers (`app/**/route.ts`, `app/**/page.tsx`, Server Actions) **must not contain business rules**. They are thin adapters only — parsing input, calling a use-case, rendering/returning output.
>
> All business logic documented in `docs/legacy-reference/06-business-rules.md` must live in the **domain** and **application** layers, never in `app/`.

---

## Layered Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                       │
│  app/**/page.tsx, app/**/route.ts, components/            │
│  → Rendering, form handling, HTTP request/response only   │
└───────────────────────┬────────────────────────────────────┘
                         │ calls
┌───────────────────────▼────────────────────────────────────┐
│  APPLICATION LAYER (Use Cases)                              │
│  src/application/<domain>/use-cases/                        │
│  → Orchestrates domain logic + repositories                 │
│  → One use-case = one business operation (e.g. SaveSale)    │
└───────────────────────┬────────────────────────────────────┘
                         │ calls
┌───────────────────────▼────────────────────────────────────┐
│  DOMAIN LAYER                                                │
│  src/domain/<domain>/                                        │
│  → Entities, value objects, pure business rules              │
│  → No framework, no DB, no HTTP — pure TypeScript             │
└───────────────────────┬────────────────────────────────────┘
                         │ interfaces implemented by
┌───────────────────────▼────────────────────────────────────┐
│  DATA ACCESS LAYER                                            │
│  src/infrastructure/repositories/                              │
│  → Prisma/Drizzle queries, implements domain repository ports │
└───────────────────────┬────────────────────────────────────┘
                         │
┌───────────────────────▼────────────────────────────────────┐
│  EXTERNAL INTEGRATIONS LAYER                                  │
│  src/infrastructure/external/                                  │
│  → IAK API client, SMTP client, SMS gateway client             │
└──────────────────────────────────────────────────────────────┘
```

**Dependency rule:** Arrows point downward only. Domain layer has ZERO imports from application, infrastructure, or presentation. Application layer imports domain (interfaces) but not infrastructure directly — it depends on abstractions (ports), which infrastructure implements (adapters).

---

## Directory Structure

```
src/
├── app/                              # PRESENTATION — Next.js App Router
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── pos/
│   │   │   ├── page.tsx              # renders <PosScreen />
│   │   │   └── actions.ts            # Server Actions — thin wrappers only
│   │   ├── members/page.tsx
│   │   ├── purchase/page.tsx
│   │   ├── inventory/page.tsx
│   │   ├── ppob/page.tsx
│   │   ├── reports/page.tsx
│   │   └── dashboard/page.tsx
│   └── api/
│       ├── pos/sales/route.ts        # thin — validate + call use-case
│       ├── ppob/topup/route.ts
│       └── webhooks/iak/route.ts
│
├── components/                       # PRESENTATION — pure UI, no business logic
│   ├── pos/
│   │   ├── CartTable.tsx
│   │   └── PaymentDialog.tsx
│   └── ui/                           # shadcn/generic components
│
├── application/                      # APPLICATION LAYER — use cases
│   ├── auth/
│   │   ├── use-cases/
│   │   │   ├── login.usecase.ts
│   │   │   └── verify-otp.usecase.ts
│   ├── pos/
│   │   ├── use-cases/
│   │   │   ├── open-kasir.usecase.ts
│   │   │   ├── close-kasir.usecase.ts
│   │   │   ├── add-to-cart.usecase.ts
│   │   │   ├── save-sale.usecase.ts        # ← equivalent of Pos::pos_save
│   │   │   ├── hold-invoice.usecase.ts
│   │   │   └── retrieve-hold.usecase.ts
│   ├── member/
│   │   ├── use-cases/
│   │   │   ├── get-credit-limit.usecase.ts # ← equivalent of tagihan_anggota
│   │   │   └── lookup-member.usecase.ts
│   ├── inventory/
│   │   ├── use-cases/
│   │   │   ├── receive-purchase.usecase.ts
│   │   │   ├── create-stock-opname.usecase.ts
│   │   │   ├── approve-stock-opname.usecase.ts
│   │   │   └── adjust-stock.usecase.ts
│   ├── purchase/
│   │   └── use-cases/
│   │       ├── create-purchase.usecase.ts
│   │       └── record-purchase-payment.usecase.ts
│   ├── ppob/
│   │   └── use-cases/
│   │       ├── check-operator.usecase.ts
│   │       ├── inquiry-pln.usecase.ts
│   │       └── execute-topup.usecase.ts
│   ├── loan/
│   │   └── use-cases/
│   │       ├── generate-installment-schedule.usecase.ts  # ← get_bungan_bulanan
│   │       └── apply-payroll-deduction.usecase.ts          # ← get_update_cicilan
│   └── reports/
│       └── use-cases/
│           ├── generate-branch-pl.usecase.ts               # ← Laporan Toko
│           └── get-dashboard-kpis.usecase.ts
│
├── domain/                           # DOMAIN LAYER — pure business rules
│   ├── auth/
│   │   ├── entities/User.ts
│   │   └── value-objects/Role.ts
│   ├── pos/
│   │   ├── entities/Sale.ts
│   │   ├── entities/SaleItem.ts
│   │   ├── entities/KasirSession.ts
│   │   ├── value-objects/InvoiceCode.ts
│   │   ├── value-objects/Money.ts
│   │   └── services/
│   │       ├── invoice-code-generator.service.ts
│   │       └── tax-calculator.service.ts           # inclusive/exclusive tax rules
│   ├── member/
│   │   ├── entities/Member.ts
│   │   └── services/
│   │       └── credit-limit-calculator.service.ts  # gaji_minus override rule
│   ├── inventory/
│   │   ├── entities/Item.ts
│   │   ├── entities/StockEntry.ts
│   │   └── services/
│   │       └── stock-mutation.service.ts
│   ├── loan/
│   │   ├── entities/Loan.ts
│   │   ├── entities/Installment.ts
│   │   └── services/
│   │       ├── flat-rate-calculator.service.ts
│   │       └── installment-schedule.service.ts     # month-rollover logic here
│   │
│   └── shared/
│       ├── ports/                    # repository interfaces (dependency inversion)
│       │   ├── SaleRepository.ts
│       │   ├── ItemRepository.ts
│       │   ├── MemberRepository.ts
│       │   └── LoanRepository.ts
│       └── errors/
│           ├── InsufficientCreditError.ts
│           ├── KasirNotOpenError.ts
│           └── InsufficientStockError.ts
│
├── infrastructure/                   # DATA ACCESS + EXTERNAL INTEGRATIONS
│   ├── repositories/
│   │   ├── prisma-sale.repository.ts       # implements SaleRepository
│   │   ├── prisma-item.repository.ts       # implements ItemRepository
│   │   ├── prisma-member.repository.ts     # implements MemberRepository
│   │   └── prisma-loan.repository.ts       # implements LoanRepository
│   ├── external/
│   │   ├── iak/
│   │   │   ├── iak-client.ts               # wraps IAK API HTTP calls
│   │   │   └── iak-response-mapper.ts
│   │   ├── email/
│   │   │   └── smtp-client.ts
│   │   └── sms/
│   │       └── sms-gateway-client.ts
│   └── db/
│       ├── prisma/schema.prisma
│       └── migrations/
│
└── shared/                           # cross-cutting technical utilities (NOT business rules)
    ├── auth/session.ts                # NextAuth or custom session helper
    └── logger.ts
```

---

## Layer Responsibilities — Detailed

### 1. Presentation Layer (`app/`, `components/`)

**Allowed:**
- Rendering JSX
- Form state, client-side validation UX (not business validation)
- Calling a single use-case function
- Mapping use-case result → view model
- HTTP status code selection

**Forbidden:**
- Computing credit limits, tax, stock deltas, invoice codes
- Direct Prisma/DB calls
- Direct IAK API calls
- Any `if (gaji_minus > 0)` type business conditionals

**Example — correct thin route handler:**
```typescript
// app/api/pos/sales/route.ts
import { saveSaleUseCase } from '@/application/pos/use-cases/save-sale.usecase';

export async function POST(req: Request) {
  const body = await req.json();
  const session = await getSession(req);

  const result = await saveSaleUseCase.execute({
    companyId: session.companyId,
    userId: session.userId,
    kasirId: session.kasirId,
    invoice: body.invoice,
    customerId: body.customerId,
    nikKar: body.nikKar,
    paymentType: body.paymentType,
    paidAmount: body.paidAmount,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ salesId: result.value.salesId, salesCode: result.value.salesCode });
}
```

---

### 2. Application Layer (`application/`)

**Allowed:**
- Orchestrating a sequence of domain operations
- Transaction boundary management (`db.$transaction`)
- Calling repository ports
- Calling external integration ports
- Mapping DTOs in/out

**Forbidden:**
- Direct SQL/ORM queries (must go through repository interface)
- Direct HTTP client calls (must go through integration port)
- Rendering / HTTP concerns

**Example — use case:**
```typescript
// application/pos/use-cases/save-sale.usecase.ts
export class SaveSaleUseCase {
  constructor(
    private saleRepo: SaleRepository,
    private itemRepo: ItemRepository,
    private kasirRepo: KasirRepository,
    private creditLimitService: CreditLimitCalculatorService,
    private taxCalculator: TaxCalculatorService,
    private invoiceCodeGenerator: InvoiceCodeGeneratorService,
  ) {}

  async execute(input: SaveSaleInput): Promise<Result<SaveSaleOutput>> {
    const kasir = await this.kasirRepo.findOpenSession(input.companyId, input.userId);
    if (!kasir) return Result.fail(new KasirNotOpenError());

    if (input.paymentType === 'Kredit' && input.nikKar) {
      const limitCheck = await this.creditLimitService.check(input.nikKar, input.grandTotal);
      if (!limitCheck.sufficient) return Result.fail(new InsufficientCreditError());
    }

    const invoiceCode = await this.invoiceCodeGenerator.generate('INV', input.companyId);

    // Transaction: sale + items + stock + payment + cart clear
    return this.saleRepo.createSaleTransaction({ ...input, invoiceCode });
  }
}
```

---

### 3. Domain Layer (`domain/`)

**Allowed:**
- Pure functions and classes
- Business invariants (e.g., `Money` cannot be negative on stock reduction below zero)
- Calculations: tax, credit limit, installment schedule, invoice code format

**Forbidden:**
- Any import from `next`, `react`, `prisma`, `fetch`
- Any I/O

**Example — domain service:**
```typescript
// domain/member/services/credit-limit-calculator.service.ts
export class CreditLimitCalculatorService {
  calculateEffectiveLimit(member: Member): Money {
    // Mirrors legacy: effective_limit = gaji_minus > 0 ? gaji_minus : limit_toko
    return member.gajiMinus.isGreaterThan(Money.zero())
      ? member.gajiMinus
      : member.limitToko;
  }

  calculateRemainingCredit(effectiveLimit: Money, monthlyUsage: Money): Money {
    return effectiveLimit.subtract(monthlyUsage);
  }
}
```

```typescript
// domain/loan/services/installment-schedule.service.ts
export class InstallmentScheduleService {
  generateDueDates(startDate: Date, tenorMonths: number): Date[] {
    const dates: Date[] = [];
    let year = startDate.getFullYear();
    let month = startDate.getMonth() + 1; // 1-indexed, mirrors legacy $bulan

    for (let i = 0; i < tenorMonths; i++) {
      if (month > 12) {           // explicit month-rollover guard —
        year += 1;                 // legacy bug CT-LOAN-003 must NOT recur
        month = 1;
      }
      dates.push(new Date(year, month - 1, startDate.getDate()));
      month += 1;
    }
    return dates;
  }
}
```

---

### 4. Data Access Layer (`infrastructure/repositories/`)

**Allowed:**
- ORM queries (Prisma/Drizzle)
- Mapping DB rows → domain entities
- Implementing repository interfaces defined in `domain/shared/ports/`

**Forbidden:**
- Business logic (e.g., no credit limit math here — only data retrieval/storage)
- Calling other repositories directly (composition happens in application layer)

**Example:**
```typescript
// infrastructure/repositories/prisma-member.repository.ts
export class PrismaMemberRepository implements MemberRepository {
  async findByNik(nik: string): Promise<Member | null> {
    const row = await prisma.mAnggota.findUnique({ where: { nikKar: nik } });
    return row ? MemberMapper.toDomain(row) : null;
  }

  async getMonthlyKreditUsage(nik: string, month: Date): Promise<Money> {
    const result = await prisma.dbSales.aggregate({
      _sum: { grandTotal: true },
      where: {
        nikKar: nik,
        paymentType: 'Kredit',
        salesStatus: 'Final',
        salesDate: { gte: startOfMonth(month), lte: endOfMonth(month) },
      },
    });
    return Money.fromDecimal(result._sum.grandTotal ?? 0);
  }
}
```

---

### 5. External Integrations Layer (`infrastructure/external/`)

**Allowed:**
- HTTP clients to IAK, SMTP, SMS gateway
- Response mapping to domain-friendly DTOs
- Retry/timeout/circuit-breaker logic

**Forbidden:**
- Business decision-making (e.g., "should we block this top-up" is a domain/application decision, not here)

**Example:**
```typescript
// infrastructure/external/iak/iak-client.ts
export class IakClient {
  async checkOperator(phone: string): Promise<IakOperatorResult> {
    const res = await fetch(`${this.baseUrl}/check-operator`, { ... });
    const json = await res.json();
    return { rc: json.data.rc, operator: json.data.operator }; // no decisions made here
  }
}
```

---

## Module-to-Layer Mapping Table

| Legacy Module | Domain Entities | Application Use Cases | Repository Ports | External Integrations |
|---|---|---|---|---|
| Auth | `User`, `Role` | `LoginUseCase`, `VerifyOtpUseCase` | `UserRepository` | `EmailClient` |
| Kasir | `KasirSession` | `OpenKasirUseCase`, `CloseKasirUseCase` | `KasirRepository` | — |
| POS | `Sale`, `SaleItem`, `Cart` | `SaveSaleUseCase`, `AddToCartUseCase`, `HoldInvoiceUseCase` | `SaleRepository`, `CartRepository` | `SmsClient` |
| Member | `Member` | `GetCreditLimitUseCase`, `LookupMemberUseCase` | `MemberRepository` | — |
| Inventory | `Item`, `StockEntry`, `StockOpname` | `ReceivePurchaseUseCase`, `ApproveStockOpnameUseCase` | `ItemRepository`, `StockOpnameRepository` | — |
| Purchase | `Purchase` | `CreatePurchaseUseCase`, `RecordPaymentUseCase` | `PurchaseRepository`, `SupplierRepository` | — |
| PPOB | `PpobOrder` | `CheckOperatorUseCase`, `ExecuteTopupUseCase` | `PpobRepository` | `IakClient` |
| Loan | `Loan`, `Installment` | `GenerateScheduleUseCase`, `ApplyPayrollUseCase` | `LoanRepository` | — |
| Reports | (read-only projections) | `GenerateBranchPlUseCase`, `GetDashboardKpisUseCase` | `ReportingRepository` (read-only) | `ExcelExportClient` |

---

## Testing Strategy per Layer

| Layer | Test Type | Tool |
|---|---|---|
| Domain | Unit tests (pure, no mocks needed) | Vitest/Jest |
| Application | Unit tests with mocked repository ports | Vitest/Jest + in-memory fakes |
| Data Access | Integration tests against real test DB | Vitest + Testcontainers/Prisma test DB |
| External Integrations | Contract tests against sandbox (IAK sandbox env) | Vitest + recorded fixtures |
| Presentation | E2E tests | Playwright |
| **Characterization Parity** | Cross-cutting — same scenarios as `characterization-tests.md`, run against application layer | Vitest, asserting on repository mutation calls |

---

## Anti-Patterns to Avoid (Explicitly Forbidden)

| Anti-pattern | Why forbidden | Legacy analog to NOT repeat |
|---|---|---|
| Business logic inside Server Action | Untestable, unreusable, breaks layering | Legacy has all logic in Controllers |
| Direct Prisma call in `page.tsx` | Bypasses domain rules & validation | — |
| Repository returning raw DB rows to application layer | Leaks persistence details upward | — |
| `credit-limit-calculator.service.ts` importing Prisma | Violates domain purity | — |
| Cache-rebuild pattern (`DELETE + re-INSERT`) carried forward | Legacy anti-pattern (`record_customer_payment`) — replace with computed aggregation or event-sourced ledger | `custom_helper.record_customer_payment()` |
| String-concatenated SQL anywhere | Legacy SQL injection bugs — Prisma/parameterized queries only | `Login_model`, `Pos_ppob` |
