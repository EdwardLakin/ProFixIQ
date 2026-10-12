# ProFixIQ Feedback Control

## Purpose

Feedback Control replaces the retired external engineering-request agent with a lightweight, product-management feedback loop inside the main ProFixIQ application.

Customer submissions are captured from the shared application shell, organized into product themes, and reviewed in `/ops/feedback`. Submitting feedback never creates a GitHub branch, pull request, code change, or deployment.

## Product surfaces

The shared intake classifies feedback across:

- Shop
- Fleet
- Field
- Equipment
- Mobile
- Customer Portal
- Ops

The current route is captured automatically and users can add structured bug details and screenshots.

## Triage

A small fast-model call may:

- summarize the report,
- classify feedback type and product surface,
- identify strong duplicate/theme matches,
- assess urgency for bugs,
- recommend a product-management action.

The call is budget governed and capped at 350 output tokens. A deterministic fallback keeps intake available when AI is unavailable or budget-restricted.

Frequency, unique-user counts, and unique-shop counts are measured from stored submissions; they are not AI estimates.

## Lifecycle

Feedback themes move through:

`New -> Reviewing -> Planned -> In Progress -> Completed`

A theme can also be marked `Declined`.

Ops can add internal notes, flag or clear attention, inspect original submissions and screenshots, and optionally notify requesters when a completed item ships.

## Notifications

The Ops owner is emailed when:

- a new feedback theme is created,
- an existing theme escalates to needs-attention,
- a theme crosses configured report/shop frequency milestones.

When an item is marked Completed, Ops can send a short completion email to the users who submitted feedback in that cluster.

## Compatibility storage

Existing `agent_requests` rows are retained as the durable compatibility ledger so historical reports are not lost and no destructive production-data migration is required. Product lifecycle metadata is stored under `normalized_json.feedback`.

The established private `agent_uploads` bucket is also retained for existing screenshot data. Feedback Control exposes screenshots through owner-only, short-lived signed URLs.

These physical compatibility names do not dispatch work to an engineering agent.

## Retired engineering-agent boundary

The external autonomous engineering request/fix system has been retired from ProFixIQ. Removed runtime responsibilities include:

- request dispatch to the external engineering organization,
- engineering case synchronization,
- branch / PR approval and retry control,
- external Agent API secret bridge,
- human approval proof callback,
- engineering-agent AI-usage callback,
- Agent Control UI and its release-health dependency.

Legacy `/agent` and `/ops/agent-control` bookmarks redirect to Feedback Control.

## Explicitly preserved AI

This retirement does **not** remove or replace:

- the ProFixIQ Assistant,
- internal Ops planning workflows,
- Technician CoPilot,
- inspection voice AI,
- onboarding/import AI,
- other product AI capabilities.

Those systems have separate responsibilities and remain in place.
