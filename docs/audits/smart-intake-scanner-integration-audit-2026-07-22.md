# Smart Intake + Scanner Integration Audit

Date: 2026-07-22

## Executive decision

ProFixIQ should not build a second scanner or a separate registration-import workflow.

The correct design is:

1. Keep one shared document/vehicle capture engine.
2. Give that engine two orchestrators:
   - **Quick Scan**: manually opened from customer/vehicle entry and returns only captured fields.
   - **Smart Intake**: begins with capture, resolves the customer and vehicle, then continues through the existing full intake questionnaire and line-generation flow.
3. Keep `IntakeV1` as the canonical questionnaire payload after a real customer and vehicle have been resolved.
4. Add a separate typed capture result for untrusted OCR/barcode output. Do not place unreviewed registration data directly into canonical customer, vehicle, or intake records.
5. Consolidate the three current line-materialization paths before expanding OCR.

This preserves the working manual customer/vehicle flow while making scanning an acceleration layer rather than a replacement.

---

## Current-state map

### 1. Canonical full intake questionnaire

Primary feature folder:

- `features/work-orders/intake/types.ts`
- `features/work-orders/intake/schema.zod.ts`
- `features/work-orders/intake/screens/*`
- `app/api/work-orders/[id]/intake/route.ts`

Supported modes:

- `app`
- `portal`
- `fleet`

The canonical `IntakeV1` payload already covers:

- customer and vehicle identity
- unit number, odometer, and engine hours
- primary/additional concern
- when the concern started and whether it happened before
- recent work
- duplication and operating conditions
- primary system and symptom types
- warning indicators and DTCs
- context and recent events
- diagnostic/repair authorization
- preferred contact method
- attachment references
- internal advisor/technician/template context

The route stores the payload in `work_orders.intake_json`, supports draft/submitted status, and can materialize suggested `work_order_lines`.

### 2. Canonical route pages

The same route client is exposed at:

- Internal app: `app/work-orders/[id]/intake/page.tsx`
- Customer portal: `app/portal/work-orders/[id]/intake/page.tsx`
- Fleet: `app/fleet/work-orders/[id]/intake/page.tsx`

The portal work-order viewer has an active **Complete intake** CTA. I did not find an equivalent mobile-specific intake route or a clear internal/fleet CTA in the reviewed entry points.

### 3. Desktop create-work-order quick intake

`features/work-orders/app/work-orders/create/page.tsx` contains a separate quick intake modal.

It collects only:

- concern
- details
- contact preference
- mileage

It writes a `PORTAL INTAKE` text block into `work_orders.notes`, builds a minimal `IntakeV1`, then calls the canonical intake POST endpoint.

This is not the full questionnaire.

### 4. Legacy portal request builder

`app/portal/request/build/page.tsx` contains another independent intake implementation.

It:

- stores concern/details/contact/mileage in `work_orders.notes`
- lets customers manually add menu lines, custom lines, and quote-only lines
- submits through `app/api/portal/request/submit/route.ts`
- creates a `[Portal Intake] Diagnostic` line from the notes block
- can create a parts request from submitted lines

This path does not use the canonical `IntakeV1` questionnaire for its intake data or line generation.

### 5. Current VIN scanner

The shared VIN scanner is available from desktop and mobile work-order creation and writes into the customer/vehicle draft state.

It is not integrated into:

- `PortalIntakeScreen`
- `AppIntakeScreen`
- `FleetIntakeScreen`
- the legacy portal request builder

It captures vehicle identity only. It has no registration/customer contract.

---

## Confirmed gaps

## A. Three intake systems can create different lines

There are currently three materially different paths:

1. Canonical full intake POST -> `buildIntakeSuggestedLines`
2. Desktop quick intake -> canonical POST with a minimal payload
3. Legacy portal submit -> direct `[Portal Intake] Diagnostic` insertion

They use different deduplication, notes, job types, menu matching, and source labels.

Result: the same customer concern can produce different work-order lines depending on where it was entered.

## B. Internal full intake does not currently create lines

`IntakeRouteClient` treats internal app save as a PUT draft save. It does not call the POST submit/materialization path used by portal and fleet.

The internal questionnaire can therefore be fully completed and saved without creating the intended work-order lines.

## C. Rich questionnaire answers are mostly discarded during line generation

`buildIntakeSuggestedLines` currently returns one line:

- the highest-scoring menu item, or
- one generic one-hour diagnostic fallback

Matching uses concern text, additional text, recent work, primary system, and symptom types.

The generated line does not meaningfully include:

