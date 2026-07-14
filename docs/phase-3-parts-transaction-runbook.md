# Phase 3 parts transaction rollout

## Migration order

Run only after PR validation is green:

1. `20260714039900_phase3_part_request_statuses.sql`
2. `20260714040000_phase3_parts_atomic_commands.sql`
3. `20260714040100_phase3_parts_quantity_reconciliation.sql`
4. `20260714040200_phase3_atomic_line_void.sql`
5. `20260714040300_phase3_part_identity_snapshots.sql`
6. `20260714040400_phase3_invoice_net_issued_rpc.sql`
7. `20260714040500_phase3_parts_reconciliation_and_postcheck.sql`

Expected final notice:

```text
Phase 3 canonical parts transaction postcheck passed.
```

## Controlled validation

Use a non-invoiced test work order.

1. Add a priced request item to a repair line with an explicit idempotency key.
2. Retry with the same key and confirm no duplicate work-order part/allocation.
3. Partially order the item and confirm requested, ordered, and received quantities remain separate.
4. Partially receive using a stable receipt key; retry and confirm no duplicate receipt.
5. Allocate and partially issue the part.
6. Return part of the issued quantity and confirm both request-item and work-order-part returned quantities reconcile.
7. Confirm invoice preview/issuance includes only net issued quantity.
8. Attempt a quantity change after invoice finalization and confirm `WORK_ORDER_FINANCIALLY_LOCKED`.
9. Void an uninvoiced line and confirm reservations, open-order remainder, received stock, and issued quantity follow the selected dispositions atomically.

## Rollout cautions

- Client callers must now provide stable idempotency keys for package commit, item attach, receiving, issuing, returning, and line void.
- The old timestamp-derived receipt fallback is intentionally removed.
- Replacement with net issued quantity is rejected until issued stock is fully returned.
- Vendor return is not silently simulated; it requires its own canonical vendor-return command.
