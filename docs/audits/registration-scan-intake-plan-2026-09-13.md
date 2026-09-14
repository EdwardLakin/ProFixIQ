# Registration Scan + Smart Intake — Audit Refresh & Implementation Plan

Date: 2026-09-13
Supersedes/refreshes: `docs/audits/smart-intake-scanner-integration-audit-2026-07-22.md`
(kept for its Phase 3-5 design; do not re-derive the sections restated here).

## What was asked

Add a document-scan entry point to the desktop **Create Work Order** page
that extracts customer/vehicle info from a registration photo, prefills the
form, and saves the registration to the customer/vehicle profile. The
existing "Documents" upload on that page is nested in a collapsed
attachments panel and does no extraction.

The prior audit recommended against a standalone scanner and instead laid
out a phased "Smart Intake" roadmap. This document re-verifies that audit
against the current code (7 weeks later), records what was implemented in
this session, and gives the concrete remaining plan.

## Original audit findings: still true / already changed

Re-checked every claim against current `main`-branch code before writing
any code:

| Finding | Status |
|---|---|
| Desktop "Documents" upload is nested, non-extracting | **Confirmed** — `features/work-orders/app/work-orders/create/page.tsx`, inside a collapsed `<details>` "Attachments & internal notes" panel; a raw `<input type="file">` with no OCR call. |
| `AppIntakeScreen` "Save" only PUTs a draft, never POSTs/materializes | **Confirmed** — `features/work-orders/intake/screens/AppIntakeScreen.tsx` calls `props.onSave`; `IntakeRouteClient.tsx`'s `onSave` only calls `saveDraft` (PUT). |
| Response contract mismatch (`inserted` vs `createdLines`) | **Confirmed and fixed this session** — see below. |
| No app/portal authorization guard on the intake route, only fleet | **Confirmed and fixed this session** — see below. |
| Attachments in the canonical questionnaire are a disabled placeholder | **Confirmed, unchanged** — `AttachmentsBlock.tsx` renders a disabled button. Not required for Quick Scan (see "Why this didn't block Quick Scan" below). |
| Legacy `/portal/request/build` intake still separate from canonical `IntakeV1` | **Confirmed, unchanged.** |
| Description-based line idempotency | **Confirmed, unchanged** (needs a schema migration — see Phase 0 remaining). |
| An unused, dead `mergeFromOcr.ts` + a working-but-unwired `/api/ocr/registration` vision endpoint already existed | **Confirmed.** `features/work-orders/state/mergeFromOcr.ts` has zero importers. `app/api/ocr/registration/route.ts` is a real GPT-vision extractor, previously only reachable from an internal `/app/agent/planner` experimental tool. This session's Quick Scan reuses that endpoint directly instead of building a second one. |

## Why Quick Scan didn't need to wait for the full roadmap

The original audit assumed a scanner would feed the same `IntakeV1`
questionnaire/materialization system used by app/portal/fleet — which does
have real reliability and auth gaps. On closer reading, the desktop create
page's customer/vehicle **create/dedupe** path (`ensureCustomer`,
`ensureVehicleRow` in `create/page.tsx`) is a *separate*, already-robust
subsystem: shop-scoped, VIN/plate duplicate-checked, cross-customer-VIN
guarded, used today by the manual form and the existing "Scan VIN" button.

**Quick Scan writes through that same path.** It does not touch
`IntakeV1`/`work_order_lines` materialization at all. So the "required
hardening before scanner integration" list only actually gates **Smart
Intake** (Phase 3), not Quick Scan (Phase 1-2). This plan implements
Quick Scan now, and separately hardens the `IntakeV1` route (Phase 0)
since it's real, pre-existing risk independent of scanning.

## Implemented this session

### Quick Scan (audit Phase 1 + 2, scoped to desktop create-work-order)

