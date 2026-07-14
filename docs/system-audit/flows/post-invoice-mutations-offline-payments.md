# Post-invoice mutations and offline payments

Parent audit: #992

## Scope

This trace covers work-order and line mutation after invoice issuance, line void/correction handling, and non-Stripe payment posting.

## Current flow

```text
Work order / line UI
  -> direct Supabase updates for selected fields
  -> route-specific lifecycle guards vary by operation

Delete or void line
  -> authenticate user
  -> load line and work order
  -> block exact invoiced status
  -> optionally apply stock moves allocation-by-allocation
  -> delete allocations
  -> update line void metadata

Payments
  -> Stripe checkout routes
  -> Stripe checkout-completed webhook
  -> payments row
  -> no source-confirmed manual/offline payment command
```

## Confirmed findings

### Post-invoice mutation protection is not centralized

The work-order client directly updates line priority and quote status. Those writes do not pass through the invoice-state check implemented by the delete/void route. Finalized financial state therefore depends on individual callers remembering to add a guard.

Tracked by #1019.

### Line void is a partial-commit sequence

The delete/void route can apply one or more stock moves, delete allocations, and finally update the line. These are separate calls with no shared transaction or stable operation key.

Tracked by #1020.

### Manual/offline payment posting is absent

Stripe checkout and webhook ingestion exist, but no source-confirmed canonical staff command was found for cash, cheque, terminal, EFT, financing, or other offline payment methods.

Tracked by #1021.

## Required target state

```text
Immutable invoice version
  -> database-enforced post-finalization mutation policy
  -> explicit reopen / adjustment / credit / void-reissue commands

Line correction command
  -> idempotent transactional RPC
  -> canonical part return/release
  -> allocation reconciliation
  -> line void state
  -> audit event

Canonical payment posting command
  -> Stripe or staff/manual input
  -> payment event ledger
  -> invoice paid/balance rollup
  -> work-order lifecycle rollup
  -> accounting sync state
```

## Issues

- #1019 Enforce post-invoice mutation locks across all work-order write paths
- #1020 Make line void, stock return, allocation removal, and audit state atomic
- #1021 Add a canonical manual and offline payment posting workflow