- DTCs
- warning indicators
- duplication conditions
- speed/temperature/frequency
- operating conditions
- recent events/context
- authorization limits
- odometer or engine hours

The questionnaire is collecting technician-useful information, but much of it never reaches the line complaint/notes or materialization decision.

## D. The type is richer than the actual UI

Examples:

- Concern UI does not expose `started_at`, `happened_before`, or `recent_work`.
- Symptoms UI does not expose warning indicators or DTC entry.
- Context UI omits some typed fields and currently excludes `regen_event` from its rendered choices.
- Attachments are explicitly disabled placeholders.

## E. Draft saving is race-prone

The canonical screens call `onSaveDraft` on every state change. Text entry can generate overlapping PUT requests without debounce, revision checks, or ordered acknowledgements.

A slower earlier request can overwrite a later answer.

## F. Line idempotency is description-based

Canonical intake submission avoids duplicates by comparing lowercased descriptions.

That is fragile because:

- a description edit can create a duplicate
- two valid concerns can share a description
- resubmission can map to a different menu item
- there is no durable source key connecting a line to a specific intake suggestion

## G. API authorization needs explicit mode-specific guards

The canonical intake route has explicit fleet access handling, but the reviewed app/portal branches do not use the existing explicit shop/customer ownership helpers at the route boundary.

The route should not depend on RLS alone.

Required rules:

- `app`: authenticated staff, current shop, role/capability check, work order belongs to shop
- `portal`: authenticated portal actor, work order belongs to that customer, subject customer cannot change to another customer
- `fleet`: fleet membership/capability plus vehicle/fleet relationship

The submitted `subject.customer_id` and `subject.vehicle_id` must also be verified against the work order and shop before saving or creating lines.

## H. Response contract mismatch

The canonical POST route returns `inserted`, while the desktop create quick-intake caller reads `createdLines`.

The line may be created, but the success message cannot reliably report it.

## I. Quick intake prompt appears disconnected from the main submit path

The create page defines `maybeOpenIntakeAfterSave`, but the reviewed main create-and-continue path creates the work order, clears state, and routes to approval without calling it.

The quick modal exists, but the primary path does not clearly invoke it.

## J. Portal has two competing intake experiences

The customer can encounter:

- the canonical portal questionnaire from a work-order card, and
- the older request-builder intake form during appointment/request creation

Both write different data and create lines differently.

## K. Scanner evidence has nowhere canonical to go

`IntakeV1.attachments` is designed for references, but attachment upload is unavailable in the intake UI.

A registration or VIN-label image should be retained only as controlled evidence when the shop/customer chooses to keep it. It should not be embedded in `intake_json`.

## L. Registration data needs a review boundary

A registration can provide customer and vehicle data, but it is not authoritative proof that the person presenting it should replace the customer currently linked to a work order.

The system must never silently:

- move a VIN between customers
- overwrite an existing customer name/address
- replace current contact information with stale registration data
- create a duplicate customer because the phone number is absent

---

## Recommended shared capture contract

Add a feature-level contract separate from `IntakeV1`:

```ts
export type IntakeCaptureV1 = {
  version: "1.0";
  source:
    | "vin_label"
    | "vehicle_registration"
    | "license_plate"
    | "odometer"
    | "fleet_document"
    | "manual";
  capturedAt: string;
  customer: {
    firstName?: string | null;
    lastName?: string | null;
    businessName?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  vehicle: {
    vin?: string | null;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    licensePlate?: string | null;
    color?: string | null;
    unitNumber?: string | null;
    odometerKm?: number | null;
    engineHours?: number | null;
  } | null;
  confidence: Record<string, number>;
  warnings: string[];
  evidence?: {
    localPreviewUrl?: string | null;
    mediaId?: string | null;
    documentClass?: string | null;
  } | null;
};
```

Rules:

- OCR/barcode output remains a capture result until reviewed.
- Every populated field carries provenance/confidence.
- VIN must pass normalization and checksum/consensus rules where applicable.
- The result is applied only through a resolver.
- Raw OCR text and full registration images are not persisted by default.

---

## Resolver layer

Create one shared resolver used by desktop, mobile, portal, and fleet.

Suggested location:

- `features/work-orders/intake/capture/resolveIntakeCapture.ts`

Responsibilities:

1. Normalize VIN, plate, names, address, postal code, mileage, and year.
2. Search the current shop for existing vehicles by VIN first, then plate/unit.
3. Search customer candidates using existing links plus name/address/email/phone.
4. Return explicit outcomes:
   - exact existing customer + vehicle
   - existing vehicle with a different customer
   - possible customer matches
   - new customer + new vehicle
   - insufficient data
