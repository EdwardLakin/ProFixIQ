# Phase 5 Summary — Booking Transaction Safety

## What was fixed
- Replaced the portal request start route’s race-prone check-then-insert flow with a single RPC-backed atomic create path that creates work order + booking in one transaction.
- Added idempotency propagation from the portal “when” UI (`idempotencyKey`) through `/api/portal/request/start` into `work_orders.source_row_id` as `portal_start:<customer_id>:<key>`.
- Added replay handling so duplicate/retry submissions return the existing `workOrderId` + `bookingId` instead of creating duplicates.
- Hardened portal submit flow ownership checks (`booking.customer_id`), and added replay-safe short-circuit when the request was already submitted/finalized.
- Hardened generic portal booking create helper to map DB overlap violations to a stable 409 overlap response.

## Canonical integrity protections now enforced
- constraints
  - `bookings_work_order_id_unique` (one linked booking per work order).
  - `work_orders_portal_start_source_row_id_unique` for `portal_start:%` idempotency keys.
  - `bookings_no_active_overlap` exclusion constraint for active booking statuses (`pending`,`confirmed`).
- idempotency keys
  - Client-generated `idempotencyKey` on portal start, persisted via `work_orders.source_row_id`.
  - Replay path returns prior IDs instead of creating additional records.
- transactional helpers / RPCs
  - `public.portal_request_start_atomic(...)` now performs the work order + booking create sequence in one DB transaction boundary.
- route truth path
  - `/api/portal/request/start` now calls `portal_request_start_atomic` as the authoritative create path.

## Files changed
- app/api/portal/request/start/route.ts
- app/api/portal/request/submit/route.ts
- app/portal/request/when/page.tsx
- features/portal/server/createPortalBooking.ts
- db/sql/2026-04-20_phase5_portal_booking_transaction_safety.sql
- phase5-summary.md

## Migrations added
- `db/sql/2026-04-20_phase5_portal_booking_transaction_safety.sql`
  - Adds booking/work-order invariants and portal start atomic RPC.
- manual SQL apply required
  - This migration was generated only; it has not been applied automatically.
- regenerate Supabase types after apply
  - After applying SQL manually, regenerate Supabase types so typed RPC/function signatures are current.

## Behavior changes
- Portal request start now deduplicates replayed submissions with the same idempotency key and returns existing IDs.
- Concurrent overlapping active bookings are now blocked at DB level (409 semantics in app paths).
- Portal submit now rejects cross-customer booking linkage attempts and safely returns success for already-submitted finalized requests.

## Risks resolved
- Race-prone booking creation path (`app/api/portal/request/start/route.ts`)
  - Resolved: moved to atomic RPC + DB exclusion + idempotency uniqueness.
- Directly related booking/request/work-order check-then-insert duplicate/partial-write risk
  - Resolved for portal start authority path and replay semantics.
  - Mitigated for portal booking helper overlap handling and portal submit replay/ownership checks.

## Remaining related risks not fixed in this phase
- Existing historical data that already violates the new overlap constraint must be cleaned before migration apply if constraint creation fails.
- Parts request creation in submit flow remains best-effort/non-transactional with downstream RPC call, but booking/work-order linkage and replay safety were addressed in this phase.

## Validation run
- `npx tsc --noEmit`
  - pass
- `npm run lint`
  - fails with pre-existing repo-wide lint errors outside this phase’s touched scope.

## Notes for next phase
- Run a repo-wide cleanup and launch-readiness sweep focused on pre-existing lint violations, and consider extending submit-path idempotency to downstream parts-request generation metadata for fully replay-stable post-submit side effects.
