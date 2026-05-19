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
- Policy creation is idempotent for manual re-runs by dropping each named policy before recreating it, because PostgreSQL does not support `CREATE POLICY IF NOT EXISTS`.
- Internal staff policies are scoped through `profiles.id = auth.uid()` and `profiles.shop_id`.
- Property member read policies are intentionally scoped to explicit portfolio, property, or unit memberships.
- The current draft avoids recursive `property_members` policies. There is no existing reusable property-membership helper-function pattern in the repo, so richer future member/role write policies should introduce a reviewed helper rather than nesting broader `property_members` lookups inside that table's own RLS.
- Tenant requesters can only draft maintenance requests inside their membership scope.
- Vendor RLS remains deferred because a safe user-to-vendor link is not represented yet; the draft does not infer vendor access from contact fields or the `vendor` member role.

### Step 6 production-safety hardening

- Tenant-consistency validation triggers prevent child rows from mismatching `shop_id` or parent scope across portfolios, properties, units, assets, maintenance requests, inspections, vendor assignments, and approval thresholds.
- `property_vendor_assignments` requires at least one parent link through `request_id` or `work_order_id`.
- Conservative `NOT VALID` check constraints define expected values for `property_members.role`, `property_maintenance_requests.severity`, and `property_maintenance_requests.status`; these remain safe for production-like data because existing rows can be audited and validated separately.
- Optional work-order links are checked for matching `work_orders.shop_id` where present, but the draft still does not add or wire runtime work-order conversion behavior.

### Explicit exclusions

This step does not introduce rent collection, accounting, lease management, tenant screening, owner statements, API wiring, route changes, existing fleet/shop RLS changes, or work-order conversion changes.

### Future optional work-order context

The SQL file includes a clearly commented optional `work_orders` source-context section for a later phase. It should not be applied automatically with the maintenance schema until the conversion flow is intentionally designed.

## Step 18A: Manual property request timeline SQL draft

Step 18A adds a review-only SQL draft at `supabase/manual/property-request-timeline-step-18a.sql` for future property request timeline support. This draft is documentation-only and is not applied by this branch.

### Proposed timeline schema additions

- `property_request_events` (append-only timeline/event stream)
  - supports system/internal/vendor/tenant actor typing
  - supports event typing for comments, status changes, links, and system entries
  - supports visibility levels for internal-only vs tenant/shared surfaces
- `property_request_read_receipts` (request-level and event-level read tracking)
  - supports optional `event_id` for per-event receipts
  - includes partial unique indexes to avoid duplicate receipt rows
- `property_request_attachments` (metadata placeholders only)
  - stores attachment metadata references for future media/file uploads
  - does not create or configure Supabase Storage buckets

### Data safety and tenant consistency

- Adds validation triggers/functions to enforce `shop_id` consistency across requests, events, receipts, and attachments.
- Enforces that `event_id` references (when present) match the same `request_id` + `shop_id`.
- Keeps schema additive and scoped to property maintenance request records.

### RLS scope in this draft

- Enables RLS on all three new tables.
- Adds conservative internal staff CRUD policies scoped to `profiles.shop_id`.
- Adds property-member select scope for tenant-visible/all-parties request events.
- Adds tenant-requester insert scope for `tenant_visible` `comment` events only.
- Adds self-insert read-receipt policy (`reader_profile_id = auth.uid()`).
- Defers vendor-specific RLS until explicit vendor-user linkage exists.

### Explicit exclusions for Step 18A

- No runtime wiring or app behavior changes.
- No migration execution or schema application in this branch.
- No tenant portal auth implementation.
- No vendor auth implementation.
- No real image/video/document upload implementation.
