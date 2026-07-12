# AGENTS.md

## Mission

ProFixIQ is an AI-native shop operating system for automotive, heavy-duty, and fleet repair operations.

Treat this repository as a production multi-tenant system. Changes may affect work orders, inspections, technicians, parts, approvals, customer and fleet portals, invoicing, billing, AI processing, reporting, and historical business data.

The objective is not merely to make code compile. The objective is to make the smallest complete production-quality change that preserves tenant isolation, data integrity, canonical architecture, and the intended end-to-end workflow.

## Stack

- Next.js App Router
- React
- TypeScript with strict typing expectations
- Supabase: Postgres, Auth, Storage, and Row Level Security
- Vercel
- Stripe
- SendGrid / email infrastructure
- Vitest
- ESLint
- pnpm

Use the versions and dependencies already declared in `package.json`. Do not assume current framework documentation matches the installed version.

## Repository Commands

Prefer the repository's existing scripts.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm check
pnpm build
pnpm audit:api-routes
```

Additional database and QA scripts exist in `package.json`. Inspect them before use.

Do not claim a command passed unless it was actually executed successfully.

## Core Operating Rules

1. Inspect before editing.
2. Find the root cause before choosing the fix.
3. Reuse canonical code, tables, routes, services, helpers, types, and UI patterns.
4. Make the smallest complete change that solves the underlying problem.
5. Preserve existing behavior unless the task explicitly requires changing it.
6. Do not perform broad architectural rewrites unless explicitly requested.
7. Do not modify unrelated files "while here."
8. Do not create parallel systems to avoid understanding the existing one.
9. Distinguish confirmed repository facts from assumptions.
10. If an assumption materially affects correctness, verify it in code, schema, migrations, tests, or call sites before implementation.
11. Prefer durable fixes over UI-only symptom suppression.
12. Treat live data as potentially imperfect and historically inconsistent.
13. Never weaken security, authorization, validation, RLS, constraints, or auditability merely to make a test pass.
14. Never expose secret values, service-role keys, tokens, or sensitive environment-variable contents.
15. Do not mutate production data or external production systems unless explicitly requested.

## Investigation Requirements

Before changing code, inspect the relevant portions of the complete flow.

Depending on the task, this includes:

- user-facing component or page
- event handler or server action
- API route
- authorization helper
- domain/service logic
- Supabase query or RPC
- table definitions and generated database types
- migrations
- RLS policies
- storage policies
- downstream consumers
- exports and reports
- tests
- all meaningful call sites

Search for existing implementations before creating a new abstraction.

For bugs, explicitly determine:

- where the incorrect state originates
- whether the failure is UI, API, domain logic, persistence, authorization, schema, or lifecycle related
- whether the visible symptom is duplicated elsewhere
- whether multiple entry points can create the same state
- whether retries or replays can repeat the mutation
- whether the proposed fix changes historical or downstream behavior

Do not patch the first visible conditional until the data flow has been traced far enough to explain the root cause.

## Multi-Tenant and Authorization Rules

ProFixIQ is multi-tenant. Tenant isolation is a non-negotiable system invariant.

`shop_id` and organization/location scope are security boundaries, not convenience fields.

When touching tenant-scoped behavior:

1. Verify authentication.
2. Verify authorization.
3. Verify the acting user's relationship to the target shop or organization.
4. Verify every read and write is scoped correctly.
5. Verify IDs supplied by the client cannot be used to cross tenant boundaries.
6. Verify service-role usage does not bypass application authorization.
7. Verify RLS assumptions against actual policies or migrations.
8. Preserve audit context for privileged or exceptional actions.

Never trust a client-provided `shop_id` as authorization.

Do not remove tenant predicates because RLS "should handle it." Application authorization and database policy should reinforce each other.

Do not use service-role access as a shortcut around broken RLS or authorization.

Staff seat and billing ownership is location/shop scoped. Multi-location viewing or active-location context must not be implemented by casually mutating a staff member's canonical home `shop_id`.

Transfers, privileged cross-location operations, and owner/admin actions require explicit authorization, seat/capacity checks where applicable, and auditability.

## Database and Migration Rules

The database is part of the product contract.

Before writing a migration:

1. Inspect existing migrations for the table, column, index, constraint, trigger, function, RPC, and policy involved.
2. Inspect generated Supabase types, but do not treat TypeScript types as proof that live schema exists.
3. Search application reads and writes.
4. Identify existing rows that could violate the proposed change.
5. Determine deployment ordering between schema and application code.

Prefer migrations that are:

- additive where practical
- idempotent or replay-safe where practical
- safe for existing data
- explicit about backfills
- explicit about constraints and indexes
- compatible with rolling deployment where practical

Before adding `NOT NULL`, foreign keys, check constraints, exclusion constraints, or unique indexes:

- inspect for violating rows
- define a deterministic backfill or cleanup strategy
- preserve valid historical data
- do not silently delete ambiguous business data
- add focused validation for the invariant

Use canonical tables and durable foreign-key relationships when a canonical model already exists.

Do not introduce a second table, event system, status model, or relationship merely because it is easier than integrating with the existing model.

When a mutation can be retried, replayed, webhook-driven, worker-driven, or double-clicked, evaluate idempotency explicitly.

When changing schema, update generated database types if required by the repository workflow.

Never edit an old production migration to simulate a new migration unless the repository explicitly treats migrations as disposable. Create a new migration for production schema evolution.

## RLS and Security Review

For any new or changed table, RPC, storage path, or privileged API:

- identify the tenant anchor
- identify allowed roles
- verify SELECT, INSERT, UPDATE, and DELETE behavior separately
- verify cross-shop access is denied
- verify owner/admin access is intentional
- verify service-role callers perform explicit authorization before privileged access
- verify storage object paths cannot be forged across organizations or sessions
- verify public or anonymous access is intentionally limited

Security review is required for changes involving:

- authentication
- user creation
- owner PIN behavior
- memberships
- active shop/location context
- billing
- Stripe
- customer portals
- fleet portals
- approvals
- internal worker routes
- service-role Supabase clients
- storage
- AI ingestion or document processing

## Canonical Architecture Rules

Before adding a route, table, service, event type, or helper, search for the existing canonical implementation.

Prefer delegation or consolidation over duplicate implementations.

If a legacy route must remain for compatibility:

- delegate or redirect to the canonical implementation when technically appropriate
- do not duplicate side effects
- preserve expected HTTP semantics
- add tests proving the legacy path and canonical path cannot drift silently

Do not create parallel:

- Stripe webhook handlers
- checkout flows
- approval side-effect pipelines
- event systems
- work-order status models
- inspection models
- asset models
- AI provider call paths
- tenant context systems

If two existing systems appear duplicative, investigate ownership and consumers before deleting or merging either one.

## Work Order and Inspection Invariants

These are critical workflows.

The intended high-level lifecycle is:

- advisor or authorized user creates work
- technician performs inspection or service workflow
- findings and recommendations are captured
- labor and parts are attached to the correct repair/work-order context
- advisor reviews
- customer or fleet approval is recorded
- approved work progresses through downstream parts and service workflows
- completion and invoicing states remain consistent
- evidence and audit history remain attached to the correct durable records

When touching work orders, work-order lines, inspections, recommendations, quotes, or approvals:

1. Search all creation and mutation entry points.
2. Preserve canonical status values and normalized transitions.
3. Do not conflate distinct domain states.
4. Keep work-order and line-level state responsibilities clear.
5. Verify downstream portal, parts, invoice, analytics, export, and report consumers.
6. Preserve evidence/media relationships.
7. Evaluate partial failure and retry behavior.
8. Add focused regression coverage.

Examples of distinct states that must not be casually conflated include stock availability, part-number/description compatibility, approval state, work status, and processing lifecycle.

A warning shown inline and a toast for the same condition may create duplicate UX. Prefer one clear visible advisory path unless multiple surfaces serve materially different purposes.

## Parts Lifecycle Rules

Parts behavior can affect technician, parts, advisor, work-order, quote, and invoice flows.

When changing parts behavior:

- identify the canonical part/request/line relationships
- preserve durable links rather than relying on copied display text
- distinguish availability from compatibility or mismatch detection
- preserve deliberate override acknowledgements and their audit reason when overrides are allowed
- verify duplicate attachment and replay behavior
- verify parts request, receiving, quote, and work-order consumers
- do not treat "no stock" as equivalent to a compatibility mismatch
- do not block a valid override only in the client if the server must persist the acknowledgement

## Approval and Portal Rules

Approval is a business and audit event.

When changing approval behavior:

- identify the canonical approval entry point
- preserve line decisions
- preserve work-order approval stamps and timestamps
- preserve actor and source context where available
- ensure status transitions occur once
- make replay behavior safe
- verify customer and fleet portal behavior separately where they differ
- verify downstream parts and invoice effects

Do not duplicate approval side effects across legacy and canonical endpoints.

Do not trust a portal-supplied tenant or record ID without validating its authorized relationship.

## Stripe and Billing Rules

Stripe changes require conservative handling.

Before changing billing:

- inspect the canonical checkout route
- inspect the canonical webhook
- inspect subscription synchronization
- inspect metadata keys already accepted
- inspect webhook idempotency
- inspect plan and seat-limit mapping
- inspect portal/session behavior

Do not create a second Stripe webhook pipeline.

Do not casually change price mapping, subscription status interpretation, seat caps, or metadata keys.

Webhook handlers must be replay-safe.

Never log Stripe secrets or full sensitive payloads unnecessarily.

Changes that require Stripe dashboard configuration, webhook configuration, price IDs, or environment variables must be explicitly reported as manual actions.

## AI and Background Processing Rules

AI is assistive infrastructure, not permission to bypass domain integrity.

Route provider calls through the existing provider abstraction when one exists.

For AI or worker-driven processing:

- preserve deterministic lifecycle state
- make retries and stale locks safe
- record failures without blocking manual workflows where the product supports manual fallback
- record usage/cost through canonical usage infrastructure when applicable
- avoid provider-specific logic in feature code when an abstraction exists
- never treat model output as trusted authorization or tenant scope
- validate structured AI output before persistence
- preserve source capture/evidence relationships

Do not make user uploads wait synchronously for long-running AI work if the existing architecture queues processing.

## API and Server Mutation Rules

For new or changed API routes and server actions:

- validate input
- authenticate the caller
- authorize the resource
- scope database access
- return intentional status codes
- handle expected conflicts explicitly
- avoid leaking internal errors or sensitive data
- evaluate idempotency
- preserve audit events where required
- test failure paths, not only success paths

Do not rely solely on hidden UI controls for authorization.

If a client check prevents a request, determine whether the server must also enforce or persist the rule.

## Frontend and UX Rules

Preserve the ProFixIQ premium dark industrial/glass visual direction and existing branding system.

- Reuse shared shells, cards, controls, dialogs, and primitives.
- Use existing theme or brand variables instead of hardcoded colors where available.
- Keep new surfaces visually cohesive with ProFixIQ.
- Preserve keyboard and touch usability.
- Test desktop, tablet, and mobile implications.
- Avoid forced table widths that create unnecessary tablet overflow.
- Ensure action areas wrap predictably.
- Do not use a toast as the only explanation for a durable workflow conflict when an inline advisory or acknowledgement flow is more appropriate.
- Avoid duplicate warnings for the same condition.
- Keep user-facing language operational and understandable; do not expose internal schema or implementation terminology unnecessarily.

For dashboard work, preserve the widget-oriented architecture and keep business logic out of layout containers.

For report, PDF, invoice, and export work, verify branding and ensure reviewed/visible state is consistent with the UI's source of truth.

## TypeScript and Code Quality Rules

Maintain strict typing.

Avoid:

- `any`
- unsafe casts used to suppress real mismatches
- non-null assertions without a proven invariant
- silent fallback values that hide corrupted or missing state
- swallowed errors
- duplicated domain logic
- speculative abstractions
- dead compatibility code without confirmed consumers

When types and runtime schema disagree, investigate the schema and migration history. Do not cast around the discrepancy.

Prefer explicit domain helpers for repeated business invariants.

Do not refactor unrelated code solely for style.

## Testing Requirements

Every bug fix should include focused regression coverage when the behavior is reasonably testable.

Tests should prove the repaired invariant, not merely snapshot the implementation.

Depending on the change, test:

- authorized success
- unauthorized or cross-tenant denial
- invalid input
- replay/idempotency
- partial state
- legacy/canonical delegation
- status transition behavior
- mismatch versus availability distinctions
- existing-data migration compatibility
- mobile/tablet interaction logic where practical

Before completion, run the narrowest useful tests first, then broader validation.

Default completion validation for meaningful code changes:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Use `pnpm check` when appropriate.

Run `pnpm audit:api-routes` when API route structure or canonicalization is affected.

If the full suite is impractical or blocked, run the strongest relevant subset and state exactly what was not verified.

Do not describe pre-existing failures as caused by the task. Do not describe task-introduced failures as pre-existing.

## Environment Variables and External Configuration

Do not invent environment-variable names.

Before requiring an environment variable:

- search the repository for the exact variable
- inspect existing configuration helpers and examples
- determine server-only versus client exposure requirements
- determine whether Vercel, Supabase, Stripe, or another service requires a matching external configuration step

Never output secret values.

At task completion, explicitly say either:

- `Environment variables: none required`

or list the exact variable names and where the user must configure them.

Do the same for migrations and manual deployment actions.

## Code Review Instructions

When reviewing a PR, prioritize correctness and production risk over style.

Continue looking for additional meaningful findings until no new material issues are found.

Specifically inspect for:

- cross-shop or cross-organization data leakage
- missing authentication
- missing resource authorization
- client-controlled tenant scope
- unsafe service-role access
- incorrect RLS assumptions
- forged storage paths
- non-idempotent mutations
- webhook or worker replay bugs
- duplicate side effects
- partial failure leaving contradictory state
- unsafe migrations or missing backfills
- schema/type drift
- duplicate canonical and legacy systems
- status normalization regressions
- work-order versus line-state confusion
- approval lifecycle regressions
- parts availability versus compatibility conflation
- audit acknowledgement that is displayed but not persisted
- UI/API/database flow mismatches
- stale exports or reports using a different source of truth
- tablet/mobile layout regressions
- environment-variable requirements omitted from the PR summary
- tests that do not actually cover the claimed behavior
- claims that validation passed without evidence in the task execution

Do not manufacture low-value style findings to appear exhaustive. Findings should identify a concrete correctness, security, data-integrity, maintainability, or user-workflow risk.

## Definition of Done

A task is done only when:

1. The root cause or requested behavior is understood.
2. Relevant call sites and downstream consumers were inspected.
3. The smallest complete fix was implemented.
4. Tenant isolation and authorization remain correct.
5. Database changes are migration-safe and existing-data-safe.
6. Retry/replay/idempotency concerns were evaluated where relevant.
7. Focused regression coverage was added or a specific reason was given why it was not practical.
8. Relevant validation commands were actually run.
9. The final diff was reviewed for unrelated edits, duplicate logic, dead code, and schema drift.
10. Required migrations, environment variables, external configuration, deployment actions, and unverified risks are clearly reported.

## Required Final Response Format

Unless the user explicitly requests another format, finish with:

### Root cause
Explain the actual cause. For feature work, state the prior limitation or missing capability.

### What changed
Summarize the implementation and important flow changes.

### Why this is safe
Explain tenant, authorization, data-integrity, compatibility, and idempotency considerations relevant to the task.

### Files changed
List the exact files changed.

### Validation
List only commands actually run and their actual result.

### Database
State migrations/backfills required, or `Database: no migration required`.

### Environment variables
State exact required variable names and configuration locations, or `Environment variables: none required`.

### Manual/deployment actions
List any Supabase, Vercel, Stripe, provider, or deployment steps, or state `Manual actions: none`.

### Remaining risks or unverified assumptions
Be explicit. If none are known, say so.

## Working Style

Prefer autonomous completion.

Ask a question only when missing information creates a meaningful risk of implementing the wrong behavior or performing an unsafe action.

If the repository can answer the question, inspect the repository instead of asking the user.

Prefer exact fixes over theory, durable relationships over copied state, canonical paths over compatibility drift, and evidence-backed completion over confident claims.
