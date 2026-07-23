# ProFixIQ completion map — 2026-07-23

## Decision

**Deployment readiness: NO-GO.**

Current `main` is deployable by Vercel and passes TypeScript, but it is not
release-verified:

- `main` at `27bd6efe` has a successful Vercel status.
- TypeScript completed successfully with `tsc --noEmit`.
- The API route inventory completed successfully and now covers 372 routes.
- The complete Vitest run reported 48 failed tests, 1,136 passed tests, and 2
  skipped database integration tests.
- The two skipped tests are the live parts lifecycle database integration
  suite. That means the newest Add Part, Use Part, handoff, consumption,
  authorization, and replay changes are not yet proven against a running
  Supabase schema in this audit environment.
- No authenticated multi-role browser run, production-like database replay,
  Stripe test-mode checkout, customer/fleet portal session, two-device
  inspection session, or offline device pilot was executed during this audit.

The failed test count is not equivalent to 48 confirmed product defects.
Most failures are source-shape assertions that still expect code which was
replaced by newer atomic RPCs, renamed migrations, moved mobile components, or
changed copy. They still make the release gate unusable: genuine regressions
cannot be distinguished from stale contracts until they are reconciled.

## Status language

- **Code-complete**: the canonical implementation exists and focused automated
  evidence passes.
- **Partial**: meaningful implementation exists, but a required path,
  verification layer, or lifecycle edge remains incomplete.
- **Broken**: a reachable current-main path is demonstrably wrong.
- **Duplicated**: more than one active or reviewable implementation claims the
  same responsibility.
- **Unverified**: implementation may be correct, but the required runtime
  evidence was not available.
- **Blocked**: an external configuration, environment, migration application,
  or product decision is required before verification can finish.

## Evidence baseline

| Evidence | Result | Meaning |
| --- | --- | --- |
| Repository | `EdwardLakin/ProFixIQ` | Public repository, default branch `main` |
| Audited main | `27bd6efe` | Merge of PR #1176, canonical parts transaction repair |
| Main deployment check | Vercel success | Build/deployment provider accepted current main |
| TypeScript | Pass | Current main compiles under the installed TypeScript project |
| API route audit | Pass; 372 routes | Static inventory completed; it is not an authorization proof |
| API risk heuristic | 62 high, 21 medium, 289 low | Every high/medium result still needs human flow review; false positives are expected |
| Full Vitest | 48 failed, 1,136 passed, 2 skipped | Repository-wide release gate is red |
| Schema files | 120 migrations, 11 manual SQL files | Migration history is large and manual SQL remains a second delivery surface |
| Latest migration | `20260723114500_canonical_use_part_runtime_security.sql` | Latest schema work is the direct Use Part runtime/security repair |
| Generated DB types | Typecheck pass | Types and current code compile; this does not prove deployed schema parity |

## Single completion map

