# Phase 15 connected lifecycle validation

Run ID: `QA-20260823-P15`

## Outcome

The Fleet request synchronized to Shop immediately, but two independent Sev-2
handoff defects blocked advisor intake before a work order could be created.
Both failed conversions were atomic: the request stayed open, its work-order
link stayed empty, and the source request produced zero work orders.

This change repairs the Fleet-to-Shop boundary without rewriting ambiguous
legacy ownership:

- new service requests reject units whose vehicle owner differs from the Fleet
  billing customer;
- legacy-invalid requests fail closed at the work-order customer/vehicle guard;
- Fleet `diagnostic` request lines translate to Shop's canonical `diagnosis`
  job type;
- request and conversion routes return safe product errors instead of database
  messages, constraint names, or record identifiers;
- clean replay exercises valid conversion, retry idempotency, invalid request
  rejection, and atomic rejection of a legacy-invalid request.

## Live coverage

| Transition | Evidence | Result |
| --- | --- | --- |
| Fleet request using legacy-invalid unit | Appeared once in Fleet and once in Shop intake | Pass sync; intake blocked |
| Shop accepts legacy-invalid request | Customer/vehicle ownership invariant rejected the write | Pass atomicity; fail UX and source validation |
| Fleet request using canonical Fleet-owned unit | Appeared once in Fleet and once in Shop intake | Pass |
| Shop accepts canonical request | Work-order line job-type constraint rejected `diagnostic` | Pass atomicity; fail conversion |
| Post-failure database state | Both requests remained open with no work-order link; zero source work orders | Pass |
| Inspection through Field/offline variations | Requires a successfully converted work order | Blocked pending deployment |
| Quote, approval, Parts, labor, QC, invoice, sandbox payment, closure, Portal/Fleet history | Requires a successfully converted work order | Blocked pending deployment |

The valid request remains the post-deployment continuation fixture:
`QA-20260823-P15-valid intermittent brake vibration`.

## Defects

### P15-001 — Fleet request accepts a unit owned by another customer

- Severity: Sev-2
- Product/role: Fleet manager to Shop advisor intake
- Prerequisite: an active legacy Fleet enrollment whose vehicle customer does
  not match the Fleet billing customer
- Reproduction:
  1. Open Fleet request builder.
  2. Select the legacy-invalid active unit.
  3. Add a diagnostic concern and send it to the advisor.
  4. Open Shop Fleet Request Inbox and accept the request.
- Expected: invalid ownership is rejected before request submission, or Shop
  intake provides a safe actionable remediation without partial data.
- Actual: Fleet accepts the request; Shop conversion fails and displays raw
  work-order, customer, and vehicle identifiers.
- Data impact: no partial work order was committed, but the invalid request is
  stranded in the intake queue and exposes internal identifiers.
- Suspected root cause: enrollment hardening protects new enrollments, while
  request creation trusted every active legacy enrollment and the production
  work-order invariant was absent from migration history.
- Likely modules: Fleet request creation RPC, Fleet-to-Shop conversion RPC,
  request-builder submit route, conversion route.
- Fix: enforce ownership at request insertion, reconcile the work-order
  invariant into a forward migration, sanitize known and unknown RPC errors.
- Regression scope: new request, PM/pre-trip request creation, copied legacy
  request, retry, cross-shop scope, conversion atomicity, Fleet and Shop lists.

### P15-002 — Fleet diagnostic lines violate the Shop job-type contract

- Severity: Sev-2
- Product/role: Shop advisor Fleet intake
- Prerequisite: a valid Fleet-owned unit with a diagnostic request line
- Reproduction:
  1. Submit a diagnostic request for a canonical Fleet-owned unit.
  2. Open Shop Fleet Request Inbox.
  3. Accept the request.
- Expected: one work order and one diagnosis line are created and linked.
- Actual: the conversion writes `diagnostic`; Shop accepts `diagnosis`, so the
  transaction fails and the constraint name is shown in the UI.
- Data impact: no partial work order was committed; the request remains open.
- Suspected root cause: the converter copied the Fleet line-kind vocabulary
  directly instead of translating to the Shop job-type vocabulary.
- Likely module: `convert_fleet_service_request_to_work_order_atomic`.
- Fix: translate `diagnostic` to `diagnosis` at the canonical handoff boundary;
  keep route errors non-disclosing.
- Regression scope: diagnostic, menu, inspection, PM-package and custom lines;
  first conversion and replay; request/work-order line linkage.

## Automated verification

- Focused Vitest: 34 passed.
- TypeScript: passed.
- Focused ESLint: zero errors and zero warnings.
- Full ESLint: zero errors; 231 pre-existing warnings.
- Full Vitest: 2,900 passed, 47 failed, 2 skipped. All 47 failures are existing
  CRLF-sensitive source/SQL string assertions; no Phase 15 test failed.
- Clean database runtime: committed to the existing required Supabase clean
  replay workflow; local Docker/Supabase tooling is unavailable, so CI is the
  execution gate.

## Deployment and continuation gate

Do not retry Shop intake until the forward migration and route deployment are
live. After deployment, accept the existing valid request and continue the same
record through inspection, quote decision, Parts, labor, QC, invoice, sandbox
payment, closure, Portal/Fleet history, Field, and offline/reconnect checks.

## Cleanup

Two prefixed synthetic requests remain open as regression evidence. No hard
delete or ownership rewrite was performed. Archive/cancel them through the
normal product lifecycle after post-deployment verification.
