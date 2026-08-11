begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Mobile V1 configuration belongs to the shop, while field execution capability
-- belongs to a specific profile. Neither changes the profile's canonical RBAC
-- role. A shop owner can therefore be a field operator without becoming a
-- mechanic everywhere else in ProFixIQ.
create table if not exists public.mobile_service_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  service_model text not null default 'mobile',
  solo_mode boolean not null default false,
  dispatch_enabled boolean not null default true,
  service_vehicles_enabled boolean not null default false,
  truck_inventory_enabled boolean not null default false,
  default_visit_minutes integer not null default 60,
  field_operator_count_target integer not null default 1,
  onboarding_completed_at timestamptz,
  configured_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_service_settings_model_ck
    check (service_model in ('shop','mobile','both')),
  constraint mobile_service_settings_visit_minutes_ck
    check (default_visit_minutes between 5 and 720),
  constraint mobile_service_settings_operator_target_ck
    check (field_operator_count_target between 1 and 500)
);

create table if not exists public.mobile_field_operators (
  shop_id uuid not null references public.shops(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, profile_id)
);

create table if not exists public.mobile_service_followups (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  service_visit_id uuid references public.service_visits(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  recommendation text not null,
  disposition text not null default 'quote_later',
  status text not null default 'open',
  estimated_amount numeric(12,2),
  follow_up_at timestamptz,
  notes text,
  recommended_by uuid references public.profiles(id) on delete set null,
  recommended_at timestamptz not null default now(),
  quoted_at timestamptz,
  converted_work_order_id uuid references public.work_orders(id) on delete set null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_service_followups_recommendation_ck
    check (length(trim(recommendation)) between 1 and 2000),
  constraint mobile_service_followups_disposition_ck
    check (disposition in ('quote_later','contact_later','monitor')),
  constraint mobile_service_followups_status_ck
    check (status in ('open','quoted','converted','dismissed')),
  constraint mobile_service_followups_amount_ck
    check (estimated_amount is null or estimated_amount >= 0)
);

create index if not exists mobile_service_followups_shop_status_idx
  on public.mobile_service_followups(shop_id, status, follow_up_at, recommended_at desc);
create index if not exists mobile_service_followups_work_order_idx
  on public.mobile_service_followups(work_order_id, recommended_at desc);
create index if not exists mobile_service_followups_vehicle_idx
  on public.mobile_service_followups(shop_id, vehicle_id, status)
  where vehicle_id is not null and status = 'open';

alter table public.mobile_service_settings enable row level security;
alter table public.mobile_field_operators enable row level security;
alter table public.mobile_service_followups enable row level security;

revoke all on table public.mobile_service_settings from public, anon;
revoke all on table public.mobile_field_operators from public, anon;
revoke all on table public.mobile_service_followups from public, anon;
grant select on table public.mobile_service_settings to authenticated;
grant select on table public.mobile_field_operators to authenticated;
grant select on table public.mobile_service_followups to authenticated;
grant all on table public.mobile_service_settings to service_role;
grant all on table public.mobile_field_operators to service_role;
grant all on table public.mobile_service_followups to service_role;

create or replace function public.mobile_is_shop_member(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.shop_id = p_shop_id
      and (p.id = auth.uid() or p.user_id = auth.uid())
  );
$$;

revoke all on function public.mobile_is_shop_member(uuid) from public, anon;
grant execute on function public.mobile_is_shop_member(uuid) to authenticated, service_role;

drop policy if exists mobile_service_settings_member_select on public.mobile_service_settings;
create policy mobile_service_settings_member_select
on public.mobile_service_settings for select to authenticated
using (public.mobile_is_shop_member(shop_id));

drop policy if exists mobile_field_operators_member_select on public.mobile_field_operators;
create policy mobile_field_operators_member_select
on public.mobile_field_operators for select to authenticated
using (public.mobile_is_shop_member(shop_id));

drop policy if exists mobile_service_followups_member_select on public.mobile_service_followups;
create policy mobile_service_followups_member_select
on public.mobile_service_followups for select to authenticated
using (public.mobile_is_shop_member(shop_id));

create or replace function public.mobile_is_field_operator(
  p_shop_id uuid,
  p_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.mobile_field_operators mfo
    join public.profiles p on p.id = mfo.profile_id
    where mfo.shop_id = p_shop_id
      and mfo.profile_id = p_profile_id
      and mfo.enabled = true
      and p.shop_id = p_shop_id
  );
$$;

create or replace function public.mobile_actor_is_field_operator(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    join public.mobile_field_operators mfo
      on mfo.shop_id = p.shop_id and mfo.profile_id = p.id and mfo.enabled = true
    where p.shop_id = p_shop_id
      and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  );
$$;

revoke all on function public.mobile_is_field_operator(uuid,uuid) from public, anon;
revoke all on function public.mobile_actor_is_field_operator(uuid,uuid) from public, anon;
grant execute on function public.mobile_is_field_operator(uuid,uuid) to authenticated, service_role;
grant execute on function public.mobile_actor_is_field_operator(uuid,uuid) to authenticated, service_role;

-- Keep the existing technician resource contract, but also treat an explicitly
-- enabled Mobile field operator as schedulable capacity. Canonical role remains
-- untouched.
create or replace function public.sync_profile_scheduling_resource()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_should_be_resource boolean := false;
begin
  if tg_op <> 'INSERT' and old.id is not null then
    update public.scheduling_resources
    set active = false, updated_at = now()
    where profile_id = old.id
      and resource_type = 'technician'
      and (
        new.shop_id is null
        or shop_id <> new.shop_id
        or (
          lower(coalesce(new.role, '')) not in (
            'mechanic','technician','tech','lead_hand','leadhand','foreman'
          )
          and not public.mobile_is_field_operator(new.shop_id, new.id)
        )
      );
  end if;

  if new.shop_id is not null then
    v_should_be_resource :=
      lower(coalesce(new.role, '')) in (
        'mechanic','technician','tech','lead_hand','leadhand','foreman'
      )
      or public.mobile_is_field_operator(new.shop_id, new.id);
  end if;

  if v_should_be_resource then
    insert into public.scheduling_resources(
      shop_id, code, name, resource_type, mode, profile_id,
      public_bookable, is_fallback, active, sort_order
    ) values (
      new.shop_id,
      'tech:' || new.id::text,
      coalesce(nullif(trim(new.full_name), ''), 'Field operator'),
      'technician', 'both', new.id,
      false, false, true, 200
    ) on conflict do nothing;

    update public.scheduling_resources
    set name = coalesce(nullif(trim(new.full_name), ''), 'Field operator'),
        active = true,
        updated_at = now()
    where shop_id = new.shop_id
      and profile_id = new.id
      and resource_type = 'technician';
  end if;
  return new;
end;
$$;

create or replace function public.sync_mobile_field_operator_resource()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid := coalesce(new.shop_id, old.shop_id);
  v_profile_id uuid := coalesce(new.profile_id, old.profile_id);
  v_enabled boolean := case when tg_op = 'DELETE' then false else coalesce(new.enabled, false) end;
  v_profile public.profiles%rowtype;
  v_resource_id uuid;
begin
  select * into v_profile
  from public.profiles p
  where p.id = v_profile_id and p.shop_id = v_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Field operator must belong to the same shop.';
  end if;

  select r.id into v_resource_id
  from public.scheduling_resources r
  where r.shop_id = v_shop_id
    and r.profile_id = v_profile_id
    and r.resource_type = 'technician'
  limit 1;

  if v_enabled then
    insert into public.scheduling_resources(
      shop_id, code, name, resource_type, mode, profile_id,
      public_bookable, is_fallback, active, sort_order
    ) values (
      v_shop_id,
      'tech:' || v_profile_id::text,
      coalesce(nullif(trim(v_profile.full_name), ''), 'Field operator'),
      'technician', 'both', v_profile_id,
      false, false, true, 200
    ) on conflict do nothing;

    update public.scheduling_resources
    set name = coalesce(nullif(trim(v_profile.full_name), ''), 'Field operator'),
        active = true,
        updated_at = now()
    where shop_id = v_shop_id
      and profile_id = v_profile_id
      and resource_type = 'technician';
  elsif v_resource_id is not null
        and lower(coalesce(v_profile.role, '')) not in (
          'mechanic','technician','tech','lead_hand','leadhand','foreman'
        ) then
    if exists (
      select 1 from public.scheduling_reservations sr
      where sr.resource_id = v_resource_id
        and sr.status = 'active'
        and sr.ends_at > now()
    ) then
      raise exception using errcode = 'P0001', message = 'Field operator has active or future service visits.';
    end if;
    update public.scheduling_resources
    set active = false, updated_at = now()
    where id = v_resource_id;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_mobile_field_operator_resource()
  from public, anon, authenticated, service_role;

drop trigger if exists mobile_field_operators_sync_resource on public.mobile_field_operators;
create trigger mobile_field_operators_sync_resource
after insert or update of enabled or delete on public.mobile_field_operators
for each row execute function public.sync_mobile_field_operator_resource();

-- Explicit field capability also participates in execution authorization. The
-- actor still has to be the visit's assigned profile; this does not grant shop-
-- wide technician authority to an owner.
create or replace function public.dispatch_can_execute(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_visit_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.dispatch_can_manage(p_shop_id, p_actor_user_id)
    or exists (
      select 1
      from public.service_visits sv
      join public.profiles p on p.id = sv.assigned_user_id
      where sv.id = p_visit_id
        and sv.shop_id = p_shop_id
        and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
        and (
          lower(coalesce(p.role, '')) in (
            'mechanic','technician','tech','lead_hand','leadhand','foreman'
          )
          or public.mobile_is_field_operator(p_shop_id, p.id)
        )
    );
$$;

revoke all on function public.dispatch_can_execute(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.dispatch_can_execute(uuid,uuid,uuid)
  to authenticated, service_role;

-- Owner/admin Mobile setup. It can make the current user an explicit field
-- operator and optionally seed one service truck + canonical stock location.
create or replace function public.mobile_configure_service_v1_atomic(
  p_shop_id uuid,
  p_service_model text,
  p_solo_mode boolean,
  p_dispatch_enabled boolean,
  p_service_vehicles_enabled boolean,
  p_truck_inventory_enabled boolean,
  p_default_visit_minutes integer,
  p_field_operator_count_target integer,
  p_enable_current_actor_field_operator boolean,
  p_service_vehicle_name text,
  p_service_vehicle_unit_number text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_model text := lower(coalesce(p_service_model, 'mobile'));
  v_vehicle_id uuid;
  v_stock_location_id uuid;
  v_stock_code text;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found or lower(coalesce(v_profile.role, '')) not in ('owner','admin') then
    raise exception using errcode = '42501', message = 'Owner or admin access is required.';
  end if;

  if v_model not in ('shop','mobile','both') then
    raise exception using errcode = '22023', message = 'Invalid service model.';
  end if;
  if coalesce(p_default_visit_minutes, 0) not between 5 and 720 then
    raise exception using errcode = '22023', message = 'Default visit length must be between 5 and 720 minutes.';
  end if;
  if coalesce(p_field_operator_count_target, 0) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Field operator target is invalid.';
  end if;

  insert into public.mobile_service_settings(
    shop_id, service_model, solo_mode, dispatch_enabled,
    service_vehicles_enabled, truck_inventory_enabled,
    default_visit_minutes, field_operator_count_target,
    onboarding_completed_at, configured_by, updated_at
  ) values (
    p_shop_id, v_model, coalesce(p_solo_mode, false), coalesce(p_dispatch_enabled, true),
    coalesce(p_service_vehicles_enabled, false), coalesce(p_truck_inventory_enabled, false),
    p_default_visit_minutes, p_field_operator_count_target,
    now(), v_profile.id, now()
  ) on conflict (shop_id) do update set
    service_model = excluded.service_model,
    solo_mode = excluded.solo_mode,
    dispatch_enabled = excluded.dispatch_enabled,
    service_vehicles_enabled = excluded.service_vehicles_enabled,
    truck_inventory_enabled = excluded.truck_inventory_enabled,
    default_visit_minutes = excluded.default_visit_minutes,
    field_operator_count_target = excluded.field_operator_count_target,
    onboarding_completed_at = coalesce(public.mobile_service_settings.onboarding_completed_at, now()),
    configured_by = excluded.configured_by,
    updated_at = now();

  insert into public.mobile_field_operators(shop_id, profile_id, enabled, created_by, updated_at)
  values (p_shop_id, v_profile.id, coalesce(p_enable_current_actor_field_operator, false), v_profile.id, now())
  on conflict (shop_id, profile_id) do update set
    enabled = excluded.enabled,
    updated_at = now();

  if coalesce(p_service_vehicles_enabled, false) then
    select sv.id, sv.stock_location_id
      into v_vehicle_id, v_stock_location_id
    from public.service_vehicles sv
    where sv.shop_id = p_shop_id
      and sv.primary_user_id = v_profile.id
    order by sv.created_at
    limit 1
    for update;

    if coalesce(p_truck_inventory_enabled, false) and v_stock_location_id is null then
      v_stock_code := 'TRUCK-' || upper(substr(replace(v_profile.id::text, '-', ''), 1, 8));
      insert into public.stock_locations(shop_id, code, name)
      values (
        p_shop_id,
        v_stock_code,
        coalesce(nullif(trim(p_service_vehicle_name), ''), 'Service Truck') || ' Inventory'
      )
      on conflict (shop_id, code) do update set name = excluded.name
      returning id into v_stock_location_id;
    end if;

    if v_vehicle_id is null then
      insert into public.service_vehicles(
        shop_id, name, unit_number, primary_user_id, stock_location_id,
        active, capabilities, created_by, updated_at
      ) values (
        p_shop_id,
        coalesce(nullif(trim(p_service_vehicle_name), ''), 'Service Truck'),
        nullif(trim(coalesce(p_service_vehicle_unit_number, '')), ''),
        v_profile.id,
        v_stock_location_id,
        true,
        jsonb_build_object('mobile_v1', true),
        v_profile.id,
        now()
      ) returning id into v_vehicle_id;
    else
      update public.service_vehicles
      set name = coalesce(nullif(trim(p_service_vehicle_name), ''), name),
          unit_number = coalesce(nullif(trim(coalesce(p_service_vehicle_unit_number, '')), ''), unit_number),
          stock_location_id = coalesce(v_stock_location_id, stock_location_id),
          active = true,
          capabilities = coalesce(capabilities, '{}'::jsonb) || jsonb_build_object('mobile_v1', true),
          updated_at = now()
      where id = v_vehicle_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'shopId', p_shop_id,
    'profileId', v_profile.id,
    'fieldOperator', coalesce(p_enable_current_actor_field_operator, false),
    'serviceVehicleId', v_vehicle_id,
    'stockLocationId', v_stock_location_id
  );
end;
$$;

revoke all on function public.mobile_configure_service_v1_atomic(
  uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid
) from public, anon;
grant execute on function public.mobile_configure_service_v1_atomic(
  uuid,text,boolean,boolean,boolean,boolean,integer,integer,boolean,text,text,uuid
) to authenticated, service_role;

-- One-call intake. Canonical booking triggers continue to own scheduling and
-- Service Visit materialization. Preliminary quoted price is intentionally
-- intake metadata only; it never becomes invoice truth by this function.
create or replace function public.mobile_create_service_call_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_phone text,
  p_vehicle_id uuid,
  p_vehicle_year integer,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_plate text,
  p_address_line1 text,
  p_city text,
  p_province_state text,
  p_postal_code text,
  p_concern text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_quoted_price numeric,
  p_currency text,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_customer_id uuid := p_customer_id;
  v_vehicle_id uuid := p_vehicle_id;
  v_address_id uuid;
  v_booking_id uuid;
  v_visit_id uuid;
  v_ends_at timestamptz;
  v_existing jsonb;
  v_result jsonb;
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'CAD'));
  v_concern text := nullif(trim(coalesce(p_concern, '')), '');
  v_can_intake boolean := false;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':mobile-intake:' || p_operation_key, 0));
  select mok.result into v_existing
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'rapid_service_intake'
    and mok.operation_key = p_operation_key;
  if v_existing is not null then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;

  v_can_intake := lower(coalesce(v_profile.role, '')) in (
    'owner','admin','manager','advisor','service','mechanic','technician','tech','lead_hand','leadhand','foreman'
  ) or public.mobile_is_field_operator(p_shop_id, v_profile.id);
  if not v_can_intake then
    raise exception using errcode = '42501', message = 'Mobile intake is not allowed for this actor.';
  end if;

  if p_starts_at is null then
    raise exception using errcode = '22023', message = 'Arrival time is required.';
  end if;
  if coalesce(p_duration_minutes, 0) not between 5 and 720 then
    raise exception using errcode = '22023', message = 'Visit length must be between 5 and 720 minutes.';
  end if;
  if v_concern is null then
    raise exception using errcode = '22023', message = 'Customer concern is required.';
  end if;
  if nullif(trim(coalesce(p_address_line1, '')), '') is null then
    raise exception using errcode = '22023', message = 'Service location is required.';
  end if;
  if p_quoted_price is not null and p_quoted_price < 0 then
    raise exception using errcode = '22023', message = 'Quoted price cannot be negative.';
  end if;
  if v_currency not in ('CAD','USD') then
    raise exception using errcode = '22023', message = 'Currency must be CAD or USD.';
  end if;
  v_ends_at := p_starts_at + make_interval(mins => p_duration_minutes);

  if v_customer_id is not null then
    if not exists (
      select 1 from public.customers c
      where c.id = v_customer_id and c.shop_id = p_shop_id
    ) then
      raise exception using errcode = 'P0001', message = 'Customer does not belong to this shop.';
    end if;
  else
    if length(v_phone_digits) >= 7 then
      select c.id into v_customer_id
      from public.customers c
      where c.shop_id = p_shop_id
        and regexp_replace(coalesce(c.phone_number, c.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
      order by c.updated_at desc nulls last, c.created_at desc nulls last
      limit 1;
    end if;
    if v_customer_id is null and nullif(trim(coalesce(p_customer_name, '')), '') is not null then
      select c.id into v_customer_id
      from public.customers c
      where c.shop_id = p_shop_id
        and lower(trim(coalesce(c.name, ''))) = lower(trim(p_customer_name))
      order by c.updated_at desc nulls last, c.created_at desc nulls last
      limit 1;
    end if;
    if v_customer_id is null then
      insert into public.customers(
        shop_id, name, phone, phone_number, created_at, updated_at
      ) values (
        p_shop_id,
        nullif(trim(coalesce(p_customer_name, '')), ''),
        nullif(trim(coalesce(p_phone, '')), ''),
        nullif(trim(coalesce(p_phone, '')), ''),
        now(), now()
      ) returning id into v_customer_id;
    else
      update public.customers
      set name = coalesce(nullif(trim(coalesce(p_customer_name, '')), ''), name),
          phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
          phone_number = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone_number),
          updated_at = now()
      where id = v_customer_id;
    end if;
  end if;

  if v_vehicle_id is not null then
    if not exists (
      select 1 from public.vehicles v
      where v.id = v_vehicle_id
        and v.shop_id = p_shop_id
        and (v.customer_id = v_customer_id or v.customer_id is null)
    ) then
      raise exception using errcode = 'P0001', message = 'Vehicle does not belong to this customer/shop.';
    end if;
  else
    if nullif(trim(coalesce(p_vehicle_plate, '')), '') is not null then
      select v.id into v_vehicle_id
      from public.vehicles v
      where v.shop_id = p_shop_id
        and lower(regexp_replace(coalesce(v.license_plate, ''), '[^a-zA-Z0-9]', '', 'g')) =
            lower(regexp_replace(p_vehicle_plate, '[^a-zA-Z0-9]', '', 'g'))
      order by v.created_at desc nulls last
      limit 1;
    end if;
    if v_vehicle_id is null and (
      p_vehicle_year is not null
      or nullif(trim(coalesce(p_vehicle_make, '')), '') is not null
      or nullif(trim(coalesce(p_vehicle_model, '')), '') is not null
      or nullif(trim(coalesce(p_vehicle_plate, '')), '') is not null
    ) then
      insert into public.vehicles(
        shop_id, customer_id, year, make, model, license_plate, created_at
      ) values (
        p_shop_id, v_customer_id, p_vehicle_year,
        nullif(trim(coalesce(p_vehicle_make, '')), ''),
        nullif(trim(coalesce(p_vehicle_model, '')), ''),
        nullif(trim(coalesce(p_vehicle_plate, '')), ''),
        now()
      ) returning id into v_vehicle_id;
    elsif v_vehicle_id is not null then
      update public.vehicles
      set customer_id = coalesce(customer_id, v_customer_id)
      where id = v_vehicle_id and shop_id = p_shop_id;
    end if;
  end if;

  insert into public.service_addresses(
    shop_id, customer_id, label, address_line1, city,
    province_state, postal_code, country_code, created_by, updated_at
  ) values (
    p_shop_id, v_customer_id, 'Service call', trim(p_address_line1),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_province_state, '')), ''),
    nullif(trim(coalesce(p_postal_code, '')), ''),
    'CA', v_profile.id, now()
  ) returning id into v_address_id;

  insert into public.bookings(
    shop_id, customer_id, vehicle_id, starts_at, ends_at,
    status, notes, created_by, lifecycle_metadata, updated_at
  ) values (
    p_shop_id, v_customer_id, v_vehicle_id, p_starts_at, v_ends_at,
    'confirmed', v_concern, v_profile.id,
    jsonb_strip_nulls(jsonb_build_object(
      'service_mode', 'mobile',
      'created_actor_mode', 'staff',
      'source', 'rapid_mobile_intake',
      'service_address_id', v_address_id,
      'customer_concern', v_concern,
      'quoted_price', p_quoted_price,
      'quoted_currency', v_currency,
      'quoted_at', case when p_quoted_price is null then null else now() end,
      'intake_phone', nullif(trim(coalesce(p_phone, '')), '')
    )),
    now()
  ) returning id into v_booking_id;

  select sv.id into v_visit_id
  from public.service_visits sv
  where sv.booking_id = v_booking_id
  limit 1
  for update;
  if v_visit_id is null then
    raise exception using errcode = 'P0001', message = 'Mobile booking did not materialize a Service Visit.';
  end if;

  update public.service_visits sv
  set service_address_id = v_address_id,
      dispatch_notes = v_concern,
      lifecycle_metadata = coalesce(sv.lifecycle_metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'source', 'rapid_mobile_intake',
        'customer_concern', v_concern,
        'quoted_price', p_quoted_price,
        'quoted_currency', v_currency
      )),
      assigned_user_id = case
        when public.mobile_is_field_operator(p_shop_id, v_profile.id) then v_profile.id
        else sv.assigned_user_id
      end,
      version = sv.version + 1,
      updated_at = now()
  where sv.id = v_visit_id;

  if public.mobile_is_field_operator(p_shop_id, v_profile.id) then
    perform public.dispatch_sync_technician_reservation(v_visit_id);
    perform public.dispatch_record_visit_event(
      v_visit_id, 'assigned', p_actor_user_id, 'scheduled', 'scheduled',
      jsonb_build_object('source', 'rapid_mobile_intake', 'auto_assigned', true)
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'customerId', v_customer_id,
    'vehicleId', v_vehicle_id,
    'bookingId', v_booking_id,
    'serviceVisitId', v_visit_id,
    'serviceAddressId', v_address_id,
    'scheduledStart', p_starts_at,
    'scheduledEnd', v_ends_at
  );

  insert into public.mobile_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, result
  ) values (
    p_shop_id, 'rapid_service_intake', p_operation_key, auth.uid(), v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;

  return v_result;
end;
$$;

revoke all on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,timestamptz,integer,numeric,text,uuid,text
) from public, anon;
grant execute on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,timestamptz,integer,numeric,text,uuid,text
) to authenticated, service_role;

