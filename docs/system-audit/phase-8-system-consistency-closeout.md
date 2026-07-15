# Phase 8 — System Consistency and Audit Closeout

## Purpose

Phase 8 closes the repository-wide daily-operations audit by removing remaining lifecycle bypasses and documenting the canonical command owners established in Phases 1–7.

## Canonical lifecycle ownership

| Domain | Canonical owner |
| --- | --- |
| Invoice versions, payments, receipts, reversals, QuickBooks, financial outbox | Phase 1 financial RPCs |
| Financial mutation locks and correction sessions | Phase 2 lock commands |
| Parts receipt, allocation, issue, return, replacement, void, net-issued invoice quantity | Phase 3 parts commands |
| Technician assignment, shift eligibility, labor segments, start/pause/resume/finish | Phase 4 workforce commands |
| Quote decisions and inspection-to-quote imports | Phase 5 quote commands |
| Mobile offline queue, inspection progress, job-photo evidence | Phase 6 mobile reliability |
| Portal identity, bookings, request lines, customer line decisions | Phase 7 portal commands |
| Compatibility approval bundle, mark-ready, AI suggestion drafts, route retirement | Phase 8 consistency commands |

## Phase 8 changes

### Approval compatibility

The legacy approval endpoint is retained only as an adapter. It now calls `apply_approval_compatibility_bundle_atomic`, which:

- locks the work order, quote lines, and existing work-order lines;
- calls the Phase 5 quote decision command inside the same transaction;
- applies existing-line decisions with Phase 7 semantics;
- leaves approved work `awaiting` and `authorized`;
- enforces financial locks and stable operation keys;
- reconciles the parent approval state exactly once.

The obsolete `workOrderLineApproval.ts` multi-write helper was removed.

### Ready-to-invoice transition

`mark_work_order_ready_atomic` owns the parent readiness transition. It rechecks active lines and unresolved quote lines under row locks before updating the parent. History, ShopReel delivery, and AI learning occur after commit and cannot change the canonical result.

### AI suggestions

Selected AI suggestions now create advisor-review quote drafts through `add_ai_suggested_quote_lines_atomic`. AI labor, parts, cause, correction, and pricing are context only until accepted through the normal review workflow.

### Retired mutation routes

The following legacy routes now return `410 Gone`:

- `/api/work-orders/update-status`
- `/api/work-orders/add-line`
- `/api/work-orders/lines/update-from-inspection`

They previously bypassed one or more canonical lifecycle boundaries.

## RLS and privileged client boundary

Service-role access is limited to narrowly justified administration, external integration, and server-owned provisioning paths. Daily work-order state mutations use authenticated shop-scoped access plus transactional RPC validation.

## Retry and idempotency boundary

Every retryable Phase 8 command uses a tenant-scoped stable operation key and stores the committed result. Retries return the previously committed result without repeating lifecycle changes.

## Audit register reconciliation

Issues #1010–#1018 and #1021–#1027 were closed as completed because Phase 1 PR #1028 implemented their canonical financial, portal, QuickBooks, receipt, and notification requirements.

## Validation required before merge

1. Run Phase 8 typecheck, targeted lint, and focused tests.
2. Confirm the Vercel production build is green.
3. Run the migrations in order.
4. Confirm the final post-check notice.
5. Test one compatibility approval, one mark-ready action, and one AI suggestion draft.
6. Merge the PR and close master audit #992 with the final flow index and phase references.
