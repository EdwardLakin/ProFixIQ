# Phase 5 Quote and Inspection Lifecycle Runbook

## Migration order

1. `supabase/migrations/20260715060000_phase5_atomic_quote_decisions.sql`
2. `supabase/migrations/20260715060100_phase5_atomic_inspection_quote_import.sql`
3. `supabase/migrations/20260715060200_phase5_quote_lifecycle_postcheck.sql`

Deploy the application changes only after all three migrations succeed.

The final migration must print:

```text
Phase 5 quote and inspection lifecycle postcheck passed.
```

## Required foundation

- Phase 2 financial lifecycle protection is applied.
- Phase 3 canonical parts lifecycle is applied.
- Phase 4 technician labor lifecycle is applied.
- Inspection work-order anchor columns exist.
- Quote-to-parts linkage columns exist.

## Validation checklist

1. Send a quote containing at least two customer-visible quote lines.
2. Approve one selected line and decline the remaining sent lines.
3. Confirm the approved repair is created with `status = awaiting` and `approval_state = approved`.
4. Confirm no active labor segment or active punch timestamp is created by customer approval.
5. Confirm the remaining sent quote lines are declined in the same response.
6. Confirm linked parts requests and items point to the materialized repair line.
7. Retry with the same operation key and confirm no duplicate repair line is created.
8. Confirm an invoiced work order rejects the decision with `FINANCIALLY_LOCKED`.
9. Import an inspection anchored to the same work order and confirm quote lines and required parts appear together.
10. Retry the import with the same operation key and confirm the same committed IDs are returned.
11. Confirm imports are rejected for a different work order, an unanchored inspection, or a conflicting vehicle ID.
12. Confirm OK and N/A observations do not enter Quote Review from keyword matching.
13. Confirm completed billable work plus an info line can pass readiness.
14. Confirm an info-only work order fails with `no_billable_lines`.

## Application fallback

The migrations are additive. A previous application build can be redeployed while the new functions and operation records remain in place. Operation records should be retained because they provide retry safety and audit history.
