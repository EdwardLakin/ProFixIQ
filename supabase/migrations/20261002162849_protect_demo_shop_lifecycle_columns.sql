begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Follow-up to 20261002000000_demo_prospect_shop_isolation.sql: that
-- migration added shops.demo_prospect_profile_id and
-- shops.demo_shop_archived_at, but the existing
-- prevent_client_shop_billing_identity_write() trigger (which already
-- blocks anon/authenticated writes to every other server-managed shops
-- column) didn't know about either new column. Without this, a prospect
-- -- who is 'owner' of their own cloned shop, and therefore passes
-- shops_staff_write_update's RLS check -- could null out
-- demo_prospect_profile_id via the client Data API and immediately drop out
-- of listDemoProspects()/extend/revoke/the archive worker, or clear
-- demo_shop_archived_at to un-archive their own shop. Both lifecycle
-- columns must be as server-managed as the billing columns already are.
--
-- This only widens the existing guard's column list; its trigger
-- definition, the columns it already protected, and every other behavior
-- are unchanged.
CREATE OR REPLACE FUNCTION public.prevent_client_shop_billing_identity_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if current_user in ('anon', 'authenticated') and (
    new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.stripe_subscription_status is distinct from old.stripe_subscription_status
    or new.stripe_trial_end is distinct from old.stripe_trial_end
    or new.stripe_current_period_end is distinct from old.stripe_current_period_end
    or new.plan is distinct from old.plan
    or new.user_limit is distinct from old.user_limit
    or new.active_user_count is distinct from old.active_user_count
    or new.billable_user_count is distinct from old.billable_user_count
    or new.stripe_billing_sync_required is distinct from old.stripe_billing_sync_required
    or new.stripe_billing_sync_error is distinct from old.stripe_billing_sync_error
    or new.stripe_billing_synced_at is distinct from old.stripe_billing_synced_at
    or new.stripe_pricing_model is distinct from old.stripe_pricing_model
    or new.subscription_package is distinct from old.subscription_package
    or new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
    or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
    or new.stripe_details_submitted is distinct from old.stripe_details_submitted
    or new.stripe_onboarding_completed is distinct from old.stripe_onboarding_completed
    or new.stripe_default_currency is distinct from old.stripe_default_currency
    or new.stripe_platform_fee_bps is distinct from old.stripe_platform_fee_bps
    or new.stripe_connect_charge_model is distinct from old.stripe_connect_charge_model
    or new.stripe_connect_dashboard_type is distinct from old.stripe_connect_dashboard_type
    or new.stripe_connect_fees_collector is distinct from old.stripe_connect_fees_collector
    or new.stripe_connect_losses_collector is distinct from old.stripe_connect_losses_collector
    or new.billing_entitlement_override is distinct from old.billing_entitlement_override
    or new.billing_grace_until is distinct from old.billing_grace_until
    or new.billing_entitlement_updated_at is distinct from old.billing_entitlement_updated_at
    or new.demo_prospect_profile_id is distinct from old.demo_prospect_profile_id
    or new.demo_shop_archived_at is distinct from old.demo_shop_archived_at
  ) then
    raise exception using
      errcode = '42501',
      message = 'shop billing, payment, entitlement, and demo-lifecycle fields are server managed';
  end if;
  return new;
end;
$function$;

commit;
