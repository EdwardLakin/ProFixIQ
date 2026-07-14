# Invoice finalization, resend, and reversal flow

## Current traced flow

```mermaid
flowchart LR
    A[Invoice preview] --> B[POST /api/invoices/send]
    B --> C[Review work order]
    C --> D[Build canonical snapshot]
    D --> E{Client invoiceTotal present?}
    E -->|Yes| F[Client amount takes precedence]
    E -->|No| G[Use snapshot or work-order total]
    F --> H[Insert or update latest invoice]
    G --> H
    H --> I[status issued_pending_send]
    I --> J[Send invoice email]
    J --> K[Best-effort post-send persistence]
    K --> L[Invoice status issued]
    K --> M[Work order status invoiced]

    N[Stripe checkout completed] --> O[Upsert payment succeeded]
    O --> P[No invoice/work-order rollup]
    Q[Refund / dispute / failure] --> R[No webhook handling]
```

## Confirmed defects

- #1013 Client-provided invoice total can override the canonical server snapshot.
- #1014 Resending updates the latest invoice row in place rather than preserving an immutable issued version.
- #1015 Refunds, failures, and disputes are not reconciled after a payment is marked succeeded.
- #1010 Successful Stripe payments are not rolled into invoice balance or work-order closure.
- #1011 Portal checkout uses original invoice total instead of outstanding balance.
- #1012 Staff checkout accepts client-provided amount and work-order linkage.

## Target invariant

One immutable invoice version must define the collectible amount. Every payment event must post to an append-only ledger and atomically recalculate net paid amount, remaining balance, invoice state, and work-order state. Delivery events must not rewrite financial history.
