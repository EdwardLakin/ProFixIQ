# Phase 1 financial foundation rollout

## Required owner step

Run the Supabase migrations in filename order:

1. `20260714013000_phase1_financial_foundation.sql`
2. `20260714013100_phase1_financial_security_and_integrations.sql`
3. `20260714013200_phase1_financial_notifications.sql`
4. `20260714013300_phase1_financial_rollups_and_corrections.sql`
5. `20260714013400_phase1_financial_reconciliation_hardening.sql`
6. `20260714013500_phase1_financial_postcheck.sql`

The final migration is read-only validation and raises an exception if required tables, RPCs, columns, or security restrictions are missing.

No new environment variables are required. The financial outbox cron uses the existing Vercel `CRON_SECRET` authorization pattern. The app continues to use the existing Stripe, Supabase service role, site URL, and SendGrid environment variables.

## Deployment order

1. Merge and deploy the application changes.
2. Apply the six migrations in order immediately before or during the deployment window.
3. Confirm the final postcheck prints `Phase 1 financial foundation postcheck passed.`
4. Issue one test invoice, start a Stripe test payment, and confirm the portal balance and receipt update after the webhook.

## Functional coverage

- Immutable issued invoice versions
- Server-derived invoice totals and outstanding balances
- Portal and staff Stripe checkout linked to invoice versions
- Idempotent payment events and receipts
- Manual cash, cheque, terminal, EFT, financing, and other payment posting
- Manual payment reversals
- Stripe payment failure, refund, and dispute event capture
- Invoice void command and reissue guards
- Customer-visible invoice version history
- Immutable invoice PDF rendering
- QuickBooks export from issued invoice versions with duplicate recovery
- Financial notification outbox, customer notifications, email delivery, and read-state controls

## Existing-data behavior

Existing invoice rows remain intact. New invoice sends create immutable `invoice_versions`. Existing invoices without a version are not made payable through the new checkout path until they are reissued or backfilled. This avoids silently charging against mutable legacy totals.

## Rollback approach

Do not drop the new financial tables after production data is written. Application rollback can point checkout and portal code back to the previous release, but retained invoice versions and payment events should remain as audit records. Corrective schema changes should be forward migrations.