create or replace function public.mobile_create_service_followup_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_service_visit_id uuid,
  p_recommendation text,
  p_disposition text,
  p_estimated_amount numeric,
  p_follow_up_at timestamptz,
  p_notes text,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_followup_id uuid;
  v_disposition text := lower(coalesce(nullif(trim(p_disposition), ''), 'quote_later'));
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;
  if nullif(trim(coalesce(p_recommendation, '')), '') is null then
    raise exception using errcode = '22023', message = 'Recommendation is required.';
  end if;
  if v_disposition not in ('quote_later','contact_later','monitor') then
    raise exception using errcode = '22023', message = 'Invalid follow-up disposition.';
  end if;
  if p_estimated_amount is not null and p_estimated_amount < 0 then
    raise exception using errcode = '22023', message = 'Estimated amount cannot be negative.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':mobile-followup:' || p_operation_key, 0));
  select mok.result into v_existing
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_service_followup'
    and mok.operation_key = p_operation_key;
  if v_existing is not null then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;

  select * into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id and wo.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found.';
  end if;

  if not public.dispatch_can_manage(p_shop_id, p_actor_user_id)
     and not public.mobile_is_field_operator(p_shop_id, v_profile.id)
     and not exists (
       select 1 from public.service_visits sv
       where sv.shop_id = p_shop_id
         and sv.work_order_id = p_work_order_id
         and sv.assigned_user_id = v_profile.id
     ) then
    raise exception using errcode = '42501', message = 'Field execution access is required.';
  end if;

  if p_service_visit_id is not null and not exists (
    select 1 from public.service_visits sv
    where sv.id = p_service_visit_id
      and sv.shop_id = p_shop_id
      and sv.work_order_id = p_work_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'Service Visit does not match the work order.';
  end if;

  insert into public.mobile_service_followups(
    shop_id, work_order_id, service_visit_id, customer_id, vehicle_id,
    recommendation, disposition, estimated_amount, follow_up_at,
    notes, recommended_by, updated_at
  ) values (
    p_shop_id, p_work_order_id, p_service_visit_id,
    v_work_order.customer_id, v_work_order.vehicle_id,
    trim(p_recommendation), v_disposition, p_estimated_amount, p_follow_up_at,
    nullif(trim(coalesce(p_notes, '')), ''), v_profile.id, now()
  ) returning id into v_followup_id;

  v_existing := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'followupId', v_followup_id,
    'workOrderId', p_work_order_id,
    'status', 'open',
    'disposition', v_disposition
  );

  insert into public.mobile_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'mobile_service_followup', p_operation_key, auth.uid(), p_work_order_id, v_existing
  ) on conflict (shop_id, operation_name, operation_key) do nothing;

  return v_existing;
