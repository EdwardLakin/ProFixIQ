# ProFixIQ Code Review Policy

## Purpose

This document defines the repository-specific review standard for ProFixIQ.

Review for production correctness, tenant safety, data integrity, lifecycle consistency, and end-to-end workflow behavior. Do not optimize for the number of findings. Continue investigating while new material risks are being discovered, and stop when additional review is only producing speculative or stylistic comments.

A review should answer:

1. Does the change solve the stated problem at its root?
2. Does it preserve ProFixIQ's tenant and authorization boundaries?
3. Can retries, replays, duplicate requests, partial failures, or concurrent actions create contradictory state?
4. Does the change use the canonical architecture rather than creating drift?
5. Do UI, API, domain logic, database state, exports, and downstream consumers agree?
6. Is the migration and deployment path safe for existing data?
7. Do the tests prove the claimed behavior and important failure cases?

## Review Priority

Review findings in this order:

1. Security and tenant isolation
2. Data loss or data corruption
3. Authorization and privileged access
4. Incorrect business lifecycle or state transitions
5. Duplicate side effects, replay, and idempotency failures
6. Unsafe migrations and deployment ordering
7. Canonical architecture drift
8. End-to-end workflow regressions
9. Missing or misleading validation and tests
10. Material mobile, tablet, accessibility, or operational UX regressions
11. Maintainability risks with a concrete future failure mode

Do not block a PR for subjective style preferences when repository conventions are otherwise followed.

## Finding Severity

Use severity based on production impact.

### Critical

Use for issues that can plausibly cause:

- cross-tenant data exposure or mutation
- authentication bypass
- broad authorization bypass
- destructive production data loss
- exposed secrets or service credentials
- uncontrolled privileged production actions
- materially incorrect billing across tenants or customers

Critical findings should identify the exact attack, failure, or data-loss path.

### High

Use for issues that can plausibly cause:

- unauthorized resource access within a broader tenant or role boundary
- duplicate charges, approvals, orders, or irreversible side effects
- migration failure on valid existing production data
- broken work-order, approval, parts, or invoice lifecycle
- silent data corruption
- webhook or worker replay causing repeated mutations
- service-role access without adequate application authorization
- a canonical flow being bypassed in a way that creates contradictory state

### Medium

Use for concrete defects such as:

- incomplete workflow behavior
- incorrect status mapping
- stale exports or reports
- mismatch between UI and persisted state
- missing audit context for an exceptional action
- a meaningful tablet/mobile regression
- an important failure path not handled
- tests that miss a likely regression introduced by the change
- duplicate logic likely to drift because both paths remain active

### Low

Use sparingly for concrete, non-blocking risks.

Examples:

- misleading operational language
- minor maintainability problems with a specific consequence
- small accessibility regressions
- low-impact inconsistencies that could confuse users

Do not create Low findings for formatting, naming taste, or personal preference.

## Required Review Method

Before submitting findings:

1. Read the PR description and claimed root cause.
2. Inspect the complete diff.
3. Identify the user and data flow affected.
4. Search for relevant call sites and parallel entry points.
5. Inspect canonical helpers, routes, services, and tables.
6. Inspect relevant migrations and generated database types.
7. Inspect authorization and RLS assumptions.
8. Inspect downstream consumers.
9. Inspect focused tests.
10. Compare the claimed validation with the actual change.

For a localized bug, do not assume the bug is localized merely because the diff is small.

For a broad PR, review by lifecycle and invariant rather than reading files in isolation.

When evidence is incomplete, state the uncertainty. Do not present speculation as a confirmed defect.

## Tenant Isolation and Authorization Checklist

Treat `shop_id`, organization scope, location scope, memberships, and portal resource relationships as security boundaries.

Check:

- Is the caller authenticated where required?
- Is the caller authorized for the specific resource?
- Is tenant scope derived from trusted server-side context?
- Can a client change `shop_id`, organization ID, location ID, work-order ID, session ID, customer ID, vehicle ID, or another foreign key to access another tenant?
- Are reads scoped as carefully as writes?
- Does an update or delete include the expected tenant/resource predicate?
- Does a lookup by globally unique ID accidentally skip authorization?
- Does service-role Supabase access bypass RLS without equivalent application authorization?
- Can an RPC be called directly with forged tenant identifiers?
- Do RLS policies cover SELECT, INSERT, UPDATE, and DELETE intentionally?
- Are `WITH CHECK` requirements present where writes need tenant enforcement?
- Can owner/admin behavior accidentally grant staff cross-location access?
- Does active-location context mutate canonical staff ownership or `profiles.shop_id`?
- Are transfers or privileged cross-location actions audited and capacity-checked where applicable?
- Can public, anonymous, customer portal, or fleet portal access enumerate or infer another tenant's records?