| Workstream | Current classification | Evidence on current main | Missing evidence or blocker | Next completion gate |
| --- | --- | --- | --- | --- |
| Authentication | **Code-complete; runtime-unverified** | `tests/user-auth-normalization.test.ts` and `tests/auth-portal-hardening.test.ts` passed; staff creation includes rollback coverage; portal identity has hardened invite/activation routes | No owner/advisor/technician/fleet/customer login matrix was run; reset, invite, username-only, and revoked-session behavior remain production-like smoke items | Create isolated users for every role and run login, reset, invite, logout, revoked-session, and cross-shop denial tests |
| Guided onboarding | **Partial; duplicated** | Guided onboarding analysis and page-panel suites passed; canonical guided session routes and tables exist | `tests/guided-onboarding-v2-foundation.test.ts` has a stale navigation assertion; PRs #947 and #950 duplicate the same onboarding evidence change; signup-to-first-work-order runtime was not tested | Reconcile the test with current navigation, choose/close the duplicate PRs, then run new-shop signup → import/scratch → settings → first work order |
| Work-order creation | **Code-complete; runtime-unverified** | `tests/create-work-order-customer-vehicle-save.test.ts` passed; current routes support customer/vehicle save, suggested-line attachment, intake, and canonical line creation | No browser test proved search selection, manual customer/fleet entry, save, refresh, and second-device visibility together | Run owner/advisor desktop and mobile creation with existing and new customers, multiple vehicles, suggested maintenance, and refresh on a second device |
| Inspections | **Partial; high regression risk** | Canonical identity, cross-device reconciliation, autosave, offline recovery, photo staging, and recent publication-guard suites passed; main includes the versioned writer and canonical-source migrations | Six inspection contract files fail because they expect superseded writer/reopen/UI shapes; no installed-app two-device run was performed; deployment order of the recent inspection migrations was not checked against a live non-production database | Reconcile the six contracts to the canonical writer, replay migrations into a clean Supabase environment, then run phone/desktop simultaneous edit, photo, signature, finalize, reopen, PDF, and conflict recovery |
| Quoting and approvals | **Code-complete; runtime-unverified** | Phase 5 quote lifecycle, shop decision, quote send, history relevance, and Phase 8 approval consistency coverage is present; decisions route through atomic commands | Inspection-to-quote source contracts include stale failures; no customer and fleet replay test proved one decision and one set of downstream effects | Run failed inspection → quote → send → approve/decline/defer twice for customer and fleet; confirm exactly one line decision, parts release, status transition, and audit record |
| Parts lifecycle | **Code-complete on latest main; database-runtime-unverified** | PR #1176 is on main; focused part picker, async handoff, SQL authorization/idempotency, Add Part, Use Part, receiving, allocation, return, and invoice-parts suites mostly passed | Two database integration tests were skipped; four workbench tests still assert the pre-RPC implementation; production-like migration/schema parity is unknown | Run the full parts DB integration suite against clean replayed schema, then smoke request → quote → approval → pick/order → receive → allocate → handoff → use → return |
| Technician handoff and consumption | **Code-complete on latest main; database-runtime-unverified** | Latest migrations and routes use the atomic handoff/use transaction, stable operation keys, shop authorization, replay receipts, and net-issued invoice quantities | Same skipped runtime suite as parts; no technician UI double-submit/network-loss test in this audit | Execute handoff and Use Part as parts staff and assigned technician, repeat every request, lose network after commit, and prove one stock move, one consumption result, and one invoice quantity |
| Invoicing | **Partial; runtime-unverified** | Immutable invoice versions, payment event ledger, manual payment, PDF renderer, closeout gate, and live invoice safety suites exist; premium PDF unit tests passed | The seven Phase 1 source-contract tests are stale after migration/route changes; PR #1119 (font embedding) has a failed Vercel status; no full invoice/payment/receipt/void/reissue run was performed | Reconcile Phase 1 contracts, decide whether #1119 is still needed, then run issue → PDF → partial/full payment → receipt → refund/reversal → void/reissue using test-mode providers |
| Customer and fleet portals | **Partial; runtime-unverified** | Portal invite, booking, request, approval, mobile refactor, service/quote request, navigation, and advisor-message coverage passed; recent portal source markers are on main | No real invite callback, mobile customer session, fleet session, advisor routing, payment, or account-revocation run was performed | Run customer and fleet invite acceptance on phone, list/detail visibility, quote decisions, Message Shop routing, invoice/payment, profile, logout, and cross-customer denial |
| Workforce | **Partial; runtime-unverified** | Workforce activity, time reliability, corrections, admin actionability, documents, and payroll review implementations exist; canonical shift and labor RPCs are present | Four workforce/job-punch contracts are stale or reference removed paths; one suite reads a renamed migration; no authenticated punch-in/out, break, hold/resume, correction, or payroll close run was performed | Replace stale source assertions with RPC behavior tests and run shift start/break/end, line start/hold/release/finish, correction audit, pay-period refresh, and cross-shop denial |
| Messaging | **Code-complete; runtime-unverified** | Conversation authorization, participant scope, offline drafts, portal navigation, and advisor-directed portal messaging tests passed | No two-account realtime test, offline/reconnect draft race, attachment, or revoked-participant test was run | Test staff↔staff and customer↔advisor messages on two devices, including offline draft, reconnect, attachment, notification, and removed membership |
| Mobile routing | **Broken on main; fixed on this branch** | The shared resolver is used by middleware, the mobile shell, assistant entries, dashboard primitives, and previous-page controls | On main, `/work-orders/<UUID>` could be truncated because `/work-orders/view` was treated as a prefix without verifying the boundary; canonical `/quote-review/<id>` also had no mobile mapping | Merge only after the 27-case route suite, TypeScript, lint, build, and role-based phone smoke pass |
| Offline synchronization | **Partial; pilot-blocked** | Mutation receipts, session re-verification, technician/advisor/parts caches, photo staging, conflict handling, diagnostics, and resilience tests mostly passed | One update-activation assertion is stale; the two-device/device-quota/update/eviction pilot in `docs/offline-shop-pilot.md` has not been executed | Complete every pilot matrix row on iOS/iPadOS, Android, and desktop PWA; do not expand release until all rows pass |
| AI features | **Partial; open PR blocked** | Main has provider abstraction, safe display/serialization, usage, action approvals, deterministic closeout, and reliable shop-assistant conversation/action tests | PR #1143 is 86 commits, its Shop Assistant workflow failed TypeScript because `@shared/types/types/supabase-shop-assistant` was missing, and Vercel failed; current main does not contain that complete orchestration layer; one structured-output unit test also falls back unexpectedly in the full suite | Rebase or replace #1143 from current main, restore generated-type ownership, pass action authorization/idempotency/runtime tests, and keep technician diagnosis non-executable |
| Billing | **Partial; externally blocked** | Canonical Stripe webhook aliasing, signature validation, subscription synchronization, server-derived checkout, payment ledger, and API-version coverage exist | One webhook test expects obsolete error copy; no Stripe test-mode signup, checkout, renewal, failed payment, cancellation, seat limit, or replay was run; provider dashboard configuration was not inspected | Run Stripe test-mode lifecycle with repeated webhooks and verify canonical shop subscription fields, access changes, and no duplicate financial events |
| Schema and RLS | **Partial; replay-unverified** | 120 additive migrations, generated types, numerous RLS policies, narrow RPC grants, and the latest direct Use Part authorization repair are present | 11 manual SQL files remain outside the migration chain; three workforce contract tests still treat manual SQL as authority; the static API audit flags 83 high/medium routes for review; no clean replay or direct-RPC cross-shop matrix was run | Establish migrations as the only production authority, map or retire manual SQL, clean-replay locally, then test every privileged RPC both through the API and directly as authorized/unauthorized users |
| Deployment readiness | **NO-GO** | Current main Vercel status is green and TypeScript/API inventory pass | Full tests are red, database integration is skipped, mobile routing is broken on main, two current PRs fail Vercel, migrations are not replay-verified here, and required role/device/provider smokes are absent | Restore a trustworthy green gate, complete clean-schema/runtime tests, and attach the exact multi-role/mobile/offline/provider smoke evidence before any production deployment |

