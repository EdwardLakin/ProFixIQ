begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Keep Mobile-specific SQL authorization aligned with the canonical application
-- RBAC groups instead of reusing Dispatch management as a proxy.
create or replace function public.mobile_can_manage_work_orders(
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
    where p.shop_id = p_shop_id
      and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and lower(coalesce(p.role, '')) in (
        'owner','admin','manager','advisor','service','lead_hand','leadhand','foreman'
      )
  );
$$;

create or replace function public.mobile_can_manage_followups(
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
    where p.shop_id = p_shop_id
      and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and lower(coalesce(p.role, '')) in (
        'owner','admin','manager','advisor','service','lead_hand','leadhand','foreman'
      )
  );
$$;

revoke all on function public.mobile_can_manage_work_orders(uuid,uuid) from public, anon;
revoke all on function public.mobile_can_manage_followups(uuid,uuid) from public, anon;
grant execute on function public.mobile_can_manage_work_orders(uuid,uuid) to authenticated, service_role;
grant execute on function public.mobile_can_manage_followups(uuid,uuid) to authenticated, service_role;

-- Mobile setup may only adopt/update vehicles explicitly owned by Mobile V1.
-- Existing canonical service vehicles for the same technician remain untouched.
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
  v_unit_number text := nullif(trim(coalesce(p_service_vehicle_unit_number, '')), '');
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
      and coalesce(sv.capabilities, '{}'::jsonb) @> '{"mobile_v1":true}'::jsonb
    order by sv.created_at
    limit 1
    for update;

    if v_unit_number is not null and exists (
      select 1
      from public.service_vehicles sv
      where sv.shop_id = p_shop_id
        and lower(trim(coalesce(sv.unit_number, ''))) = lower(v_unit_number)
        and (v_vehicle_id is null or sv.id <> v_vehicle_id)
    ) then
      raise exception using errcode = '23505', message = 'Service vehicle unit number is already in use.';
    end if;

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
    elsif not coalesce(p_truck_inventory_enabled, false) then
      v_stock_location_id := null;
    end if;

    if v_vehicle_id is null then
      insert into public.service_vehicles(
        shop_id, name, unit_number, primary_user_id, stock_location_id,
        active, capabilities, created_by, updated_at
      ) values (
        p_shop_id,
        coalesce(nullif(trim(p_service_vehicle_name), ''), 'Service Truck'),
        v_unit_number,
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
          unit_number = v_unit_number,
          stock_location_id = v_stock_location_id,
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

-- Rapid intake now obeys the configured service model. Shop-only configuration
-- forces shop mode, mobile-only forces mobile mode, and mixed configuration
-- requires the caller to choose the physical mode for this call.
drop function if exists public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,timestamptz,integer,numeric,text,uuid,text
);

