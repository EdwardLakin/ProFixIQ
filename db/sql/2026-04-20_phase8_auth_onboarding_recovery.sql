-- Phase 8: auth + onboarding recovery hardening
-- - make owner bootstrap retry-safe for partial records
-- - eliminate ambiguous shop_id references in return shape
-- - ensure profile/shop/member linkage is complete after bootstrap

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
security invoker
set search_path = public
as $$
declare
  v_uid uuid;
  v_profile public.profiles%rowtype;
  v_shop_id uuid;
  v_created boolean := false;
  v_member_exists boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized';
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

  select *
    into v_profile
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_profile.shop_id is not null then
    v_shop_id := v_profile.shop_id;

    update public.shops s
      set business_name = p_business_name,
          shop_name = p_shop_name,
          name = p_shop_name,
          street = p_street,
          address = p_street,
          city = p_city,
          province = p_province,
          postal_code = p_postal_code,
          country = p_country,
          timezone = p_timezone,
          owner_pin_hash = p_owner_pin_hash,
          owner_pin = null,
          pin = null,
          owner_id = v_uid,
          created_by = coalesce(s.created_by, v_uid)
    where s.id = v_shop_id
    returning s.id into v_shop_id;

    if v_shop_id is null then
      raise exception 'Shop not found for profile';
    end if;
  else
    select s.id
      into v_shop_id
    from public.shops s
    where s.owner_id = v_uid
    order by s.created_at desc nulls last
    limit 1
    for update;

    if v_shop_id is null then
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
        p_business_name,
        p_shop_name,
        p_shop_name,
        p_street,
        p_street,
        p_city,
        p_province,
        p_postal_code,
        p_country,
        p_timezone,
        p_owner_pin_hash,
        null,
        null
      )
      returning id into v_shop_id;

      v_created := true;
    else
      update public.shops s
      set business_name = p_business_name,
          shop_name = p_shop_name,
          name = p_shop_name,
          street = p_street,
          address = p_street,
          city = p_city,
          province = p_province,
          postal_code = p_postal_code,
          country = p_country,
          timezone = p_timezone,
          owner_pin_hash = p_owner_pin_hash,
          owner_pin = null,
          pin = null,
          owner_id = v_uid,
          created_by = coalesce(s.created_by, v_uid)
      where s.id = v_shop_id;
    end if;
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
    v_shop_id,
    p_street,
    p_city,
    p_province,
    p_postal_code,
    p_country
  )
  on conflict (shop_id) do update
    set address_line1 = excluded.address_line1,
        city = excluded.city,
        province = excluded.province,
        postal_code = excluded.postal_code,
        country = excluded.country;

  select exists(
    select 1
    from public.shop_members sm
    where sm.shop_id = v_shop_id
      and sm.user_id = v_uid
  )
  into v_member_exists;

  if v_member_exists then
    update public.shop_members sm
    set role = 'owner',
        created_by = coalesce(sm.created_by, v_uid)
    where sm.shop_id = v_shop_id
      and sm.user_id = v_uid;
  else
    insert into public.shop_members (shop_id, user_id, role, created_by)
    values (v_shop_id, v_uid, 'owner', v_uid);
  end if;

  update public.profiles p
    set role = 'owner',
        shop_id = v_shop_id,
        completed_onboarding = true
  where p.id = v_uid;

  return query
  select v_shop_id as shop_id, v_created as created_shop;
end;
$$;

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
