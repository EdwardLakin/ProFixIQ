# Stripe webhook operations

## Canonical endpoint

Register exactly one production Stripe webhook destination for ProFixIQ:

`https://<production-domain>/api/stripe/webhook`

The older `/api/stripe/checkout/webhook` route is a temporary compatibility alias that delegates to the same canonical handler. Do not register both URLs in Stripe. Remove the legacy registration only after confirming Stripe delivery history no longer targets it; the application alias may remain during that controlled migration.

## Delivery behavior

- Stripe signatures are verified from the raw request body before persistence or side effects.
- Every verified Stripe event ID is durably claimed before processing.
- Completed event IDs return success on replay without repeating side effects.
- Concurrent deliveries receive a retryable non-success response until the active claim completes, preventing an abandoned lease from being acknowledged as processed.
- Failed claims are retryable, and abandoned processing claims become retryable after the lease expires.
- Subscription events retrieve the current Stripe subscription and apply it through a monotonic database watermark, so an older delivery cannot replace a newer canonical billing state.

## Dashboard verification

In Stripe Workbench or Developers > Webhooks:

1. Confirm the production destination URL ends in `/api/stripe/webhook`.
2. Confirm `/api/stripe/checkout/webhook` is not also registered.
3. Confirm the destination listens only for the event types handled by `features/stripe/api/stripe/webhook/route.ts`.
4. Replay one recent test-mode event twice and confirm both deliveries receive HTTP 200 while only one receipt attempt is processed.

Changing Stripe dashboard configuration is a manual production action and is not performed by repository migrations.
