# Phase 4 technician labor lifecycle rollout

## Scope

Phase 4 makes technician assignment and job labor transitions transactional while preserving the existing work-order, workforce, payroll, and multi-technician architecture.

## Canonical ownership

- `work_order_line_technicians` is the canonical multi-technician assignment set.
- `work_order_lines.assigned_tech_id` is the synchronized primary-technician mirror.
- `work_order_line_labor_segments` is the canonical actual-job-time ledger.
- `work_order_lines.punched_in_at` and `punched_out_at` are derived mirrors maintained in the same transaction.
- `tech_shifts` is the shop-scoped shift authorization envelope.

## Migration order

Run in this order:

1. `supabase/migrations/20260714050000_phase4_atomic_technician_labor.sql`
2. `supabase/migrations/20260714050100_phase4_coordinated_labor_and_postcheck.sql`

The final migration must print:

```text
Phase 4 technician labor lifecycle postcheck passed.
```

## Validation scenarios

1. Assign the first technician to a line and verify both the relationship row and primary mirror are updated.
2. Add a second technician and verify both assignments remain while the newest assignment becomes the primary mirror.
3. Start a job with a same-shop active shift and verify one open labor segment and matching line mirrors.
4. Retry the start with the same key and verify no duplicate segment is created.
5. Attempt a start with only a different-shop or null-shop open shift and verify it is rejected.
6. Pause for hold and verify the segment close and line `on_hold` state commit together.
7. Release hold to `awaiting` and verify no labor segment is created.
8. Resume and verify a new segment is created.
9. Finish with valid cause, correction, and labor time and verify segment close, line completion, inspection finalization, mirrors, and activity log.
10. Start break/lunch or End Day with active job time and verify all active job segments close through the coordinated RPC.
11. Attempt assignment or labor mutation on a financially locked work order and verify `FINANCIALLY_LOCKED`.

## Rollback behavior

Every RPC runs inside one PostgreSQL transaction. Any validation, constraint, segment, mirror, line, inspection, assignment, or audit failure rolls back all writes made by that operation.

## No new environment variables

Phase 4 uses the existing Supabase authentication and service-role configuration.
