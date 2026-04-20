# Phase 4 Summary — Approval Webhook Canonicalization

## What was fixed
- Consolidated approval webhook business logic into `app/api/quotes/approval-webhook/route.ts` and removed conflicting behavior from the duplicate implementation.
- Added authenticated customer actor checks and customer-owned work-order scoping in the canonical webhook path.
- Added deterministic replay handling by computing changed line subsets and returning an `idempotent` response when repeated deliveries do not change state.
- Normalized side effects in one place: line approval propagation, work order approval stamps/signature fields, status transition handling, and operational event logging.
- Updated the customer approval page caller to post directly to the canonical webhook path.
- Converted the old `/work-orders/approval-webhook` route to a 307 compatibility redirect so it no longer contains approval mutation logic.

## Canonical approval paths now enforced
- webhook route
  - `/api/quotes/approval-webhook`
- approval status transition helpers
  - `applyAndPropagateWorkOrderLineApprovalDecision` (approve/decline propagation)
- downstream side-effect handlers
  - work order customer approval fields + status normalization in the canonical webhook route
  - `logOperationalEvent` from the canonical webhook route

## Files changed
- `app/api/quotes/approval-webhook/route.ts`
- `app/work-orders/approval-webhook/route.ts`
- `app/work-orders/[id]/approve/page.tsx`

## Migrations added
- None

## Behavior changes
- Customer approval submissions now go to `/api/quotes/approval-webhook` directly.
- Duplicate webhook route no longer independently mutates quote/work-order approval state.
- Replayed approval deliveries now avoid duplicate line-level mutation work and return `idempotent: true` when no state change is needed.
- Customer ownership and optional shop mismatch checks now fail fast before any approval mutation.

## Risks resolved
- Duplicate approval webhook implementations with conflicting logic.
  - Resolved: canonicalized to `/api/quotes/approval-webhook`; legacy path is redirect-only.
- Dependent approval/quote/work-order update flows relying on mismatched webhook side effects.
  - Resolved: updated approval page caller to canonical path; all approval side effects consolidated into one route.

## Remaining related risks not fixed in this phase
- Other non-webhook approval endpoints (for example per-line decision APIs and quote approval APIs) still exist by design and should be reviewed in a future phase for global transition-policy alignment.

## Validation run
- `npx tsc --noEmit` → pass
- `npx eslint app/api/quotes/approval-webhook/route.ts app/work-orders/approval-webhook/route.ts app/work-orders/[id]/approve/page.tsx` → pass

## Notes for next phase
- For booking transaction safety, apply a similar canonicalization pattern for all booking commit paths: one transaction boundary, one idempotency strategy, and one authoritative status transition map.
