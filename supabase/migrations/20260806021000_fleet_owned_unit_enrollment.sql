begin;

-- Fleet managers now own asset enrollment from the Fleet product. Keep the
-- security-definer RPC as the single mutation boundary, but bind every new or
-- newly enrolled vehicle to the customer account owned by the selected fleet.
create or replace function public.manage_fleet_unit_enrollment(
  p_action text,
  p_fleet_id uuid,
  p_vehicle_id uuid default null,
  p_driver_profile_id uuid default null,
  p_unit_number text default null,
  p_vin text default null,
  p_license_plate text default null,
  p_year integer default null,
  p_make text default null,
  p_model text default null,
  p_nickname text default null,
  p_route_label text default null,
  p_pretrip_due_local_time time without time zone default '07:00'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_customer_id uuid;
  v_vehicle_id uuid := p_vehicle_id;
  v_vehicle_customer_id uuid;
  v_assignment_id uuid;
  v_timezone text;
  v_due_at timestamptz;
  v_is_internal boolean := false;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select f.shop_id, f.customer_id
  into v_shop_id, v_customer_id
  from public.fleets f
  where f.id = p_fleet_id;
  if v_shop_id is null or v_customer_id is null then
    raise exception 'Fleet not found';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.shop_id = v_shop_id
      and p.role in ('owner','admin','manager')
  ) into v_is_internal;

  if not (
    v_is_internal
    or exists (
      select 1
      from public.fleet_members m
      where m.user_id = v_user_id
        and m.fleet_id = p_fleet_id
        and m.role in ('owner','admin','manager','fleet_manager','dispatcher','approver')
    )
  ) then
    raise exception 'Fleet management access required';
  end if;

  if p_action = 'create_and_enroll' then
    if nullif(btrim(coalesce(p_unit_number,'')),'') is null
       and nullif(btrim(coalesce(p_vin,'')),'') is null
       and nullif(btrim(coalesce(p_license_plate,'')),'') is null then
      raise exception 'Unit number, VIN, or plate is required';
    end if;

    if exists (
      select 1
      from public.vehicles v
      where v.shop_id = v_shop_id
        and (
          (nullif(btrim(coalesce(p_vin,'')),'') is not null and upper(v.vin) = upper(btrim(p_vin)))
          or (nullif(btrim(coalesce(p_license_plate,'')),'') is not null and upper(v.license_plate) = upper(btrim(p_license_plate)))
          or (nullif(btrim(coalesce(p_unit_number,'')),'') is not null and upper(v.unit_number) = upper(btrim(p_unit_number)))
        )
    ) then
      raise exception 'A matching vehicle already exists; enroll the existing record';
    end if;

    insert into public.vehicles (
      shop_id, customer_id, unit_number, vin, license_plate, year, make, model
    )
    values (
      v_shop_id, v_customer_id, nullif(btrim(p_unit_number),''),
      nullif(btrim(p_vin),''), nullif(btrim(p_license_plate),''), p_year,
      nullif(btrim(p_make),''), nullif(btrim(p_model),'')
    )
    returning id into v_vehicle_id;
  elsif p_action not in ('enroll_existing','assign') then
    raise exception 'Unsupported fleet enrollment action';
  end if;

  if v_vehicle_id is null then raise exception 'Vehicle is required'; end if;

  select v.customer_id
  into v_vehicle_customer_id
  from public.vehicles v
  where v.id = v_vehicle_id
    and v.shop_id = v_shop_id;
  if not found then raise exception 'Vehicle is not in this shop'; end if;

  if p_action = 'assign' and not exists (
    select 1
    from public.fleet_vehicles fv
    where fv.fleet_id = p_fleet_id
      and fv.vehicle_id = v_vehicle_id
      and coalesce(fv.active, true)
  ) then
    raise exception 'Enroll the unit before assigning a driver';
  end if;

  if p_action = 'enroll_existing' and not exists (
    select 1
    from public.fleet_vehicles fv
    where fv.fleet_id = p_fleet_id
      and fv.vehicle_id = v_vehicle_id
  ) then
    if v_vehicle_customer_id is null and v_is_internal then
      update public.vehicles
      set customer_id = v_customer_id
      where id = v_vehicle_id
        and shop_id = v_shop_id
        and customer_id is null;
    elsif v_vehicle_customer_id is distinct from v_customer_id then
      raise exception 'Vehicle is not owned by this Fleet account';
    end if;
  end if;

  insert into public.fleet_vehicles (
    fleet_id, vehicle_id, shop_id, nickname, active
  )
  values (
    p_fleet_id, v_vehicle_id, v_shop_id, nullif(btrim(p_nickname),''), true
  )
  on conflict (fleet_id,vehicle_id) do update
  set shop_id = excluded.shop_id,
      nickname = coalesce(excluded.nickname,public.fleet_vehicles.nickname),
      active = true;

  if p_action = 'assign' then
    if p_driver_profile_id is null then raise exception 'Driver is required'; end if;
    if not exists (
      select 1
      from public.fleet_members m
      where m.fleet_id = p_fleet_id
        and m.user_id = p_driver_profile_id
        and m.role in ('driver','viewer')
    ) then
      raise exception 'Driver must be an active driver member of this fleet';
    end if;

    select coalesce(nullif(s.timezone,''),'America/Los_Angeles')
    into v_timezone
    from public.shops s
    where s.id = v_shop_id;
    v_due_at := ((now() at time zone v_timezone)::date + p_pretrip_due_local_time) at time zone v_timezone;
    if v_due_at <= now() then
      v_due_at := (((now() at time zone v_timezone)::date + 1) + p_pretrip_due_local_time) at time zone v_timezone;
    end if;

    update public.fleet_dispatch_assignments
    set active = false, updated_at = now()
    where fleet_id = p_fleet_id
      and vehicle_id = v_vehicle_id
      and active;

    insert into public.fleet_dispatch_assignments (
      shop_id, fleet_id, vehicle_id, driver_profile_id, driver_name,
      unit_label, vehicle_identifier, route_label, next_pretrip_due, state,
      active, pretrip_required, pretrip_due_local_time, assigned_at, assigned_by
    )
    select
      v_shop_id, p_fleet_id, v_vehicle_id, p_driver_profile_id,
      coalesce(nullif(p.full_name,''),nullif(p.email,''),'Driver'),
      coalesce(nullif(p_nickname,''),nullif(v.unit_number,''),nullif(v.license_plate,''),nullif(v.vin,''),'Unit'),
      coalesce(nullif(v.unit_number,''),nullif(v.license_plate,''),nullif(v.vin,'')),
      nullif(btrim(p_route_label),''), v_due_at, 'pretrip_due', true, true,
      p_pretrip_due_local_time, now(), v_user_id
    from public.profiles p
    cross join public.vehicles v
    where p.id = p_driver_profile_id
      and v.id = v_vehicle_id
    returning id into v_assignment_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'fleetId', p_fleet_id,
    'vehicleId', v_vehicle_id,
    'assignmentId', v_assignment_id
  );
end;
$function$;

revoke execute on function public.manage_fleet_unit_enrollment(
  text,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,time without time zone
) from public, anon;
grant execute on function public.manage_fleet_unit_enrollment(
  text,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,time without time zone
) to authenticated, service_role;

commit;
