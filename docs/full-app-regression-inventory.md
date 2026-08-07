# Full-app regression inventory

## Purpose

The regression inventory replaces manual route-by-route clicking as the first line of regression detection. It catalogs the complete application surface and links four contracts:

1. application Supabase consumers (`from`, select/filter/mutation columns, RPCs, Storage, and Realtime),
2. the canonical generated schema from a clean migration replay,
3. executable evidence for critical multi-step flows, and
4. normalized production error signatures from an optional log export.

It is an inventory and an early-warning gate, not a claim that static analysis replaces browser acceptance testing. Missing browser/API/database evidence remains visible as a critical-flow gap.

## Commands

```bash
# Generate JSON and Markdown reports; known and new findings are reported.
pnpm regression:inventory

# CI mode. Fails for a new error, an expired baseline entry, or a stale entry
# whose underlying issue has been resolved.
pnpm regression:inventory:check

# Repair-campaign mode. Fails while any current error remains.
pnpm regression:inventory:strict

# Deliberate baseline update after reviewing every new fingerprint.
pnpm regression:inventory:baseline

# Add a Supabase/Vercel JSON, JSON-array, or NDJSON log export.
pnpm regression:inventory --logs /absolute/or/repo-relative/logs.json

# Compare consumers against a separately generated linked/live type contract.
pnpm regression:inventory --schema /tmp/supabase.live.ts
```

Reports are written to `artifacts/regression-inventory/inventory.json` and `artifacts/regression-inventory/summary.md` by default. CI writes them to the runner temp directory, adds the Markdown summary to the GitHub job summary, and uploads both as the `full-app-regression-inventory` artifact.

## CI contract

`Agent PR Checks` runs the baseline-aware scanner on every pull request to `main`, regardless of which app domain changed. It intentionally runs before typecheck/test/build with `continue-on-error`, so all validation evidence is still collected; a final step enforces the inventory result.

The existing Supabase clean-replay workflow remains the database-side proof:

```text
app consumers -> canonical generated types -> clean migration replay
```

This closes the previous gap where migrations and generated types could reconcile cleanly while untyped or casted app queries still referenced retired columns.

## Exact, expiring baseline

`scripts/regression-inventory/baseline.json` stores exact fingerprints. A fingerprint is based on rule, file, subject, and operation; line numbers are intentionally excluded so harmless line movement does not create a new regression.

Baseline rules:

- Every entry is visible in every report.
- Every entry expires after 30 days unless it is repaired or deliberately re-reviewed.
- New errors fail CI.
- Expired entries fail CI.
- Resolved entries also fail CI until removed, preventing permanent stale suppressions.
- Runtime log findings cannot be written into the static baseline.

Never refresh the baseline simply to make CI green. Review the generated Markdown and JSON, fix the consumer when practical, and use the baseline only for confirmed existing debt; link each deliberate refresh to an owner or repair issue in the PR.

## Critical-flow evidence

`scripts/regression-inventory/critical-flows.json` defines 19 supported full-app golden paths. The abandoned property experiment is intentionally excluded while its remaining code is removed. The shared fixture contract uses two shops with equivalent roles and deliberately duplicated display values, SKUs, unit numbers, and supplier names. That makes a missing `shop_id` predicate observable instead of accidentally passing because test data is globally unique.

The sentinel part costs `$40` and sells for `$80`:

- Quote Review must retain and present both internal values.
- Customer and invoice surfaces use `$80`.
- Purchase orders use `$40`.
- Replaying the order creates neither a duplicate PO nor a duplicate line.

Filename matching alone is not accepted for the three currently regressed stages. A proving test must contain the relevant marker:

```text
@regression-flow quotes.review-cost-and-sell
@regression-flow parts.request-to-po
@regression-flow messaging.notification-acknowledgement
```

Markers belong beside assertions that execute the invariant. A source-text assertion that merely checks whether implementation text contains a string is classified separately and cannot satisfy executable evidence.

## Runtime error classifier

The optional log classifier accepts JSON, arrays, NDJSON, or plain line exports. It writes counts and normalized categories only; it does not copy raw messages or payloads into the report.

Initial signatures cover:

- missing columns, relations, and RPC signatures (`42703`, `42P01`, `42883`, `PGRST202`, `PGRST204`, `PGRST205`),
- invalid PostgREST filters,
- RLS and permission drift,
- database constraint violations,
- request items that reach PO creation without an inventory link,
- notification acknowledgement persistence failures,
- invoice cost-recomputation permission drift, and
- HTTP 5xx responses.

Production logs are read-only input. Do not commit raw logs; they may contain tenant or customer context.

## Current boundaries and next layer

The scanner resolves inline and file-local constant targets and validates RPC overloads, embedded PostgREST filters, inline/local mutation payloads, Realtime table/filter contracts, and buckets explicitly provisioned by ordered migrations. Dynamic wrappers, row-derived bucket names, imported computed selectors, and runtime-generated filters are reported as warnings rather than treated as proven-safe.

Storage buckets created only through dashboard/manual SQL are reported as migration-chain gaps. A trusted nightly job should additionally generate linked types, query the post-replay `storage.buckets` catalog, and feed normalized Supabase/Vercel logs into this same inventory. That job requires production-scoped secrets and is intentionally separate from untrusted pull-request CI.
