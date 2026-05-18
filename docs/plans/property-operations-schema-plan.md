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