create function public.mobile_create_service_call_atomic(
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
  p_service_mode text,
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
  v_vehicle_customer_id uuid;
  v_address_id uuid;
  v_booking_id uuid;
  v_visit_id uuid;
  v_ends_at timestamptz;
  v_existing jsonb;
  v_result jsonb;
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_currency text;
  v_country_code text;
  v_shop_country text;
  v_config_model text;
  v_mode text;
  v_requested_mode text := lower(nullif(trim(coalesce(p_service_mode, '')), ''));
  v_concern text := nullif(trim(coalesce(p_concern, '')), '');
  v_can_intake boolean := false;
  v_auto_assign boolean := false;
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

  select
    lower(trim(coalesce(s.country, 'US'))),
    lower(coalesce(ms.service_model,
      case when s.location_type = 'mobile_service_branch' then 'mobile' else 'shop' end
    ))
  into v_shop_country, v_config_model
  from public.shops s
  left join public.mobile_service_settings ms on ms.shop_id = s.id
  where s.id = p_shop_id;
  if not found then
    raise exception using errcode = '23503', message = 'Shop not found.';
  end if;

  if v_shop_country in ('ca','can','canada') then
    v_country_code := 'CA';
    v_currency := 'CAD';
  else
    v_country_code := 'US';
    v_currency := 'USD';
  end if;
  perform p_currency;

  if v_config_model = 'both' then
    if v_requested_mode not in ('shop','mobile') then
      raise exception using errcode = '22023', message = 'Choose shop or mobile service for this call.';
    end if;
    v_mode := v_requested_mode;
  elsif v_config_model in ('shop','mobile') then
    v_mode := v_config_model;
  else
    v_mode := case when v_requested_mode in ('shop','mobile') then v_requested_mode else 'shop' end;
  end if;

  v_can_intake := lower(coalesce(v_profile.role, '')) in (
    'owner','admin','manager','advisor','service','mechanic','technician','tech','lead_hand','leadhand','foreman'
  ) or public.mobile_is_field_operator(p_shop_id, v_profile.id);
  if not v_can_intake then
    raise exception using errcode = '42501', message = 'Mobile intake is not allowed for this actor.';
  end if;

  select
    v_mode = 'mobile'
    and public.mobile_is_field_operator(p_shop_id, v_profile.id)
    and (coalesce(ms.solo_mode, false) or not coalesce(ms.dispatch_enabled, true))
  into v_auto_assign
  from public.mobile_service_settings ms
  where ms.shop_id = p_shop_id;
  v_auto_assign := coalesce(v_auto_assign, false);

  if p_starts_at is null then
    raise exception using errcode = '22023', message = 'Arrival time is required.';
  end if;
  if coalesce(p_duration_minutes, 0) not between 5 and 720 then
    raise exception using errcode = '22023', message = 'Visit length must be between 5 and 720 minutes.';
  end if;
  if v_concern is null then
    raise exception using errcode = '22023', message = 'Customer concern is required.';
  end if;
  if v_mode = 'mobile' and nullif(trim(coalesce(p_address_line1, '')), '') is null then
    raise exception using errcode = '22023', message = 'Service location is required for mobile work.';
  end if;
  if p_quoted_price is not null and p_quoted_price < 0 then
    raise exception using errcode = '22023', message = 'Quoted price cannot be negative.';
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
    select v.customer_id into v_vehicle_customer_id
    from public.vehicles v
    where v.id = v_vehicle_id and v.shop_id = p_shop_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'Vehicle does not belong to this shop.';
    end if;
    if v_vehicle_customer_id is not null and v_vehicle_customer_id <> v_customer_id then
      raise exception using errcode = '23503', message = 'Vehicle does not belong to the selected customer.';
    end if;
    if v_vehicle_customer_id is null then
      update public.vehicles set customer_id = v_customer_id
      where id = v_vehicle_id and shop_id = p_shop_id;
    end if;
  else
    if nullif(trim(coalesce(p_vehicle_plate, '')), '') is not null then
      select v.id, v.customer_id into v_vehicle_id, v_vehicle_customer_id
      from public.vehicles v
      where v.shop_id = p_shop_id
        and lower(regexp_replace(coalesce(v.license_plate, ''), '[^a-zA-Z0-9]', '', 'g')) =
            lower(regexp_replace(p_vehicle_plate, '[^a-zA-Z0-9]', '', 'g'))
      order by v.created_at desc nulls last
      limit 1;

      if v_vehicle_id is not null
         and v_vehicle_customer_id is not null
         and v_vehicle_customer_id <> v_customer_id then
        raise exception using errcode = '23503', message = 'VEHICLE_PLATE_OWNERSHIP_CONFLICT';
      end if;
      if v_vehicle_id is not null and v_vehicle_customer_id is null then
        update public.vehicles set customer_id = v_customer_id
        where id = v_vehicle_id and shop_id = p_shop_id;
      end if;
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
    end if;
  end if;

  if v_vehicle_id is null then
    raise exception using errcode = '22023', message = 'Vehicle is required for service intake.';
  end if;

  if v_mode = 'mobile' then
    insert into public.service_addresses(
      shop_id, customer_id, label, address_line1, city,
      province_state, postal_code, country_code, created_by, updated_at
    ) values (
      p_shop_id, v_customer_id, 'Service call', trim(p_address_line1),
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_province_state, '')), ''),
      nullif(trim(coalesce(p_postal_code, '')), ''),
      v_country_code, v_profile.id, now()
    ) returning id into v_address_id;
  end if;

  insert into public.bookings(
    shop_id, customer_id, vehicle_id, starts_at, ends_at,
    status, notes, created_by, lifecycle_metadata, updated_at
  ) values (
    p_shop_id, v_customer_id, v_vehicle_id, p_starts_at, v_ends_at,
    'confirmed', v_concern, v_profile.id,
    jsonb_strip_nulls(jsonb_build_object(
      'service_mode', v_mode,
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

  if v_visit_id is null and v_mode = 'shop' then
    insert into public.service_visits(
      shop_id, booking_id, work_order_id, service_address_id,
      mode, status, scheduled_start, scheduled_end,
      dispatch_notes, lifecycle_metadata, created_by,
      last_status_at, last_status_by
    ) values (
      p_shop_id, v_booking_id, null, null,
      'shop', 'scheduled', p_starts_at, v_ends_at,
      v_concern,
      jsonb_build_object('source', 'rapid_mobile_intake', 'service_mode', 'shop'),
      v_profile.id, now(), v_profile.id
    ) returning id into v_visit_id;

    insert into public.service_visit_events(
      shop_id, service_visit_id, event_type, from_status, to_status,
      actor_user_id, assigned_user_id, service_vehicle_id, metadata
    ) values (
      p_shop_id, v_visit_id, 'created', null, 'scheduled',
      v_profile.id, null, null,
      jsonb_build_object('source', 'rapid_shop_intake', 'booking_id', v_booking_id)
    );
  end if;

  if v_visit_id is null then
    raise exception using errcode = 'P0001', message = 'Booking did not materialize a Service Visit.';
  end if;

  update public.service_visits sv
  set service_address_id = case when v_mode = 'mobile' then v_address_id else null end,
      dispatch_notes = v_concern,
      lifecycle_metadata = coalesce(sv.lifecycle_metadata, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'source', 'rapid_mobile_intake',
          'service_mode', v_mode,
          'customer_concern', v_concern,
          'quoted_price', p_quoted_price,
          'quoted_currency', v_currency
        )),
      assigned_user_id = case when v_auto_assign then v_profile.id else sv.assigned_user_id end,
      version = sv.version + 1,
      updated_at = now()
  where sv.id = v_visit_id;

  if v_auto_assign then
    perform public.dispatch_sync_technician_reservation(v_visit_id);
    perform public.dispatch_record_visit_event(
      v_visit_id, 'assigned', p_actor_user_id, 'scheduled', 'scheduled',
      jsonb_build_object(
        'source', 'rapid_mobile_intake',
        'auto_assigned', true,
        'reason', 'solo_or_dispatch_disabled'
      )
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
    'serviceMode', v_mode,
    'assignedToCurrentActor', v_auto_assign,
    'currency', v_currency,
    'countryCode', v_country_code,
    'scheduledStart', p_starts_at,
    'scheduledEnd', v_ends_at
  );

  insert into public.mobile_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, result
  ) values (
    p_shop_id, 'rapid_service_intake', p_operation_key,
    coalesce(auth.uid(), p_actor_user_id), v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;

  return v_result;
end;
$$;

revoke all on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,timestamptz,integer,numeric,text,text,uuid,text
) from public, anon;
grant execute on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,timestamptz,integer,numeric,text,text,uuid,text
) to authenticated, service_role;