end;
$$;

revoke all on function public.mobile_create_service_followup_atomic(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) from public, anon;
grant execute on function public.mobile_create_service_followup_atomic(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) to authenticated, service_role;

-- Replay-safe mobile transition. The persisted from-status makes a queued
-- command fail closed if another device has moved the visit, while a command
-- whose target state is already present replays idempotently.
create or replace function public.mobile_replay_service_visit_transition_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_from_status text,
  p_to_status text,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_result jsonb;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if not public.dispatch_can_execute(p_shop_id, p_actor_user_id, p_visit_id) then
    raise exception using errcode = '42501', message = 'Field execution access is required.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;

  select * into v_visit
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Service Visit not found.';
  end if;

  if v_visit.status = lower(p_to_status) then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'visit', public.dispatch_visit_snapshot(p_visit_id)
    );
  end if;
  if v_visit.status <> lower(p_from_status) then
    raise exception using errcode = '40001', message = 'SERVICE_VISIT_STATE_CHANGED';
  end if;

  v_result := public.dispatch_transition_service_visit_atomic(
    p_shop_id,
    p_visit_id,
    lower(p_to_status),
    null,
    null,
    v_visit.version,
    p_actor_user_id,
    p_operation_key
  );
  return v_result;
end;
$$;

revoke all on function public.mobile_replay_service_visit_transition_atomic(
  uuid,uuid,text,text,uuid,text
) from public, anon;
grant execute on function public.mobile_replay_service_visit_transition_atomic(
  uuid,uuid,text,text,uuid,text
) to authenticated, service_role;

comment on table public.mobile_field_operators is
  'Explicit field-execution capability. This does not change or alias the canonical profile role.';
comment on table public.mobile_service_followups is
  'User-authored future-work opportunities captured during Mobile Service without adding them to the current invoice.';
comment on function public.mobile_create_service_call_atomic is
  'Rapid Mobile Service intake that reuses canonical customer, vehicle, booking, scheduler, and Service Visit records.';

notify pgrst, 'reload schema';

commit;
