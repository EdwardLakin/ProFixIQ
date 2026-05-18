# Property Operations Schema Plan (Future)

This note is a planning artifact only. No migrations are executed by this change.

## Goals

Support a future property vertical while preserving existing shop/fleet behavior and tenant isolation.

## Likely Future Additions

- `operations_vertical` or `source_vertical` on `work_orders`
- `source_request_type` / `source_request_id` on `work_orders`
- `property_profiles` or `property_portfolios`
- `property_units`
- `property_assets`
- `property_members`
- `property_maintenance_requests`
- `property_inspections`
- vendor assignment relationships
- approval thresholds/rules for property organizations

## Notes

- Keep additions additive and backfill-safe.
- Preserve `shop_id`/tenant boundary semantics as the schema evolves.
- Apply all SQL manually in Supabase SQL Editor during future implementation phases.

## Step 6: Manual property operations SQL draft

Step 6 adds a review-only Supabase SQL draft at `supabase/manual/property-operations-step-6.sql`. The draft is not applied by this branch and no runtime code is wired to it.

### Proposed maintenance-only schema

The draft proposes additive property maintenance tables for:

- `property_portfolios` to group properties under a `shop_id` tenant boundary.
- `property_properties` for buildings, properties, or sites.
- `property_units` for units or areas within a property.
- `property_assets` for maintainable physical assets attached to a property or unit.
- `property_members` for future property-branch access scoping.
- `property_maintenance_requests` for tenant, staff, or manager maintenance issues, with an optional future `work_order_id` link.
- `property_inspections` for property, unit, move-in, move-out, and preventive inspection records.
- `property_vendors` and `property_vendor_assignments` for maintenance vendor coordination.
- `property_approval_thresholds` for future owner/manager approval threshold rules.

### RLS and tenant isolation assumptions

- Every proposed table is scoped by `shop_id`.
- RLS is enabled on every proposed table.
- Internal staff policies are scoped through `profiles.id = auth.uid()` and `profiles.shop_id`.
- Property member read policies are intentionally scoped to explicit portfolio, property, or unit memberships.
- Tenant requesters can only draft maintenance requests inside their membership scope.
- Vendor RLS remains a TODO because a safe user-to-vendor link is not represented yet.

### Explicit exclusions

This step does not introduce rent collection, accounting, lease management, tenant screening, owner statements, API wiring, route changes, existing fleet/shop RLS changes, or work-order conversion changes.

### Future optional work-order context

The SQL file includes a clearly commented optional `work_orders` source-context section for a later phase. It should not be applied automatically with the maintenance schema until the conversion flow is intentionally designed.
