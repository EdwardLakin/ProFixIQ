# AGENTS.md — ProFixIQ Delivery Contract

## Mission

ProFixIQ is a production, multi-tenant shop, fleet, and mobile-service operating
system. Deliver the smallest complete production-quality change while
preserving tenant isolation, data integrity, canonical architecture, workflow
speed, and existing behavior.

The normal outcome of an implementation task is a validated change, one
notification-safe draft PR, and any task-owned forward migrations applied and
verified directly when this file authorizes them.

## Non-Negotiables

1. Inspect before editing. Trace the affected UI, API/server action,
   authorization, domain logic, database, events, and downstream consumers.
2. Find the root cause. Do not patch the first visible condition without
   explaining where the wrong state originates.
3. Reuse canonical routes, services, helpers, tables, statuses, and UI
   primitives. Search before creating anything new.
4. Never weaken authentication, authorization, tenant scope, RLS, constraints,
   validation, idempotency, auditability, or tests to make a change pass.
5. Never expose secrets, tokens, service-role keys, database passwords, or
   sensitive environment-variable values.
6. Never mutate production during an audit, diagnosis, plan, review, or other
   read-only request.
7. Never push to `main`, merge, enable auto-merge, force-push a reviewed branch,
   or mark a PR ready without explicit user instruction.
8. Preserve unrelated user changes. Ask only when the repository and connected
   tools cannot resolve a materially risky choice.

## Additive-First Change Control

This section is a hard scope boundary for every Codex implementation, review,
review-fix, and follow-up task in this repository. A request to build a new
feature is not permission to change existing behavior.

Before editing, classify the task and state the classification in the working
plan:

- **Isolated addition:** adds new behavior without changing an existing
  contract. This is the default for every new feature.
- **Compatible integration:** connects to an existing contract while preserving
  every existing caller, authorization decision, state transition, side effect,
  and passing regression.
- **Contract change:** intentionally changes existing behavior. This requires
  the user's explicit, task-specific approval before editing. A general request
  to build, continue, fix a review, or make CI green is not approval.

For isolated additions and compatible integrations, do not:

- replace or redefine a function, RPC, service, helper, route contract, status,
  default, or canonical mutation used by an existing flow;
- attach a trigger to a pre-existing table or change an existing trigger;
- change RLS policies, grants, revokes, constraints, foreign-key delete/update
  behavior, or column privileges on pre-existing objects;
- make an existing role more or less capable;
- edit an existing regression so new behavior passes;
- hide a shared-contract change inside a feature migration or review fix.

If a new capability cannot be completed without one of those changes, stop
before editing and report:

1. the exact existing object and consumers that would change;
2. why an isolated addition or adapter cannot satisfy the requirement;
3. the preserved behavior tests that must run;
4. the smallest compatibility/integration change proposed;
5. the rollout and rollback boundary.

Then ask for explicit approval of that contract change. Do not infer approval
from urgency, prior approvals, a failing check, or permission to fix the feature.

Keep required shared integration work in a separate PR that lands and proves
backward compatibility before the additive feature PR. When investigating a
failure, first identify the commit that introduced it and fix that contract at
its source; do not make the current unrelated PR absorb the repair.

Before publishing any implementation, compare the diff to its base and list
every pre-existing function, table, trigger, policy, privilege, route contract,
canonical service, and test changed. An additive PR with any unapproved item in
that list is not publishable. Run preserved-flow regressions on the final head;
a new feature is not complete when an older passing flow fails.

During review, treat an unapproved shared-contract change as a blocking
architecture finding even when the code is secure and its new tests pass. Do
not auto-fix that finding by expanding scope; return to the additive boundary or
request approval.

## Sources of Truth and Reading Order

Use, in order:

1. Current code and all meaningful call sites.
2. `supabase/migrations/` for deployable schema history.
3. Existing tests for preserved behavior.
4. `features/shared/types/types/supabase.ts` as the generated application
   contract, not proof of live schema by itself.
5. `docs/code-review.md` for detailed review and domain checklists.

Do not load every document for every task. Read only relevant sections of
`docs/code-review.md` during implementation; read it completely for a formal PR
review.

