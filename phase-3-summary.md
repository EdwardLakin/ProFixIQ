# Phase 3 Summary — Billing Canonicalization

## What was fixed
- Centralized Stripe webhook lifecycle handling into a single shared handler and wired canonical ingestion at `/api/stripe/webhook`.
- Added a backward-compatible alias route at `/api/stripe/checkout/webhook` that delegates to the canonical webhook handler to avoid split processing logic.
- Fixed subscription metadata user key drift by accepting both `supabase_user_id` and legacy `supabaseUserId` when syncing profile/shop subscription state.
- Improved payment webhook idempotency by checking existing `payments.stripe_session_id` before insert and updating existing rows on duplicate deliveries.
- Canonicalized staff payment checkout logic to `/api/stripe/payments/checkout` and converted `/api/payments/checkout` into a compatibility alias to eliminate duplicate business logic.
- Centralized Stripe subscription status parsing/attention-state mapping in a shared helper used by owner settings and AppShell billing indicators.

## Canonical billing paths now enforced
- checkout route
  - Canonical one-time staff checkout: `/api/stripe/payments/checkout`
  - Compatibility alias: `/api/payments/checkout` (delegates to canonical)
- webhook route
  - Canonical Stripe webhook endpoint: `/api/stripe/webhook`
  - Compatibility alias: `/api/stripe/checkout/webhook` (delegates to canonical)
- entitlement/state helpers
  - Shared status parser + billing-attention mapper: `features/stripe/lib/stripe/subscriptionStatus.ts`
- billing UI source of truth
  - Owner settings and app shell now consume canonical `shops.stripe_subscription_status` through shared status helpers (no local duplicated status parsers)

## Files changed
- app/api/payments/checkout/route.ts
- app/api/stripe/webhook/route.ts
- app/api/stripe/checkout/webhook/route.ts
- features/stripe/api/stripe/checkout/webhook/route.ts
- features/stripe/lib/stripe/subscriptionStatus.ts
- features/shared/components/AppShell.tsx
- features/dashboard/app/dashboard/owner/settings/page.tsx

## Migrations added
- None.
- Existing tables/columns were sufficient for this phase; idempotency improvements were implemented in handler logic.

## Behavior changes
- Duplicate webhook logic is removed: both webhook URLs now run the same canonical lifecycle sync path.
- Duplicate payment checkout logic is removed: legacy `/api/payments/checkout` now uses canonical `/api/stripe/payments/checkout` behavior.
- Subscription checkout metadata now reliably links users even when legacy/new key naming differs.
- Duplicate Stripe webhook delivery for payment sessions no longer risks duplicate `payments` rows; existing rows are updated safely.
- Billing badges/state parsing in owner/admin surfaces now rely on one shared status parser.

## Risks resolved
- Finding 1 (duplicate checkout implementations): **Resolved** by converging logic to canonical `/api/stripe/payments/checkout` with `/api/payments/checkout` as a thin alias.
- Finding 2 (webhook placement/canonicalization risk): **Resolved** by introducing canonical `/api/stripe/webhook` and delegating legacy `/api/stripe/checkout/webhook` to the same handler.
- Finding 3 (entitlement drift risk): **Partially resolved** in this phase by unifying Stripe status parsing, fixing metadata key drift, and consolidating lifecycle sync path; UI now reads canonical synced shop status consistently.

## Remaining related risks not fixed in this phase
- Legacy feature-path route files like `features/stripe/api/stripe/checkout/link-user/route.ts` still exist and are not part of canonical app-router API surfaces; they should be retired or repointed in a cleanup phase.
- Plan/seat enforcement still depends on existing `shops.plan` and seat-count logic; this phase did not re-author plan-to-entitlement policy derivation.
- Stripe dashboard webhook configuration must be confirmed to point to `/api/stripe/webhook` in each environment.

## Validation run
- `npx tsc --noEmit` → pass
- `npm run lint` → fail (pre-existing repo-wide lint errors outside this phase scope)
- `npx eslint app/api/stripe/webhook/route.ts app/api/stripe/checkout/webhook/route.ts app/api/payments/checkout/route.ts features/stripe/api/stripe/checkout/webhook/route.ts features/stripe/lib/stripe/subscriptionStatus.ts features/shared/components/AppShell.tsx features/dashboard/app/dashboard/owner/settings/page.tsx` → pass

## Notes for next phase
- Next phase should canonicalize approval webhook/workflow handling similarly: establish one canonical approval ingestion route, converge any duplicate sync/update helpers, and ensure actor/shop scoping for all approval-triggered state transitions.
