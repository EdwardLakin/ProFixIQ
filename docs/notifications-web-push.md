# Shared notifications and Web Push

Product-neutral platform (Equipment, Shop Mobile, Field). Standard Web Push over
the browser's own push service with VAPID; no paid provider.

## Producer API
`createNotification()` in `features/notifications/server/notificationStore.ts`.
Callers pass shop, recipient profile, `eventType`, a stable `dedupeKey`, in-app
title/body, and a relative `targetPath`. The recipient must belong to the shop;
repeats with the same `(recipient, dedupeKey)` create nothing and queue no push.

## Data (service-role only; no authenticated/anon grants)
- `app_notifications` — in-app record; `acknowledged_at` is set by the recipient
  (`POST /api/notifications/[id]/ack`) and is independent of push delivery.
- `app_push_subscriptions` — one row per device endpoint, owned by one user at a
  time (a new sign-in on the device takes it over); revoked on disable, sign-out
  (browser-side drop), or push-service 404/410.
- `app_notification_push_deliveries` — per device status with attempts/backoff
  (60s, 5m, 30m, 2h; max 5). Leased via `claim_app_push_deliveries` (`SKIP LOCKED`).
  Re-validated at send time: reassigned user, other shop, revoked device,
  acknowledged or expired notification => `suppressed`.

## Privacy
Push payloads are always generic ("ProFixIQ — You have a new update"). Details load
in-app after the target path is opened and re-authorized.

## Operations
- Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:ops@…`);
  generate with `npx web-push generate-vapid-keys`. Unset => push reports
  unsupported and the worker no-ops; in-app records still work.
- Worker: `/api/internal/push-deliveries` (cron every minute, internal secret).
- Users opt in per device from the notification menu. iPhone/iPad require the
  installed Home Screen app.

## Not included
Event producers (dispatch, parts ready, approvals), the unacknowledged-dispatch
reminder, and customer notifications are separate work.
