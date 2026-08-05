begin;

create or replace function public.profixiq_protect_shop_billing_identity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if coalesce(v_request_role, '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A browser may bootstrap only its first shop. Billing identity always starts
    -- unentitled and is hydrated by the server-owned Stripe acquisition flow.
    new.plan := 'starter';
    new.user_limit := 10;
    new.max_users := null;
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
  end if;

  if
    new.plan is distinct from old.plan
    or new.user_limit is distinct from old.user_limit
    or new.max_users is distinct from old.max_users
    or new.active_user_count is distinct from old.active_user_count
    or new.billable_user_count is distinct from old.billable_user_count
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.stripe_subscription_status is distinct from old.stripe_subscription_status
    or new.stripe_trial_end is distinct from old.stripe_trial_end
    or new.stripe_current_period_end is distinct from old.stripe_current_period_end
    or new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
    or new.stripe_pricing_model is distinct from old.stripe_pricing_model
    or new.stripe_billing_sync_required is distinct from old.stripe_billing_sync_required
    or new.stripe_billing_sync_error is distinct from old.stripe_billing_sync_error
    or new.stripe_billing_synced_at is distinct from old.stripe_billing_synced_at
    or new.billing_entitlement_override is distinct from old.billing_entitlement_override
    or new.billing_grace_until is distinct from old.billing_grace_until
    or new.billing_entitlement_updated_at is distinct from old.billing_entitlement_updated_at
  then
    raise exception 'shop billing identity is server-managed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.profixiq_protect_shop_billing_identity()
  from public, anon, authenticated;

drop trigger if exists shops_protect_billing_identity on public.shops;
create trigger shops_protect_billing_identity
before insert or update
on public.shops
for each row
execute function public.profixiq_protect_shop_billing_identity();

commit;
