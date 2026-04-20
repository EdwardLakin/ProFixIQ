# Phase 6 Summary — Canonical Cleanup Sweep

## What was fixed
- Added a canonical feature-level Stripe webhook route module (`features/stripe/api/stripe/webhook/route.ts`) and switched app route handlers to import from it.
- Kept the legacy Stripe feature path as a compatibility shim and marked it explicitly as legacy.
- Cleaned `app/api/portal/request/submit` by removing stale migration-era comments and moving portal intake concern parsing into a dedicated feature helper.
- Added dedicated tests for portal intake concern extraction to keep portal request submit behavior aligned.
- Marked the legacy owner PIN settings endpoint alias as backward-compatible and documented the canonical route.

## Canonical paths confirmed
- auth/access
- owner PIN
- billing
- approvals
- booking integrity

## Files changed
- app/api/portal/request/submit/route.ts
- app/api/settings/update/shop/owner-pin/set/route.ts
- app/api/stripe/checkout/webhook/route.ts
- app/api/stripe/webhook/route.ts
- features/portal/lib/request/portalIntake.ts
- features/stripe/api/stripe/checkout/webhook/route.ts
- features/stripe/api/stripe/webhook/route.ts
- tests/portal-intake.test.ts
- docs/phase-6-canonical-cleanup-summary.md

## Migrations added
- None.
- clearly state: manual SQL apply required (not applicable in this sweep because no migration was added)
- clearly state: regenerate Supabase types after apply (not applicable in this sweep because no migration was added)

## Behavior changes
- Stripe app webhook handlers now resolve through a single canonical feature import path.
- Portal intake concern parsing logic is unchanged functionally, but now sourced from a dedicated helper with test coverage.
- Legacy owner PIN settings alias behavior remains unchanged, but is now explicitly documented as compatibility-only.

## Risks resolved
- Reduced naming drift and confusion from Stripe webhook logic living only under a `checkout/webhook` feature path.
- Removed stale and misleading comments in portal request submit flow that could lead to incorrect maintenance assumptions.
- Reduced risk of regression in portal intake diagnostic auto-line creation with focused tests.

## Remaining known launch risks outside this sweep
- Legacy compatibility routes still exist by design (`/api/stripe/checkout/webhook`, `/api/settings/update/shop/owner-pin/set`) and should be removed only after external callers are confirmed migrated.

## Validation run
- npx tsc --noEmit
- npx vitest run tests/owner-pin-crypto.test.ts tests/portal-intake.test.ts
- npx eslint app/api/portal/request/submit/route.ts app/api/stripe/webhook/route.ts app/api/stripe/checkout/webhook/route.ts app/api/settings/update/shop/owner-pin/set/route.ts features/portal/lib/request/portalIntake.ts features/stripe/api/stripe/webhook/route.ts

## Notes for verification
- Verify Stripe webhook endpoint configuration in Stripe dashboard points to `/api/stripe/webhook`.
- Verify no external clients still require direct dependency on legacy owner PIN settings path before eventual removal.