-- Work-order handoff uses the canonical workOrderCreators role group, while an
-- assigned technician still has the narrow self-service handoff path.
create or replace function public.mobile_materialize_service_visit_work_order_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_visit public.service_visits%rowtype;
  v_booking public.bookings%rowtype;
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_custom_id text;
  v_role text;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;

  select result into v_existing
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_materialize_work_order'
    and mok.operation_key = p_operation_key;
  if found then return v_existing || jsonb_build_object('idempotent', true); end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;
  v_role := lower(coalesce(v_profile.role, ''));

  select * into v_visit
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id
  for update;
  if not found or v_visit.booking_id is null then
    raise exception using errcode = 'P0001', message = 'Booking-backed Service Visit not found.';
  end if;

  if not public.mobile_can_manage_work_orders(p_shop_id, p_actor_user_id)
     and not (
       v_visit.assigned_user_id = v_profile.id
       and public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id)
     ) then
    raise exception using errcode = '42501', message = 'Work-order handoff requires work-order creation authority or the assigned technician.';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = v_visit.booking_id and b.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Linked booking not found.';
  end if;

  if v_visit.work_order_id is not null then
    select * into v_work_order from public.work_orders where id = v_visit.work_order_id and shop_id = p_shop_id;
  elsif v_booking.work_order_id is not null then
    select * into v_work_order from public.work_orders where id = v_booking.work_order_id and shop_id = p_shop_id;
  end if;

  if v_work_order.id is null then
    if v_booking.customer_id is null or v_booking.vehicle_id is null then
      raise exception using errcode = '23503', message = 'Customer and vehicle are required before creating the work order.';
    end if;
    if not exists (
      select 1 from public.vehicles v
      where v.id = v_booking.vehicle_id
        and v.shop_id = p_shop_id
        and v.customer_id = v_booking.customer_id
    ) then
      raise exception using errcode = '23503', message = 'Booking vehicle does not belong to the booking customer.';
    end if;

    if public.mobile_can_manage_work_orders(p_shop_id, p_actor_user_id) then
      select * into v_work_order
      from public.create_work_order_with_custom_id(
        p_shop_id,
        v_booking.customer_id,
        v_booking.vehicle_id,
        coalesce(v_booking.notes, v_visit.dispatch_notes, ''),
        3,
        false,
        case when v_role in ('advisor','service','manager','owner','admin') then v_profile.id else null end
      );
    else
      loop
        v_custom_id := 'WO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
        insert into public.work_orders(
          shop_id, customer_id, vehicle_id, notes, priority, is_waiter,
          created_by, advisor_id, custom_id, status
        ) values (
          p_shop_id, v_booking.customer_id, v_booking.vehicle_id,
          coalesce(v_booking.notes, v_visit.dispatch_notes, ''), 3, false,
          coalesce(auth.uid(), p_actor_user_id), null, v_custom_id, 'awaiting'
        ) on conflict do nothing
        returning * into v_work_order;
        exit when v_work_order.id is not null;
      end loop;
    end if;
  end if;

  update public.bookings
  set work_order_id = v_work_order.id,
      lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb)
        || jsonb_build_object('mobile_work_order_handoff_operation_key', p_operation_key),
      updated_at = now()
  where id = v_booking.id
    and (work_order_id is null or work_order_id = v_work_order.id);

  select * into v_visit
  from public.service_visits
  where id = p_visit_id and shop_id = p_shop_id;
  if v_visit.work_order_id is distinct from v_work_order.id then
    raise exception using errcode = 'P0001', message = 'Service Visit did not accept the work-order handoff.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'serviceVisitId', v_visit.id,
    'bookingId', v_booking.id,
    'workOrderId', v_work_order.id,
    'workOrderNumber', v_work_order.custom_id,
    'visit', public.dispatch_visit_snapshot(v_visit.id)
  );

  insert into public.mobile_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'mobile_materialize_work_order', p_operation_key,
    coalesce(auth.uid(), p_actor_user_id), v_work_order.id, v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

