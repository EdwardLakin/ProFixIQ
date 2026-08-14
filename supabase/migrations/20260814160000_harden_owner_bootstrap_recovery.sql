-- Harden the deployed first-shop owner bootstrap without changing its public
-- signature or generated Supabase type shape.
--
-- ROLLING-DEPLOYMENT CONTRACT:
-- - Old app + old DB: existing behavior.
-- - Old app + new DB: raw PIN hashes retain the historical
--   completed_onboarding=true success semantic.
-- - New app + old DB: a harmless contract probe fails before any bootstrap
--   mutation, so the new app returns 503 instead of calling the old body.
-- - New app + new DB: the route prefixes the already-string PIN-hash argument
--   with a private protocol marker. This function strips the marker before
--   storing the real hash and atomically leaves completed_onboarding=false.
--   The server then reconciles canonical Stripe billing and explicitly finalizes.
-- - No second public RPC is introduced, so generated database types do not drift.

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
as $$
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

  -- Harmless readiness probe used by the new application before it sends the
  -- pending protocol marker. The previously deployed function rejects the
  -- sentinel country, so app-first deployment fails closed without mutation.
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

  v_pending_protocol := left(p_owner_pin_hash, length(v_pending_marker)) = v_pending_marker;
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

  -- Exact/concurrent retries are read-only once the profile points at a shop
  -- actually owned by the caller. Both pending and completed owner states are
  -- accepted. The server verifies the submitted PIN against the persisted shop
  -- hash before billing, completion, or privileged-cookie issuance.
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

  -- Never infer commercial identity from recency. Exactly one historical
  -- owner-created shop can be recovered; multiple candidates require explicit
  -- resolution rather than silently mutating whichever row was newest.
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

  -- Raw hashes preserve the old app's completion contract. The new app sends
  -- the marker only after the readiness probe proves this function understands
  -- it, so its first-shop transition is pending atomically.
  update public.profiles as p
    set role = 'owner',
        shop_id = v_target_shop_id,
        completed_onboarding = not v_pending_protocol
  where p.id = v_uid
    and p.shop_id is null
    and p.role is null
    and not coalesce(p.completed_onboarding, false);

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
  on conflict (shop_id, user_id) do update
    set role = 'owner',
        created_by = coalesce(shop_members.created_by, excluded.created_by);

  return query
  select v_target_shop_id, v_created;
end;
$$;

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
) to authenticated;
