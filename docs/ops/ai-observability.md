# AI Observability (Operations)

## Purpose

AI observability provides owner/admin/manager visibility into AI review-layer health without exposing raw evidence, mutation payloads, PIN references, or secrets.

## Metrics surfaced

- **Recommendations**
  - Active, open, acknowledged, dismissed, resolved, expired
  - Stale backlog and high/critical-risk backlog
  - Needs-refresh count
  - Domain split (`work_orders`, `shop_boost`)
- **Action previews**
  - Total, ready, approval required, expired
  - Execution-blocked signal count (event-derived)
  - Domain and safe action-type breakdowns
- **Approvals**
  - Pending, approved, rejected
  - Owner PIN required count (boolean-derived only)
- **Expiration/Cron activity**
  - Last expiration event timestamp
  - Expiration counts in last 24 hours / 7 days for recommendations, previews, approvals
- **Events / errors**
  - Recent event counts by canonical event type
  - Error-like event counts (`*.blocked`, `*.failed`, owner-pin validation/missing)

## Cron health inference

`cronProbablyRunning` is inferred conservatively:

- `true` when an expiration event is observed in the recent health window
- `false` when stale/pending backlog exists but no expiration events are observed
- `unknown` when there is insufficient evidence to conclude either way

## Environment prerequisites

- Internal stale-expiration route enabled
- `INTERNAL_CRON_SECRET` configured for cron authentication
- Vercel cron configured to call stale expiration route on schedule

## If stale backlog grows

1. Confirm `/api/internal/ai/expire-stale` invocation frequency and auth headers.
2. Check observability widget for last expiration timestamp and error-like events.
3. Review AI event stream for blocked/failed patterns before taking action.
4. Verify app role/capability access for operators reviewing AI inbox/recommendations.

## Operational guardrails

- Do **not** start with direct DB mutation.
- Do **not** bypass approval/PIN controls.
- Keep response actions in canonical review flows (recommendations + approvals).
