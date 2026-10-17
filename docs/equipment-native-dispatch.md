# Native Equipment Dispatch

Compatible integration at `/equipment/dispatch`; replaces its placeholder without
changing the canonical Shop/Field board or any command contract.

- Uses `getDispatchBoard` with the canonical default window (12 hours back,
  seven days ahead, plus unscheduled active visits). Filters the authenticated
  shop's Equipment identity index **before** search, status/asset filters and
  50-row pagination. Ordinary-vehicle visits never reach the view.
- Reuses the Equipment work-queue projection for active work choices, excluding
  estimates. Its existing asset/work scan limits remain explicitly partial.
  Jobsites are the selected work order customer's first 100 scoped addresses,
  with a truncation notice. No address creation is added.
- Preserves directory access, `canManageScheduling`, demo expiry and Equipment
  entitlement before privileged reads. Uses the session client for canonical
  scheduling, work-order identity and address reads; privileged participant
  reads are scoped to the shop and only the displayed Equipment visit IDs.
- Dispatch Now calls the existing `POST /api/equipment/dispatch` with a lead,
  optional supporting technicians/truck, jobsite and notes. It retains the
  service's approval, Field access, participant, notification and active-visit
  fences. No labor is started. Resource choices describe eligibility, never
  time availability.
- The actor may acknowledge only their own displayed participant assignment
  through the existing acknowledgement route; the command reauthorizes it.
  The existing Equipment Field entry also mounts personal pending receipts after
  its unchanged Field-access gate, so mechanics can acknowledge without gaining
  scheduling, directory, work-order or execution access. The personal projection
  returns only own visit ID, participant role and assignment timestamp, verifies
  active same-shop Equipment visits, and discloses its 5,000-receipt scan cap.
- Existing participant names come from scoped profile identity reads independent
  of the eligibility-filtered choices for new dispatches. Revoking Field
  eligibility does not hide who is still assigned or awaiting acknowledgement.
- Requests are persisted in tab-session storage under shop + actor before send.
  Uncertain/503 outcomes and same-tab reloads reuse the exact key and payload.
  A rejected retry retains the original uncertain request. No background or
  offline dispatch queue is added; closing the tab ends recovery storage.

## Deliberate limits

This slice does not create new field-call work orders, schedule future visits,
reassign/reschedule/cancel existing visits, or drive execution status. Those
controls are not implied by a create-visit command. Existing visits are shown
read-only except for personal acknowledgement. Field execution and the separate
Finish/last-technician-off/offline PR are unchanged.

Availability counts remain absent pending the owner's decision on job window,
duration and resource unit. No schema, RPC, role, grant, RLS, trigger, shared
workflow, environment or deployment configuration is changed. The new entry
uses the existing graphite/steel/amber light/dark workspace primitives.

## Validation and rollback

Targeted mocked fixture tests cover mixed products/tenants, filtering before
pagination, scheduling-role and entitlement denials, scoped reads, participant
selection, exact command payloads, retry/reload keys and acknowledgement wiring.
These are not live database, real-device or production validation. Run the
existing Equipment/dispatch preserved-flow suites, TypeScript, lint and local
Next build; require applicable exact-head CI and clean Codex review before merge.

Rollback is reverting this application-only PR. No database or manual deployment
operation is required.