New shared capture layer (reusable by mobile/portal later, per the
original audit's "one engine, two entry points" design):

- `features/work-orders/intake/capture/types.ts` — `IntakeCaptureV1`
  contract (trimmed to what's populated today: customer + vehicle fields,
  source, warnings).
- `features/work-orders/intake/capture/scanRegistration.ts` — calls the
  existing `/api/ocr/registration` directly as multipart form data (no
  throwaway storage upload just to run OCR), normalizes/validates the VIN,
  and flags when nothing readable came back.
- `features/work-orders/intake/capture/resolveVehicleCaptureMatch.ts` —
  thin, informational wrapper around the existing
  `features/shared/lib/vehicles/duplicateCheck.ts` used to preview "this
  looks like an existing vehicle" before apply. The *authoritative* dedupe
  still happens at save time in `ensureVehicleRow` — unchanged.

New UI:

- `features/vehicles/components/RegistrationScanModal.tsx` — "Scan
  Registration" trigger (sits next to the existing "Scan VIN" button).
  Captures/chooses a photo, calls the capture layer, then shows a
  **per-field review checklist** before anything is applied: every
  extracted field defaults to checked, *except* one that already has a
  different value in the form (shown unchecked, with the current value
  visible) — so a scan can never silently overwrite a value the advisor
  already typed. This directly satisfies the original audit's "manual
  safety" acceptance criterion without needing the full resolver/session
  system built for multi-surface Smart Intake.

Wiring (`features/work-orders/app/work-orders/create/page.tsx`):

- Applies only the checked fields into the existing `customer`/`vehicle`
  draft state (same state the manual form and "Scan VIN" already write
  to) — no parallel form, no new state shape.
- Stores the captured photo and uploads it to the vehicle's document
  record (`vehicle_media`, bucket `vehicle-docs`) as soon as the
  vehicle is resolved (on "Save & add work" / "Create work order"), not
  gated behind full work-order submission. This is the "save the
  registration to the customer/vehicle profile" part of the request.

Shared upload helper (extracted, not duplicated):

- `features/vehicles/lib/vehicleMediaUpload.ts` — the storage-path
  convention and `vehicle_media` insert that already existed inline in
  `uploadVehicleFiles`'s `upOne` closure, pulled out so the registration
  scan flow and the existing photo/doc attachments both go through one
  implementation.

`vehicle_media.type` has a DB check constraint limited to `'photo' |
'document'` (`supabase/migrations/20260705000000_public_schema_baseline.sql`).
The scanned registration is stored as `type: "document"` with a
`"Registration - <filename>"` label rather than adding a new type value —
it shows up wherever vehicle documents already appear today (e.g.
`features/customers/app/customers/[id]/page.tsx`), no migration needed.

Tests added: `tests/work-orders/create-work-order-registration-scan.test.ts`.
Existing `tests/vehicle-media-bucket-provisioning.test.ts` updated for the
extracted upload helper (same behavior, moved implementation).

### Phase 0 (canonical `IntakeV1` route hardening) — partial

Independent of Quick Scan, but explicitly called out as required before
Smart Intake (Phase 3) can safely exist. Fixed in
`app/api/work-orders/[id]/intake/route.ts`:

1. **Missing app/portal authorization.** GET/PUT/POST previously checked
   *only* `auth.getUser()` for app and portal modes — any authenticated
   user could read or write **any shop's** work-order intake by guessing a
   work-order id and passing `?mode=app`, and any authenticated portal
   user could do the same for `?mode=portal` regardless of whose work
   order it was. Added `authorizeIntakeAccess()`:
   - `app`: `requireShopScopedApiAccess` (role in `ROLE_GROUPS.workOrderManagers`)
     + the caller's `shop_id` must equal the work order's `shop_id`.
   - `portal`: `requirePortalCustomerActor` + the authenticated customer's
     id must equal the work order's `customer_id`.
   - `fleet`: unchanged (`requireFleetIntakeAccess`, already existed).
2. **Unverified subject IDs.** A submitted `intake.subject.customer_id`/
   `vehicle_id` was written and used for line materialization without any
   check that it matched the work order being acted on. Added
   `verifyIntakeSubjectScope()`: rejects (403) an attempt to move the
   customer, and rejects a `vehicle_id` that doesn't belong to the work
   order's customer. Applied to PUT and POST.
3. **Response contract mismatch.** The route returned `{ inserted }`; the
   desktop quick-intake caller
   (`saveIntakeAndCreateDiagnosticLine` in `create/page.tsx`) reads
   `json.createdLines`, which was always `undefined` — so the "N suggested
   lines created" toast never fired even when lines were created. Now
   returns both `inserted` and `createdLines` (same value).

Tests added: `tests/work-order-intake-access-guards.test.ts` (11 cases,
runtime-mocked, covering both new guard functions plus source-level
wiring assertions that GET/PUT/POST actually call them).

Verification for everything in this session: `pnpm run typecheck` (clean),
`eslint` on changed files (0 errors/warnings), full `vitest run`
(3957/3959 passing, 2 pre-existing skips, 0 regressions).

## Not done this session — remaining plan

### Phase 0 remainder (canonical intake route/screens)

Still open, in priority order:

1. **Internal app "Save" should offer an explicit submit/materialize
   action**, not only a draft PUT. Today `AppIntakeScreen`'s only button is
   labeled "Save intake" and calls the PUT-only path by design (see the
   `// app saves rather than submits` comment in
   `AppIntakeScreen.tsx`) — an internal advisor can fully fill out the
   questionnaire and have zero lines created. This is a **product
   decision**, not a pure bug fix (should saving from the app screen
   always also materialize lines, or should there be a separate "Complete
   intake" step distinct from "save my progress"?) — flagging for
   deliberate sign-off rather than silently changing screen behavior.
2. **Draft-save debounce + ordering.** `IntakeRouteClient.saveDraft` is
   called on every keystroke-level `onChange` with no debounce and no
   revision/sequence check, so a slower earlier PUT can overwrite a later
   one. Needs a client-side debounce (~500ms) plus either a monotonic
   revision counter ignored-if-stale on the server, or a `updated_at`
   compare-and-swap.
3. **Durable line idempotency.** Current dedupe is
   lowercased-description matching in the POST handler. Needs a schema
   migration (proposed, not yet written):
   ```sql
   alter table work_order_lines add column intake_source_key text;
   alter table work_order_lines add column intake_revision integer;
   create unique index work_order_lines_intake_source_key_idx
     on work_order_lines (work_order_id, intake_source_key)
     where intake_source_key is not null;
   ```
   then `buildIntakeSuggestedLines` emits a stable key (e.g.
   `menu_item_id` when matched, else a hash of the normalized concern),
   and the POST handler upserts on that key instead of the description
   set. **This changes the DB schema — needs its own reviewed
   migration PR, not bundled here.**
4. **Legacy portal consolidation.** `app/portal/request/build/page.tsx`
   still parses `PORTAL INTAKE` notes and creates its own diagnostic line
   independently of `IntakeV1`. Retiring it in favor of the canonical
   portal intake screen is a portal-facing UX change that needs product
   sign-off on the transition (the original audit's Phase 4).
5. **Connect full questionnaire answers to line content.**
   `buildIntakeSuggestedLines` still surfaces only concern text; DTCs,
   warning indicators, duplication conditions, operating conditions, and
   authorization limits are collected but not written into the generated
   line's notes. Content work, not a correctness bug.

### Phase 3 — Smart Intake UX (app/portal/fleet, scanner-first)

Build the full "capture → resolve customer/vehicle → canonical
questionnaire → proposed lines → submit" flow described in the original
audit, on top of the `IntakeCaptureV1`/resolver primitives added this
session. Needs Phase 0 items 1-3 above finished first (that's the actual
gate — Smart Intake writes through `IntakeV1` materialization, Quick Scan
does not). Entry points: "Start Smart Intake" on app/mobile create,
customer portal request/appointment flow, existing portal "Complete
intake" CTA, fleet work-order intake.

### Phase 4 — Portal consolidation

Retire new writes to `PORTAL INTAKE` note blocks once the canonical portal
questionnaire is embedded in the request flow; keep old-notes parsing
read-only for history. Depends on Phase 3.

### Phase 5 — Advanced local vision

Lazy-loaded local OCR/document-classifier, offline-first capture, plate
and odometer reading. Not started; lowest priority, no user-facing
dependency on it today.

## Suggested next PR

Phase 0 item 2 (draft debounce) is the next highest-value, lowest-risk
follow-up — it's a pure client-side fix with no schema change and no
product-facing behavior decision needed. Item 3 (idempotency) needs a
migration PR reviewed on its own. Item 1 (app "Save" semantics) needs a
product decision before any code changes.
