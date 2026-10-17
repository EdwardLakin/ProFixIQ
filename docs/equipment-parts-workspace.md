# Equipment Parts requests

Compatible integration at `/equipment/parts`, owned by `agent/equipment-parts-workspace`.
Base: `2fa9ba9a7fe8152fef70c71c9e2ebacaaeef4356`.

The page replaces the planned entry with an Equipment-scoped request queue,
canonical stage labels, quantity summaries, search, stage filtering, refresh and
25-request pages. Canonical queue reads traverse all read pages; Equipment
identity and tenant filtering occur before counts and presentation pagination.

Authentication, demo expiry and Equipment entitlement precede business reads.
The navigation gate stays unchanged. The canonical Parts queue permits only
owner, admin, manager and parts roles. Lead hands and foremen see an access
explanation, no queue or financial data and no action controls. Broadening their
queue access would require a separate contract decision; this PR does not do so.

Parts and work-order reads use the authenticated session. Equipment profiles are
server-only, so their identity projection uses the existing admin client after
all page gates, restricted to the authenticated shop and candidate vehicle IDs.
Requests must relate through `part_requests.work_order_id` to same-shop
`work_orders.vehicle_id` and same-shop `equipment_asset_profiles.vehicle_id`.
Unlinked, internal/menu-only and ordinary-vehicle requests are excluded. Raw
financial fields are used only by canonical server-side stage derivation and
are never serialized to the Equipment client.

The native action is the existing `PickOrderTaskModal`, with unchanged live
stock reads, quantity calculation, allocation/cancel commands, idempotency and
error handling. It is offered only for the canonical order/receive stage; the
commands reauthorize and enforce approval. Closing or changing the modal
refreshes the Equipment queue. It operates on approved requests for the chosen
Equipment work order, which can include multiple request cards.

## Scope limits

Quoting, attaching inventory, ordering shortages, receiving and handoff continue
through existing request detail, inventory and purchase-order surfaces. Links
are explicit: those shared surfaces cover the whole shop, not just Equipment.
The full `PartsRequestWorkbench` is not mounted with partially wired callbacks:
several of its interactive controls are unconditional and optional callbacks can
silently do nothing. The self-contained canonical pick modal safely composes the
supported native action without copying the detail page's command orchestration.
No claim is made that all purchasing/inventory workflows are native.

This is a snapshot refreshed by the user or action completion, not a new realtime
subscription. Existing queue ordering and stages are retained. No schema, RPC,
API, role, RLS, grants, trigger, Finish, dispatch, subscription or billing changes.

## Existing surfaces changed

- Equipment Parts page: replaces placeholder presentation; preserves navigation
  access, adds the stricter canonical queue gate and entitlement check.
- Equipment shell registry: Parts changes from planned to live, without changing
  role visibility or destination.
- Shell tests: only the explicitly replaced Parts placeholder expectations
  change; new page/access/loader/command tests cover the replacement.

All canonical loaders, components, routes and commands remain unchanged.
Rollback: revert this application-only PR. No migration or manual production
operation. Validation uses local fixtures and placeholder build credentials;
real-device and production behavior remain unverified.