A finding should describe the concrete cross-boundary path, not merely say "check RLS."

## Service Role and Internal Route Checklist

Any use of a Supabase service-role client or internal worker route deserves explicit review.

Check:

- Is authentication performed before privileged access?
- Is authorization performed before the service-role query?
- Is the target resource scoped after privilege escalation?
- Is a secret-protected internal endpoint actually verifying the secret?
- Is secret comparison handled safely enough for the route's threat model?
- Can request input choose arbitrary tenant scope?
- Can a user-accessible route reach an internal privileged helper?
- Are errors or logs exposing sensitive data?
- Can a worker process another tenant's job due to a missing ownership predicate?
- Are stale locks and concurrent workers handled?
- Are privileged actions auditable?

Do not accept "RLS protects this" when the code uses service-role access.

## Database Migration Checklist

Review every migration as if it will run against imperfect live data.

Check:

- Does the migration inspect or account for violating existing rows?
- Is a backfill required before a new constraint?
- Is the backfill deterministic?
- Can the migration silently discard ambiguous business data?
- Does a unique index fail because historical duplicates may exist?
- Does a foreign key fail because orphaned rows may exist?
- Does `NOT NULL` fail because old rows are incomplete?
- Does a check constraint reject historical statuses or values?
- Does an exclusion constraint require extension or operator support?
- Are indexes added for new hot-path predicates or foreign-key access where needed?
- Is the migration replay-safe where practical?
- Is application deployment ordering compatible with the schema change?
- Does old code continue working during a rolling deployment?
- Are generated Supabase types updated when required?
- Is an old migration being edited instead of adding a new production migration?
- Are RLS policies recreated without accidentally broadening access?
- Are functions or RPCs using the intended `SECURITY INVOKER` or `SECURITY DEFINER` behavior?
- If `SECURITY DEFINER` is used, is `search_path` controlled and authorization explicit?

Reject casts or TypeScript workarounds that hide real schema drift.

## Idempotency, Replay, and Concurrency Checklist

Explicitly inspect mutations triggered by:

- Stripe webhooks
- approval webhooks
- portal submissions
- internal workers
- AI processing jobs
- retries
- browser double-clicks
- network retry
- queue redelivery
- scheduled jobs
- import or activation flows

Check:

- Is there a durable idempotency key?
- Is uniqueness enforced in the database where appropriate?
- Can two concurrent requests both pass a pre-check and insert?
- Is the operation atomic when multiple records must agree?
- Can partial failure leave contradictory state?
- Can a replay duplicate events, approvals, parts, bookings, invoices, usage records, or outbound messages?
- Does the code confuse "already completed" with failure?
- Are lock acquisition and stale-lock recovery safe?
- Does retry preserve the original tenant and source context?

A client-side disabled button is not an idempotency guarantee.

## Canonical Architecture Checklist

Search before accepting a new implementation.

Check for duplicate or competing:

- API routes
- server actions
- Stripe webhook handlers
- checkout handlers
- approval pipelines
- event systems
- status maps
- tenant-context helpers
- asset models
- inspection models
- AI provider calls
- usage/cost tracking
- storage path builders
- export/report structure builders

If a legacy route remains:

- Does it delegate or redirect appropriately?
- Can it still perform independent side effects?
- Does it preserve required HTTP behavior?
- Are canonical and compatibility paths covered by tests?
- Can the two paths drift silently?

Do not request consolidation solely because two files have similar names. Confirm overlapping responsibility and consumers first.

## Work Order and Line State Checklist

Work-order state and work-order-line state are related but not interchangeable.

Check:

- Are status values canonical and normalized?
- Is a work-order status being incorrectly written to a line or vice versa?
- Can one incomplete line coexist with an incorrectly completed work order?
- Are assignment, `in_progress`, `on_hold`, completion, `ready_to_invoice`, and invoiced transitions coherent?
- Are transitions performed from all relevant entry points?
- Can retries repeat completion side effects?
- Do advisor, technician, parts, portal, and invoice views interpret the state consistently?
- Are historical statuses mapped safely?
- Do analytics or dashboard queries still understand the changed state?

Do not accept a status fix that only changes display text while persisted state remains wrong.

## Inspection, Evidence, and Report Checklist

Check:

