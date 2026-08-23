# Phase 14 authorization and plan-gate validation

Validated 2026-08-23 against the Phase 14 branch and the authenticated production Fleet fixture.

## Repaired boundaries

- Added server route guards to Owner Brand Studio, Customer Import, and Payments. These pages no longer render their client surface for manager, advisor, technician, parts, Fleet, driver, customer, unknown, or signed-out actors.
- Moved Stripe Connect onboarding onto the canonical shop-scoped API guard. Account creation now requires owner/admin role, `canManageBilling`, and a current billing or privileged owner-PIN proof before Stripe or the service-role client is called.
- Preserved the owner-PIN continuation in the Payments UI for both settings saves and Stripe onboarding.
- Locked role-change behavior with request-by-request canonical-profile tests. An owner changed to manager is denied on the next page or API request without needing to sign out.

## Automated evidence

- The Phase 14 matrix covers owner, admin, manager, advisor, technician, lead tech, parts, fleet manager, dispatcher, driver, and customer capability boundaries.
- Direct owner page tests assert server guards and explicit billing/branding capabilities.
- The denied Stripe onboarding test proves no Stripe client or service-role client is created before authorization succeeds.
- Existing product-boundary, Field authorization, plan compatibility, role-gating, Stripe, and workspace authorization suites remain green.
- Focused result: 56 passing tests across the Phase 14 matrix and governance-boundary suite; 45 passing tests across the wider focused authorization/plan regression set before the matrix expansion.
- Repository result: 2,894 passing, 47 failing, 2 skipped. All 47 failures reproduce the existing Windows CRLF-sensitive source/SQL assertion baseline; no Phase 14 test failed.
- TypeScript passes. ESLint reports zero errors and 233 pre-existing warnings.

## Live evidence

Authenticated actor label: `Internal Fleet Operations`.

- Full Fleet manager surface loaded with four active units and no console warnings/errors.
- Direct-open of the driver-only `/updates` route redirected to Fleet Control and exposed no driver dashboard.
- A stale unit URL using a valid-shaped nonexistent UUID showed only `Unit not found in your fleet`.
- The stale URL stayed non-disclosing after refresh, back, and forward navigation.
- Direct API-document navigation is blocked by the in-app Browser client, so HTTP status/payload assertions come from route tests rather than the live tab.

## Remaining live coverage gate

Dedicated owner, admin, manager, advisor, technician, lead-tech, parts, fleet-manager, dispatcher, driver, customer, and Field-operator sessions were not all handed off in the current Browser session. The automated matrix and server tests cover their contracts, but sequential production identity checks, cross-tenant object replay, live role revocation from a second admin session, and Starter-versus-Pro identity passes remain required before final release readiness can be declared.
