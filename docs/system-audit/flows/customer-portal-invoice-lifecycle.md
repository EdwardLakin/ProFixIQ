# Customer portal invoice lifecycle audit

## Scope

This trace covers customer invoice visibility, invoice-version selection, portal totals, PDF rendering, payment controls, and customer-facing state after invoice issue.

## Current flow

```text
Invoice send
  -> invoices row created or updated
  -> work_orders invoice markers updated
  -> portal notification created
  -> customer opens /portal/invoices
  -> portal selects latest invoice row per work order
  -> detail page reloads live work-order lines and allocations
  -> totals are rebuilt with invoice/work-order/allocation fallbacks
  -> pay button shown whenever shop_id exists
  -> PDF route rebuilds from current work-order snapshot
```

## Confirmed defects

### Portal and PDF are not immutable

The portal and PDF both read current work-order data after issue. Later labor, part, supplies, pricing, or line changes can alter the document the customer sees.

Tracked in #1022.

### Payment control is lifecycle-blind

The portal payment button is rendered without checking paid balance, void/cancel/superseded state, or explicit payability. The server checkout must independently enforce the canonical current balance and payable state.

Tracked in #1023.

### Latest row is not necessarily the customer-visible invoice

The portal selects the newest invoice row without filtering by lifecycle state. Draft, pending-send, failed, voided, or superseded rows can displace the actual issued document.

Tracked in #1024.

## Required canonical model

```text
immutable invoice version
  -> explicit customer-visible lifecycle state
  -> immutable line/customer/vehicle/shop snapshot
  -> portal detail by invoice version ID
  -> PDF by invoice version ID
  -> payment against positive outstanding balance
  -> receipt/refund/void state from canonical payment rollup
```

## Required controls

- Portal history lists invoice versions, not one mutable work-order invoice.
- Draft and failed-send versions remain internal.
- Issued and paid versions are immutable.
- Voids, credits, and replacements retain visible linkage.
- Payment buttons appear only for payable versions with a positive balance.
- Portal, PDF, email, payment, and accounting use the same invoice version identity.