## Open pull-request disposition

There are 16 open PRs.

### Current but blocked

- **#1143 — Shop assistant orchestration:** mergeable according to GitHub, but
  Vercel failed and the dedicated workflow failed TypeScript on a missing
  Supabase assistant type module. It is also 86 commits behind a rapidly
  changing main and must be rebased or rebuilt, not merged as-is.
- **#1119 — Invoice PDF fonts:** one commit and mergeable, but Vercel failed.
  Confirm whether main's current PDF renderer already supersedes it before
  repairing or closing it.

### Duplicated or stale

- **#947 and #950** have the same onboarding-evidence title and intent. Select
  at most one after comparing with current main.
- **#921, #910, #906, #460, #445, #357, #354, #352, #271, and #266** predate
  the current July 23 lifecycle work. Most are now conflicting. Their old
  green Vercel checks prove only their historical snapshots, not compatibility
  with current main.
- **#2** is an obsolete draft migration placeholder and must never be used as
  schema authority.
- **#1** is an obsolete schema-dump workflow proposal with a failed Vercel
  status.

No PR was closed, merged, or changed by this audit.

## Priority order

1. **P0 — Restore a trustworthy release gate.** Classify and reconcile the
   remaining 47 failures after this branch's mobile fix. Replace source-string
   assertions with behavior or SQL-contract tests where possible. Do not make
   tests green by restoring superseded non-atomic code.
2. **P0 — Prove the canonical shop golden path against a clean database.**
   Work order → inspection → recommendation/quote → approval → parts
   order/pick/receive → handoff/use/return → cause/correction → invoice →
   payment/receipt. Repeat retryable actions and test direct RPC denial.
