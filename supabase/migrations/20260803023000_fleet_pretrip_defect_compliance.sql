-- P0 fleet pre-trip, defect, compliance, enrollment, and assignment lifecycle.
-- This migration is additive and keeps the existing fleet/PM tables authoritative.

alter table public.fleet_dispatch_assignments
  add column if not exists active boolean not null default true,
  add column if not exists pretrip_required boolean not null default true,
  add column if not exists pretrip_due_local_time time without time zone not null default '07:00',
  add column if not exists assigned_at timestamptz not null default now(),
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null;

update public.fleet_dispatch_assignments
set active = false
where state = 'completed' and active;

with ranked as (
  select id,
         row_number() over (
           partition by fleet_id, vehicle_id
           order by updated_at desc nulls last, created_at desc, id
         ) as rn
  from public.fleet_dispatch_assignments
  where active
)
update public.fleet_dispatch_assignments a
set active = false
from ranked r
where a.id = r.id and r.rn > 1;

create unique index if not exists fleet_dispatch_one_active_unit_uidx
  on public.fleet_dispatch_assignments (fleet_id, vehicle_id)
  where active;

create index if not exists fleet_dispatch_due_active_idx
  on public.fleet_dispatch_assignments (next_pretrip_due)
  where active and pretrip_required;

create table if not exists public.fleet_unit_defects (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  source_pretrip_id uuid not null references public.fleet_pretrip_reports(id) on delete cascade,
  defect_key text not null,
  label text not null,
  severity text not null check (severity in ('safety','compliance','maintenance','recommend')),
  state text not null default 'open'
    check (state in ('open','acknowledged','converted','deferred','resolved')),
  description text,
  reported_by uuid references public.profiles(id) on delete set null,
  reported_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  deferred_until date,
  deferred_reason text,
  service_request_id uuid references public.fleet_service_requests(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_unit_defects_source_key_uniq unique (source_pretrip_id, defect_key),
  constraint fleet_unit_defects_ack_state_chk check (
    state <> 'acknowledged' or (acknowledged_at is not null and acknowledged_by is not null)
  ),
  constraint fleet_unit_defects_defer_state_chk check (
    state <> 'deferred' or (deferred_until is not null and nullif(btrim(deferred_reason),'') is not null)
  ),
  constraint fleet_unit_defects_resolved_state_chk check (
    state <> 'resolved' or resolved_at is not null
  )
);

create index if not exists fleet_unit_defects_fleet_state_idx
  on public.fleet_unit_defects (fleet_id, state, reported_at desc);
create index if not exists fleet_unit_defects_vehicle_state_idx
  on public.fleet_unit_defects (vehicle_id, state, reported_at desc);
create index if not exists fleet_unit_defects_request_idx
  on public.fleet_unit_defects (service_request_id)
  where service_request_id is not null;
create index if not exists fleet_unit_defects_work_order_idx
  on public.fleet_unit_defects (work_order_id)
  where work_order_id is not null;

create table if not exists public.fleet_pretrip_compliance (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  assignment_id uuid not null references public.fleet_dispatch_assignments(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_profile_id uuid not null references public.profiles(id) on delete cascade,
  service_date date not null,
  due_at timestamptz not null,
  status text not null default 'due'
    check (status in ('due','completed','missed','excused')),
  pretrip_report_id uuid references public.fleet_pretrip_reports(id) on delete set null,
  completed_at timestamptz,
  excused_at timestamptz,
  excused_by uuid references public.profiles(id) on delete set null,
  excuse_reason text,
  notification_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_pretrip_compliance_assignment_day_uniq unique (assignment_id, service_date),
  constraint fleet_pretrip_compliance_completed_chk check (
    status <> 'completed' or (pretrip_report_id is not null and completed_at is not null)
  ),
  constraint fleet_pretrip_compliance_excused_chk check (
    status <> 'excused' or (excused_at is not null and excused_by is not null and nullif(btrim(excuse_reason),'') is not null)
  )
);

create index if not exists fleet_pretrip_compliance_fleet_day_idx
  on public.fleet_pretrip_compliance (fleet_id, service_date desc, status);
create index if not exists fleet_pretrip_compliance_driver_day_idx
  on public.fleet_pretrip_compliance (driver_profile_id, service_date desc);
create index if not exists fleet_pretrip_compliance_missed_idx
  on public.fleet_pretrip_compliance (due_at)
  where status = 'missed';

alter table public.fleet_unit_defects enable row level security;
alter table public.fleet_pretrip_compliance enable row level security;

drop policy if exists "fleet_unit_defects.select.scope" on public.fleet_unit_defects;
create policy "fleet_unit_defects.select.scope"
on public.fleet_unit_defects for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_unit_defects.shop_id
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_unit_defects.fleet_id
  )
);

