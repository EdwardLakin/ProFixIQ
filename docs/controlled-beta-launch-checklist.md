# Controlled Beta Launch Checklist

Use this checklist before moving from controlled demo to public beta.

## Security + Build Validation

- [ ] Rotate Supabase service role key before public beta cutover.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npx vitest run tests/plan-normalization-complete-aliases.test.ts`.
- [ ] Run `npx vitest run tests/plan-feature-matrix-compat.test.ts`.
- [ ] Run `npx vitest run tests/stripe-api-version-unification.test.ts`.

## Demo + QA Evidence

- [ ] Run seed demo flow (`seed demo`) in the target environment.
- [ ] Run `qa-demo-seed` and attach the JSON output artifact to launch evidence.
- [ ] Smoke test work orders `1003`, `1004`, `1006`, and `1007`.
- [ ] Smoke test signup, signin, onboarding, checkout success, and checkout cancel flows.

## Claim-Safety + Commercial Gating

- [ ] Verify public copy uses: **"One complete product. No feature tax."**
- [ ] Verify plans are positioned as scaling by shop size/support/usage, not modules.
- [ ] Verify workforce copy states: workforce scheduling, attendance, documents, certifications, and readiness (not a standalone HRIS replacement).
- [ ] Verify payroll copy states: payroll review, export readiness, provider-ready export foundation (not payroll processing).
- [ ] Verify exclusion note is visible: ProFixIQ does not process payroll, file/remit payroll taxes, administer benefits, or provide legal compliance services.
- [ ] Verify **Complete 100** is contact-only and not self-serve checkout.
