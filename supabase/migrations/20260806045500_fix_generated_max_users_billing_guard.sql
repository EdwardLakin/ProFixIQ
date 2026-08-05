begin;

-- max_users is a generated column. In BEFORE UPDATE triggers PostgreSQL has not
-- recomputed its NEW value yet, so comparing NEW.max_users to OLD.max_users
-- falsely classified every normal shop settings update as a billing mutation.
create or replace function public.prevent_client_shop_billing_identity_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
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
  ) then
    raise exception using
      errcode = '42501',
      message = 'shop billing, payment, and entitlement fields are server managed';
  end if;
  return new;
end;
$$;

create or replace function public.normalize_client_shop_billing_identity_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  new.plan := 'starter';
  new.user_limit := 10;
  new.active_user_count := 0;
  new.billable_user_count := 0;
  new.stripe_customer_id := null;
  new.stripe_subscription_id := null;
  new.stripe_subscription_status := null;
  new.stripe_trial_end := null;
  new.stripe_current_period_end := null;
  new.stripe_checkout_session_id := null;
  new.stripe_pricing_model := 'base_plus_seats_v2';
  new.stripe_billing_sync_required := true;
  new.stripe_billing_sync_error := null;
  new.stripe_billing_synced_at := null;
  new.billing_entitlement_override := null;
  new.billing_grace_until := null;
  new.billing_entitlement_updated_at := now();
  return new;
end;
$$;

commit;
