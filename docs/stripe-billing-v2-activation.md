# Stripe billing v2 production activation

## Scope

This runbook activates the ProFixIQ commercial and Connect architecture introduced by PR #1284.

- ProFixIQ Complete: CAD/USD 299 monthly, 10 active staff users included.
- Additional active user: CAD/USD 50 monthly per user above 10.
- ProFixIQ Unlimited: CAD/USD 600 monthly.
- Shops are never feature-gated or blocked from adding staff.
- At 17 active users, reconciliation replaces base-plus-seats with Unlimited.
- Customer invoice payments are direct charges in the shop connected account.
- Stripe owns connected-account processing pricing and negative-balance liability.
- The default ProFixIQ transaction fee is 0 basis points.

## Live Stripe catalog

### Products

| Role | Product ID | Product name |
| --- | --- | --- |
| Base | `prod_V02eBDQQRWsf6l` | ProFixIQ Complete |
| Additional seat | `prod_V02eKyGJfw0bn1` | ProFixIQ Additional User |
| Unlimited | `prod_V02eDS4Krz7T4Y` | ProFixIQ Unlimited |

### Prices

| Role | Price ID | Lookup key | Default / option |
| --- | --- | --- | --- |
| Base | `price_1U02ZMITYwJQigUIzIpBpVyE` | `profixiq_base_monthly_v2` | CAD 299 / USD 299 |
| Additional seat | `price_1U02ZYITYwJQigUInUy1mRZL` | `profixiq_additional_seat_monthly_v2` | CAD 50 / USD 50 |
| Unlimited | `price_1U02ZlITYwJQigUIn5il2C7y` | `profixiq_unlimited_monthly_v2` | CAD 600 / USD 600 |

All prices are recurring monthly licensed prices, have exclusive tax behavior, and use the ProFixIQ SaaS tax code.

## Live discounts

| Program | Coupon | Public code | Terms |
| --- | --- | --- | --- |
| Founder | `profixiq_founder25_v2` | `FOUNDER25` | 25% forever; first subscription; 25 redemptions; new redemptions end 2026-12-31 |
| Beta | `profixiq_beta100_3m_v2` | `BETA3FREE` | 100% for 3 months; first subscription; 50 redemptions; new redemptions end 2026-12-31 |
| Extended beta | `profixiq_beta50_6m_v2` | `BETA50` | 50% for 6 months; first subscription; 50 redemptions; new redemptions end 2026-12-31 |
| Referral | `profixiq_referral100_once_v2` | `REFER1` | First invoice free; first subscription; 100 redemptions |
| Lifetime discount | `profixiq_lifetime50_v2` | None | 50% forever; manually assigned only |
| Lifetime access | `profixiq_lifetime100_v2` | None | 100% forever; manually assigned only |

Lifetime coupons must be assigned to a specific approved customer or subscription. Do not create reusable public promotion codes for them.

## Required production environment variables

```text
STRIPE_PRICE_BASE_MONTHLY=price_1U02ZMITYwJQigUIzIpBpVyE
STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY=price_1U02ZYITYwJQigUInUy1mRZL
STRIPE_PRICE_UNLIMITED_MONTHLY=price_1U02ZlITYwJQigUIn5il2C7y
STRIPE_TRIAL_DAYS=14
STRIPE_AUTOMATIC_TAX_ENABLED=true
STRIPE_CONNECT_WEBHOOK_SECRET=<secret from the connected-account webhook endpoint>
STRIPE_BILLING_RECONCILE_TOKEN=<random server-only secret>
INTERNAL_STRIPE_BILLING_RECONCILE_SECRET=<random server-only secret>
```

Existing variables retained:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CRON_SECRET
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Never expose any Stripe secret, webhook secret, service-role key, or reconciliation secret through a `NEXT_PUBLIC_` variable.

## Webhook endpoints

### Platform billing

URL:

```text
https://profixiq.com/api/stripe/webhook
```

Required events:

```text
account.updated
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
payment_intent.payment_failed
```

Use the Stripe API version configured by `features/stripe/lib/stripe/client.ts`.

### Connected shop payments

URL:

```text
https://profixiq.com/api/stripe/connect/webhook
```

Configure this endpoint for events on connected accounts and store its distinct signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.

Required events:

```text
checkout.session.completed
payment_intent.payment_failed
charge.refunded
charge.dispute.created
charge.dispute.closed
```

The Connect route verifies the connected-account signing secret before delegating the payload to the common idempotent event processor.

## Database migrations

Apply in repository order. The relevant additions are:

```text
20260802101450_restore_ai_action_events_substrate.sql
20260802170000_stripe_billing_model_connect_correction.sql
20260802170100_stripe_subscription_snapshot_v2.sql
```

After application:

1. Verify `shop_payment_settings` and `billing_discount_grants` have RLS enabled.
2. Verify direct client writes cannot change Stripe-owned fields on `shops`.
3. Verify each shop has a `billable_user_count` snapshot.
4. Verify subscription webhook snapshots can persist `stripe_pricing_model`.
5. Run Supabase security and performance advisors.

## Deployment sequence

1. Merge PR #1284 after every required workflow is green.
2. Apply the three migrations to production.
3. Configure the new price IDs and server-only reconciliation variables.
4. Deploy the production application.
5. Create/update both webhook endpoints and set the Connect signing secret.
6. Confirm the platform endpoint and Connect endpoint each return HTTP 2xx for signed test events.
7. Create one new shop subscription with a promotion code in Stripe test mode or a controlled internal live customer.
8. Onboard one controlled shop connected account.
9. Pay a small controlled invoice through the customer portal.
10. Verify the payment, connected account ID, application fee, invoice event, and work-order balance in ProFixIQ.

## Existing subscription migration

Do not bulk-switch subscriptions without a dry run.

For each existing ProFixIQ shop:

1. Run canonical billing reconciliation with `dry_run=true`.
2. Confirm the Stripe customer and subscription belong to exactly one shop.
3. Confirm the current subscription currency is supported by the v2 prices.
4. Confirm active staff count and target price:
   - 0–10 users: 299
   - 11–16 users: 299 + 50 per user above 10
   - 17+ users: 600 Unlimited
5. Apply the reconciliation.
6. Confirm increases invoice immediately and reductions do not create retroactive credits.
7. Confirm the shop record reports `base_plus_seats_v2` and no sync error.

## Legacy Connect migration

Existing legacy Express/destination connections remain payment-disabled by the new code and return `migration_required`.

For each legacy shop:

1. Confirm whether the existing account can be migrated to the explicit direct-charge controller configuration.
2. If it cannot, create a new full-dashboard connected account through ProFixIQ onboarding.
3. Complete KYC and payout setup.
4. Confirm charges and payouts are enabled.
5. Enable portal payments in `shop_payment_settings` only after the account reports the direct-charge model.
6. Never reuse destination-charge Checkout for the migrated shop.

## Rollback

- New catalog objects are additive. Deactivate new promotion codes or prices instead of deleting products used by subscriptions.
- Set `portal_payments_enabled=false` to stop new shop invoice Checkout sessions immediately.
- Disable the connected-account webhook endpoint if the Connect route is unhealthy.
- Set `stripe_billing_sync_required=false` only after documenting why reconciliation is paused.
- Do not revert a subscription to an old price without reviewing currency, discounts, prorations, and the active seat count.
