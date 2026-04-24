# AI stale expiration cron

## Purpose
This scheduled job calls the internal stale-expiration route to expire stale canonical AI substrate records (`ai_recommendations`, `ai_action_previews`, `ai_action_approvals`) that are already eligible for expiration.

## Scheduler configuration
- Provider: Vercel Cron
- Route: `/api/internal/ai/expire-stale`
- Schedule: `17 3 * * *` (daily at 03:17 UTC)
- Method: `GET`

## Authorization model
- The route remains internal-only.
- Allowed auth patterns:
  - `x-internal-cron-secret: <INTERNAL_CRON_SECRET>`
  - `Authorization: Bearer <INTERNAL_CRON_SECRET>`
- Required env var names:
  - `INTERNAL_CRON_SECRET`
  - `CRON_SECRET` (set to the same value as `INTERNAL_CRON_SECRET` so Vercel Cron's bearer token is accepted)

## Behavior
- Scheduled `GET` runs expiration with:
  - `dryRun: false`
  - `limit: 100` (bounded)
- Manual `POST` remains available for controlled operations and defaults to `dryRun: true` when omitted.

## Manual invocation examples
Dry run (POST):

```bash
curl -X POST "https://<your-domain>/api/internal/ai/expire-stale" \
  -H "content-type: application/json" \
  -H "x-internal-cron-secret: <INTERNAL_CRON_SECRET>" \
  -d '{"dryRun":true,"limit":25}'
```

Execute expiration (POST):

```bash
curl -X POST "https://<your-domain>/api/internal/ai/expire-stale" \
  -H "content-type: application/json" \
  -H "x-internal-cron-secret: <INTERNAL_CRON_SECRET>" \
  -d '{"dryRun":false,"limit":100}'
```

## Safety notes
- Expires stale canonical AI substrate status only.
- No autonomous execution.
- No preview execution.
- No action approval execution.
- No customer/staff/vendor messaging.
- No invoice sending or parts ordering.
- No work-order, assignment, schedule, or Shop Boost mutation.
- Response returns safe summary counts only (no raw evidence or payload exposure).
