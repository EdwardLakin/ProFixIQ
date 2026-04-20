-- Phase 6: transaction-wrapped critical writes for owner bootstrap + shop hours

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

  update public.profiles
    set role = 'owner',
        shop_id = v_shop_id
  where id = v_uid;

  return query
  select v_shop_id, v_created;
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

create or replace function public.replace_shop_hours_atomic(
  p_shop_id uuid,
  p_hours jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid;
  v_role text;
  v_profile_shop_id uuid;
  v_row jsonb;
  v_day integer;
  v_open text;
  v_close text;
  v_closed boolean;
  v_has_day_of_week boolean;
  v_has_weekday boolean;
  v_has_is_closed boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select lower(coalesce(p.role, '')), p.shop_id
    into v_role, v_profile_shop_id
  from public.profiles p
  where p.id = v_uid;

  if v_profile_shop_id is null then
    raise exception 'Forbidden';
  end if;

  if v_profile_shop_id <> p_shop_id then
    raise exception 'Forbidden';
  end if;

  if v_role not in ('owner', 'admin') then
    raise exception 'Forbidden';
  end if;

  if p_hours is null or jsonb_typeof(p_hours) <> 'array' then
    raise exception 'hours must be an array';
  end if;

  v_has_day_of_week := public.has_column('shop_hours'::regclass, 'day_of_week');
  v_has_weekday := public.has_column('shop_hours'::regclass, 'weekday');
  v_has_is_closed := public.has_column('shop_hours'::regclass, 'is_closed');

  if not v_has_day_of_week and not v_has_weekday then
    raise exception 'shop_hours weekday/day_of_week column missing';
  end if;

  delete from public.shop_hours where shop_id = p_shop_id;

  for v_row in select value from jsonb_array_elements(p_hours)
  loop
    v_day := nullif(trim(coalesce(v_row->>'day_of_week', v_row->>'weekday', '')), '')::integer;
    if v_day is null or v_day < 0 or v_day > 6 then
      raise exception 'Invalid weekday/day_of_week value';
    end if;

    v_closed := coalesce((v_row->>'is_closed')::boolean, (v_row->>'closed')::boolean, false);
    v_open := nullif(trim(coalesce(v_row->>'open_time', '')), '');
    v_close := nullif(trim(coalesce(v_row->>'close_time', '')), '');

    if v_closed then
      v_open := null;
      v_close := null;
    end if;

    if v_has_day_of_week and v_has_is_closed then
      insert into public.shop_hours (shop_id, day_of_week, open_time, close_time, is_closed)
      values (p_shop_id, v_day, v_open, v_close, v_closed);
    elsif v_has_day_of_week then
      insert into public.shop_hours (shop_id, day_of_week, open_time, close_time)
      values (p_shop_id, v_day, coalesce(v_open, '00:00'), coalesce(v_close, '00:00'));
    elsif v_has_is_closed then
      insert into public.shop_hours (shop_id, weekday, open_time, close_time, is_closed)
      values (p_shop_id, v_day, v_open, v_close, v_closed);
    else
      insert into public.shop_hours (shop_id, weekday, open_time, close_time)
      values (p_shop_id, v_day, coalesce(v_open, '00:00'), coalesce(v_close, '00:00'));
    end if;
  end loop;
end;
$$;

grant execute on function public.replace_shop_hours_atomic(uuid, jsonb) to authenticated;
