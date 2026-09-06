begin;

create or replace function public.recover_stranded_stripe_acquisition_identity(
  p_auth_user_id uuid,
  p_profile_id uuid,
  p_shop_id uuid,
  p_intent_id uuid,
  p_nonce text,
  p_checkout_email text,
  p_stripe_price_id text,
  p_checkout_session_id text,
  p_customer_id text,
  p_subscription_id text,
  p_expected_profile_checkout_session_id text,
  p_expected_profile_customer_id text,
  p_expected_profile_subscription_id text,
  p_expected_shop_checkout_session_id text,
  p_expected_shop_customer_id text,
  p_expected_shop_subscription_id text
)
returns table (
  recovered boolean,
  denial_reason text,
  shop_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_intent private.stripe_acquisition_intents%rowtype;
  v_profile public.profiles%rowtype;
  v_shop public.shops%rowtype;
  v_auth_email text;
begin
  if p_auth_user_id is null
     or p_profile_id is null
     or p_shop_id is null
     or p_intent_id is null
     or p_nonce !~ '^[0-9a-f]{64}$'
     or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$'
     or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
     or p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     or p_stripe_price_id !~ '^price_[A-Za-z0-9]+$'
     or nullif(btrim(p_checkout_email), '') is null then
    return query select false, 'invalid_recovery_artifacts'::text, null::uuid;
    return;
  end if;

  select *
    into v_profile
    from public.profiles
   where id = p_profile_id
     and (
       id = p_auth_user_id
       or user_id = p_auth_user_id
     )
   for update;

  if not found or v_profile.shop_id is distinct from p_shop_id then
    return query select false, 'profile_shop_mismatch'::text, null::uuid;
    return;
  end if;

  if lower(coalesce(v_profile.role, '')) not in ('owner', 'admin') then
    return query select false, 'billing_role_required'::text, p_shop_id;
    return;
  end if;

  select *
    into v_shop
    from public.shops
   where id = p_shop_id
   for update;

  if not found then
    return query select false, 'shop_not_found'::text, null::uuid;
    return;
  end if;

  select lower(btrim(email))
    into v_auth_email
    from auth.users
   where id = p_auth_user_id;

  if v_auth_email is null
     or v_auth_email is distinct from lower(btrim(p_checkout_email)) then
    return query select false, 'email_mismatch'::text, p_shop_id;
    return;
  end if;

  select *
    into v_intent
    from private.stripe_acquisition_intents
   where id = p_intent_id
   for update;

  if not found then
    return query select false, 'intent_not_found'::text, p_shop_id;
    return;
  end if;

  -- Recovery intentionally does not reject solely because expires_at passed.
  -- The caller must revalidate the completed Checkout Session and active
  -- subscription against Stripe immediately before invoking this RPC.
  if v_intent.nonce is distinct from p_nonce
     or v_intent.stripe_price_id is distinct from p_stripe_price_id
     or v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id
     or v_intent.stripe_customer_id is distinct from p_customer_id
     or v_intent.stripe_subscription_id is distinct from p_subscription_id
     or lower(btrim(v_intent.checkout_email)) is distinct from lower(btrim(p_checkout_email)) then
    return query select false, 'intent_identity_mismatch'::text, p_shop_id;
    return;
  end if;

  -- A claimed intent may only make recovery idempotent. It must never be used
  -- to replace a different canonical billing identity.
  if v_intent.status = 'claimed' then
    if v_intent.claimed_user_id is not distinct from p_auth_user_id
       and v_intent.claimed_shop_id is not distinct from p_shop_id
       and v_profile.stripe_checkout_session_id is not distinct from p_checkout_session_id
       and v_profile.stripe_customer_id is not distinct from p_customer_id
       and v_profile.stripe_subscription_id is not distinct from p_subscription_id
       and v_shop.stripe_checkout_session_id is not distinct from p_checkout_session_id
       and v_shop.stripe_customer_id is not distinct from p_customer_id
       and v_shop.stripe_subscription_id is not distinct from p_subscription_id then
      return query select true, null::text, p_shop_id;
    else
      return query select false, 'intent_consumed'::text, p_shop_id;
    end if;
    return;
  end if;

  if v_intent.status <> 'completed'
     or v_intent.stripe_completion_event_id is null
     or v_intent.stripe_completion_created_at is null then
    return query select false, 'intent_not_completed'::text, p_shop_id;
    return;
  end if;

  if v_intent.claimed_user_id is not null
     or v_intent.claimed_shop_id is not null then
    return query select false, 'intent_consumed'::text, p_shop_id;
    return;
  end if;

  -- Compare-and-swap the stale identity. Any concurrent billing change makes
  -- the recovery request stale rather than overwriting newer canonical state.
  if v_profile.stripe_checkout_session_id is distinct from p_expected_profile_checkout_session_id
     or v_profile.stripe_customer_id is distinct from p_expected_profile_customer_id
     or v_profile.stripe_subscription_id is distinct from p_expected_profile_subscription_id
     or v_shop.stripe_checkout_session_id is distinct from p_expected_shop_checkout_session_id
     or v_shop.stripe_customer_id is distinct from p_expected_shop_customer_id
     or v_shop.stripe_subscription_id is distinct from p_expected_shop_subscription_id then
    return query select false, 'canonical_identity_changed'::text, p_shop_id;
    return;
  end if;

  if exists (
    select 1
      from public.profiles
     where id <> p_profile_id
       and (
         stripe_checkout_session_id = p_checkout_session_id
         or stripe_customer_id = p_customer_id
         or stripe_subscription_id = p_subscription_id
       )
  ) then
    return query select false, 'replacement_identity_owned_by_other_profile'::text, p_shop_id;
    return;
  end if;

  if exists (
    select 1
      from public.shops
     where id <> p_shop_id
       and (
         stripe_checkout_session_id = p_checkout_session_id
         or stripe_customer_id = p_customer_id
         or stripe_subscription_id = p_subscription_id
       )
  ) then
    return query select false, 'replacement_identity_owned_by_other_shop'::text, p_shop_id;
    return;
  end if;

  update public.profiles
     set stripe_checkout_session_id = p_checkout_session_id,
         stripe_customer_id = p_customer_id,
         stripe_subscription_id = p_subscription_id
   where id = p_profile_id;

  update public.shops
     set stripe_checkout_session_id = p_checkout_session_id,
         stripe_customer_id = p_customer_id,
         stripe_subscription_id = p_subscription_id
   where id = p_shop_id;

  update private.stripe_acquisition_intents
     set status = 'claimed',
         claimed_user_id = p_auth_user_id,
         claimed_shop_id = p_shop_id,
         claimed_at = coalesce(claimed_at, now()),
         updated_at = now()
   where id = p_intent_id;

  return query select true, null::text, p_shop_id;
end;
$$;

revoke all on function public.recover_stranded_stripe_acquisition_identity(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text,
  text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.recover_stranded_stripe_acquisition_identity(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text,
  text, text, text, text, text, text
) to service_role;

commit;
