begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- The canonical owner bootstrap is intentionally callable by an authenticated
-- user only after it locks and validates that user's unassigned profile and
-- completed Stripe trial claim. A later profile-authorization trigger could
-- not distinguish that trusted transition from a direct self-promotion, so it
-- rejected every first-shop bootstrap with SQLSTATE 42501.
--
-- Record the validated actor in a private transaction-scoped authorization
-- context that authenticated callers cannot forge. The profile guard can then
-- recognize exactly the canonical null -> owner/shop transition while the
-- existing shop trigger retains its behavior for every other caller.

create table if not exists private.owner_bootstrap_authorizations (
  transaction_id bigint primary key,
  actor_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);

revoke all on table private.owner_bootstrap_authorizations
  from public, anon, authenticated, service_role;

comment on table private.owner_bootstrap_authorizations is
  'Ephemeral transaction authorization written only by bootstrap_owner_atomic and deleted before the RPC returns.';

create or replace function public.prevent_profile_authorization_self_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $profile_authorization_guard$
declare
  v_actor_user_id uuid := auth.uid();
begin
  -- Service-role and trusted database administration have no end-user JWT and
  -- remain able to provision or move memberships.
  if v_actor_user_id is null then
    return new;
  end if;

  -- The private authorization row is transaction-specific and is written only
  -- after the canonical RPC has locked the actor's profile, verified it is
  -- unassigned, and confirmed the completed Stripe trial claim. Permit only
  -- the exact initial shop assignment and/or owner promotion to a shop owned
  -- by that same actor. This accepts both deployed trigger shapes: production
  -- upserts owner/shop together, while clean replay assigns shop_id first.
  if tg_op = 'UPDATE'
    and old.id = v_actor_user_id
    and old.role is null
    and new.id is not distinct from old.id
    and new.user_id is not distinct from old.user_id
    and new.shop_id is not null
    and (
      (
        old.shop_id is null
        and (new.role is null or new.role = 'owner')
      )
      or (
        old.shop_id = new.shop_id
        and new.role = 'owner'
      )
    )
    and new.organization_id is not distinct from old.organization_id
    and new.agent_role is not distinct from old.agent_role
    and new.plan is not distinct from old.plan
    and new.created_by is not distinct from old.created_by
    and exists (
      select 1
      from private.owner_bootstrap_authorizations as bootstrap_authorization
      where bootstrap_authorization.transaction_id = txid_current()
        and bootstrap_authorization.actor_user_id = v_actor_user_id
    )
    and exists (
      select 1
      from public.shops as bootstrap_shop
      where bootstrap_shop.id = new.shop_id
        and bootstrap_shop.owner_id = v_actor_user_id
    )
  then
    return new;
  end if;

  -- set_owner_shop_id uses INSERT ... ON CONFLICT DO UPDATE. PostgreSQL fires
  -- the INSERT trigger before it resolves that conflict, so allow only that
  -- exact bootstrap-owned row shape when the locked, unassigned profile is
  -- already present. The subsequent UPDATE trigger is checked above.
  if tg_op = 'INSERT'
    and new.id = v_actor_user_id
    and new.user_id = v_actor_user_id
    and new.role = 'owner'
    and new.shop_id is not null
    and new.created_by = v_actor_user_id
    and exists (
      select 1
      from private.owner_bootstrap_authorizations as bootstrap_authorization
      where bootstrap_authorization.transaction_id = txid_current()
        and bootstrap_authorization.actor_user_id = v_actor_user_id
    )
    and exists (
      select 1
      from public.profiles as bootstrap_profile
      where bootstrap_profile.id = v_actor_user_id
        and (
          (
            bootstrap_profile.shop_id is null
            and bootstrap_profile.role is null
            and not coalesce(bootstrap_profile.completed_onboarding, false)
          )
          or (
            bootstrap_profile.shop_id = new.shop_id
            and bootstrap_profile.role = 'owner'
          )
        )
        and new.organization_id is not distinct from bootstrap_profile.organization_id
        and new.agent_role is not distinct from bootstrap_profile.agent_role
        and new.plan is not distinct from bootstrap_profile.plan
    )
    and exists (
      select 1
      from public.shops as bootstrap_shop
      where bootstrap_shop.id = new.shop_id
        and bootstrap_shop.owner_id = v_actor_user_id
    )
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id = v_actor_user_id and (
      new.role is not null
      or new.shop_id is not null
      or new.organization_id is not null
      or new.agent_role is not null
      or (
        new.user_id is not null
        and new.user_id is distinct from v_actor_user_id
      )
    ) then
      raise exception using
        errcode = '42501',
        message = 'Profile role and shop membership are server-managed.';
    end if;
    return new;
  end if;

  if old.id = v_actor_user_id and (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.role is distinct from old.role
    or new.shop_id is distinct from old.shop_id
    or new.organization_id is distinct from old.organization_id
    or new.agent_role is distinct from old.agent_role
    or new.plan is distinct from old.plan
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      errcode = '42501',
      message = 'Profile role and shop membership are server-managed.';
  end if;

  return new;
end;
$profile_authorization_guard$;

create or replace function public.bootstrap_owner_atomic(
  p_business_name text,
  p_shop_name text,
  p_street text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_country text,
  p_timezone text,
  p_owner_pin_hash text
)
returns table (
  shop_id uuid,
  created_shop boolean
)
language plpgsql
security definer
set search_path = public
as $bootstrap_owner_atomic$
declare
  v_uid uuid;
  v_profile public.profiles%rowtype;
  v_target_shop_id uuid;
  v_created boolean := false;
  v_owned_shop_count bigint := 0;
  v_pending_protocol boolean := false;
  v_effective_owner_pin_hash text;
  v_pending_marker constant text := 'profixiq-owner-bootstrap-pending-v2:';
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  -- Harmless readiness probe used by the application before it sends the
  -- pending protocol marker.
  if p_business_name = '__profixiq_owner_bootstrap_v2_probe__'
    and p_shop_name = '__probe__'
    and p_street = '__probe__'
    and p_city = '__probe__'
    and p_province = '__probe__'
    and p_postal_code = '__probe__'
    and p_country = '__PROBE__'
    and p_timezone = 'Etc/UTC'
    and p_owner_pin_hash = '__probe__'
  then
    return query
    select '00000000-0000-4000-8000-000000000002'::uuid, false;
    return;
  end if;

  if nullif(trim(coalesce(p_business_name, '')), '') is null
    or nullif(trim(coalesce(p_shop_name, '')), '') is null
    or nullif(trim(coalesce(p_street, '')), '') is null
    or nullif(trim(coalesce(p_city, '')), '') is null
    or nullif(trim(coalesce(p_province, '')), '') is null
    or nullif(trim(coalesce(p_postal_code, '')), '') is null
    or nullif(trim(coalesce(p_country, '')), '') is null
    or nullif(trim(coalesce(p_timezone, '')), '') is null
    or nullif(trim(coalesce(p_owner_pin_hash, '')), '') is null
  then
    raise exception 'Missing required fields';
  end if;

  v_pending_protocol := left(p_owner_pin_hash, length(v_pending_marker))
    = v_pending_marker;
  v_effective_owner_pin_hash := case
    when v_pending_protocol
      then substr(p_owner_pin_hash, length(v_pending_marker) + 1)
    else p_owner_pin_hash
  end;

  if nullif(trim(coalesce(v_effective_owner_pin_hash, '')), '') is null then
    raise exception 'Missing owner PIN hash';
  end if;

  if upper(trim(p_country)) not in ('US', 'CA') then
    raise exception 'Unsupported country';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as tz
    where tz.name = trim(p_timezone)
  ) then
    raise exception 'Unsupported timezone';
  end if;

  select p.*
    into v_profile
  from public.profiles as p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_profile.shop_id is not null then
    if v_profile.role = 'owner'
      and exists (
        select 1
        from public.shops as existing_shop
        where existing_shop.id = v_profile.shop_id
          and existing_shop.owner_id = v_uid
      )
    then
      return query select v_profile.shop_id, false;
      return;
    end if;

    raise exception 'Owner bootstrap not allowed';
  end if;

  if v_profile.role is not null
    or coalesce(v_profile.completed_onboarding, false)
  then
    raise exception 'Owner bootstrap not allowed';
  end if;

  if not coalesce(v_profile.stripe_checkout_complete, false)
    or v_profile.stripe_customer_id is null
    or v_profile.stripe_subscription_id is null
  then
    raise exception 'Completed trial claim required';
  end if;

  if exists (
    select 1
    from public.shop_members as existing_membership
    where existing_membership.user_id = v_uid
  ) then
    raise exception 'Owner bootstrap not allowed';
  end if;

  -- The private transaction authorization is established only after the
  -- complete authorization and commercial eligibility checks above pass.
  insert into private.owner_bootstrap_authorizations (
    transaction_id,
    actor_user_id
  )
  values (txid_current(), v_uid);

  select count(*)
    into v_owned_shop_count
  from public.shops as s
  where s.owner_id = v_uid;

  if v_owned_shop_count > 1 then
    raise exception 'Ambiguous owner shop recovery';
  end if;

  if v_owned_shop_count = 1 then
    select s.id
      into v_target_shop_id
    from public.shops as s
    where s.owner_id = v_uid
    for update;
  else
    insert into public.shops (
      owner_id,
      created_by,
      business_name,
      shop_name,
      name,
      street,
      address,
      city,
      province,
      postal_code,
      country,
      timezone,
      owner_pin_hash,
      owner_pin,
      pin
    )
    values (
      v_uid,
      v_uid,
      trim(p_business_name),
      trim(p_shop_name),
      trim(p_shop_name),
      trim(p_street),
      trim(p_street),
      trim(p_city),
      trim(p_province),
      trim(p_postal_code),
      upper(trim(p_country)),
      trim(p_timezone),
      v_effective_owner_pin_hash,
      null,
      null
    )
    returning id into v_target_shop_id;

    v_created := true;
  end if;

  update public.profiles as p
    set role = 'owner',
        shop_id = v_target_shop_id,
        completed_onboarding = not v_pending_protocol
  where p.id = v_uid
    and not coalesce(p.completed_onboarding, false)
    and (
      (p.shop_id is null and p.role is null)
      or (
        p.shop_id = v_target_shop_id
        and (p.role is null or p.role = 'owner')
      )
    );

  if not found then
    raise exception 'Owner bootstrap not allowed';
  end if;

  update public.shops as s
    set business_name = trim(p_business_name),
        shop_name = trim(p_shop_name),
        name = trim(p_shop_name),
        street = trim(p_street),
        address = trim(p_street),
        city = trim(p_city),
        province = trim(p_province),
        postal_code = trim(p_postal_code),
        country = upper(trim(p_country)),
        timezone = trim(p_timezone),
        owner_pin_hash = v_effective_owner_pin_hash,
        owner_pin = null,
        pin = null,
        owner_id = v_uid,
        created_by = coalesce(s.created_by, v_uid)
  where s.id = v_target_shop_id
    and s.owner_id = v_uid;

  if not found then
    raise exception 'Owner shop not found';
  end if;

  insert into public.shop_profiles (
    shop_id,
    address_line1,
    city,
    province,
    postal_code,
    country
  )
  values (
    v_target_shop_id,
    trim(p_street),
    trim(p_city),
    trim(p_province),
    trim(p_postal_code),
    upper(trim(p_country))
  )
  on conflict on constraint shop_profiles_pkey do update
    set address_line1 = excluded.address_line1,
        city = excluded.city,
        province = excluded.province,
        postal_code = excluded.postal_code,
        country = excluded.country;

  insert into public.shop_members (shop_id, user_id, role, created_by)
  values (v_target_shop_id, v_uid, 'owner', v_uid)
  on conflict on constraint shop_members_pkey do update
    set role = 'owner',
        created_by = coalesce(shop_members.created_by, excluded.created_by);

  delete from private.owner_bootstrap_authorizations as bootstrap_authorization
  where bootstrap_authorization.transaction_id = txid_current()
    and bootstrap_authorization.actor_user_id = v_uid;

  if not found then
    raise exception 'Owner bootstrap authorization context missing';
  end if;

  return query
  select v_target_shop_id, v_created;
end;
$bootstrap_owner_atomic$;

revoke all on function public.bootstrap_owner_atomic(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.bootstrap_owner_atomic(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated, service_role;

comment on function public.bootstrap_owner_atomic(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Atomically creates or recovers the first owner shop after trial-claim validation and delegates the guarded profile transition through a private transaction authorization.';

commit;