## Stack and Commands

Next.js App Router, React, strict TypeScript, Supabase Postgres/Auth/Storage/RLS,
Vercel, Stripe, SendGrid, Vitest, ESLint, and pnpm.

Use versions and scripts already declared in `package.json`:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm check
pnpm build
pnpm audit:api-routes
pnpm db:schema:check
pnpm db:schema:refresh
pnpm regression:inventory:check
```

Never claim a command passed unless it ran successfully on the final task diff
or exact published commit.

## Connector-First Execution

### GitHub

Use connected GitHub tools for repository/PR inspection, branch creation,
commits and ref updates, workflow/log inspection, and draft PR creation or
updates.

- Missing `gh`, shell authentication, or token variables is not a blocker when
  the connector supports the operation.
- Do not request GitHub credentials before trying the connector.
- Use a repo-backed environment for non-trivial multi-file implementation and
  tests. Do not turn a large change into dozens of remote one-file commits.
- A small documentation/config-only change may use one connector commit.

### Supabase

Use connected Supabase tools for project discovery, schema/migration
inspection, SQL, migrations, logs, advisors, type generation, and Edge
Functions.

- Missing `supabase`, shell authentication, or `SUPABASE_ACCESS_TOKEN` is not a
  blocker when the connector supports the operation.
- Do not ask the user to run `supabase db push`, paste SQL, repair history, or
  supply a token when the connector can do the work.
- Target the canonical ProFixIQ production project, never `ProFixIQ-Agent`.
  Resolve the current reference from repository configuration, then verify
  canonical tables (`shops`, `profiles`, `customers`, `vehicles`,
  `work_orders`, `work_order_lines`) and migration history before a write.

If a connector is unavailable or lacks an operation, report the exact gap only
after exhausting connector-backed alternatives. Do not request credentials by
habit.

## Standard Delivery Workflow

### 1. Scope and baseline

- Confirm current `main`, working tree/branch state, and task-owned files.
- Search open PRs for overlapping files or the same product slice. Continue the
  existing PR instead of creating a competing one.
- Identify affected roles, entry points, tables, statuses, external systems,
  offline paths, and downstream consumers.
- For broad work, identify the complete cutover boundary before editing.

### 2. Implement one coherent change

- Prefer the smallest complete repair over a broad rewrite.
- If the user requests a replacement subsystem, audit all consumers and change
  the system as one coordinated slice. Do not piece a second system beside the
  old one.
- Keep compatibility paths only for confirmed consumers; delegate them to the
  canonical path and prevent duplicate side effects.
- Add focused regression coverage. Do not include unrelated cleanup.

### 3. Validate efficiently

- Run narrow checks while iterating; run the full risk-appropriate gate once
  after the implementation stabilizes.
- Do not rerun the full suite after every small edit.
- Do not blindly retry failures. Diagnose the first actionable failure, fix it,
  rerun that check, then run the final gate.
- Prove a failure occurs on the base branch before calling it pre-existing.
- Review the final diff for accidental files, debug output, secrets, duplicate
  logic, stale comments, and schema/type drift.

### 4. Publish and verify

- One coherent task equals one branch and one PR.
- Start from latest `main`; use `agent/<short-description>` unless continuing an
  existing task branch.
- Finish and validate before the first remote push whenever practical.
- Open one draft PR. Batch follow-up fixes into one additional push where
  practical; never open a follow-up PR for an unmerged PR's review findings.
- Inspect the published diff and exact head SHA.
- Distinguish failed, cancelled, skipped, pending, and successful checks. Do not
  call a PR green while a required gate is absent or pending.

## Regression Control

- Existing passing tests are contracts. Do not delete, skip, weaken, narrow, or
  rewrite them merely to accommodate new code.
- Do not change canonical schema/business logic to match an incorrect
  implementation; align the implementation to the existing system.
- Existing tests may change only for an intentional product-contract change.
  Then update the complete affected system, add tests for the new contract, and
  explain the change in the PR.
- A bug fix needs a behavior-focused regression test that would fail for the
  reported defect when reasonably testable.
- Inspect all meaningful creation/mutation paths, authorization, status
  transitions, constraints/RLS, replay/concurrency, partial failure, webhooks,
  workers, notifications, portals, exports, reports, mobile/tablet, and offline
  consumers relevant to the change.

### Validation matrix

**Docs/config only**

- inspect final Markdown/config and links;
- review the complete diff for accuracy and stale instructions.

**Localized code/UI**

- focused regression tests;
- `pnpm typecheck`;
- ESLint on changed JavaScript/TypeScript.

**Meaningful app/cross-flow change**

- focused tests;
- `pnpm check`;
- `pnpm build`;
- `pnpm regression:inventory:check` when flow inventory can change.

**API, worker, webhook, canonicalization, or privileged mutation**

- meaningful app gate;
- `pnpm audit:api-routes`;
- authorization, cross-tenant denial, idempotency, and failure-path tests.

**Migration, RLS, function, trigger, constraint, or generated types**

- relevant application checks and runtime SQL tests;
- `pnpm db:schema:check`;
- when the contract intentionally changes, `pnpm db:schema:refresh`, review the
  generated diff, then rerun `pnpm db:schema:check`;
- Supabase Clean Replay Validation on the final PR head;
- security/performance advisors after production apply.

If a local environment cannot run a required check, use CI on the exact final
head and report precisely what was not independently verified.

## PR Safety and Notification Control

The user works primarily from an iPad. Create one useful review event, not a
stream of agent-generated email.

- Do not open a PR until the branch is coherent and locally validated.
- Open as draft and keep it draft through implementation and batched repairs.
- Do not repeatedly toggle Draft/Ready. Mark Ready once only when explicitly
  requested or when an agreed release step requires it.
- Do not request reviewers, mention users/bots, add labels, post progress/CI
  comments, submit GitHub reviews, or invoke `@codex review` unless requested.
- Inspect CI silently and report status in the task response. Keep the PR body
  current instead of posting status comments.
- Do not close/recreate a PR, create remote micro-commits, or push every small
  fix separately.
- Do not create task-specific GitHub Actions workflows to run a command, apply
  a migration, or work around missing local authentication.
- Use existing required workflows. Change persistent CI only for a durable
  repository-wide need.

Current CI intentionally lets expensive domain workflows skip during draft
iteration and run when a PR becomes Ready. `Agent PR Checks` remains universal;
migration diffs also require Supabase clean replay. Preserve check names and
concurrency behavior unless the task explicitly redesigns CI.

Vercel Git deployments are production-only for cost control. Keep
`vercel.json` configured with `main: true` and the wildcard fallback set to
`false`. Do not add preview branch allowlists or an `ignoreCommand` override
unless the user explicitly requests preview deployments.

Green CI is necessary but not sufficient. Before recommending merge, confirm
the final diff, final head, unresolved findings, migration state, and deployment
ordering. Never merge or enable auto-merge without explicit approval.

## Database and Migration Delivery

`supabase/migrations/` is the only ordered deployable schema history. `db/sql/`
contains reference material, snapshots, or audits.

### Migration design

- Inspect prior migrations, application reads/writes, and live schema read-only.
- Create a new forward migration with a unique local/remote version. Never edit,
  rename, reorder, or replace an applied migration.
- Account for imperfect historical data before adding constraints. Backfills
  must be deterministic and observable; never silently discard ambiguous data.
- Keep expand/deploy/contract ordering compatible with the deployed app. Split
  destructive/incompatible changes into staged releases.
- Review RLS/grants, function security and `search_path`, indexes, triggers,
  idempotency, generated types, and forward-repair behavior.

### Standing migration instruction

For an implementation task that adds a new task-owned forward migration, normal
completion includes applying that exact migration directly to canonical
ProFixIQ production after the gates below pass. Do not leave it silently pending
or hand the user a CLI command.

This authorizes only the reviewed migration(s) created for the current task. It
does not authorize destructive/ambiguous data cleanup, reset/restore/pause/
delete, migration-history repair/reversion, unrelated migration backlog, or a
breaking schema change before compatible code is deployed. Those actions need
explicit action-specific approval. Read-only requests never authorize writes.

### Production migration protocol

1. Identify exact task-owned files and order.
2. Compare repository and remote history. Stop on gaps, collisions, modified
   historical files, or unrelated pending migrations.
3. Pass schema check, required runtime tests, generated-type checks, and final
   clean-replay CI.
4. Publish final SQL in the draft PR before applying it.
5. Verify the canonical production project readiness gate; do not trust a
   display name alone.
6. Apply only the reviewed SQL through the connected migration tool, in order.
7. On timeout/unknown result, do not retry blindly; re-read migration history
   and schema state first.
8. Verify remote version/name and expected schema, RLS/grants, triggers,
   functions, constraints, and backfill counts.
9. Run security/performance advisors and fix task-created findings.
10. Record exact applied migrations and evidence in the PR body/final response.

Application is incomplete until repository history, remote history, and schema
agree. If the connector cannot preserve that agreement, stop before drift and
report the exact blocker.

## Core Product Invariants

- `shop_id`, organization/location scope, memberships, portal relationships,
  and storage paths are security boundaries. Authenticate, authorize the
  resource, derive tenant scope server-side, and scope every read/write.
- RLS and application authorization reinforce each other. Service-role access
  requires explicit authorization because it bypasses RLS.
- `work_orders` are repair/commercial truth; line state is related but not
  interchangeable. Service Visits own physical dispatch; scheduler records own
  time/capacity; technician labor assignment is separate from dispatch.
- The technician is the source of truth for work/evidence. Advisor review and
  customer/fleet approval remain explicit durable stages.
- Approval, parts, payments, webhooks, workers, offline mutations, imports, and
  outbound messages must be idempotent, auditable, and safe under retry,
  concurrency, and partial failure.
- Parts retain durable relationships through request, quote, approval, PO,
  receiving, allocation, use/return, and invoice. Availability is not
  compatibility.
- UI, persisted state, portals, PDFs/exports, invoices, payments, reporting, and
  analytics must use the same reviewed source of truth.
- Shop and Fleet are connected but separate products. Fleet service requests
  become Shop work orders only through the canonical Shop-owned path; drivers
  report defects to Fleet dispatch/management.
- Mobile/offline operations require durable operation keys, ordered replay,
  tenant/user scope, conflict/version handling, and idempotent receipts.
- Keep one canonical Stripe checkout/webhook/subscription path and one
  canonical provider/usage path for AI. AI output never determines tenant scope
  or authorization.
- Reuse ProFixIQ branding and shared UI primitives. Preserve few-click speed,
  touch/tablet/mobile usability, scroll/layer behavior, and understandable
  loading/empty/error/refresh states.

## Code Review Rules

Before formal review, read `docs/code-review.md` completely. Prioritize:

1. cross-tenant/unauthorized access;
2. data loss/corruption and unsafe migrations;
3. broken lifecycle/status transitions;
4. replay, concurrency, duplicate side effects, and partial failure;
5. canonical architecture drift;
6. end-to-end regressions and misleading tests;
7. material mobile/tablet/operational regressions.

Do not manufacture style findings. Findings require a reachable path, concrete
impact, evidence, and focused repair direction. Review the final stable head
once; do not submit GitHub comments or request automated review on every
intermediate push unless requested.

## Definition of Done and Handoff

A task is done only when the root cause/capability is understood, relevant
consumers were inspected, canonical implementation and focused regressions are
complete, risk-appropriate validation passed on the final diff, only task-owned
files are present, one draft PR contains the work, and task-owned migrations
were applied/verified or an exact safety blocker is reported.

Final response:

- **Result:** outcome and material behavior change.
- **Validation:** only checks actually run and their result.
- **Database/deployment:** exact migration status, environment changes, and
  manual actions; say `none` when none.
- **PR:** branch, commit, draft PR link, check state, and review/merge readiness.
- **Remaining:** only real blockers, risks, or unverified device/production
  behavior.

Prefer autonomous completion with concise progress updates. When the user
corrects repeated behavior, update this file or the nearest relevant
instruction so the correction persists. Keep detailed domain review material
in `docs/code-review.md` or a closer directory-specific `AGENTS.md`.
