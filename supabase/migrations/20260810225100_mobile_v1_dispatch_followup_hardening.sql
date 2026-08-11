begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Future-work rows are visible to management, the person who authored them,
-- or the field operator assigned to the linked Service Visit. A generic shop
-- member must not be able to browse every customer's future-work pipeline.
drop policy if exists mobile_service_followups_member_select
  on public.mobile_service_followups;
drop policy if exists mobile_service_followups_scoped_select
  on public.mobile_service_followups;
create policy mobile_service_followups_scoped_select
on public.mobile_service_followups for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.shop_id = mobile_service_followups.shop_id
      and (p.id = auth.uid() or p.user_id = auth.uid())
      and lower(coalesce(p.role, '')) in (
        'owner','admin','manager','advisor','service','lead_hand','leadhand','foreman'
      )
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = mobile_service_followups.recommended_by
      and p.shop_id = mobile_service_followups.shop_id
      and (p.id = auth.uid() or p.user_id = auth.uid())
  )
  or exists (
    select 1
    from public.service_visits sv
    join public.profiles p on p.id = sv.assigned_user_id
    where sv.id = mobile_service_followups.service_visit_id
      and sv.shop_id = mobile_service_followups.shop_id
      and (p.id = auth.uid() or p.user_id = auth.uid())
  )
);

-- Rapid intake only self-assigns when the shop is explicitly configured as a
-- solo/no-dispatch workflow. Team shops that use Dispatch keep the new visit
-- unassigned so the canonical Dispatch board owns technician/truck assignment.
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

  v_can_intake := lower(coalesce(v_profile.role, '')) in (
    'owner','admin','manager','advisor','service','mechanic','technician','tech','lead_hand','leadhand','foreman'
  ) or public.mobile_is_field_operator(p_shop_id, v_profile.id);
  if not v_can_intake then
    raise exception using errcode = '42501', message = 'Mobile intake is not allowed for this actor.';
  end if;

  select
    public.mobile_is_field_operator(p_shop_id, v_profile.id)
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
        when v_auto_assign then v_profile.id
        else sv.assigned_user_id
      end,
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
    'assignedToCurrentActor', v_auto_assign,
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

notify pgrst, 'reload schema';

commit;
