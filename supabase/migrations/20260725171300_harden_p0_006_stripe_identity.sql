begin;

create schema if not exists private;

alter table public.profiles
  add column if not exists stripe_checkout_complete boolean not null default false,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table public.shops
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text,
  add column if not exists stripe_trial_end timestamptz,
  add column if not exists stripe_current_period_end timestamptz;

create unique index if not exists profiles_stripe_checkout_session_id_uidx
  on public.profiles (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists profiles_stripe_customer_id_uidx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_uidx
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index if not exists shops_stripe_checkout_session_id_uidx
  on public.shops (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists shops_stripe_customer_id_uidx
  on public.shops (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists shops_stripe_subscription_id_uidx
  on public.shops (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists private.stripe_acquisition_intents (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  nonce text not null unique,
  plan_key text not null,
  stripe_price_id text not null,
  trial_days integer not null,
  founding_discount_applied boolean not null default false,
  status text not null default 'pending',
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  checkout_email text,
  stripe_completion_event_id text,
  stripe_completion_created_at timestamptz,
  claimed_user_id uuid references auth.users(id) on delete set null,
  claimed_shop_id uuid references public.shops(id) on delete set null,
  claimed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_acquisition_intents_request_key_check
    check (char_length(request_key) between 8 and 200),
  constraint stripe_acquisition_intents_nonce_check
    check (nonce ~ '^[0-9a-f]{64}$'),
  constraint stripe_acquisition_intents_plan_check
    check (plan_key in ('starter', 'pro', 'unlimited')),
  constraint stripe_acquisition_intents_price_check
    check (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  constraint stripe_acquisition_intents_trial_days_check
    check (trial_days between 0 and 60),
  constraint stripe_acquisition_intents_status_check
    check (status in ('pending', 'checkout_created', 'completed', 'claimed', 'failed', 'expired')),
  constraint stripe_acquisition_intents_session_check
    check (stripe_checkout_session_id is null or stripe_checkout_session_id ~ '^cs_[A-Za-z0-9_]+$'),
  constraint stripe_acquisition_intents_customer_check
    check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  constraint stripe_acquisition_intents_subscription_check
    check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$')
);

alter table private.stripe_acquisition_intents enable row level security;
alter table private.stripe_acquisition_intents force row level security;

create index if not exists stripe_acquisition_intents_status_expiry_idx
  on private.stripe_acquisition_intents (status, expires_at);

create index if not exists stripe_acquisition_intents_claimed_user_idx
  on private.stripe_acquisition_intents (claimed_user_id)
  where claimed_user_id is not null;

create index if not exists stripe_acquisition_intents_claimed_shop_idx
  on private.stripe_acquisition_intents (claimed_shop_id)
  where claimed_shop_id is not null;

revoke all on table private.stripe_acquisition_intents
  from public, anon, authenticated, service_role;

create or replace function public.begin_stripe_acquisition_intent(
  p_request_key text,
  p_nonce text,
  p_plan_key text,
  p_stripe_price_id text,
  p_trial_days integer,
  p_founding_discount_applied boolean
)
returns table (
  intent_id uuid,
  intent_nonce text,
  checkout_session_id text,
  intent_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_intent private.stripe_acquisition_intents%rowtype;
begin
  if p_request_key is null or char_length(p_request_key) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'invalid acquisition request key';
  end if;
  if p_nonce is null or p_nonce !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid acquisition nonce';
  end if;
  if p_plan_key not in ('starter', 'pro', 'unlimited') then
    raise exception using errcode = '22023', message = 'invalid acquisition plan';
  end if;
  if p_stripe_price_id is null or p_stripe_price_id !~ '^price_[A-Za-z0-9]+$' then
    raise exception using errcode = '22023', message = 'invalid acquisition price';
  end if;
  if p_trial_days is null or p_trial_days not between 0 and 60 then
    raise exception using errcode = '22023', message = 'invalid acquisition trial';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stripe-acquisition:' || p_request_key, 0));

  select *
  into v_intent
  from private.stripe_acquisition_intents
  where request_key = p_request_key
  for update;

  if not found then
    insert into private.stripe_acquisition_intents (
      request_key,
      nonce,
      plan_key,
      stripe_price_id,
      trial_days,
      founding_discount_applied
    )
    values (
      p_request_key,
      p_nonce,
      p_plan_key,
      p_stripe_price_id,
      p_trial_days,
      coalesce(p_founding_discount_applied, false)
    )
    returning * into v_intent;
  elsif v_intent.plan_key is distinct from p_plan_key
     or v_intent.stripe_price_id is distinct from p_stripe_price_id
     or v_intent.trial_days is distinct from p_trial_days
     or v_intent.founding_discount_applied is distinct from coalesce(p_founding_discount_applied, false) then
    raise exception using errcode = '22023', message = 'acquisition request key reused with different policy';
  end if;

  if v_intent.expires_at <= now() and v_intent.status not in ('claimed', 'expired') then
    update private.stripe_acquisition_intents
    set status = 'expired', updated_at = now()
    where id = v_intent.id
    returning * into v_intent;
  end if;

  return query
  select v_intent.id, v_intent.nonce, v_intent.stripe_checkout_session_id, v_intent.status;
end;
$$;

create or replace function public.attach_stripe_acquisition_checkout(
  p_intent_id uuid,
  p_nonce text,
  p_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_attached boolean;
begin
  if p_checkout_session_id is null or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$' then
    return false;
  end if;

  update private.stripe_acquisition_intents
  set stripe_checkout_session_id = p_checkout_session_id,
      status = case when status = 'pending' then 'checkout_created' else status end,
      updated_at = now()
  where id = p_intent_id
    and nonce = p_nonce
    and expires_at > now()
    and status in ('pending', 'checkout_created', 'completed', 'claimed')
    and (stripe_checkout_session_id is null or stripe_checkout_session_id = p_checkout_session_id)
  returning true into v_attached;

  return coalesce(v_attached, false);
end;
$$;

create or replace function public.record_stripe_acquisition_completion(
  p_intent_id uuid,
  p_nonce text,
  p_checkout_session_id text,
  p_customer_id text,
  p_subscription_id text,
  p_stripe_price_id text,
  p_checkout_email text,
  p_event_id text,
  p_event_created_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_recorded boolean;
begin
  if p_checkout_session_id is null or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$'
     or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]+$'
     or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     or p_stripe_price_id is null or p_stripe_price_id !~ '^price_[A-Za-z0-9]+$'
     or nullif(lower(trim(coalesce(p_checkout_email, ''))), '') is null
     or nullif(trim(coalesce(p_event_id, '')), '') is null then
    return false;
  end if;

  update private.stripe_acquisition_intents
  set stripe_customer_id = p_customer_id,
      stripe_subscription_id = p_subscription_id,
      checkout_email = lower(trim(p_checkout_email)),
      stripe_completion_event_id = coalesce(stripe_completion_event_id, p_event_id),
      stripe_completion_created_at = greatest(
        coalesce(stripe_completion_created_at, '-infinity'::timestamptz),
        coalesce(p_event_created_at, now())
      ),
      status = case when status = 'claimed' then status else 'completed' end,
      updated_at = now()
  where id = p_intent_id
    and nonce = p_nonce
    and expires_at > now()
    and stripe_price_id = p_stripe_price_id
    and stripe_checkout_session_id = p_checkout_session_id
    and status in ('checkout_created', 'completed', 'claimed')
    and (stripe_customer_id is null or stripe_customer_id = p_customer_id)
    and (stripe_subscription_id is null or stripe_subscription_id = p_subscription_id)
  returning true into v_recorded;

  return coalesce(v_recorded, false);
end;
$$;

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

create or replace function public.prevent_client_profile_billing_identity_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    new.stripe_checkout_complete is distinct from old.stripe_checkout_complete
    or new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  ) then
    raise exception using errcode = '42501', message = 'billing identity fields are server managed';
  end if;
  return new;
end;
$$;

create or replace function private.sync_claimed_acquisition_billing_to_shop()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_intent private.stripe_acquisition_intents%rowtype;
  v_shop public.shops%rowtype;
begin
  if new.shop_id is null
     or lower(trim(coalesce(new.role, ''))) not in ('owner', 'admin')
     or new.stripe_checkout_complete is not true
     or new.stripe_checkout_session_id is null
     or new.stripe_customer_id is null
     or new.stripe_subscription_id is null then
    return new;
  end if;

  select *
  into v_intent
  from private.stripe_acquisition_intents
  where claimed_user_id = new.id
    and status = 'claimed'
    and stripe_checkout_session_id = new.stripe_checkout_session_id
    and stripe_customer_id = new.stripe_customer_id
    and stripe_subscription_id = new.stripe_subscription_id
    and (claimed_shop_id is null or claimed_shop_id = new.shop_id)
  order by claimed_at desc nulls last
  limit 1
  for update;

  if not found then
    return new;
  end if;

  select * into v_shop
  from public.shops
  where id = new.shop_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'claimed billing shop not found';
  end if;

  if (v_shop.stripe_checkout_session_id is not null and v_shop.stripe_checkout_session_id <> new.stripe_checkout_session_id)
     or (v_shop.stripe_customer_id is not null and v_shop.stripe_customer_id <> new.stripe_customer_id)
     or (v_shop.stripe_subscription_id is not null and v_shop.stripe_subscription_id <> new.stripe_subscription_id) then
    raise exception using errcode = '23505', message = 'shop billing identity conflict';
  end if;

  update public.shops
  set stripe_checkout_session_id = new.stripe_checkout_session_id,
      stripe_customer_id = new.stripe_customer_id,
      stripe_subscription_id = new.stripe_subscription_id
  where id = new.shop_id;

  update private.stripe_acquisition_intents
  set claimed_shop_id = new.shop_id,
      updated_at = now()
  where id = v_intent.id;

  return new;
end;
$$;

drop trigger if exists sync_claimed_acquisition_billing_to_shop on public.profiles;
create trigger sync_claimed_acquisition_billing_to_shop
after update of shop_id, role on public.profiles
for each row execute function private.sync_claimed_acquisition_billing_to_shop();

drop trigger if exists prevent_client_profile_billing_identity_write on public.profiles;
create trigger prevent_client_profile_billing_identity_write
before update on public.profiles
for each row execute function public.prevent_client_profile_billing_identity_write();

create or replace function public.prevent_client_shop_billing_identity_write()
returns trigger
language plpgsql
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
  ) then
    raise exception using errcode = '42501', message = 'shop billing fields are server managed';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_client_shop_billing_identity_write on public.shops;
create trigger prevent_client_shop_billing_identity_write
before update on public.shops
for each row execute function public.prevent_client_shop_billing_identity_write();

revoke all on function public.begin_stripe_acquisition_intent(text, text, text, text, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.attach_stripe_acquisition_checkout(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.record_stripe_acquisition_completion(uuid, text, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_stripe_acquisition_intent(uuid, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;

grant execute on function public.begin_stripe_acquisition_intent(text, text, text, text, integer, boolean)
  to service_role;
grant execute on function public.attach_stripe_acquisition_checkout(uuid, text, text)
  to service_role;
grant execute on function public.record_stripe_acquisition_completion(uuid, text, text, text, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.claim_stripe_acquisition_intent(uuid, text, text, text, text, text, text, uuid)
  to service_role;

revoke all on function public.prevent_client_profile_billing_identity_write() from public;
revoke all on function public.prevent_client_shop_billing_identity_write() from public;
revoke all on function private.sync_claimed_acquisition_billing_to_shop()
  from public, anon, authenticated, service_role;

commit;