3. **P0 — Replay the complete migration chain in non-production.** Compare the
   resulting schema/functions/policies to generated types and current route
   calls. Resolve manual-SQL ownership without editing historical migrations.
4. **P0 — Complete installed inspection and offline pilots.** Two-device
   editing, staged photos, session expiry, network loss after commit, conflict
   recovery, update activation, storage pressure, and account switching.
5. **P1 — Complete auth/portal/workforce/billing role matrices.** These have
   substantial code but insufficient production-like evidence.
6. **P1 — Rebase or replace the assistant orchestration PR.** AI expansion
   follows operational truth and release-gate repair; it must not bypass
   canonical domain commands.
7. **P2 — Close or supersede stale PRs.** This removes misleading green checks
   and duplicate implementations from the review surface.

## Completed workstream: mobile route integrity

### Root cause

`firstPathSegmentAfter()` sliced a pathname at the supplied prefix length
without first proving that the pathname was actually at or below that prefix.
`mapWorkOrderPath()` probes `/work-orders/view` before parsing a normal work
order ID. A UUID path such as `/work-orders/9c2a...` was therefore sliced in
the middle and redirected to the wrong mobile work-order ID. Similar
`startsWith()` checks also accepted lookalike paths such as `pretrips` as
`pretrip`.

The canonical desktop quote route `/quote-review/<work-order-id>` was not
mapped at all, so quote links opened from mobile could escape to the desktop
surface.

### Implemented correction

- Added segment-boundary matching for every recognized mobile route family.
- Made dynamic segment extraction fail closed unless the prefix is an exact
  path boundary.
- Preserved full UUID work-order IDs.
- Mapped canonical and compatibility quote-review routes to the mobile
  work-order detail.
- Consumed the legacy `woId` query parameter once it is converted into the
  mobile path while preserving unrelated query parameters and hashes.
- Added regression cases for full UUIDs, view routes, canonical quote review,
  legacy quote review, query/hash preservation, and lookalike route names.

### Safety

This change performs no database access and changes no authorization,
membership, RLS, schema, business status, or mutation behavior. Middleware and
the client shell continue to use the same resolver; only known path-boundary
classification and destination integrity change. External, portal, API, and
shared-auth routes still return no mobile rewrite.

### Branch verification

- The focused mobile route suite passes all 27 cases, including full UUIDs,
  canonical and compatibility quote-review links, query/hash preservation, and
  lookalike route boundaries.
- TypeScript and targeted ESLint pass.
- The API route audit passes and inventories all 372 current routes.
- A production Next.js build completes with local placeholder values for
  required build-time secrets. No external service or production environment
  was contacted.
- The complete branch suite reports 47 failed, 1,142 passed, and 2 skipped
  tests across 205 files. The mobile route suite is no longer among the failed
  files; 28 other files remain red. This is an improvement over the audited
  main baseline, not a release-ready result.
- Authenticated role/device verification remains the required manual gate
  below because this audit environment has no seeded test identities or
  running non-production Supabase instance.

## Required smoke test for this branch

1. On an iPhone/iPad-sized viewport, sign in separately as owner, advisor,
   manager/foreman, and technician.
2. Open a work order whose route uses a UUID from each role dashboard. Confirm
   the exact same UUID appears in `/mobile/work-orders/<id>`.
3. Paste `/work-orders/<UUID>` directly into the browser on a mobile device.
   Confirm middleware redirects to the exact mobile record.
4. Open `/work-orders/view/<UUID>?tab=parts#handoff`; confirm the UUID, query,
   and hash survive.
5. Open `/work-orders/<UUID>/quote-review`,
   `/quote-review/<UUID>`, and
   `/work-orders/quote-review?woId=<UUID>`. Confirm each stays in the mobile
   shell and opens that work order.
6. Tap quote links from the mobile work-order page, advisor notifications,
   assistant results, and the previous-page control.
7. Open work-order board, create, customer, fleet pretrip, messages,
   inspections, parts, offline, assistant, planner, settings, and reports
   links. Confirm none land on a desktop page.
8. Confirm portal, external, `mailto:`, reset-password, and API links are not
   rewritten.
9. Repeat with the device installed as a PWA and with a cold start.
