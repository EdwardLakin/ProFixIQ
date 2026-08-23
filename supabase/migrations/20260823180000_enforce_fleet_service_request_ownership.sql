begin;

-- Fleet service requests are billed to the Fleet customer account. Reject
-- stale or legacy enrollments whose vehicle is owned by another customer
-- before any request can enter the Shop handoff queue.
create or replace function private.enforce_fleet_service_request_vehicle_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_fleet_shop_id uuid;
  v_fleet_customer_id uuid;
  v_vehicle_shop_id uuid;
  v_vehicle_customer_id uuid;
begin
  select f.shop_id, f.customer_id
  into v_fleet_shop_id, v_fleet_customer_id
  from public.fleets f
  where f.id = new.fleet_id;

  select v.shop_id, v.customer_id
  into v_vehicle_shop_id, v_vehicle_customer_id
  from public.vehicles v
  where v.id = new.vehicle_id;

  if v_fleet_shop_id is null
     or v_vehicle_shop_id is null
     or new.shop_id is distinct from v_fleet_shop_id
     or v_vehicle_shop_id is distinct from v_fleet_shop_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'PFX_FLEET_REQUEST_SCOPE_MISMATCH';
  end if;

  if v_fleet_customer_id is null
     or v_vehicle_customer_id is null
     or v_vehicle_customer_id is distinct from v_fleet_customer_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'PFX_FLEET_UNIT_OWNERSHIP_MISMATCH';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_fleet_service_request_vehicle_ownership()
  from public, anon, authenticated;

drop trigger if exists trg_enforce_fleet_service_request_vehicle_ownership
  on public.fleet_service_requests;
create trigger trg_enforce_fleet_service_request_vehicle_ownership
before insert or update of shop_id, fleet_id, vehicle_id
on public.fleet_service_requests
for each row
execute function private.enforce_fleet_service_request_vehicle_ownership();

-- Production already carried this invariant as schema drift. Reconcile it
-- into migration history and replace identifier-bearing exceptions with
-- stable product error codes.
create or replace function public.enforce_work_order_customer_vehicle_consistency()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_vehicle_customer_id uuid;
begin
  if new.vehicle_id is null then
    return new;
  end if;

  select v.customer_id
  into v_vehicle_customer_id
  from public.vehicles v
  where v.id = new.vehicle_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PFX_WORK_ORDER_VEHICLE_NOT_FOUND';
  end if;

  if v_vehicle_customer_id is null then
    return new;
  end if;

  if new.customer_id is null then
    new.customer_id := v_vehicle_customer_id;
  elsif new.customer_id is distinct from v_vehicle_customer_id then
    raise exception using
      errcode = 'P0001',
      message = 'PFX_WORK_ORDER_CUSTOMER_VEHICLE_MISMATCH';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_work_order_customer_vehicle_consistency()
  from public, anon, authenticated;
grant execute on function public.enforce_work_order_customer_vehicle_consistency()
  to service_role;

drop trigger if exists trg_enforce_work_order_customer_vehicle_consistency
  on public.work_orders;
create trigger trg_enforce_work_order_customer_vehicle_consistency
before insert or update of customer_id, vehicle_id
on public.work_orders
for each row
execute function public.enforce_work_order_customer_vehicle_consistency();

