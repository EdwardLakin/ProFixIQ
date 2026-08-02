# Operational Observability P0–P4 Implementation Result

## Intended outcome

Give ProFixIQ one tenant-safe, append-only operational event stream that can support timelines, AI context, regression validation and the future shop simulator without replacing canonical business records or blocking technician work.

## P0 — Foundation and safety

- Added `public.operational_events` as the canonical append-only event stream.
- Added `public.operational_event_failures` as a durable non-blocking failure sink.
- Added same-shop owner/admin/manager RLS for observability reads.
- Revoked anonymous access and authenticated client mutation access.
- Replaced `unified_events` with a `security_invoker` compatibility view over the canonical stream.
- Removed the legacy work-order-line AI trigger that silently discarded invalid event types.
- Isolated failure-notification errors so they cannot roll back the durable failure record.
- Preserved acknowledged incident state across repeated monitor runs.

## P1 — Canonical event contract

The event model includes:

- shop, event type and occurred time
- actor and actor role
- entity and parent entity
- correlation and causation IDs
- idempotency key
- source, severity and schema version
- safe structured metadata

The authoritative work-order ID is used as the correlation ID whenever available.

## P2 — Workflow coverage

Initial capture covers:

- work orders and work-order lines
- inspections and findings
- estimate and quote-line transitions
- parts requests, purchase orders, work-order parts and dispositions
- technician labor segments and daily punch events
- payroll entries
- invoices, invoice versions and payments
- bookings
- fleet service requests
- portal notifications
- conversations and messages
- AI action events

A dedicated forward migration resolves workforce punch identity from either `profile_id` or auth `user_id` without modifying punch records.

## P3 — UI

- Added `/dashboard/operations/observability` for owner/admin/manager roles.
- Added pipeline status, domain coverage, searchable events, failure review, event mix and AI health.
- Added record and correlation filters.
- Added a role-gated work-order timeline dock.
- Added direct links from timeline entries back to authoritative records.

## P4 — Monitoring and notifications

- Added an hourly internal health route protected by `INTERNAL_CRON_SECRET`.
- Added a service-role-only combined operational and AI health projection.
- Added internal alerts for:
  - event pipeline stalls
  - durable event-write failures
  - material event-volume drops while work continues
  - AI expiration processing failures
- Added a server-gated health banner above Shop Operations for owner/admin/manager roles.
- Business workflows remain available if telemetry or alert delivery fails.

## Verification included

- migration contract coverage
- route authorization and safe response coverage
- event domain, health and record-link helper coverage
- alert threshold coverage
- UI/navigation/cron contract coverage
- generated TypeScript syntax transpilation for the new server services and routes

## Not performed

- No production migration was run.
- No production data was modified.
- No deployment was triggered.
- No pull request was merged.

## Required post-migration verification

Apply the forward migrations to an isolated test database, regenerate Supabase types, run the repository suite, execute the role-based smoke checklist in `docs/ops/operational-observability.md`, and run Supabase security/performance advisors before requesting production migration approval.
