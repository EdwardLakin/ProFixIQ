set local lock_timeout = '5s';
set local statement_timeout = '5min';

create table if not exists public.early_access_discount_grant_bindings (
  application_id uuid primary key references public.early_access_applications(id) on delete cascade,
  grant_id uuid not null unique references public.billing_discount_grants(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.early_access_discount_grant_bindings enable row level security;
alter table public.early_access_discount_grant_bindings force row level security;
revoke all on table public.early_access_discount_grant_bindings from public, anon, authenticated, service_role;

comment on table public.early_access_discount_grant_bindings is
  'Task-owned Early Access adapter that gives each application one durable billing discount grant without changing shared shop contracts.';

create or replace function public.issue_early_access_discount_grant_atomic(
  p_application_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_profile_id uuid,
  p_approval_token_hash text,
  p_approval_expires_at timestamptz,
  p_checkout_attempt_namespace text,
  p_reissue boolean,
  p_expected_reissue_count integer
)
returns table (
  grant_id uuid,
  reissued boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_application public.early_access_applications%rowtype;
  v_grant public.billing_discount_grants%rowtype;
  v_reissue_count integer;
  v_intent_status text;
  v_intent_id_text text;
begin
  if p_application_id is null
     or p_actor_auth_user_id is null
     or p_actor_profile_id is null
     or p_approval_token_hash is null
     or p_approval_token_hash !~ '^[0-9a-f]{64}$'
     or p_approval_expires_at is null
     or p_approval_expires_at <= now()
     or p_checkout_attempt_namespace is null
     or p_checkout_attempt_namespace !~ '^[0-9a-f]{32}$'
     or p_expected_reissue_count is null
     or p_expected_reissue_count < 0 then
    raise exception using errcode = '22023', message = 'invalid Early Access grant issuance input';
  end if;

  perform 1 from auth.users u where u.id = p_actor_auth_user_id;
  if not found then
    raise exception using errcode = '23503', message = 'Early Access approval actor does not exist';
  end if;

  perform 1 from public.profiles p where p.id = p_actor_profile_id;
  if not found then
    raise exception using errcode = '23503', message = 'Early Access approval profile does not exist';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('early-access-application:' || p_application_id::text, 0));

  select *
    into v_application
    from public.early_access_applications a
   where a.id = p_application_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Early Access application not found';
  end if;

  if coalesce(p_reissue, false) then
    if v_application.status <> 'approved' then
      raise exception using errcode = '55000', message = 'Early Access application is not approved';
    end if;

    select g.*
      into v_grant
      from public.early_access_discount_grant_bindings b
      join public.billing_discount_grants g on g.id = b.grant_id
     where b.application_id = v_application.id
     for update of g;

    if not found
       or v_grant.status <> 'active'
       or v_grant.shop_id is not null
       or v_grant.discount_class <> 'beta'
       or v_grant.percent_off is distinct from 30::numeric
       or v_grant.duration <> 'repeating'
       or v_grant.duration_in_months is distinct from 6
       or v_grant.terms_version is distinct from v_application.offer_terms_version
       or v_grant.metadata->>'purpose' is distinct from 'early_access'
       or v_grant.metadata->>'application_id' is distinct from v_application.id::text
       or lower(v_grant.metadata->>'application_email') is distinct from lower(trim(v_application.email))
       or v_grant.metadata->>'product_package' is distinct from v_application.product_package
       or v_grant.metadata->>'offer_terms_version' is distinct from v_application.offer_terms_version then
      raise exception using errcode = '55000', message = 'Early Access grant is not eligible for reissue';
    end if;

    if coalesce(v_grant.metadata->>'token_reissue_count', '') ~ '^[0-9]+$' then
      v_reissue_count := (v_grant.metadata->>'token_reissue_count')::integer;
    else
      v_reissue_count := 0;
    end if;

    if v_reissue_count <> p_expected_reissue_count then
      raise exception using errcode = '40001', message = 'Early Access approval link was reissued concurrently';
    end if;

    -- Once checkout has started, only a definitively dead attempt may be reset.
    -- Completed/claimable purchases must finish through their existing artifacts.
    if nullif(v_grant.metadata->>'checkout_session_id', '') is not null then
      v_intent_id_text := nullif(v_grant.metadata->>'acquisition_intent_id', '');
      if v_intent_id_text is null
         or v_intent_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '55000', message = 'Early Access checkout state is not recoverable by reissue';
      end if;

      select i.status
        into v_intent_status
        from private.stripe_acquisition_intents i
       where i.id = v_intent_id_text::uuid;

      if not found or v_intent_status not in ('expired', 'failed') then
        raise exception using errcode = '55000', message = 'Early Access checkout is still active or completed';
      end if;
    end if;

    update public.billing_discount_grants g
       set metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'approval_token_hash', p_approval_token_hash,
         'approval_expires_at', p_approval_expires_at,
         'checkout_attempt_namespace', p_checkout_attempt_namespace,
         'token_reissue_count', v_reissue_count + 1,
         'token_reissued_at', now(),
         'token_reissued_by_auth_user_id', p_actor_auth_user_id,
         'token_reissued_by_profile_id', p_actor_profile_id,
         'checkout_session_id', null,
         'acquisition_intent_id', null,
         'checkout_started_at', null
       )
     where g.id = v_grant.id;

    return query select v_grant.id, true;
    return;
  end if;

  if v_application.status <> 'pending' then
    raise exception using errcode = '55000', message = 'Early Access application has already been reviewed';
  end if;

  if exists (
    select 1
      from public.early_access_discount_grant_bindings b
     where b.application_id = v_application.id
  ) or exists (
    select 1
      from public.billing_discount_grants g
     where g.metadata->>'purpose' = 'early_access'
       and g.metadata->>'application_id' = v_application.id::text
       and g.status in ('active', 'redeemed')
  ) then
    raise exception using errcode = '23505', message = 'Early Access application already has a discount grant';
  end if;

  insert into public.billing_discount_grants (
    shop_id,
    discount_class,
    percent_off,
    duration,
    duration_in_months,
    status,
    approved_by,
    terms_version,
    metadata
  )
  values (
    null,
    'beta',
    30,
    'repeating',
    6,
    'active',
    p_actor_auth_user_id,
    v_application.offer_terms_version,
    jsonb_build_object(
      'purpose', 'early_access',
      'application_id', v_application.id,
      'application_email', lower(trim(v_application.email)),
      'product_package', v_application.product_package,
      'approval_token_hash', p_approval_token_hash,
      'approval_expires_at', p_approval_expires_at,
      'checkout_attempt_namespace', p_checkout_attempt_namespace,
      'offer_terms_version', v_application.offer_terms_version,
      'pricing_model', 'product_packages_v1',
      'trial_days', 7,
      'approved_auth_user_id', p_actor_auth_user_id,
      'approved_profile_id', p_actor_profile_id,
      'token_reissue_count', 0
    )
  )
  returning * into v_grant;

  insert into public.early_access_discount_grant_bindings (application_id, grant_id)
  values (v_application.id, v_grant.id);

  update public.early_access_applications a
     set status = 'approved',
         reviewed_at = now(),
         reviewed_by = p_actor_profile_id
   where a.id = v_application.id;

  return query select v_grant.id, false;
end;
$$;

revoke all on function public.issue_early_access_discount_grant_atomic(uuid, uuid, uuid, text, timestamptz, text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.issue_early_access_discount_grant_atomic(uuid, uuid, uuid, text, timestamptz, text, boolean, integer)
  to service_role;

create or replace function public.attach_early_access_checkout_grant(
  p_grant_id uuid,
  p_checkout_attempt_namespace text,
  p_stripe_coupon_id text,
  p_stripe_customer_id text,
  p_checkout_session_id text,
  p_acquisition_intent_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_grant public.billing_discount_grants%rowtype;
  v_existing_session text;
  v_existing_intent text;
  v_existing_intent_status text;
begin
  if p_grant_id is null
     or p_checkout_attempt_namespace is null
     or p_checkout_attempt_namespace !~ '^[0-9a-f]{32}$'
     or p_stripe_customer_id is null
     or p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
     or p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$'
     or p_acquisition_intent_id is null then
    return false;
  end if;

  select g.*
    into v_grant
    from public.early_access_discount_grant_bindings b
    join public.billing_discount_grants g on g.id = b.grant_id
   where g.id = p_grant_id
   for update of g;

  if not found
     or v_grant.status <> 'active'
     or v_grant.metadata->>'purpose' is distinct from 'early_access'
     or v_grant.metadata->>'checkout_attempt_namespace' is distinct from p_checkout_attempt_namespace then
    return false;
  end if;

  v_existing_session := nullif(v_grant.metadata->>'checkout_session_id', '');
  if v_existing_session is not null and v_existing_session <> p_checkout_session_id then
    v_existing_intent := nullif(v_grant.metadata->>'acquisition_intent_id', '');
    if v_existing_intent is null
       or v_existing_intent !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return false;
    end if;

    select i.status
      into v_existing_intent_status
      from private.stripe_acquisition_intents i
     where i.id = v_existing_intent::uuid;

    if not found or v_existing_intent_status not in ('expired', 'failed') then
      return false;
    end if;
  end if;

  update public.billing_discount_grants g
     set stripe_coupon_id = coalesce(p_stripe_coupon_id, g.stripe_coupon_id),
         metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
           'stripe_customer_id', p_stripe_customer_id,
           'checkout_session_id', p_checkout_session_id,
           'acquisition_intent_id', p_acquisition_intent_id,
           'checkout_started_at', now()
         )
   where g.id = p_grant_id
     and g.status = 'active'
     and g.metadata->>'checkout_attempt_namespace' = p_checkout_attempt_namespace;

  return found;
end;
$$;

revoke all on function public.attach_early_access_checkout_grant(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.attach_early_access_checkout_grant(uuid, text, text, text, text, uuid)
  to service_role;

create or replace function public.bind_pending_early_access_discount_grant(
  p_user_id uuid,
  p_shop_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_shop public.shops%rowtype;
  v_grant public.billing_discount_grants%rowtype;
  v_match_count integer;
begin
  if p_user_id is null or p_shop_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('early-access-shop-bind:' || p_user_id::text, 0));

  select *
    into v_shop
    from public.shops s
   where s.id = p_shop_id
   for update;

  if not found
     or v_shop.owner_id is distinct from p_user_id
     or v_shop.stripe_subscription_id is null then
    return false;
  end if;

  perform 1
    from public.profiles p
   where p.id = p_user_id
     and p.shop_id = p_shop_id
     and lower(coalesce(p.role::text, '')) = 'owner'
     and p.stripe_subscription_id = v_shop.stripe_subscription_id;
  if not found then
    return false;
  end if;

  select count(*)::integer
    into v_match_count
    from public.early_access_discount_grant_bindings b
    join public.billing_discount_grants g on g.id = b.grant_id
    join public.early_access_applications a on a.id = b.application_id
   where g.status = 'active'
     and g.shop_id is null
     and a.status = 'approved'
     and g.metadata->>'purpose' = 'early_access'
     and g.metadata->>'pending_user_id' = p_user_id::text
     and g.metadata->>'subscription_id' = v_shop.stripe_subscription_id
     and nullif(g.metadata->>'checkout_session_id', '') is not null;

  if v_match_count = 0 then
    return false;
  end if;
  if v_match_count <> 1 then
    raise exception using errcode = '21000', message = 'multiple pending Early Access grants match owner billing identity';
  end if;

  select g.*
    into v_grant
    from public.early_access_discount_grant_bindings b
    join public.billing_discount_grants g on g.id = b.grant_id
    join public.early_access_applications a on a.id = b.application_id
   where g.status = 'active'
     and g.shop_id is null
     and a.status = 'approved'
     and g.metadata->>'purpose' = 'early_access'
     and g.metadata->>'pending_user_id' = p_user_id::text
     and g.metadata->>'subscription_id' = v_shop.stripe_subscription_id
     and nullif(g.metadata->>'checkout_session_id', '') is not null
   for update of g;

  update public.billing_discount_grants g
     set shop_id = p_shop_id,
         status = 'redeemed',
         metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
           'pending_user_id', null,
           'pending_shop_binding_completed_at', now(),
           'redeemed_at', now()
         )
   where g.id = v_grant.id
     and g.status = 'active'
     and g.shop_id is null;

  return found;
end;
$$;

revoke all on function public.bind_pending_early_access_discount_grant(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.bind_pending_early_access_discount_grant(uuid, uuid)
  to service_role;

create or replace function public.rearm_expired_early_access_acquisition_intent(
  p_grant_id uuid,
  p_user_id uuid,
  p_intent_id uuid,
  p_nonce text,
  p_checkout_session_id text,
  p_customer_id text,
  p_subscription_id text,
  p_stripe_price_id text,
  p_checkout_email text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_grant public.billing_discount_grants%rowtype;
  v_intent private.stripe_acquisition_intents%rowtype;
  v_auth_email text;
begin
  if p_grant_id is null
     or p_user_id is null
     or p_intent_id is null
     or p_nonce is null or p_nonce !~ '^[0-9a-f]{64}$'
     or p_checkout_session_id is null or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$'
     or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
     or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     or p_stripe_price_id is null or p_stripe_price_id !~ '^price_[A-Za-z0-9]+$'
     or nullif(lower(trim(coalesce(p_checkout_email, ''))), '') is null then
    return false;
  end if;

  select lower(trim(u.email)) into v_auth_email
    from auth.users u
   where u.id = p_user_id;
  if v_auth_email is null or v_auth_email <> lower(trim(p_checkout_email)) then
    return false;
  end if;

  select g.*
    into v_grant
    from public.early_access_discount_grant_bindings b
    join public.billing_discount_grants g on g.id = b.grant_id
   where g.id = p_grant_id
   for update of g;

  if not found
     or v_grant.status <> 'active'
     or v_grant.shop_id is not null
     or v_grant.metadata->>'purpose' is distinct from 'early_access'
     or lower(v_grant.metadata->>'application_email') is distinct from v_auth_email
     or v_grant.metadata->>'checkout_session_id' is distinct from p_checkout_session_id
     or v_grant.metadata->>'stripe_customer_id' is distinct from p_customer_id
     or v_grant.metadata->>'acquisition_intent_id' is distinct from p_intent_id::text then
    return false;
  end if;

  select *
    into v_intent
    from private.stripe_acquisition_intents i
   where i.id = p_intent_id
   for update;

  if not found
     or v_intent.nonce is distinct from p_nonce
     or v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id
     or v_intent.stripe_price_id is distinct from p_stripe_price_id
     or v_intent.status = 'claimed'
     or v_intent.claimed_user_id is not null
     or v_intent.claimed_shop_id is not null
     or not (v_intent.expires_at <= now() or v_intent.status = 'expired')
     or v_intent.status not in ('checkout_created', 'completed', 'failed', 'expired')
     or (v_intent.stripe_customer_id is not null and v_intent.stripe_customer_id <> p_customer_id)
     or (v_intent.stripe_subscription_id is not null and v_intent.stripe_subscription_id <> p_subscription_id)
     or (v_intent.checkout_email is not null and v_intent.checkout_email <> v_auth_email) then
    return false;
  end if;

  update private.stripe_acquisition_intents i
     set stripe_customer_id = p_customer_id,
         stripe_subscription_id = p_subscription_id,
         checkout_email = v_auth_email,
         status = 'completed',
         expires_at = now() + interval '15 minutes',
         updated_at = now()
   where i.id = p_intent_id;

  return found;
end;
$$;

revoke all on function public.rearm_expired_early_access_acquisition_intent(uuid, uuid, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.rearm_expired_early_access_acquisition_intent(uuid, uuid, uuid, text, text, text, text, text, text)
  to service_role;

comment on function public.issue_early_access_discount_grant_atomic(uuid, uuid, uuid, text, timestamptz, text, boolean, integer) is
  'Atomically approves one Early Access application, creates its one task-owned discount grant binding, or serializes a safe private-link reissue.';
comment on function public.bind_pending_early_access_discount_grant(uuid, uuid) is
  'Explicit Early Access adapter used after canonical owner bootstrap; it does not attach triggers to shared shop contracts.';
comment on function public.rearm_expired_early_access_acquisition_intent(uuid, uuid, uuid, text, text, text, text, text, text) is
  'Narrow recovery adapter for a verified completed Early Access Stripe checkout whose canonical acquisition intent expired before authenticated claim.';