drop policy if exists "fleet_pretrip_compliance.select.scope" on public.fleet_pretrip_compliance;
create policy "fleet_pretrip_compliance.select.scope"
on public.fleet_pretrip_compliance for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_pretrip_compliance.shop_id
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_pretrip_compliance.fleet_id
  )
);

revoke all on table public.fleet_unit_defects from anon, authenticated;
revoke all on table public.fleet_pretrip_compliance from anon, authenticated;
grant select on table public.fleet_unit_defects to authenticated;
grant select on table public.fleet_pretrip_compliance to authenticated;
grant all on table public.fleet_unit_defects to service_role;
grant all on table public.fleet_pretrip_compliance to service_role;

create or replace function public.fleet_defect_descriptor(p_key text)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select case p_key
    when 'brakes' then jsonb_build_object('label','Brakes / air system','severity','safety')
    when 'tires' then jsonb_build_object('label','Tires, wheels & rims','severity','compliance')
    when 'lights' then jsonb_build_object('label','Lights & signals','severity','compliance')
    when 'steering' then jsonb_build_object('label','Steering','severity','safety')
    when 'suspension' then jsonb_build_object('label','Suspension','severity','maintenance')
    when 'fluids' then jsonb_build_object('label','Leaks (oil, coolant, fuel)','severity','maintenance')
    when 'body' then jsonb_build_object('label','Body, mirrors, glass','severity','recommend')
    when 'safetyEquipment' then jsonb_build_object('label','Safety equipment','severity','safety')
    else jsonb_build_object('label',initcap(replace(p_key,'_',' ')),'severity','recommend')
  end
$function$;

create or replace function public.validate_fleet_pretrip_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_latest_odometer numeric;
  v_latest_hours numeric;
  v_engine_hours numeric;
  v_reason text := nullif(btrim(coalesce(new.checklist ->> 'readingCorrectionReason','')), '');
begin
  if nullif(new.checklist ->> 'engineHours','') is not null then
    begin
      v_engine_hours := (new.checklist ->> 'engineHours')::numeric;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Engine hours must be a valid number';
    end;
    if v_engine_hours < 0 then
      raise exception using errcode = '22023', message = 'Engine hours must be non-negative';
    end if;
  end if;

  select r.odometer_km
    into v_latest_odometer
  from public.fleet_unit_readings r
  where r.fleet_id = new.fleet_id
    and r.vehicle_id = new.vehicle_id
    and r.odometer_km is not null
  order by r.recorded_at desc, r.created_at desc
  limit 1;

  select r.engine_hours
    into v_latest_hours
  from public.fleet_unit_readings r
  where r.fleet_id = new.fleet_id
    and r.vehicle_id = new.vehicle_id
    and r.engine_hours is not null
  order by r.recorded_at desc, r.created_at desc
  limit 1;

  if new.odometer_km is not null
     and v_latest_odometer is not null
     and new.odometer_km < v_latest_odometer
     and v_reason is null then
    raise exception using
      errcode = 'P0001',
      message = format('Odometer is below the latest reading of %s km; provide a correction reason', v_latest_odometer);
  end if;

  if v_engine_hours is not null
     and v_latest_hours is not null
     and v_engine_hours < v_latest_hours
     and v_reason is null then
    raise exception using
      errcode = 'P0001',
      message = format('Engine hours are below the latest reading of %s; provide a correction reason', v_latest_hours);
  end if;

  return new;
end;
$function$;

drop trigger if exists fleet_pretrip_validate_reading on public.fleet_pretrip_reports;
create trigger fleet_pretrip_validate_reading
before insert on public.fleet_pretrip_reports
for each row execute function public.validate_fleet_pretrip_reading();

create unique index if not exists fleet_pretrip_driver_unit_day_uidx
  on public.fleet_pretrip_reports (fleet_id, vehicle_id, driver_profile_id, inspection_date)
  where driver_profile_id is not null;

create or replace function public.capture_pretrip_unit_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_engine_hours numeric;
begin
  if nullif(new.checklist ->> 'engineHours','') is not null then
    v_engine_hours := (new.checklist ->> 'engineHours')::numeric;
  end if;

  if new.odometer_km is null and v_engine_hours is null then
    return new;
  end if;

  insert into public.fleet_unit_readings (
    shop_id, fleet_id, vehicle_id, odometer_km, engine_hours,
    source_type, source_id, operation_key, confidence, recorded_at,
    recorded_by, metadata
  )
  values (
    new.shop_id, new.fleet_id, new.vehicle_id, new.odometer_km, v_engine_hours,
    'pretrip', new.id, 'pretrip:' || new.id::text, 1, new.created_at,
    new.driver_profile_id,
    jsonb_strip_nulls(jsonb_build_object(
      'driver_name', new.driver_name,
      'location', new.checklist ->> 'location',
      'reading_correction_reason', new.checklist ->> 'readingCorrectionReason'
    ))
  )
  on conflict (shop_id, operation_key)
    where operation_key is not null
  do nothing;

  return new;