-- The Fleet request vocabulary uses `diagnostic`; Shop work-order lines use
-- the canonical `diagnosis` job type. Translate at the handoff boundary.
create or replace function public.convert_fleet_service_request_to_work_order_atomic(
  p_service_request_id uuid
)
returns table(work_order_id uuid, conversion_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request public.fleet_service_requests%rowtype;
  v_fleet public.fleets%rowtype;
  v_work_order_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_request
  from public.fleet_service_requests
  where id = p_service_request_id
  for update;

  if v_request.id is null then
    raise exception 'Service request not found';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.shop_id = v_request.shop_id
      and p.role in ('owner', 'admin', 'manager', 'advisor')
  ) then
    raise exception 'Shop staff review is required';
  end if;

  select * into v_fleet
  from public.fleets f
  where f.id = v_request.fleet_id
    and f.shop_id = v_request.shop_id;

  if v_fleet.id is null or v_fleet.customer_id is null then
    raise exception 'Fleet billing account is unavailable';
  end if;

  if not exists (
    select 1 from public.fleet_vehicles fv
    where fv.fleet_id = v_request.fleet_id
      and fv.vehicle_id = v_request.vehicle_id
      and (fv.shop_id is null or fv.shop_id = v_request.shop_id)
      and coalesce(fv.active, true)
  ) then
    raise exception 'Vehicle is not actively enrolled in this Fleet';
  end if;

  if v_request.work_order_id is not null then
    return query select v_request.work_order_id, 'already_linked'::text;
    return;
  end if;

  if not exists (
    select 1 from public.fleet_service_request_lines l
    where l.service_request_id = v_request.id
  ) or exists (
    select 1 from public.fleet_service_request_lines l
    where l.service_request_id = v_request.id
      and (
        l.shop_id <> v_request.shop_id
        or l.fleet_id <> v_request.fleet_id
        or l.vehicle_id <> v_request.vehicle_id
      )
  ) then
    raise exception 'Structured request lines must match the request scope';
  end if;

  insert into public.work_orders (
    shop_id,
    customer_id,
    customer_name,
    vehicle_id,
    status,
    approval_state,
    source_fleet_service_request_id,
    created_by,
    notes
  ) values (
    v_request.shop_id,
    v_fleet.customer_id,
    v_fleet.name,
    v_request.vehicle_id,
    'awaiting_approval',
    'pending',
    v_request.id,
    v_user_id,
    concat('Fleet request: ', v_request.title, E'\n', v_request.summary)
  ) returning id into v_work_order_id;

  insert into public.work_order_lines (
    work_order_id,
    shop_id,
    vehicle_id,
    description,
    complaint,
    notes,
    labor_time,
    job_type,
    status,
    approval_state,
    menu_item_id,
    inspection_template_id,
    price_estimate,
    line_type,
    source_fleet_service_request_line_id
  )
  select
    v_work_order_id,
    l.shop_id,
    l.vehicle_id,
    l.description,
    case when l.line_kind = 'diagnostic' then l.description else null end,
    l.notes,
    l.requested_labor_hours,
    case
      when l.line_kind = 'diagnostic' then 'diagnosis'
      when l.line_kind in ('inspection', 'pm_package') then 'maintenance'
      else 'repair'
    end,
    'awaiting',
    'pending',
    l.source_menu_item_id,
    l.source_inspection_template_id,
    case
      when l.unit_price_snapshot is null then null
      else l.unit_price_snapshot * l.quantity
    end,
    'job',
    l.id
  from public.fleet_service_request_lines l
  where l.service_request_id = v_request.id
  order by l.created_at, l.id;

  update public.fleet_service_request_lines
  set work_order_line_id = wol.id,
      updated_at = now()
  from public.work_order_lines wol
  where wol.work_order_id = v_work_order_id
    and wol.source_fleet_service_request_line_id = fleet_service_request_lines.id;

  update public.fleet_service_requests
  set work_order_id = v_work_order_id,
      status = 'scheduled',
      updated_at = now()
  where id = v_request.id;

  update public.fleet_pm_due_events
  set service_request_id = v_request.id,
      status = 'converted',
      updated_at = now()
  where id = v_request.source_pm_due_event_id;

  return query select v_work_order_id, 'converted'::text;
end;
$function$;

revoke all on function public.convert_fleet_service_request_to_work_order_atomic(uuid)
  from public, anon;
grant execute on function public.convert_fleet_service_request_to_work_order_atomic(uuid)
  to authenticated, service_role;

do $fleet_request_ownership_postcheck$
begin
  if to_regprocedure(
    'private.enforce_fleet_service_request_vehicle_ownership()'
  ) is null then
    raise exception 'Fleet request ownership guard is missing';
  end if;

  if to_regprocedure(
    'public.enforce_work_order_customer_vehicle_consistency()'
  ) is null then
    raise exception 'Work-order customer/vehicle guard is missing';
  end if;

  if pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.convert_fleet_service_request_to_work_order_atomic(uuid)'::pg_catalog.regprocedure
    ),
    $$when l.line_kind = 'diagnostic' then 'diagnosis'$$
  ) = 0 then
    raise exception 'Fleet diagnostic job-type translation is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.fleet_service_requests'::pg_catalog.regclass
      and t.tgname = 'trg_enforce_fleet_service_request_vehicle_ownership'
      and not t.tgisinternal
  ) then
    raise exception 'Fleet request ownership trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.work_orders'::pg_catalog.regclass
      and t.tgname = 'trg_enforce_work_order_customer_vehicle_consistency'
      and not t.tgisinternal
  ) then
    raise exception 'Work-order customer/vehicle trigger is missing';
  end if;
end;
$fleet_request_ownership_postcheck$;

commit;
