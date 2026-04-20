# Phase 2 Summary — Owner PIN Hardening

## What was fixed
- Replaced onboarding plaintext PIN writes with canonical hashed writes to `shops.owner_pin_hash` and explicitly nulled legacy plaintext columns (`owner_pin`, `pin`).
- Added shared server PIN crypto helper (`normalize`, `validate`, `hash`, `verify`) and refactored PIN set + verify APIs to use it.
- Kept owner PIN session behavior canonical by setting the owner PIN verified cookie on successful onboarding owner bootstrap as well as set/verify.
- Added an additive SQL hardening migration to backfill hashes from legacy plaintext columns, clear plaintext values, and enforce non-usage of plaintext owner PIN columns with a validated check constraint.
- Tightened onboarding UI validation to 4–8 numeric digits, matching backend/API contracts.
- Added automated tests for PIN normalization, validation, hashing, and verification helper behavior.

## Canonical PIN model now enforced
- storage field(s)
  - `public.shops.owner_pin_hash` is canonical.
  - `public.shops.owner_pin` and `public.shops.pin` are no longer valid truth sources and are constrained to remain `NULL`.
- verification helper(s)
  - `normalizeOwnerPin`, `isValidOwnerPin`, `hashOwnerPin`, `verifyOwnerPin` in `features/shared/lib/server/owner-pin-crypto.ts`.
- route(s) used
  - `/api/shop/owner-pin/set` for set/update.
  - `/api/shop/owner-pin/verify` for verification.
  - `/api/shop/owner-pin/clear` for clearing verified session cookie.
  - `/api/onboarding/bootstrap-owner` now writes owner PIN in canonical hashed form during shop creation.
- expiry/session behavior
  - Owner PIN verification remains cookie-based via `pfq_owner_pin_shop` with a 30-minute TTL (`OWNER_PIN_TTL_SECONDS = 60 * 30`), unchanged in semantics.

## Files changed
- `app/api/onboarding/bootstrap-owner/route.ts`
- `app/api/shop/owner-pin/set/route.ts`
- `app/api/shop/owner-pin/verify/route.ts`
- `features/auth/app/onboarding/OnboardingPage.tsx`
- `features/shared/lib/server/owner-pin-crypto.ts`
- `db/sql/2026-04-20_phase2_owner_pin_hardening.sql`
- `tests/owner-pin-crypto.test.ts`
- `phase2-owner-pin-hardening-summary.md`

## Migrations added
- `db/sql/2026-04-20_phase2_owner_pin_hardening.sql`
  - Backfills `owner_pin_hash` from legacy plaintext PIN columns when possible.
  - Clears legacy plaintext PIN columns.
  - Adds and validates `shops_owner_pin_plaintext_unused_chk` to prevent future plaintext storage.

## Behavior changes
- Onboarding owner bootstrap now succeeds only with a 4–8 digit PIN and stores only a hash.
- PIN verify checks only `owner_pin_hash` using bcrypt compare via shared helper.
- PIN set/update always writes hash and clears legacy plaintext fields.
- Existing shops with plaintext PINs are migrated to hash (when valid 4–8 numeric PIN present) and plaintext values are removed.
- Future writes attempting to persist plaintext `owner_pin`/`pin` now fail due to DB check constraint.

## Risks resolved
- Plaintext owner PIN writes during onboarding (`app/api/onboarding/bootstrap-owner/route.ts`) → **Resolved**.
- Owner PIN system canonicalization across set/verify flows → **Resolved** (shared crypto helper + single hashed storage source).
- Sensitive settings consistency relying on verified owner PIN pattern → **Resolved for audited routes** (`settings/update`, `settings/hours`, `settings/time-off`, `settings/pricing-valid-days` already use `requireOwnerPin`; this phase preserved and aligned backend PIN truth model those checks depend on).
- Duplicate plaintext columns causing ambiguity (`shops.owner_pin`, `shops.pin`) → **Resolved as active truth sources** (backfilled/cleared + constrained).

## Remaining related risks not fixed in this phase
- The legacy plaintext columns still physically exist in schema for compatibility; they are now constrained to null. Full column removal can be done in a later phase if desired with coordinated type regeneration and rollout.

## Validation run
- `npx tsc --noEmit`
  - pass (exit code 0; npm emitted non-blocking env warning: `Unknown env config "http-proxy"`).
- `pnpm test`
  - pass (`3` test files, `5` tests passed).

## Notes for next phase
- For billing/webhook canonicalization, apply the same pattern used here: establish one canonical source of truth per sensitive state transition, migrate/deprecate legacy write paths, and enforce at DB + route guard layers together.