end;
$function$;

create or replace function public.sync_fleet_defect_notification(p_pretrip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_report public.fleet_pretrip_reports%rowtype;
  v_unit_label text;
  v_open_count integer;
  v_critical boolean;
  v_fingerprint text := 'fleet-pretrip-defects:' || p_pretrip_id::text;
begin
  select * into v_report
  from public.fleet_pretrip_reports
  where id = p_pretrip_id;

  if not found then return; end if;

  select coalesce(nullif(v.unit_number,''), nullif(v.license_plate,''), nullif(v.vin,''), 'Unit')
  into v_unit_label
  from public.vehicles v
  where v.id = v_report.vehicle_id;

  select count(*)::integer,
         coalesce(bool_or(severity in ('safety','compliance')), false)
  into v_open_count, v_critical
  from public.fleet_unit_defects
  where source_pretrip_id = p_pretrip_id
    and state in ('open','acknowledged','deferred');

  if v_open_count > 0 then
    insert into public.assistant_notifications (
      shop_id, role, source, fingerprint, code, level, title, message,
      href, entity_type, entity_id, status, metadata, first_seen_at,
      last_seen_at, created_at, updated_at
    )
    values (
      v_report.shop_id, 'manager', 'fleet', v_fingerprint, 'fleet_pretrip_defect',
      case when v_critical then 'critical' else 'warning' end,
      v_open_count::text || ' pre-trip defect' || case when v_open_count = 1 then '' else 's' end || ' need review',
      coalesce(v_unit_label,'Unit') || ' was submitted with defects by ' || v_report.driver_name || '.',
      '/fleet?focus=defects', 'fleet_pretrip_report', v_report.id, 'active',
      jsonb_build_object('fleet_id',v_report.fleet_id,'vehicle_id',v_report.vehicle_id,'pretrip_id',v_report.id,'open_defect_count',v_open_count),
      now(), now(), now(), now()
    )
    on conflict (shop_id, fingerprint) do update
    set level = excluded.level,
        title = excluded.title,
        message = excluded.message,
        status = 'active',
        resolved_at = null,
        metadata = excluded.metadata,
        last_seen_at = now(),
        updated_at = now();
  else
    update public.assistant_notifications
    set status = 'resolved', resolved_at = coalesce(resolved_at,now()), updated_at = now()
    where shop_id = v_report.shop_id and fingerprint = v_fingerprint;
  end if;
end;
$function$;

create or replace function public.capture_fleet_pretrip_defects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item record;
  v_descriptor jsonb;
  v_assignment public.fleet_dispatch_assignments%rowtype;
  v_timezone text;
  v_due_at timestamptz;
begin
  if new.has_defects then
    for v_item in
      select key, value
      from jsonb_each_text(coalesce(new.checklist -> 'defects', '{}'::jsonb))
      where value = 'defect'
    loop
      v_descriptor := public.fleet_defect_descriptor(v_item.key);
      insert into public.fleet_unit_defects (
        shop_id, fleet_id, vehicle_id, source_pretrip_id, defect_key,
        label, severity, state, description, reported_by, reported_at
      )
      values (
        new.shop_id, new.fleet_id, new.vehicle_id, new.id, v_item.key,
        v_descriptor ->> 'label', v_descriptor ->> 'severity', 'open',
        nullif(btrim(coalesce(new.notes,'')), ''), new.driver_profile_id, new.created_at
      )
      on conflict (source_pretrip_id, defect_key) do nothing;
    end loop;
    perform public.sync_fleet_defect_notification(new.id);
  end if;

  if new.driver_profile_id is not null then
    select a.* into v_assignment
    from public.fleet_dispatch_assignments a
    where a.fleet_id = new.fleet_id
      and a.vehicle_id = new.vehicle_id
      and a.driver_profile_id = new.driver_profile_id
      and a.active
      and a.pretrip_required
    order by a.assigned_at desc
    limit 1;

    if found then
      select coalesce(nullif(s.timezone,''),'America/Los_Angeles')
      into v_timezone
      from public.shops s where s.id = new.shop_id;

      v_due_at := (new.inspection_date + v_assignment.pretrip_due_local_time) at time zone v_timezone;

      insert into public.fleet_pretrip_compliance (
        shop_id, fleet_id, assignment_id, vehicle_id, driver_profile_id,
        service_date, due_at, status, pretrip_report_id, completed_at, updated_at
      )
      values (
        new.shop_id, new.fleet_id, v_assignment.id, new.vehicle_id,
        new.driver_profile_id, new.inspection_date, v_due_at, 'completed',
        new.id, new.created_at, now()
      )
      on conflict (assignment_id, service_date) do update
      set status = 'completed',
          pretrip_report_id = excluded.pretrip_report_id,
          completed_at = excluded.completed_at,
          updated_at = now();

      update public.assistant_notifications
      set status = 'resolved', resolved_at = coalesce(resolved_at,now()), updated_at = now()
      where shop_id = new.shop_id
        and fingerprint = 'fleet-pretrip-missed:' || v_assignment.id::text || ':' || new.inspection_date::text;

      update public.fleet_dispatch_assignments
      set state = 'en_route',
          next_pretrip_due = (((new.inspection_date + 1) + pretrip_due_local_time) at time zone v_timezone),
          updated_at = now()
      where id = v_assignment.id;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists fleet_pretrip_defect_capture on public.fleet_pretrip_reports;
create trigger fleet_pretrip_defect_capture
after insert on public.fleet_pretrip_reports
for each row execute function public.capture_fleet_pretrip_defects();

create or replace function public.refresh_fleet_defect_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.sync_fleet_defect_notification(new.source_pretrip_id);
  return new;
end;
$function$;

drop trigger if exists fleet_defect_notification_refresh on public.fleet_unit_defects;
create trigger fleet_defect_notification_refresh
after update of state on public.fleet_unit_defects
for each row execute function public.refresh_fleet_defect_notification();

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
  v_vehicle_id uuid := p_vehicle_id;
  v_assignment_id uuid;
  v_timezone text;
  v_due_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select f.shop_id into v_shop_id from public.fleets f where f.id = p_fleet_id;
  if v_shop_id is null then raise exception 'Fleet not found'; end if;

  if not (
    exists (
      select 1 from public.profiles p
      where p.id = v_user_id and p.shop_id = v_shop_id
        and p.role in ('owner','admin','manager')
    )
    or exists (
      select 1 from public.fleet_members m
      where m.user_id = v_user_id and m.fleet_id = p_fleet_id
        and m.role in ('owner','admin','manager','fleet_manager','dispatcher')
    )
  ) then raise exception 'Fleet management access required'; end if;

  if p_action = 'create_and_enroll' then
    if nullif(btrim(coalesce(p_unit_number,'')),'') is null
       and nullif(btrim(coalesce(p_vin,'')),'') is null
       and nullif(btrim(coalesce(p_license_plate,'')),'') is null then
      raise exception 'Unit number, VIN, or plate is required';
    end if;

    if exists (
      select 1 from public.vehicles v
      where v.shop_id = v_shop_id and (
        (nullif(btrim(coalesce(p_vin,'')),'') is not null and upper(v.vin) = upper(btrim(p_vin)))
        or (nullif(btrim(coalesce(p_license_plate,'')),'') is not null and upper(v.license_plate) = upper(btrim(p_license_plate)))
        or (nullif(btrim(coalesce(p_unit_number,'')),'') is not null and upper(v.unit_number) = upper(btrim(p_unit_number)))
      )
    ) then raise exception 'A matching vehicle already exists; enroll the existing record'; end if;

    insert into public.vehicles (shop_id,unit_number,vin,license_plate,year,make,model)
    values (
      v_shop_id, nullif(btrim(p_unit_number),''), nullif(btrim(p_vin),''),
      nullif(btrim(p_license_plate),''), p_year, nullif(btrim(p_make),''),
      nullif(btrim(p_model),'')
    )
    returning id into v_vehicle_id;
  elsif p_action not in ('enroll_existing','assign') then
    raise exception 'Unsupported fleet enrollment action';
  end if;

  if v_vehicle_id is null then raise exception 'Vehicle is required'; end if;
  if not exists (select 1 from public.vehicles v where v.id = v_vehicle_id and v.shop_id = v_shop_id) then
    raise exception 'Vehicle is not in this shop';
  end if;

  insert into public.fleet_vehicles (fleet_id,vehicle_id,shop_id,nickname,active)
  values (p_fleet_id,v_vehicle_id,v_shop_id,nullif(btrim(p_nickname),''),true)
  on conflict (fleet_id,vehicle_id) do update
  set shop_id = excluded.shop_id,
      nickname = coalesce(excluded.nickname,public.fleet_vehicles.nickname),
      active = true;

  if p_action = 'assign' then
    if p_driver_profile_id is null then raise exception 'Driver is required'; end if;
    if not exists (
      select 1 from public.fleet_members m
      where m.fleet_id = p_fleet_id and m.user_id = p_driver_profile_id
        and m.role in ('driver','viewer')
    ) then raise exception 'Driver must be an active driver member of this fleet'; end if;

    select coalesce(nullif(s.timezone,''),'America/Los_Angeles')
    into v_timezone from public.shops s where s.id = v_shop_id;
    v_due_at := ((now() at time zone v_timezone)::date + p_pretrip_due_local_time) at time zone v_timezone;
    if v_due_at <= now() then
      v_due_at := (((now() at time zone v_timezone)::date + 1) + p_pretrip_due_local_time) at time zone v_timezone;
    end if;

    update public.fleet_dispatch_assignments
    set active = false, updated_at = now()
    where fleet_id = p_fleet_id and vehicle_id = v_vehicle_id and active;

    insert into public.fleet_dispatch_assignments (
      shop_id,fleet_id,vehicle_id,driver_profile_id,driver_name,unit_label,
      vehicle_identifier,route_label,next_pretrip_due,state,active,
      pretrip_required,pretrip_due_local_time,assigned_at,assigned_by
    )
    select
      v_shop_id,p_fleet_id,v_vehicle_id,p_driver_profile_id,
      coalesce(nullif(p.full_name,''),nullif(p.email,''),'Driver'),
      coalesce(nullif(p_nickname,''),nullif(v.unit_number,''),nullif(v.license_plate,''),nullif(v.vin,''),'Unit'),
      coalesce(nullif(v.unit_number,''),nullif(v.license_plate,''),nullif(v.vin,'')),
      nullif(btrim(p_route_label),''),v_due_at,'pretrip_due',true,true,
      p_pretrip_due_local_time,now(),v_user_id
    from public.profiles p cross join public.vehicles v
    where p.id = p_driver_profile_id and v.id = v_vehicle_id
    returning id into v_assignment_id;
  end if;

  return jsonb_build_object(
    'ok',true,'fleetId',p_fleet_id,'vehicleId',v_vehicle_id,'assignmentId',v_assignment_id
  );
end;
$function$;

create or replace function public.get_fleet_defect_queue(p_fleet_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile_shop_id uuid;
  v_is_internal boolean := false;
  v_allowed_fleets uuid[];
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select p.shop_id, p.role in ('owner','admin','manager')
  into v_profile_shop_id, v_is_internal
  from public.profiles p where p.id = v_user_id;

  select coalesce(array_agg(m.fleet_id), '{}'::uuid[])
  into v_allowed_fleets
  from public.fleet_members m where m.user_id = v_user_id;

  if p_fleet_id is not null and not (
    (v_is_internal and exists(select 1 from public.fleets f where f.id=p_fleet_id and f.shop_id=v_profile_shop_id))
    or p_fleet_id = any(v_allowed_fleets)
  ) then raise exception 'Fleet access required'; end if;

  if not v_is_internal and cardinality(v_allowed_fleets)=0 then
    raise exception 'Fleet access required';
  end if;

  select jsonb_build_object(
    'canManage', v_is_internal or exists (
      select 1 from public.fleet_members m
      where m.user_id=v_user_id
        and (p_fleet_id is null or m.fleet_id=p_fleet_id)
        and m.role in ('owner','admin','manager','fleet_manager','dispatcher','approver')
    ),
    'summary', jsonb_build_object(
      'open', count(*) filter(where d.state='open'),
      'acknowledged', count(*) filter(where d.state='acknowledged'),
      'deferred', count(*) filter(where d.state='deferred'),
      'converted', count(*) filter(where d.state='converted'),
      'missedPretrips', (
        select count(*) from public.fleet_pretrip_compliance c
        where c.status='missed'
          and (p_fleet_id is null or c.fleet_id=p_fleet_id)
          and ((v_is_internal and c.shop_id=v_profile_shop_id) or c.fleet_id=any(v_allowed_fleets))
      )
    ),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id',d.id,'fleetId',d.fleet_id,'vehicleId',d.vehicle_id,
      'pretripId',d.source_pretrip_id,'unitLabel',
        coalesce(nullif(fv.nickname,''),nullif(v.unit_number,''),nullif(v.license_plate,''),nullif(v.vin,''),'Unit'),
      'driverName',r.driver_name,'label',d.label,'severity',d.severity,
      'state',d.state,'description',d.description,'reportedAt',d.reported_at,
      'deferredUntil',d.deferred_until,'serviceRequestId',d.service_request_id,
      'workOrderId',d.work_order_id
    ) order by
      case d.severity when 'safety' then 0 when 'compliance' then 1 when 'maintenance' then 2 else 3 end,
      d.reported_at desc) filter(where d.id is not null), '[]'::jsonb),
    'missed', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,'fleetId',c.fleet_id,'vehicleId',c.vehicle_id,
        'driverProfileId',c.driver_profile_id,'serviceDate',c.service_date,
        'dueAt',c.due_at,'status',c.status,'unitLabel',
          coalesce(nullif(a.unit_label,''),nullif(v2.unit_number,''),nullif(v2.license_plate,''),nullif(v2.vin,''),'Unit'),
        'driverName',coalesce(nullif(a.driver_name,''),nullif(p2.full_name,''),nullif(p2.email,''),'Driver')
      ) order by c.due_at desc),'[]'::jsonb)
      from public.fleet_pretrip_compliance c
      join public.fleet_dispatch_assignments a on a.id=c.assignment_id
      join public.vehicles v2 on v2.id=c.vehicle_id
      left join public.profiles p2 on p2.id=c.driver_profile_id
      where c.status='missed'
        and (p_fleet_id is null or c.fleet_id=p_fleet_id)
        and ((v_is_internal and c.shop_id=v_profile_shop_id) or c.fleet_id=any(v_allowed_fleets))
    )
  )
  into v_result
  from public.fleet_unit_defects d
  join public.fleet_pretrip_reports r on r.id=d.source_pretrip_id
  join public.vehicles v on v.id=d.vehicle_id
  left join public.fleet_vehicles fv on fv.fleet_id=d.fleet_id and fv.vehicle_id=d.vehicle_id
  where d.state <> 'resolved'
    and (p_fleet_id is null or d.fleet_id=p_fleet_id)
    and ((v_is_internal and d.shop_id=v_profile_shop_id) or d.fleet_id=any(v_allowed_fleets));

  return coalesce(v_result,jsonb_build_object(
    'canManage',v_is_internal,'summary',jsonb_build_object('open',0,'acknowledged',0,'deferred',0,'converted',0,'missedPretrips',0),
    'items','[]'::jsonb,'missed','[]'::jsonb
  ));
