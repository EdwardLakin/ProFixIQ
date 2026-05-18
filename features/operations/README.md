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
