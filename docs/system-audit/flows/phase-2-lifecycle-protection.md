# Phase 2 — Financial Lifecycle Protection Flow

```mermaid
flowchart TD
  A[Operational work-order mutation] --> B{Non-draft invoice version exists?}
  B -- No --> C[Allow normal mutation]
  B -- Yes --> D{Open audited correction session?}
  D -- No --> E[Reject with WORK_ORDER_FINANCIALLY_LOCKED]
  D -- Yes --> F[Allow scoped correction]
  F --> G[Close correction session]
  G --> H[Database lock restored]

  I[Finalize invoice version] --> J[Allow canonical transition to invoiced]
  K[Payment/refund rollup] --> L[Allow invoice/payment balance fields only]
```

## Boundary

The protection is enforced by PostgreSQL triggers, not by UI-only checks. This keeps direct Supabase writes, API routes, service-role clients, background jobs, and RPCs under the same policy.

## Audited exception

Owner, admin, or manager users may open one correction session per work order with:

- Stable operation key
- Required reason
- Explicit scope
- Actor identity
- Open and close timestamps
- Financial outbox events

The immutable invoice version is never edited by the correction session.