end;
$function$;

create or replace function public.manage_fleet_unit_defects(
  p_action text,
  p_defect_ids uuid[],
  p_deferred_until date default null,
  p_reason text default null,
  p_requested_for_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_fleet_id uuid;
  v_vehicle_id uuid;
  v_shop_id uuid;
  v_pretrip_id uuid;
  v_request_id uuid;
  v_lines jsonb;
  v_operation_key text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if coalesce(cardinality(p_defect_ids),0)=0 then raise exception 'Select at least one defect'; end if;

  select count(*)::integer,min(d.fleet_id),min(d.vehicle_id),min(d.shop_id),min(d.source_pretrip_id)
  into v_count,v_fleet_id,v_vehicle_id,v_shop_id,v_pretrip_id
  from public.fleet_unit_defects d
  where d.id=any(p_defect_ids)
  for update;

  if v_count <> cardinality(p_defect_ids) then raise exception 'One or more defects were not found'; end if;
  if exists (
    select 1 from public.fleet_unit_defects d
    where d.id=any(p_defect_ids) and (d.fleet_id<>v_fleet_id or d.vehicle_id<>v_vehicle_id)
  ) then raise exception 'Selected defects must belong to one unit and fleet'; end if;

  if not (
    exists(select 1 from public.profiles p where p.id=v_user_id and p.shop_id=v_shop_id and p.role in ('owner','admin','manager'))
    or exists(select 1 from public.fleet_members m where m.user_id=v_user_id and m.fleet_id=v_fleet_id and m.role in ('owner','admin','manager','fleet_manager','dispatcher','approver'))
  ) then raise exception 'Fleet management access required'; end if;

  if p_action='acknowledge' then
    update public.fleet_unit_defects set
      state='acknowledged',acknowledged_at=now(),acknowledged_by=v_user_id,updated_at=now()
    where id=any(p_defect_ids) and state in ('open','deferred');
  elsif p_action='defer' then
    if p_deferred_until is null or p_deferred_until<current_date then raise exception 'A future deferral date is required'; end if;
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A deferral reason is required'; end if;
    update public.fleet_unit_defects set
      state='deferred',deferred_until=p_deferred_until,deferred_reason=left(btrim(p_reason),1000),
      acknowledged_at=coalesce(acknowledged_at,now()),acknowledged_by=coalesce(acknowledged_by,v_user_id),updated_at=now()
    where id=any(p_defect_ids) and state in ('open','acknowledged','deferred');
  elsif p_action='resolve' then
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A resolution note is required'; end if;
    update public.fleet_unit_defects set
      state='resolved',resolved_at=now(),resolved_by=v_user_id,resolution_note=left(btrim(p_reason),1000),updated_at=now()
    where id=any(p_defect_ids) and state<>'resolved';
  elsif p_action='create_request' then
    select jsonb_agg(jsonb_build_object(
      'lineKind','custom','description',d.label,
      'notes',coalesce(d.description,'Reported during daily pre-trip'),
      'quantity',1,'sourceSnapshot',jsonb_build_object('fleetDefectId',d.id,'pretripId',d.source_pretrip_id,'severity',d.severity)
    ) order by d.reported_at,d.id)
    into v_lines
    from public.fleet_unit_defects d where d.id=any(p_defect_ids);

    select 'fleet-defects:' || md5(string_agg(x::text,',' order by x::text))
    into v_operation_key from unnest(p_defect_ids) x;

    v_request_id := public.create_fleet_service_request_atomic(
      v_fleet_id,v_vehicle_id,'Pre-trip defects',
      'Manager-created request from ' || v_count::text || ' tracked pre-trip defect' || case when v_count=1 then '' else 's' end,
      p_requested_for_date,v_lines,v_operation_key
    );

    update public.fleet_service_requests
    set source_pretrip_id=coalesce(source_pretrip_id,v_pretrip_id),updated_at=now()
    where id=v_request_id;

    update public.fleet_unit_defects set
      state='converted',service_request_id=v_request_id,
      acknowledged_at=coalesce(acknowledged_at,now()),acknowledged_by=coalesce(acknowledged_by,v_user_id),updated_at=now()
    where id=any(p_defect_ids) and state<>'resolved';
  else
    raise exception 'Unsupported defect action';
  end if;

  return jsonb_build_object('ok',true,'action',p_action,'updated',v_count,'serviceRequestId',v_request_id);
end;
$function$;

create or replace function public.evaluate_fleet_pretrip_compliance(p_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment record;
  v_service_date date;
  v_due_at timestamptz;
  v_timezone text;
  v_report_id uuid;
  v_status text;
  v_fingerprint text;
  v_checked integer := 0;
  v_missed integer := 0;
  v_completed integer := 0;
begin
  for v_assignment in
    select a.*, coalesce(nullif(s.timezone,''),'America/Los_Angeles') as shop_timezone
    from public.fleet_dispatch_assignments a
    join public.shops s on s.id=a.shop_id
    where a.active and a.pretrip_required
  loop
    v_timezone := v_assignment.shop_timezone;
    for v_service_date in
      select d::date from generate_series(
        greatest(
          (v_assignment.assigned_at at time zone v_timezone)::date,
          (p_at at time zone v_timezone)::date - 1
        ),
        (p_at at time zone v_timezone)::date,
        interval '1 day'
      ) d
    loop
      v_checked := v_checked+1;
      v_due_at := (v_service_date + v_assignment.pretrip_due_local_time) at time zone v_timezone;

      select r.id into v_report_id
      from public.fleet_pretrip_reports r
      where r.fleet_id=v_assignment.fleet_id
        and r.vehicle_id=v_assignment.vehicle_id
        and r.driver_profile_id=v_assignment.driver_profile_id
        and r.inspection_date=v_service_date
      order by r.created_at desc limit 1;

      v_status := case when v_report_id is not null then 'completed'
                       when p_at>v_due_at then 'missed' else 'due' end;
      if v_status='completed' then v_completed:=v_completed+1; end if;
      if v_status='missed' then v_missed:=v_missed+1; end if;

      insert into public.fleet_pretrip_compliance (
        shop_id,fleet_id,assignment_id,vehicle_id,driver_profile_id,
        service_date,due_at,status,pretrip_report_id,completed_at,
        notification_fingerprint,updated_at
      )
      values (
        v_assignment.shop_id,v_assignment.fleet_id,v_assignment.id,
        v_assignment.vehicle_id,v_assignment.driver_profile_id,v_service_date,
        v_due_at,v_status,v_report_id,case when v_report_id is not null then now() end,
        'fleet-pretrip-missed:'||v_assignment.id::text||':'||v_service_date::text,now()
      )
      on conflict (assignment_id,service_date) do update set
        status=case when public.fleet_pretrip_compliance.status in ('completed','excused')
                    then public.fleet_pretrip_compliance.status else excluded.status end,
        pretrip_report_id=coalesce(public.fleet_pretrip_compliance.pretrip_report_id,excluded.pretrip_report_id),
        completed_at=coalesce(public.fleet_pretrip_compliance.completed_at,excluded.completed_at),
        updated_at=now();

      if v_status='missed' then
        v_fingerprint := 'fleet-pretrip-missed:'||v_assignment.id::text||':'||v_service_date::text;
        insert into public.assistant_notifications (
          shop_id,role,source,fingerprint,code,level,title,message,href,
          entity_type,entity_id,status,metadata,first_seen_at,last_seen_at,created_at,updated_at
        ) values (
          v_assignment.shop_id,'manager','fleet',v_fingerprint,'fleet_pretrip_missed',
          'critical','Daily pre-trip missed',
          coalesce(v_assignment.driver_name,'Driver')||' missed the '||v_service_date::text||
            ' pre-trip for '||coalesce(v_assignment.unit_label,'Unit')||'.',
          '/fleet?focus=defects','fleet_dispatch_assignment',v_assignment.id,'active',
          jsonb_build_object('fleet_id',v_assignment.fleet_id,'vehicle_id',v_assignment.vehicle_id,'driver_profile_id',v_assignment.driver_profile_id,'service_date',v_service_date),
          now(),now(),now(),now()
        )
        on conflict (shop_id,fingerprint) do update
        set status='active',resolved_at=null,last_seen_at=now(),updated_at=now(),message=excluded.message,metadata=excluded.metadata;
      end if;
    end loop;

    update public.fleet_dispatch_assignments
    set state=case when v_status='completed' then 'en_route' else 'pretrip_due' end,
        next_pretrip_due=((((p_at at time zone v_timezone)::date+1)+pretrip_due_local_time) at time zone v_timezone),
        updated_at=now()
    where id=v_assignment.id;
  end loop;

  return jsonb_build_object('ok',true,'checked',v_checked,'missed',v_missed,'completed',v_completed,'evaluatedAt',p_at);
end;
$function$;

create or replace function public.sync_fleet_defects_from_work_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_fleet record;
begin
  if new.source_fleet_service_request_id is not null then
    update public.fleet_unit_defects
    set work_order_id=new.id,updated_at=now()
    where service_request_id=new.source_fleet_service_request_id
      and work_order_id is distinct from new.id;
  end if;

  if lower(coalesce(new.status,'')) in ('completed','paid','closed')
     and lower(coalesce(old.status,'')) is distinct from lower(coalesce(new.status,'')) then
    update public.fleet_unit_defects
    set state='resolved',work_order_id=new.id,resolved_at=now(),
        resolution_note=coalesce(resolution_note,'Resolved when work order completed'),updated_at=now()
    where service_request_id=new.source_fleet_service_request_id and state<>'resolved';

    for v_fleet in
      select fv.fleet_id from public.fleet_vehicles fv
      where fv.vehicle_id=new.vehicle_id and coalesce(fv.active,true)
    loop
      perform public.evaluate_fleet_pm_due_events(v_fleet.fleet_id,new.vehicle_id);
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists fleet_defects_work_order_sync on public.work_orders;
create trigger fleet_defects_work_order_sync
after insert or update of status,source_fleet_service_request_id on public.work_orders
for each row execute function public.sync_fleet_defects_from_work_order();

revoke execute on function public.fleet_defect_descriptor(text) from public, anon, authenticated;
revoke execute on function public.validate_fleet_pretrip_reading() from public, anon, authenticated;
revoke execute on function public.capture_pretrip_unit_reading() from public, anon, authenticated;
revoke execute on function public.sync_fleet_defect_notification(uuid) from public, anon, authenticated;
revoke execute on function public.capture_fleet_pretrip_defects() from public, anon, authenticated;
revoke execute on function public.refresh_fleet_defect_notification() from public, anon, authenticated;
revoke execute on function public.sync_fleet_defects_from_work_order() from public, anon, authenticated;

revoke execute on function public.manage_fleet_unit_enrollment(
  text,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,time without time zone
) from public, anon;
grant execute on function public.manage_fleet_unit_enrollment(
  text,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,time without time zone
) to authenticated, service_role;

revoke execute on function public.get_fleet_defect_queue(uuid) from public, anon;
grant execute on function public.get_fleet_defect_queue(uuid) to authenticated, service_role;

revoke execute on function public.manage_fleet_unit_defects(
  text,uuid[],date,text,date
) from public, anon;
grant execute on function public.manage_fleet_unit_defects(
  text,uuid[],date,text,date
) to authenticated, service_role;

revoke execute on function public.evaluate_fleet_pretrip_compliance(timestamptz)
  from public, anon, authenticated;
grant execute on function public.evaluate_fleet_pretrip_compliance(timestamptz)
  to service_role;
