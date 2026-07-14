# Phase 3 canonical parts transaction contract

Parent audit: #992

## Non-negotiable rules

1. Existing canonical parts RPCs remain the lifecycle source of truth.
2. Every retryable operation requires a stable shop-prefixed operation key.
3. One RPC owns all writes for an operation; failures roll back every related row.
4. Quantity-changing commands lock their request, request item, work-order part, allocation, PO line, and work-order anchors before recalculating.
5. Phase 2 financial locks apply inside each quantity-changing RPC.
6. Manufacturer, supplier, vendor, part number, SKU, cost, and sell-price snapshots remain distinct.
7. Invoice quantity is always `quantity_consumed - quantity_returned`.

## Canonical quantity meanings

| Quantity | Meaning |
|---|---|
| requested | Customer/repair requirement |
| assigned | Quantity assigned to a supplier or purchasing workflow |
| ordered | Quantity committed on purchase-order lines |
| received | Physical quantity received into stock |
| allocated | On-hand quantity reserved to a work-order part |
| consumed | Gross quantity issued to the repair |
| returned | Gross issued quantity returned to stock |
| net issued | `consumed - returned` |
| cancelled | Requested quantity explicitly cancelled before use |

Assigned, ordered, and received quantities must never be inferred from one another.

## Line-void disposition contract

A line cannot be voided until every attached part quantity has an explicit disposition.

### Reserved or picked

- `release`: call canonical allocation release for every locked allocation.
- No allocation row may be deleted directly by the route.

### Ordered but not received

- `cancel_open_order`: cancel the unreceived PO-line remainder through the canonical PO cancellation command.
- `retain_open_order`: reject line void because the order remains operationally attached.

### Received but not issued

- `return_to_inventory`: retain physical stock and cancel only the work-order demand.
- `return_to_vendor`: requires a canonical vendor-return command and stock movement.
- `retain_for_other_work`: release allocation and cancel the work-order demand.

### Consumed and not returned

- `return_to_stock`: call canonical return for the complete net-issued quantity.
- `keep_consumed`: retain the issue ledger and record an explicit non-billable/internal disposition.
- `scrap`: retain the physical deduction and record a scrap disposition event.

The line is marked void only after every disposition succeeds in the same transaction.

## Implemented command boundaries

- `parts_commit_request_package_atomic`
- `parts_update_attach_allocate_item_atomic`
- `parts_issue_by_line_part_atomic` compatibility bridge into `parts_issue_work_order_part`
- Hardened `parts_create_po_line_for_request`
- Hardened `parts_receive_request_item` / `receive_part_request_item`
- Hardened `parts_issue_work_order_part`
- Hardened `parts_return_to_stock`
- Hardened `parts_replace_request_item`

## Legacy paths

Routes may validate and normalize input, but they must not update lifecycle tables before or after the canonical RPC. Compatibility endpoints must delegate to the same canonical command and require the same operation key.
