# Phase 16 release and rollback validation

Phase 16 is a fail-closed evidence gate. It does not change product behavior,
permissions, data contracts, or deployment configuration. It prevents a
release recommendation until the exact deployed candidate has satisfied every
required live, automated, cleanup, and rollback check.

## Prerequisite deployment order

Deploy Phases 6 through 15 as separate reviewed changes. Preserve their order
and record each merged PR, exact head SHA, and deployed state in the Phase 16
evidence. In particular, do not combine technician assignment, quoted-parts
state, Portal authorization, or AI grounding into one release.

Phase 16 must remain `NO-GO` while any prerequisite is merely open, green but
unmerged, merged but undeployed, or not tied to an exact SHA.

## Start a run

Use a fresh `QA-<run-id>` and the SHA actually deployed to the validation
environment:

```powershell
pnpm release:validate:init -- --template outputs/phase16-evidence.json --run-id QA-YYYYMMDD-P16 --candidate-sha <deployed-sha>
```

The generated evidence file intentionally fails every untested gate. Record
observed results; do not replace missing evidence with inferred passes. The
initializer refuses to replace an existing file. If a deliberate restart is
required, preserve the completed audit first and pass `--overwrite` explicitly.

## Required evidence

The gate requires all of the following on the same candidate SHA:

- A named operator and a positive-duration evidence window completed within
  the last 24 hours and tied to the exact deployed candidate SHA.
- Phases 6–15 merged and deployed independently, each with a unique PR number.
- Every Sev-2 closed with both automated and live regression passes; zero open
  Sev-1 or Sev-2 defects.
- Connected repair, Field variation, and offline/reconnect lifecycle passes.
- Shop Desktop/PWA, Shop Mobile, Customer Portal, Fleet, Field Service, and AI
  Copilot end-to-end passes.
- Ten consecutive refresh, cold-navigation, and back/forward runs with no
  console error or unexplained failed request.
- Owner, admin, manager, service advisor, technician, lead tech, parts, fleet
  manager, dispatcher, driver, customer, and field operator checks. Each role
  must cover allowed actions, prohibited UI, prohibited direct routes,
  server-side denial, cross-tenant replay, session revocation, Pro, and Starter.
- Pro and Starter UI gates, server gates, and no-partial-data behavior.
- 1440×900, 1024×768, 768×1024, 430×932, 390×844, and 360×800 responsive runs
  with no horizontal overflow.
- Offline reconnect without stale protected data.
- Exact, partial, mixed-case, VIN, plate, work-order, customer, asset,
  punctuation, special-character, empty, and no-result search cases across
  every available surface.
- Navigation feedback within 100 ms, agreed route budgets, and no stale mutable
  approval, request, or defect data.
- Keyboard, touch-target, and dialog accessibility checks.
- Sandbox-only payment completion with proof that no real charge occurred.
- Network observation with zero console errors and zero unexplained failed
  requests.
- Every synthetic record archived, or hard-deleted only after action-time
  confirmation.
- No unmitigated release-blocking risk and no required coverage gap.

Every lifecycle, product, role, plan, viewport, offline, search, performance,
accessibility, payment, diagnostics, cleanup, and defect result carries the
candidate SHA. Collections must remain JSON arrays and their identifiers must
be unique; malformed or contradictory evidence fails closed.

The weighted score is 30 core workflows, 25 authorization/security, 20
cross-app integrity, 10 reliability/diagnostics, 10 responsive/offline/
accessibility, and 5 AI Copilot. An open Sev-1 caps the score at 30, an open
Sev-2 at 65, and a failed core lifecycle at 70. Readiness requires the complete
100-point score; a numerical score never overrides a failed mandatory gate.

## Generate the executive report

```powershell
pnpm release:validate -- --input outputs/phase16-evidence.json --output outputs/profixiq-release-validation-QA-YYYYMMDD-P16.md
```

The command exits non-zero for `NO-GO`. Use `--report-only` only to generate a
truthful blocked-progress report; it must not be used as a release approval.
The Markdown output includes the executive recommendation, readiness score,
severity-ranked defects, top risks, prioritized fixes, regressions,
diagnostics, cleanup, coverage gaps, and rollback readiness.

## Rollback gate

Before release, record the prior stable SHA, named rollback owner, reviewed
runbook, verified application rollback, and passing post-rollback smoke. Schema
rollback is forward-only: do not delete production records, reverse migration
history, or drop additive repair objects. If a repair migration causes a
problem, roll the application back to the prior compatible SHA and ship a
reviewed forward migration.

After rollback, rerun authentication, one allowed and denied action per role,
the connected request-to-Shop handoff, work-order detail, Parts request list,
Portal quote denial, Field gate, dashboard counts, and AI safe-error paths.
The release remains `NO-GO` until that smoke passes.
