# ProFixIQ confirmed system audit issues

Parent tracker: #992

## Executive summary

The audit confirmed **35 operational defects or missing lifecycle controls** across technician time, quote approval, inspection import, parts, invoicing, payments, accounting export, customer portal rendering, receipts, and notifications.

The dominant systemic problem is not isolated UI bugs. It is that important business transitions are implemented as separate table writes and live recalculations instead of canonical, transactional, versioned domain commands.

### Severity profile

- **27 High**: can corrupt or misstate labor, inventory, invoice, payment, or accounting state; create duplicate financial records; or expose unsafe cross-lifecycle behavior.
- **8 Medium**: cause incorrect workflow state, poor customer visibility, stale notifications, or unsafe operational ambiguity.

## Recommended repair order

### Wave 1 — Financial integrity and immutable invoices

Fix first because these issues affect amounts collected, customer documents, and accounting records.

- #1010 Roll successful Stripe payments into invoice balance and work-order closure
- #1011 Charge outstanding invoice balance instead of original total
- #1012 Derive staff checkout amount and work-order linkage server-side
- #1013 Ignore client-supplied invoice totals when issuing invoices
- #1014 Preserve immutable issued invoice versions
- #1015 Reconcile refunds, failures, and disputes
- #1016 Export immutable invoice data to QuickBooks
- #1017 Prevent duplicate QuickBooks invoices
- #1018 Restrict accounting export to finalized payable states
- #1019 Enforce post-invoice mutation locks
- #1021 Add canonical manual/offline payment posting
- #1022 Render portal/PDF from immutable invoice snapshots
- #1023 Prevent payment of paid/voided/superseded invoices
- #1024 Filter portal history to customer-visible finalized versions
- #1025 Generate verified payment receipts
- #1026 Notify customers and staff for financial lifecycle events

### Wave 2 — Parts and inventory transaction safety

These issues can create stock, allocation, consumption, order, and billing divergence.

- #999 Make inspection-to-quote and parts import atomic
- #1002 Make request-level parts package commit atomic
- #1003 Make request-item edit, allocation, and stock movement atomic
- #1004 Require stable idempotency keys for receiving
- #1005 Remove or route legacy parts consumption through canonical issue RPC
- #1006 Reconcile request-item consumption after returns
- #1007 Prevent replacement from reusing old active snapshots
- #1008 Invoice net issued parts instead of remaining allocations
- #1009 Preserve partial-order state
- #1020 Make line void, stock return, allocation removal, and audit state atomic

### Wave 3 — Labor, assignment, quote, and inspection workflow correctness

- #993 Make technician job punch transitions atomic
- #994 Reject technician shifts from another shop
- #995 Prevent technician assignment drift
- #996 Make customer quote approval atomic
- #997 Create approved repair lines in an awaiting/approved state
- #998 Exclude non-actionable info lines from invoice readiness
- #1000 Do not import OK inspection items solely from keyword matches
- #1001 Validate inspection/work-order/vehicle anchoring

### Wave 4 — Notification usability

- #1027 Persist portal notification read state, realtime refresh, and history

## Complete issue register