- Is the inspection anchored to the correct work order or line?
- Can orphan inspection records be created?
- Are capture, evidence, note, transcript, finding, and recommendation relationships preserved?
- Does hidden or deleted state leak into Review or export?
- Does the printable report use the same reviewed/visible source of truth as the UI?
- Are supporting images grouped with the correct evidence?
- Does modal/lightbox styling accidentally inherit thumbnail crop behavior?
- Are report structure decisions stable when forms are blank or partial?
- Can AI-generated structure detach evidence from its source capture?
- Does branding apply consistently where required?

A visual fix to Review must be checked against printable/export behavior when they share the same domain structure.

## Parts Lifecycle Checklist

Check:

- Are parts attached to the correct durable work-order or line record?
- Is display text being used where a canonical relationship should exist?
- Are part requests, quote items, receiving, and work-order attachments consistent?
- Can the same part be attached twice through replay or multiple entry points?
- Is stock availability kept distinct from compatibility or description mismatch?
- Does a mismatch warning block valid workflows incorrectly?
- If an override is allowed, is deliberate acknowledgement explicit?
- Is the acknowledgement reason persisted server-side?
- Can the client bypass required server validation?
- Are parts-tech, advisor, and technician views consistent after the mutation?
- Do migration indexes and uniqueness rules support the intended idempotency?

Do not report "no stock" as a compatibility mismatch unless the domain logic explicitly defines it that way.

## Approval Checklist

Approval is a durable business event.

Check:

- Is there one canonical approval side-effect pipeline?
- Are line decisions persisted?
- Are work-order approval stamps and timestamps correct?
- Is actor/source context preserved?
- Are approved and declined lines handled separately?
- Do status transitions occur exactly once?
- Is webhook or portal replay safe?
- Can a legacy endpoint duplicate side effects?
- Do downstream parts and invoice workflows see the correct result?
- Are customer and fleet portal differences intentional?
- Can a user approve a work order outside the authorized portal relationship?

A successful HTTP response is not enough; verify the resulting domain state.

## Stripe and Billing Checklist

Check:

- Is the canonical Stripe webhook used?
- Is the canonical checkout route used?
- Are compatibility aliases delegating rather than duplicating logic?
- Is signature verification preserved?
- Is webhook replay safe?
- Is `stripe_session_id`, event ID, or another durable unique key used appropriately?
- Are existing metadata key variants still handled where compatibility requires them?
- Are subscription status transitions interpreted correctly?
- Are plan mappings and seat caps unchanged unless explicitly intended?
- Is seat counting scoped to the correct shop/location?
- Can failed subscription synchronization leave misleading active access?
- Are price IDs or environment variables invented rather than verified?
- Does the PR require Stripe dashboard or webhook configuration that is missing from the summary?

Never recommend logging secrets or weakening signature verification for debugging.

## User Creation and Multi-Location Checklist

Check:

- Does the server ignore or validate client-supplied shop scope?
- Is seat availability checked for the actual destination shop?
- Does active-user counting match the live schema?
- Are inactive users handled intentionally?
- Is profile creation consistent with auth metadata and membership creation?
- Can partial failure create an auth user without the required profile or membership?
- Does a multi-location selector mutate `profiles.shop_id`?
- Are staff anchored to one billing/seat location as intended?
- Are owner or organization-admin cross-location permissions membership-based?
- Are transfers restricted, capacity-checked, and audited?
- Can a demo shop or bootstrap path bypass normal seat or tenant rules unintentionally?

## AI and Background Processing Checklist

Check:

- Are provider calls routed through the canonical abstraction?
- Is model output schema-validated before persistence?
- Can model output influence authorization or tenant scope?
- Are jobs tenant/session scoped?
- Is processing lifecycle deterministic?
- Are queued, processing, retry, failed, and completed states coherent?
- Are stale locks handled?
- Is retry/backoff bounded and intentional?
- Does permanent failure preserve manual workflow availability where intended?
- Are usage and cost events recorded canonically?
- Can job chaining enqueue duplicates?
- Are source capture and evidence links preserved?
- Is upload completion unnecessarily blocked on long AI processing?
- Are internal worker endpoints adequately protected?

AI confidence is not a substitute for a business invariant.

## API and Server Action Checklist

Check:

- Input validation
- Authentication
- Resource authorization
- Tenant scoping
- Expected conflict handling
- Intentional HTTP status codes
- Sensitive error leakage
- Idempotency
- Audit events
- Partial failure
- Downstream revalidation or cache behavior where applicable

If the UI blocks a request, ask whether the server must independently enforce or persist the same rule.

If the server accepts an override, verify the override context is durable rather than existing only in React state.

## UI and Operational UX Checklist

