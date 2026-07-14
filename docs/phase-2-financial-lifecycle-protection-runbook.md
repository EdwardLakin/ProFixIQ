# Phase 2 — Financial Lifecycle Protection

## Purpose

Phase 2 prevents ordinary work-order source records from changing after an invoice version has been finalized. The database is the enforcement boundary, so direct browser writes, API routes, service-role code, background jobs, and RPCs all receive the same protection.

## Protected state

A work order is financially locked when it has at least one non-draft `invoice_versions` record and no open `work_order_correction_sessions` record.

This includes invoice histories whose latest version is:

- `issued`
- `partially_paid`
- `paid`
- `voided`
- `superseded`
- `credited`

The immutable invoice version remains unchanged even while an operational correction session is open.

## Protected records

The migration installs guards on existing anchored tables, including:

- `work_orders`
- `work_order_lines`
- `work_order_quote_lines`
- `work_order_parts`
- `work_order_part_allocations`
- `part_requests`
- `part_request_items`
- `work_order_line_technicians`
- labor and technician punch tables when they exist and expose a work-order anchor

Canonical invoice/payment rollup fields remain writable. The initial transition into `work_orders.status = invoiced` remains valid. Later operational/status changes require a correction session.

## Correction lifecycle

Only owner, admin, or manager roles with work-order management capability can open or close a correction session through the API.

Open:

```text
POST /api/work-orders/:id/corrections/open
```

Required body:

```json
{
  "reason": "Correct part quantity entered before invoicing",
  "scope": "operational_correction",
  "idempotencyKey": "stable-client-operation-id"
}
```

Close:

```text
POST /api/work-orders/:id/corrections/:sessionId/close
```

Once closed, the work order is immediately locked again.

Available scopes:

- `operational_correction`
- `invoice_adjustment`
- `void_and_reissue`
- `data_repair`

## Lock status

```text
GET /api/work-orders/:id/financial-lock
```

The response includes the latest invoice version, lifecycle status, correction session, and whether the work order is currently locked.

## Migration order

Run:

```text
supabase/migrations/20260714030000_phase2_financial_lifecycle_protection.sql
supabase/migrations/20260714030100_phase2_correction_close_and_postcheck.sql
```

A successful second migration prints:

```text
Phase 2 lifecycle protection postcheck passed.
```

## Validation

1. Create an active draft work order and confirm line/parts edits still work.
2. Finalize a new invoice and confirm the work order transitions to `invoiced`.
3. Attempt a direct update to a protected line and confirm `WORK_ORDER_FINANCIALLY_LOCKED` is returned.
4. Open a correction session with a reason and stable idempotency key.
5. Confirm the intended edit succeeds while the session is open.
6. Close the correction session.
7. Confirm ordinary edits are blocked again.
8. Confirm the original immutable invoice version snapshot and totals have not changed.

## Operational warning

Do not leave correction sessions open after the intended repair. An open session deliberately permits operational edits to a financially finalized work order. Closing the session restores the database lock.
