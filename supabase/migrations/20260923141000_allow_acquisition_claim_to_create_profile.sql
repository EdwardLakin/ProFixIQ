begin;

create or replace function public.claim_stripe_acquisition_intent(
  p_intent_id uuid,
  p_nonce text,
  p_checkout_session_id text,
  p_customer_id text,
  p_subscription_id text,
  p_stripe_price_id text,
  p_checkout_email text,
  p_user_id uuid
)
returns table (
  claimed boolean,
  denial_reason text,
  shop_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_intent private.stripe_acquisition_intents%rowtype;
  v_auth_email text;
  v_profile record;
  v_conflict boolean;
begin
  if p_checkout_session_id is null or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$'
     or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
     or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     or p_stripe_price_id is null or p_stripe_price_id !~ '^price_[A-Za-z0-9]+$'
     or nullif(lower(trim(coalesce(p_checkout_email, ''))), '') is null then
    return query select false, 'invalid_stripe_artifacts'::text, null::uuid;
    return;
  end if;

  select lower(trim(u.email))
  into v_auth_email
  from auth.users u
  where u.id = p_user_id;

  if v_auth_email is null or v_auth_email <> lower(trim(p_checkout_email)) then
    return query select false, 'email_mismatch'::text, null::uuid;
    return;
  end if;

  -- A newly verified acquisition user may not have a profile row yet. Create
  -- the canonical empty owner-bootstrap profile only after the auth identity
  -- has been proven to match the completed checkout email. Billing identity is
  -- still written below by this same claim transaction.
  insert into public.profiles (
    id,
    user_id,
    email,
    completed_onboarding,
    stripe_checkout_complete
  )
  values (
    p_user_id,
    p_user_id,
    v_auth_email,
    false,
    false
  )
  on conflict (id) do nothing;

  select p.id,
         p.shop_id,
         lower(trim(coalesce(p.role, ''))) as role,
         p.stripe_customer_id,
         p.stripe_subscription_id,
         p.stripe_checkout_session_id
  into v_profile
  from public.profiles p
  where p.id = p_user_id
    and (p.user_id is null or p.user_id = p_user_id)
  for update;

  if not found then
    return query select false, 'profile_not_found'::text, null::uuid;
    return;
  end if;

  if v_profile.shop_id is not null and v_profile.role not in ('owner', 'admin') then
    return query select false, 'billing_role_required'::text, null::uuid;
    return;
  end if;

  select *
  into v_intent
  from private.stripe_acquisition_intents
  where id = p_intent_id
  for update;

  if not found
     or v_intent.nonce is distinct from p_nonce
     or v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id
     or v_intent.stripe_price_id is distinct from p_stripe_price_id then
    return query select false, 'intent_mismatch'::text, null::uuid;
    return;
  end if;

  if v_intent.expires_at <= now() or v_intent.status = 'expired' then
    return query select false, 'intent_expired'::text, null::uuid;
    return;
  end if;

  if v_intent.status = 'claimed' then
    if v_intent.claimed_user_id = p_user_id
       and v_intent.stripe_customer_id = p_customer_id
       and v_intent.stripe_subscription_id = p_subscription_id then
      return query select true, 'already_claimed'::text, v_intent.claimed_shop_id;
    else
      return query select false, 'intent_consumed'::text, null::uuid;
    end if;
    return;
  end if;

  if v_intent.status not in ('checkout_created', 'completed') then
    return query select false, 'checkout_not_ready'::text, null::uuid;
    return;
  end if;

  if (v_intent.stripe_customer_id is not null and v_intent.stripe_customer_id <> p_customer_id)
     or (v_intent.stripe_subscription_id is not null and v_intent.stripe_subscription_id <> p_subscription_id)
     or (v_intent.checkout_email is not null and v_intent.checkout_email <> lower(trim(p_checkout_email)))
     or (v_profile.stripe_customer_id is not null and v_profile.stripe_customer_id <> p_customer_id)
     or (v_profile.stripe_subscription_id is not null and v_profile.stripe_subscription_id <> p_subscription_id)
     or (v_profile.stripe_checkout_session_id is not null and v_profile.stripe_checkout_session_id <> p_checkout_session_id) then
    return query select false, 'billing_identity_conflict'::text, null::uuid;
    return;
  end if;

  select exists (
    select 1
    from public.profiles other
    where other.id <> p_user_id
      and (
        other.stripe_checkout_session_id = p_checkout_session_id
        or other.stripe_customer_id = p_customer_id
        or other.stripe_subscription_id = p_subscription_id
      )
  ) into v_conflict;

  if v_conflict then
    return query select false, 'billing_identity_already_linked'::text, null::uuid;
    return;
  end if;

  if v_profile.shop_id is not null then
    perform 1 from public.shops s where s.id = v_profile.shop_id for update;
    if not found then
      return query select false, 'shop_not_found'::text, null::uuid;
      return;
    end if;

    select exists (
      select 1
      from public.shops s
      where s.id = v_profile.shop_id
        and (
          (s.stripe_customer_id is not null and s.stripe_customer_id <> p_customer_id)
          or (s.stripe_subscription_id is not null and s.stripe_subscription_id <> p_subscription_id)
          or (s.stripe_checkout_session_id is not null and s.stripe_checkout_session_id <> p_checkout_session_id)
        )
    ) into v_conflict;

    if v_conflict then
      return query select false, 'shop_billing_identity_conflict'::text, null::uuid;
      return;
    end if;
  end if;

  update private.stripe_acquisition_intents
  set stripe_customer_id = p_customer_id,
      stripe_subscription_id = p_subscription_id,
      checkout_email = lower(trim(p_checkout_email)),
      claimed_user_id = p_user_id,
      claimed_shop_id = v_profile.shop_id,
      claimed_at = now(),
      status = 'claimed',
      updated_at = now()
  where id = v_intent.id;

  update public.profiles
  set stripe_checkout_complete = true,
      stripe_checkout_session_id = p_checkout_session_id,
      stripe_customer_id = p_customer_id,
      stripe_subscription_id = p_subscription_id
  where id = p_user_id;

  if v_profile.shop_id is not null then
    update public.shops
    set stripe_checkout_session_id = p_checkout_session_id,
        stripe_customer_id = p_customer_id,
        stripe_subscription_id = p_subscription_id
    where id = v_profile.shop_id;
  end if;

  return query select true, null::text, v_profile.shop_id::uuid;
end;
$$;


revoke all on function public.claim_stripe_acquisition_intent(uuid, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_stripe_acquisition_intent(uuid, text, text, text, text, text, text, uuid)
  to service_role;

commit;
