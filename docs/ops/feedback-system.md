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

## Reliability and access boundary

All intake inserts, duplicate target revalidation, historical promotion, severity
aggregation, measured count changes, and owner alert events commit in one
`submit_feedback` transaction. Reporter identity comes from authenticated staff
or verified Customer Portal access. Portal users keep `reporter_id` null (the
legacy profile FK remains intact); the authenticated user is retained in
`normalized_json.reporterAuthId`. A unique index and operation lock enforce one
receipt per authenticated user and submission key.

The browser retains a versioned, user-scoped draft and immutable pending payload
until it receives a confirmed receipt. Reloading or reopening retries that same
operation. The payload contains its uploaded screenshot paths, so retries do not
re-upload screenshots. File blobs for an unsent draft require re-selection after
a reload.

Ops lifecycle writes use `update_feedback` with the displayed row version and
lock the canonical row before changing the entire cluster atomically. Stale
edits receive a conflict; they never partially change member statuses.

Owner milestones and per-requester completion delivery use fenced notification
reservations. Pre-dispatch reservations expire after five minutes. A crash or
uncertain response after dispatch is shown as an unconfirmed outcome; Ops can
explicitly resend with a possible duplicate disclosed. Successful and permanently
unreachable recipients retain receipts; ordinary retry sends only unsettled
recipients. Owner alerts remain durable and retryable from Ops even when the
original submission invocation ends. Requester emails contain generic product
text, never another shop's canonical report or internal notes.

The approved ledger restriction removes browser-role access to `agent_requests`.
Authenticated reporters use the verified submission route; only the Ops operator
can read or mutate feedback through privileged server routes. Existing rows,
foreign keys, enums, policies and triggers are preserved. Other product AI does
not use this retired engineering-request table.

## Staged rollout for PR 1854

1. Apply `20261012201500_feedback_submission_idempotency` and
   `20261013000132_feedback_atomic_control` after final schema and clean-replay
   validation. These expand the schema and preserve the currently deployed agent
   routes' permissions.
2. Merge PR 1854 and verify the production deployment uses its native Feedback
   Control routes. The new mutation RPCs fail closed while browser ledger access
   is still enabled; Ops health reports the pending restriction.
3. Apply `20261013001520_feedback_ledger_lockdown` only after that deployment.
   Verify `feedback_ready()` is true and browser-role table/RPC denial. This is
   the approved contract phase. Applying it before the native app is deployed
   would break the old authenticated engineering-request routes.
4. Verify main/production migration parity and run security/performance advisors.

Rollback of the app alone after the contract phase requires an explicitly
reviewed forward permission repair; do not silently restore the old browser
access. No historical reports or screenshots are deleted by this rollout.
