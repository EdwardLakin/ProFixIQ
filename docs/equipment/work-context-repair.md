# Equipment work context repair

Classification: compatible integration, plus the explicitly requested Equipment
navigation changes. Based on lockdown merge `2a050fd647db38f80b29e6a22145463aca22d182`.

## Root causes and repair

Equipment's queue and recent-work projection read the nullable
`work_orders.customer_name` snapshot without resolving `customer_id`. Missing
snapshots now use the canonical customer display helper on the work order's
customer, scoped to the authenticated shop. Existing snapshots are preserved;
the asset's current owner is never substituted for a historical work customer.
Lookup failures are surfaced rather than displayed as missing customers.

The picker, directory and asset action previously handed off to Shop creation.
They now open `/equipment/work-orders/create/[assetId]`. The server validates
creator role, entitlement, Equipment profile and canonical creation eligibility,
then supplies the current customer/asset to the shared creation component.
URL parameters cannot replace that server-resolved handoff. Per-asset route
storage separates drafts; Shop's global scan drafts are neither hydrated nor
written. Saved drafts must still pass canonical resumability checks and match
the Equipment shop/customer/asset. Cancel returns to Work, Back to the asset,
and choosing another asset returns to the picker.

After successful canonical creation, Equipment opens
`/equipment/work-orders/[id]`. This adapter checks the existing reader role,
entitlement, authorized workspace snapshot, shop and Equipment membership before
composing the existing workspace engine and its required tabs provider. Its job
selection stays on the Equipment URL; its Back button returns to Equipment Work.
Estimates, quote review, parts, inspections and paid-work read-only handling keep
their canonical destinations.

## Approval boundary

Creation's previous final `router.push(.../approve)` is navigation, not an
approval mutation. The customer approval page separately calls the canonical
approval webhook only after an explicit approval action. The Equipment adapter
keeps an explicit Customer approval link and all existing approval states,
pricing checks, signature handling and execution authorization. It does not
approve, skip an approval check, change status or introduce a second workflow.
The standard Shop create path still lands on `/work-orders/[id]/approve`.

## Existing surfaces changed

- `loadEquipmentWorkQueueProjection` and `loadEquipmentWorkOrders`: scoped
  missing-name resolution; queue work-order links use the Equipment adapter.
- Equipment asset page, directory and picker: navigation destinations only;
  existing handoff eligibility remains authoritative.
- `CreateWorkOrderPage` / `ShopCreateWorkOrderPage`: optional Equipment context;
  existing callers retain their defaults and canonical mutation engine.
- `PreviousDeferredWorkPanel`: optional explicit vehicle identity for Equipment;
  existing caller lookup precedence remains unchanged.
- `WorkOrderIdClient`: opt-in Equipment navigation for job selection and Back;
  existing callers, authorization and execution behavior remain unchanged.
- Two existing Equipment tests update only the explicitly changed destination
  expectations. New mounted-form, read-model and route tests cover the repair.
- Vitest adds the existing application `app` and `@work-orders` aliases so tests
  can mount the real creation component, rather than inspect its source text.

No tables, migrations, policies, grants, roles, API/RPC contracts, pricing,
billing, checkout configuration, product keys or Coming soon state change.
Rollback is reverting this UI/read-model PR; no database rollback is required.

## Validation boundaries

All new test data is local and mocked. No live demo records are written. Tests
exercise missing/snapshot/foreign customers, search, entitlement/role denial,
server-derived asset/customer context, repeat visits, cancel/back, asset switching,
forged query context, stale foreign drafts and both post-create destinations.
Deployment, live records and physical device rendering are not verified by these
tests. Local builds use CI placeholder credentials only.