Review UI as an operational tool used on desktop, tablet, and mobile.

Check:

- Does the UI use existing ProFixIQ primitives and theme variables?
- Is the same warning rendered twice through inline state and toast?
- Is a durable conflict explained only by a disappearing toast?
- Are override actions explicit and deliberate?
- Does disabled state explain how the user can proceed?
- Are tables forcing unnecessary minimum widths?
- Do action areas wrap predictably at tablet widths?
- Are touch targets usable?
- Do dialogs and lightboxes fit the viewport?
- Are loading, empty, failure, and partial states understandable?
- Does the UI expose internal implementation language?
- Does the visible state match persisted state after refresh?
- Are optimistic updates reconciled after server failure?
- Is branding preserved?
- Are exports or PDFs now inconsistent with the reviewed UI?

Do not request visual redesign unless the change creates a concrete usability or consistency defect.

## Environment and Deployment Checklist

Check the PR summary against the implementation.

If code references a new environment variable:

- Was the exact name already present or intentionally introduced?
- Is it server-only or client-exposed correctly?
- Is a configuration helper updated?
- Is Vercel configuration required?
- Is Supabase, Stripe, or provider configuration required?
- Is the manual action documented?

If a migration is included:

- Is migration execution documented?
- Does app deployment depend on migration order?
- Is type generation required?

If no external action is required, the final task report should say so explicitly.

## Test Review Checklist

Tests should prove behavior, not implementation trivia.

Check:

- Does the regression test fail for the old bug?
- Does it prove the root invariant?
- Are important alternate entry points covered?
- Is cross-tenant denial tested for authorization-sensitive work?
- Is replay or duplicate submission tested for idempotent work?
- Are existing-data edge cases tested for migrations where practical?
- Are distinct domain states tested distinctly?
- Does a test merely assert that a string exists in source code?
- Is a mocked helper hiding the integration behavior that actually broke?
- Are legacy and canonical paths tested when compatibility is part of the change?
- Does the claimed test coverage match the changed behavior?

Source-inspection tests can be useful for migration structure or architectural invariants, but they should not be presented as proof of runtime behavior they do not execute.

## Validation Review

Compare the scope of the PR with the commands actually run.

Repository commands include:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm check
pnpm build
pnpm audit:api-routes
```

Check:

- Were focused tests run?
- Was typecheck run for TypeScript changes?
- Was lint run?
- Was build run for meaningful application changes?
- Was API route audit run when canonical routes or aliases changed?
- Are failures reported accurately?
- Is a pre-existing warning being misrepresented as a new failure?
- Is a new failure being dismissed as pre-existing without evidence?

Do not create a finding merely because every command was not run. Judge validation against the actual risk and scope.

## Review Comment Standard

Every finding should contain:

1. Severity
2. Exact affected file and code path
3. Concrete failure scenario
4. Why the existing guard is insufficient
5. The invariant that should hold
6. A focused direction for repair

Prefer:

> High — The service-role lookup loads the work order by client-supplied ID before verifying membership in the work order's shop. Because RLS is bypassed, an authenticated user who obtains another work-order UUID can reach the mutation path. Authorize the work order against the caller's permitted shop before the privileged update.

Avoid:

> Security issue. Check RLS.

Prefer:

> Medium — The mismatch acknowledgement is held only in component state and is not included in the confirmed add request. Refreshing or replaying the action loses the deliberate override context, so the server cannot audit why the incompatible description was attached. Persist the acknowledgement through the canonical add mutation.

Avoid:

> Maybe save this in the database.

## False Positive Avoidance

Before filing a finding:

- verify the code path is reachable
- verify an existing helper does not already enforce the invariant
- verify RLS behavior if the finding depends on RLS
- verify the installed dependency version if behavior is version-specific
- verify the table or column exists through migrations/schema evidence
- verify a legacy path is still active before claiming duplicate side effects
- verify the downstream consumer actually uses the changed field
- distinguish a product decision from a correctness defect

If evidence is insufficient, ask for clarification in the review or state the uncertainty rather than escalating severity.

## Review Completion

A review is complete when:

- the full diff has been inspected
- affected lifecycle paths have been traced
- tenant and authorization boundaries have been checked
- database and migration impact has been checked
- replay and partial-failure risks have been considered
- canonical/legacy drift has been checked
- downstream consumers have been considered
- tests and validation claims have been evaluated
- no additional material findings are emerging

The final review summary should state whether the PR is safe to merge, safe after identified fixes, or requires deeper investigation.

Do not approve based only on green CI. Do not request changes based only on stylistic preference.
