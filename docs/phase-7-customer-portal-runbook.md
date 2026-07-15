# Phase 7 — Customer Portal Lifecycle

## Purpose

Phase 7 makes portal identity, bookings, request lines, and customer approval decisions deterministic, shop-scoped, and retry-safe.

## Migration order

Run these files in order:

1. `supabase/migrations/20260715080000_phase7_atomic_portal_invite_acceptance.sql`
2. `supabase/migrations/20260715080100_phase7_atomic_portal_booking_lifecycle.sql`
3. `supabase/migrations/20260715080200_phase7_atomic_portal_request_lines.sql`
4. `supabase/migrations/20260715080300_phase7_atomic_portal_line_decisions.sql`
5. `supabase/migrations/20260715080400_phase7_customer_portal_postcheck.sql`

The final migration must print:

```text
Phase 7 customer portal lifecycle postcheck passed.
```

## Controlled validation

1. Generate a portal invite for an existing customer.
2. Open the magic link and confirm only the invited customer row is linked.
3. Retry the same callback and confirm the same portal actor is returned.
4. Create a customer booking and confirm the customer-shop link and booking commit together.
5. Retry the booking with the same operation key and confirm no duplicate.
6. Attempt an overlapping booking and confirm rejection.
7. Reschedule through the staff route and confirm overlap and notice rules are reapplied.
8. Cancel a future unlinked booking and confirm the row remains with cancellation metadata.
9. Attempt to cancel a completed, past, or work-order-linked booking and confirm rejection.
10. Start a portal service request with a customer-owned vehicle and stable key.
11. Retry the request and confirm the same work order/booking pair is returned.
12. Add custom, menu, and inspection lines and confirm retries do not duplicate them.
13. Approve a portal line and confirm it becomes `awaiting`/`authorized`, not `in_progress`.
14. Confirm cross-customer and cross-shop IDs are rejected.
15. Confirm finalized work orders reject portal request-line and approval changes.

## Compatibility notes

- Fleet portal pages continue to use their separate fleet capability resolver.
- Existing customer invoice, payment, and receipt surfaces remain owned by Phase 1.
- The legacy portal approval page remains compatible through deterministic server-derived operation keys when it does not send a client key.
- Booking DELETE now records cancellation instead of physically deleting history.
