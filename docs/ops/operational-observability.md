# ProFixIQ Operational Observability

## Purpose

Operational observability records the important transitions that move a repair shop from intake through payment without replacing the operational tables that remain the source of truth.

The canonical event stream supports:

- owner/admin/manager timeline review
- AI operational context and summaries
- dashboard reconciliation
- workflow regression validation
- future shop simulation and truth-ledger comparisons
- diagnosis of retries, offline reconciliation, repeated actions and stalled workflows

Operational events describe what happened. They do not authorize a repair, change a work order, consume a part, alter payroll or replace technician judgment.

## Canonical event contract

`public.operational_events` is append-only and tenant-scoped.

Core fields:

- `shop_id`
- `event_type`
- `occurred_at`
- `actor_user_id` and `actor_role`
- `entity_type` and `entity_id`
- `parent_entity_type` and `parent_entity_id`
- `correlation_id`
- `causation_id`
- `idempotency_key`
- `source`
- `severity`
- `schema_version`
- safe structured `metadata`

The authoritative work order ID is used as the correlation ID whenever one is available. This allows inspection, quote, approval, parts, technician, invoice and payment events to be read as one visit timeline.

## Security model

- The event and failure tables have RLS enabled.
- Only same-shop owners, admins and managers may read the shop-wide stream.
- Authenticated clients cannot insert, update or delete canonical events.
- Anonymous access is revoked.
- The compatibility `unified_events` view uses `security_invoker = true` and relies on the canonical table's RLS.
- Event metadata intentionally excludes full database rows, customer messages, notes, repair narratives, payment details and secrets.
- Customer, fleet and technician interfaces do not receive shop-wide observability access.

Direct database and application-route authorization must both be tested before release.

## Non-blocking failure behavior

A telemetry failure must never erase or reject legitimate technician, advisor, parts or customer work.

The capture trigger therefore:

1. Attempts to append the operational event.
2. Records any failure in `public.operational_event_failures`.
3. Preserves the original business write.
4. Creates or refreshes an internal critical `assistant_notifications` item.
5. Resolves the alert after the affected event path succeeds and no unresolved event failures remain.

The failure sink stores error context, not the business record payload.

## Initial workflow coverage

The forward migration instruments:

- work orders and work-order lines
- inspections and inspection items
- estimate and quote-line activity
- parts requests and request items
- purchase orders and lines
- canonical work-order parts and disposition events
- technician labor segments and daily punch events
- payroll time entries
- invoices, invoice versions and payment events
- bookings
- fleet service requests
- portal notifications
- conversations and messages
- AI action events

The earlier `trg_work_order_lines_log_ai` trigger is removed because its invalid event type was silently discarded by the legacy `ai_events` constraint.

## Event naming

Event names use lowercase dotted paths, for example:

- `work_order.created`
- `work_order.status.in_progress`
- `work_order_line.assignment.changed`
- `inspection.status.completed`
- `quote_line.status.approved`
- `parts.request_item.status.received`
- `parts.disposition.returned`
- `workforce.job.started`
- `workforce.punch.clock_in`
- `invoice.version.status.issued`
- `invoice.payment.captured`

The event name identifies the transition. Metadata contains safe IDs and flags needed to connect related records.

## UI

Authorized users can open:

`/dashboard/operations/observability`

The workspace provides:

- pipeline status
- recent canonical event volume
- recent business-write comparison
- unresolved failure count
- workflow-domain coverage
- searchable event timeline
- direct record links
- event-type mix
- AI recommendation, approval and expiration health

The page reports `Migration required` until the forward migration is applied.

## Deployment order

1. Merge the code and migration only after review and CI pass.
2. Apply the migration to a disposable Supabase branch or isolated test project.
3. Regenerate Supabase TypeScript types.
4. Run database authorization tests for same-shop and cross-shop users.
5. Exercise one complete work-order workflow in the test environment.
6. Verify the event timeline and failure sink.
7. Run Supabase security and performance advisors.
8. Obtain explicit approval before applying the migration to production.
9. Apply the production migration.
10. Run the production smoke checklist using test records only.

## Required smoke test

1. Create a work order and confirm exactly one `work_order.created` event.
2. Update its lifecycle and confirm one semantic status event per transition.
3. Assign a technician and confirm the assignment event or `assignment_changed` metadata.
4. Complete an inspection and create a recommendation/quote line.
5. Send the quote and record approved, declined and deferred line decisions.
6. Move parts through request, quote, order, receipt, allocation, handoff and consumption.
7. Start and end technician labor and daily punches.
8. Complete cause/correction and the work-order lifecycle.
9. Finalize an invoice and record a payment event.
10. Confirm the entire sequence shares the work-order correlation ID.
11. Replay every idempotent action and confirm no duplicate operational event.
12. Force a capture failure in the test database and confirm the business action succeeds, the failure is durable and the internal alert appears.
13. Confirm owner/admin/manager same-shop access.
14. Confirm cross-shop access is denied through both the API and direct table/view calls.
15. Confirm advisor, parts, technician, customer and fleet roles cannot open the shop-wide observability workspace.
16. Verify the workspace on desktop, tablet and mobile.

## Simulator dependency

The simulator must not insert directly into `operational_events`.

It must use the same authoritative services and RPCs as the application. The resulting canonical events are evidence that the simulated workflow actually traversed production business rules. A separate simulator truth ledger can then compare expected totals with operational tables, dashboards and AI summaries.