5. Require user confirmation before any create/update.
6. Preserve nonempty canonical values unless the user explicitly approves a replacement.
7. Apply the result to the existing customer/vehicle draft or existing work order.
8. Only then build/update `IntakeV1.subject` with canonical IDs.

The resolver should reuse the existing vehicle duplicate-check flow rather than create a second matching system.

---

## Two entry points, one engine

## 1. Quick Scan

Purpose: accelerate the existing manual customer/vehicle flow.

Entry points:

- Desktop Create Work Order customer/vehicle section
- Mobile Create Work Order customer/vehicle section
- Existing work-order vehicle/customer edit surface

Button label:

- **Scan vehicle or registration**

Behavior:

1. Open the shared capture surface.
2. Automatically classify VIN label vs registration vs plate/odometer.
3. Return `IntakeCaptureV1`.
4. Show a compact field review.
5. Resolve duplicates.
6. Apply accepted fields to the existing draft.
7. Return to the same manual form.

The user can ignore scanning and continue with the current fast manual entry exactly as today.

## 2. Smart Intake

Purpose: run the full end-to-end intake.

Entry points:

- **Start Smart Intake** on desktop/mobile work-order creation
- Customer portal request/appointment flow
- Existing portal work-order **Complete intake** CTA
- Fleet work-order intake

Behavior:

1. Start with document/vehicle capture or manual selection.
2. Resolve and confirm customer + vehicle.
3. Ask only for missing contact details, normally phone/email after registration capture.
4. Continue through the canonical questionnaire.
5. Allow concern photos/video/documents.
6. Show proposed work-order lines before final submission.
7. Materialize lines idempotently.
8. Continue to the existing approval/booking/work-order destination.

Quick Scan and Smart Intake must import the same capture component and resolver. They differ only in what happens after capture.

---

## Portal integration decision

The canonical portal questionnaire should become the single questionnaire.

The legacy `/portal/request/build` flow should not keep its own `PORTAL INTAKE` parser and diagnostic-line creator long term.

Recommended transition:

1. Preserve the existing booking and request navigation.
2. Replace the legacy four-field intake section with the canonical portal intake screen embedded in the request flow.
3. Keep menu item/custom/quote requests as a separate optional **Additional requests** step after canonical intake review.
4. Route all line creation through the canonical intake materializer.
5. Stop parsing `work_orders.notes` to determine the concern after migration.
6. Keep old notes parsing read-only for historical work orders.

For an existing portal customer:

- Registration scan confirms or proposes updates.
- It must not silently change the customer linked to the portal account.
- A VIN already attached to another customer becomes a shop-review item.

For a portal request where a work order already exists, no new session table is required for the first implementation.

A durable `intake_sessions` table should be considered later only if ProFixIQ needs pre-work-order, cross-device, resumable, or unauthenticated/invite-based intake before a work order exists.

---

## Canonical line materialization

Extract the POST logic into one server service, for example:

- `features/work-orders/intake/server/materializeIntake.ts`

All entry points call this service.

It should:

1. Verify actor, shop, work order, customer, and vehicle scope.
2. Parse/sanitize `IntakeV1`.
3. Build a complete technician summary.
4. Generate one or more proposed lines.
5. Allow the UI to review suggestions before insertion when appropriate.
6. Insert idempotently using a durable source key rather than description matching.
7. Attach menu item and inspection template IDs when matched.
8. Record which intake revision produced each line.
9. Never create parts requests from arbitrary complaint text.
10. Return one stable response contract:

```ts
{
  ok: true;
  intakeStatus: "submitted";
  insertedLines: number;
  existingLines: number;
  suggestions: IntakeSuggestedLine[];
}
```

### Suggested line source migration

A forward migration will likely be required for durable idempotency, for example:

- `work_order_lines.intake_source_key text null`
- `work_order_lines.intake_revision integer null`
- unique partial index on `(work_order_id, intake_source_key)` where the key is not null

Exact naming should be reconciled with any existing source/provenance columns before migration creation.

---

## Improve questionnaire-to-line output

The technician should receive the customer’s complete diagnostic story in the line complaint/notes.

Suggested complaint:

- customer’s primary and additional concern, preserved in their words

Suggested notes should include, when provided:

- primary system and symptom types
- DTCs and warning indicators
- can/cannot duplicate
- temperature, driving state, speed range, and frequency
- recent work and when it started
- operating environment
- tow/breakdown/jump-start/accident/regen context
- smoke, smells, sounds
- mileage and engine hours
- authorization and contact instructions

