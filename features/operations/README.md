# Operations Foundation (Step 1)

This folder introduces a shared, branch-aware maintenance operations foundation for ProFixIQ.

## Purpose

- Establish reusable vertical-level terminology and route configuration.
- Keep fleet as the first live vertical with no behavioral changes.
- Define property terminology/routes for future use only.

## Current State

- **Fleet** is the only actively integrated vertical in this step.
- **Property** is represented in config only (no live routes/pages wired).
- Existing fleet screens, APIs, auth behavior, and Supabase query behavior are unchanged.

## Planned Extraction Path

Future iterations can incrementally extract shared modules for:

1. Shell/navigation containers
2. Control tower/dashboard widgets
3. Request list/detail surfaces
4. Asset list/detail surfaces
5. Vertical-aware permissions/roles
6. Request-to-work-order conversion adapters

## Database

No database migrations are applied as part of this step.
Any future schema expansion should be documented and applied manually.

## Step 2: OperationsPortalShell

- `FleetShell` now uses a shared `OperationsPortalShell` extracted under `features/operations/components`.
- This provides reusable portal shell structure for operations verticals while preserving existing fleet portal behavior and routes.
- Property operations can later reuse this shell with property terminology/routes.
- This step is UI-structure extraction only: no live property routes/pages and no database changes were introduced.

## Step 3: MaintenanceControlTower

- `FleetControlTower` now uses a shared `MaintenanceControlTower` foundation under `features/operations/components`.
- Fleet remains the only live operations vertical in-app.
- Property can later reuse this layout via property-specific adapters and property data sources.
- This step introduces no schema, migration, or route changes.

## Step 4: OperationsAssetDetailScreen

- `Fleet AssetDetailScreen` now delegates the shared asset detail layout to `OperationsAssetDetailScreen` under `features/operations/components`.
- Fleet remains the only live implementation; the existing fleet asset detail fetch, actions, issue actions, stats, and routes are preserved.
- Property operations can later reuse this foundation for property, unit, appliance, or asset records once those pages are intentionally built.
- This step introduces no schema changes, migrations, route changes, or Supabase RLS changes.

## Step 5: Property placeholder branch

- Property now has static/demo placeholder routes that reuse the shared operations components:
  - `OperationsPortalShell` for the property portal frame.
  - `MaintenanceControlTower` for the property maintenance dashboard.
  - `OperationsAssetDetailScreen` for property asset detail demos.
- The property branch uses property terminology and property route config with demo assets, demo requests, and demo vendor follow-ups only.
- No database migrations, schema changes, Supabase RLS changes, tenant/vendor auth wiring, API calls, request conversion, rent, accounting, or lease features are introduced.
- This step only proves the branch-aware UI architecture before any live property maintenance data model is added.

## Step 6: Property operations SQL draft

- A manual Supabase SQL draft was created for future property maintenance operations at `supabase/manual/property-operations-step-6.sql`.
- The draft has not been applied and no SQL was executed as part of this step.
- No app runtime code, APIs, live routes, existing fleet/shop RLS policies, or work-order conversion flows are wired to the proposed tables yet.

## Step 9: Internal property maintenance request creation

- Internal staff can now create property maintenance requests from `/property/requests/new` using authenticated Supabase RLS-scoped reads/writes.
- Request creation is still internal-only for the property branch: no tenant/vendor auth, no public submission surface, and no vendor portal behavior were added.
- Request-to-work-order conversion is still not implemented.

## Step 10: Internal property maintenance request detail + status management

- Added internal request detail at `/property/requests/[id]` with RLS-backed request visibility and linked property/unit/asset/vendor context.
- Internal staff can update request status with constrained server-side validation to approved states only.
- This remains internal-only property maintenance scope: no tenant/vendor auth, no vendor portal behavior, and no public request submission were added.
- Request-to-work-order conversion is still not implemented.