-- Management-authored follow-ups and lifecycle actions use the work-order
-- management roles. Assigned field operators keep their narrow visit-scoped path.
create or replace function public.mobile_guard_service_followup_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid;
begin
  if new.recommended_by is null then
    raise exception using errcode = '42501', message = 'A field recommendation requires an author.';
  end if;

  select coalesce(p.user_id, p.id) into v_actor_user_id
  from public.profiles p
  where p.id = new.recommended_by and p.shop_id = new.shop_id;
  if v_actor_user_id is null then
    raise exception using errcode = '42501', message = 'Recommendation author is not in this shop.';
  end if;

  if public.mobile_can_manage_followups(new.shop_id, v_actor_user_id) then
    return new;
  end if;

  if public.mobile_dispatch_profile_eligible(new.shop_id, new.recommended_by)
     and exists (
       select 1
       from public.service_visits sv
       where sv.shop_id = new.shop_id
         and sv.work_order_id = new.work_order_id
         and sv.assigned_user_id = new.recommended_by
         and (new.service_visit_id is null or sv.id = new.service_visit_id)
     ) then
    return new;
  end if;

  raise exception using errcode = '42501', message = 'Field recommendations require an assigned Service Visit.';
end;
$$;

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
  v_assigned_visit_id uuid;
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

  if not public.mobile_can_manage_followups(p_shop_id, p_actor_user_id) then
    if not public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id) then
      raise exception using errcode = '42501', message = 'Field execution access is required.';
    end if;

    select sv.id into v_assigned_visit_id
    from public.service_visits sv
    where sv.shop_id = p_shop_id
      and sv.work_order_id = p_work_order_id
      and sv.assigned_user_id = v_profile.id
      and (p_service_visit_id is null or sv.id = p_service_visit_id)
    order by sv.created_at desc
    limit 1;

    if v_assigned_visit_id is null then
      raise exception using errcode = '42501', message = 'Field recommendations require an assigned Service Visit.';
    end if;
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
    p_shop_id, p_work_order_id,
    coalesce(p_service_visit_id, v_assigned_visit_id),
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
    p_shop_id, 'mobile_service_followup', p_operation_key,
    coalesce(auth.uid(), p_actor_user_id), p_work_order_id, v_existing
  ) on conflict (shop_id, operation_name, operation_key) do nothing;

  return v_existing;