| Issue | Severity | Summary |
|---|---|---|
| #993 | High | Technician punch-in/out transitions can partially commit. |
| #994 | High | Job start/resume can use a technician shift belonging to another shop. |
| #995 | Medium | Technician assignment can drift between the line column and assignment table. |
| #996 | High | Customer quote approval spans several non-atomic repair, quote, parts, and rollup writes. |
| #997 | Medium | Customer-approved lines are created directly in progress instead of awaiting execution. |
| #998 | Medium | Informational lines can incorrectly block invoice readiness. |
| #999 | High | Inspection-to-quote and parts import can partially commit. |
| #1000 | Medium | OK inspection items can be imported merely because their titles match diagnosis/maintenance keywords. |
| #1001 | Medium | Imported inspections are not sufficiently anchored to the supplied work order and vehicle. |
| #1002 | High | Request-level parts package creation is non-atomic. |
| #1003 | High | Request-item edits, allocation changes, and stock movement are non-atomic. |
| #1004 | High | Receiving does not require a stable idempotency identity. |
| #1005 | High | Legacy parts consumption bypasses the canonical issue lifecycle. |
| #1006 | Medium | Returning issued parts does not fully reconcile request-item consumption state. |
| #1007 | High | Replacing consumed parts can reuse an obsolete active work-order-part snapshot. |
| #1008 | High | Invoice parts are derived from remaining allocations instead of net issued quantity. |
| #1009 | Medium | Partial purchase-order quantities can be represented as fully ordered. |
| #1010 | High | Successful Stripe payments do not roll into invoice balance or work-order closure. |
| #1011 | High | Checkout charges the original invoice total rather than the outstanding balance. |
| #1012 | High | Staff checkout trusts client amount and optional work-order linkage. |
| #1013 | High | Invoice issuance trusts a client-supplied invoice total. |
| #1014 | High | Resending rewrites the latest issued invoice instead of preserving versions. |
| #1015 | High | Refunds, failures, cancellations, and disputes do not reconcile local financial state. |
| #1016 | High | QuickBooks export rebuilds totals from the live work order instead of the issued invoice. |
| #1017 | High | Retry after external success/local failure can create duplicate QuickBooks invoices. |
| #1018 | Medium | Draft, pending, voided, cancelled, or superseded invoices can be exported to QuickBooks. |
| #1019 | High | Post-invoice mutation locks are not enforced across all write paths. |
| #1020 | High | Line void, stock return, allocation deletion, and audit updates are non-atomic. |
| #1021 | High | No canonical cash, cheque, terminal, EFT, financing, or other offline payment workflow exists. |
| #1022 | High | Portal and PDF invoices regenerate from mutable work-order data. |
| #1023 | High | Portal payment remains available for paid, voided, cancelled, or superseded invoices. |
| #1024 | Medium | Portal invoice history selects the newest row without customer-visible lifecycle filtering. |
| #1025 | High | Checkout success redirect does not produce a verified canonical receipt. |
| #1026 | Medium | Payment, refund, dispute, void, and reissue events do not produce consistent customer/staff notifications. |
| #1027 | Medium | Portal notifications never persist read state and lack realtime refresh/history pagination. |

## Cross-cutting architecture repairs

The 35 issues collapse into six reusable platform repairs:

1. **Canonical transactional commands**
   - Punch job
   - Approve quote
   - Import inspection recommendations
   - Receive/issue/return/replace parts
   - Finalize/void/reissue invoice
   - Post/reverse payment

2. **Stable idempotency keys**
   Every external or retryable write must have a durable operation identity enforced by a unique database constraint.

3. **Immutable financial versions**
   An issued invoice must contain persisted line, part, labor, tax, discount, supplies, customer, vehicle, shop, and total snapshots. Portal, PDF, payment, and QuickBooks must reference that exact version.

4. **Append-only financial event ledger**
   Payment success, failure, refund, dispute, reversal, credit, and void events should be retained rather than overwriting history.

5. **Database-level lifecycle guards**
   Invoiced, paid, closed, voided, or superseded work orders must reject ordinary mutations regardless of whether the caller is a browser client, API route, RPC, service-role task, or background worker.

6. **Domain events and delivery outbox**
   Financial state changes should publish idempotent events. Email, portal notifications, staff alerts, receipts, and accounting synchronization should consume those events through retryable delivery records.

## Suggested implementation sequence

1. Define invoice/payment/parts lifecycle states and transition rules.
2. Add immutable invoice-version and append-only payment-event tables.
3. Add canonical transactional RPCs/services with idempotency constraints.
4. Route existing API and direct-client mutations through those commands.
5. Add post-finalization database guards.
6. Rebuild portal, PDF, Stripe, and QuickBooks around invoice version IDs.
7. Add receipts, notifications, reversal handling, and operational alerts.
8. Backfill and reconcile existing records before enforcing strict constraints.