Menu matching should use those fields as signals, but AI/menu matching must remain advisory. The advisor/customer reviews proposed lines before they are committed when the match is not deterministic.

---

## Attachment and privacy model

Add real intake attachment upload using existing storage conventions and shop/customer authorization.

Document categories:

- registration
- VIN label
- odometer
- warning light/DTC display
- damage/concern photo
- concern video/audio
- fleet document

Privacy rules:

- Registration contains personal information.
- Do not retain the source image by default after fields are confirmed unless the user/shop explicitly chooses to attach it.
- Never persist raw OCR text containing unnecessary registration identifiers.
- Store only required normalized fields plus field-level provenance/confidence.
- Portal users can access only their own evidence.
- Staff access remains shop scoped.
- Provide a visible **Remove document after import** default.

---

## Required hardening before scanner integration

Phase 0 should be completed before a registration scanner can write customer or vehicle data.

1. Add explicit app/portal/fleet access guards to all intake route methods.
2. Verify intake subject IDs against the scoped work order.
3. Change internal app completion to POST/materialize rather than PUT-only.
4. Consolidate legacy portal and canonical line creation.
5. Fix the `inserted` vs `createdLines` response mismatch.
6. Debounce draft saves and add ordered revision handling.
7. Replace description-only idempotency.
8. Connect the full questionnaire fields to technician summaries and suggestions.
9. Enable intake attachments.
10. Add clear internal/mobile/fleet entry points.

---

## Implementation phases

## Phase 0 — Canonical intake reliability

No OCR model yet.

- route authorization and subject validation
- shared materializer
- app POST completion
- response contract repair
- line source idempotency
- draft debounce/revision
- full technician summary
- legacy portal adapter into canonical materialization
- tests for all modes

## Phase 1 — Shared capture adapter

- define `IntakeCaptureV1`
- create review UI
- create shop-scoped resolver
- integrate existing VIN capture
- support registration document classification/parsing
- support field-level confidence/provenance
- keep manual entry unchanged

## Phase 2 — Quick Scan UX

- desktop create page
- mobile create page
- existing work-order correction/edit surface
- duplicate review and safe apply

## Phase 3 — Smart Intake UX

- app, portal, and fleet canonical screens
- scanner-first optional start
- missing-contact step
- attachments
- proposed-line review
- one submit/materialization path

## Phase 4 — Portal consolidation

- embed canonical intake in portal request flow
- preserve additional menu/custom/quote request features
- retire new writes to `PORTAL INTAKE` note blocks
- retain historical parsing only

## Phase 5 — Advanced local vision

- lazy-loaded local OCR worker
- registration/VIN-label text consensus
- plate and odometer capture
- document classifier
- offline model/cache strategy
- performance and memory telemetry without storing document content

---

## Acceptance criteria

### Manual safety

- Existing manual customer/vehicle entry remains fully functional.
- Scanner failure never clears or replaces manual fields.
- Applying a scan modifies only explicitly accepted fields.

### Quick Scan

- VIN label or registration can prefill customer/vehicle draft fields.
- Existing customer/vehicle matches are shown before creation.
- A VIN cannot be silently moved between customers.
- Missing phone/email is clearly requested after registration capture.

### Smart Intake

- Same questionnaire schema is used by app, mobile, portal, and fleet.
- Draft answers survive refresh and do not regress due to save races.
- Full questionnaire data appears in the technician-facing line story.
- Suggested lines are idempotent across resubmission.
- App, portal, and fleet create the same canonical result for equivalent answers.

### Portal

- Portal actor can access only owned work orders/intakes.
- Registration scan cannot overwrite another customer.
- Legacy request flow does not create a second diagnostic line.

### Offline/mobile

- Camera opens immediately.
- OCR loads lazily.
- Manual path remains available before OCR is ready.
- Captured draft survives app suspension.
- No source registration image is uploaded without explicit retention/attachment consent.

---

## Final recommendation

Build **one Smart Intake system**, not separate VIN, registration, portal, and questionnaire products.

The existing `IntakeV1` questionnaire is the correct canonical center, but it must first become the only line-materialization path. The scanner should feed a reviewed capture result into customer/vehicle resolution, then hand off to that questionnaire.

The product should expose two experiences:

- **Scan vehicle or registration** for fast manual work-order creation.
- **Start Smart Intake** for the complete scanner + questionnaire + work-order-line flow.

Both experiences reuse the same capture engine, duplicate resolver, canonical intake schema, and materializer.