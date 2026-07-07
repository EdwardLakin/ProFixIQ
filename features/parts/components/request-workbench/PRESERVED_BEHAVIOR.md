# Parts Request Workbench V2 preserved behavior checklist

V2 must preserve or delegate to existing behavior before replacing the current page.

- Request loading by UUID or custom ID.
- Request and item status display through existing status-display helpers.
- Quote-origin / pre-approval handling.
- work_order_line_id fallback handling.
- PO create/reuse behavior.
- Existing ReceiveDrawer behavior.
- receive_part_request_item RPC behavior.
- upsert_part_allocation_from_request_item RPC behavior.
- Quote line status sync.
- Quote-only save guardrails.
- Status sync between part_request_items and part_requests.
- Menu item upsert / materialization behavior.
- parts:received event refresh behavior.
- parts-request:submitted event behavior.
- Deterministic stock suggestions.
- Deterministic supplier suggestions.
- Description conflict warnings.

## Current wiring status

- V2 is only rendered when `NEXT_PUBLIC_PARTS_REQUEST_WORKBENCH_V2=true`.
- Default production behavior remains the existing page.
- V2 Save delegates to existing item edit persistence.
- V2 Receive delegates to existing ReceiveDrawer handoff.
- V2 Order delegates to existing create/reuse PO flow.
- V2 Add to Stock delegates to existing inventory create/attach flow.
