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