end;
$$;

create or replace function public.mobile_update_service_followup_status_atomic(
  p_shop_id uuid,
  p_followup_id uuid,
  p_status text,
  p_converted_work_order_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_followup public.mobile_service_followups%rowtype;
  v_existing jsonb;
  v_target text := lower(trim(coalesce(p_status, '')));
  v_result jsonb;
  v_allowed boolean := false;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;
  if v_target not in ('quoted','converted','dismissed') then
    raise exception using errcode = '22023', message = 'Invalid follow-up status.';
  end if;

  select result into v_existing
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_service_followup_status'
    and mok.operation_key = p_operation_key;
  if found then return v_existing || jsonb_build_object('idempotent', true); end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;

  select * into v_followup
  from public.mobile_service_followups f
  where f.id = p_followup_id and f.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Follow-up not found.';
  end if;

  v_allowed := public.mobile_can_manage_followups(p_shop_id, p_actor_user_id)
    or v_followup.recommended_by = v_profile.id
    or (
      public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id)
      and exists (
        select 1 from public.service_visits sv
        where sv.shop_id = p_shop_id
          and sv.work_order_id = v_followup.work_order_id
          and sv.assigned_user_id = v_profile.id
          and (v_followup.service_visit_id is null or sv.id = v_followup.service_visit_id)
      )
    );
  if not v_allowed then
    raise exception using errcode = '42501', message = 'Follow-up update access denied.';
  end if;

  if v_followup.status = v_target then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'followupId', v_followup.id,
      'status', v_followup.status
    );
  end if;
  if v_followup.status in ('converted','dismissed') then
    raise exception using errcode = 'P0001', message = 'Terminal follow-ups cannot be reopened.';
  end if;

  if v_target = 'converted' then
    if p_converted_work_order_id is null or not exists (
      select 1
      from public.work_orders wo
      where wo.id = p_converted_work_order_id
        and wo.shop_id = p_shop_id
        and (v_followup.customer_id is null or wo.customer_id = v_followup.customer_id)
        and (v_followup.vehicle_id is null or wo.vehicle_id = v_followup.vehicle_id)
    ) then
      raise exception using errcode = '23503', message = 'Converted work order must match the follow-up customer and vehicle.';
    end if;
  end if;

  update public.mobile_service_followups
  set status = v_target,
      quoted_at = case when v_target = 'quoted' then coalesce(quoted_at, now()) else quoted_at end,
      converted_work_order_id = case when v_target = 'converted' then p_converted_work_order_id else converted_work_order_id end,
      dismissed_at = case when v_target = 'dismissed' then coalesce(dismissed_at, now()) else dismissed_at end,
      updated_at = now()
  where id = v_followup.id
  returning * into v_followup;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'followupId', v_followup.id,
    'status', v_followup.status,
    'convertedWorkOrderId', v_followup.converted_work_order_id
  );

  insert into public.mobile_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'mobile_service_followup_status', p_operation_key,
    coalesce(auth.uid(), p_actor_user_id), v_followup.work_order_id, v_result
  ) on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

notify pgrst, 'reload schema';

commit;
