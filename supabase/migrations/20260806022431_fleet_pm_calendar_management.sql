begin;

alter table public.fleet_programs
  add column if not exists assignment_mode text not null default 'all_units',
  add column if not exists requires_fleet_approval boolean not null default true,
  add column if not exists active boolean not null default true,
  add column if not exists operation_key text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.fleet_programs
  drop constraint if exists fleet_programs_assignment_mode_check;
alter table public.fleet_programs
  add constraint fleet_programs_assignment_mode_check
  check (assignment_mode in ('all_units', 'selected_units'));

create unique index if not exists fleet_programs_operation_key_uidx
  on public.fleet_programs (fleet_id, operation_key)
  where operation_key is not null;
create index if not exists fleet_programs_fleet_active_idx
  on public.fleet_programs (fleet_id, active, updated_at desc);

create table if not exists public.fleet_program_assignments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  program_id uuid not null references public.fleet_programs(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  unique (program_id, vehicle_id)
);

create index if not exists fleet_program_assignments_fleet_vehicle_idx
  on public.fleet_program_assignments (fleet_id, vehicle_id, program_id);
create index if not exists fleet_program_assignments_shop_idx
  on public.fleet_program_assignments (shop_id);
create index if not exists fleet_program_assignments_vehicle_idx
  on public.fleet_program_assignments (vehicle_id);
create index if not exists fleet_program_assignments_created_by_idx
  on public.fleet_program_assignments (created_by);

alter table public.fleet_program_assignments enable row level security;
revoke all on table public.fleet_program_assignments from public, anon;
grant select on table public.fleet_program_assignments to authenticated;
grant all on table public.fleet_program_assignments to service_role;

drop policy if exists "fleet_program_assignments.select.scope" on public.fleet_program_assignments;
create policy "fleet_program_assignments.select.scope"
on public.fleet_program_assignments
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_program_assignments.shop_id
      and p.role in ('owner', 'admin', 'manager')
      and exists (
        select 1 from public.fleet_members explicit_membership
        where explicit_membership.user_id = p.id
          and explicit_membership.fleet_id = fleet_program_assignments.fleet_id
      )
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_program_assignments.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'approver')
  )
);

drop policy if exists "fleet_program_assignments.write.management" on public.fleet_program_assignments;

create or replace function public.enforce_fleet_pm_program_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment_mode text;
  v_program_active boolean;
begin
  if not new.active then return new; end if;

  select fp.assignment_mode, fp.active
  into v_assignment_mode, v_program_active
  from public.fleet_programs fp
  where fp.id = new.program_id
    and fp.fleet_id = new.fleet_id;

  if coalesce(v_program_active, false) is false then return null; end if;
  if v_assignment_mode = 'selected_units'
     and not exists (
       select 1
       from public.fleet_program_assignments assignment
       where assignment.program_id = new.program_id
         and assignment.fleet_id = new.fleet_id
         and assignment.vehicle_id = new.vehicle_id
     )
  then
    return null;
  end if;

  return new;
end;
$function$;

drop trigger if exists fleet_pm_policy_assignment_guard on public.fleet_pm_policies;
create trigger fleet_pm_policy_assignment_guard
before insert or update of active, vehicle_id, program_id, fleet_id
on public.fleet_pm_policies
for each row execute function public.enforce_fleet_pm_program_assignment();

create or replace function public.manage_fleet_pm_program(
  p_action text,
  p_fleet_id uuid,
  p_program_id uuid,
  p_name text,
  p_cadence text,
  p_interval_km integer,
  p_interval_hours integer,
  p_interval_days integer,
  p_assignment_mode text,
  p_vehicle_ids uuid[],
  p_tasks jsonb,
  p_notes text,
  p_requires_fleet_approval boolean,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_program_id uuid;
  v_task jsonb;
  v_task_index integer := 0;
  v_target_vehicle_ids uuid[] := array[]::uuid[];
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select f.shop_id into v_shop_id
  from public.fleets f
  where f.id = p_fleet_id
  for update;
  if v_shop_id is null then raise exception 'Fleet not found'; end if;

  if not (
    exists (
      select 1 from public.profiles p
      where p.id = v_user_id
        and p.shop_id = v_shop_id
        and p.role in ('owner', 'admin', 'manager')
        and exists (
          select 1 from public.fleet_members explicit_membership
          where explicit_membership.user_id = v_user_id
            and explicit_membership.fleet_id = p_fleet_id
        )
    )
    or exists (
      select 1 from public.fleet_members m
      where m.user_id = v_user_id
        and m.fleet_id = p_fleet_id
        and m.role in ('owner', 'admin', 'manager', 'fleet_manager')
    )
  ) then
    raise exception 'Fleet manager access required';
  end if;

  if p_action = 'archive' then
    if p_program_id is null then raise exception 'PM program is required'; end if;
    select fp.id into v_program_id
    from public.fleet_programs fp
    where fp.id = p_program_id and fp.fleet_id = p_fleet_id
    for update;
    if v_program_id is null then raise exception 'PM program not found'; end if;

    update public.fleet_programs
    set active = false, updated_at = now()
    where id = v_program_id and fleet_id = p_fleet_id;
    update public.fleet_pm_policies
    set active = false, updated_at = now()
    where program_id = v_program_id and fleet_id = p_fleet_id and active;
    update public.fleet_pm_due_events
    set status = 'dismissed', updated_at = now()
    where program_id = v_program_id
      and fleet_id = p_fleet_id
      and status in ('pending', 'deferred');

    insert into public.activity_logs (user_id, action, target_table, target_id, context)
    values (
      v_user_id, 'fleet_pm_program_archived', 'fleet_programs', v_program_id,
      jsonb_build_object('fleet_id', p_fleet_id, 'shop_id', v_shop_id)
    );
    return jsonb_build_object('ok', true, 'action', p_action, 'programId', v_program_id);
  end if;

  if p_action not in ('create', 'update') then raise exception 'Unsupported PM program action'; end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then raise exception 'PM program name is required'; end if;
  if length(btrim(p_name)) > 120 then raise exception 'PM program name is too long'; end if;
  if p_cadence not in ('monthly', 'quarterly', 'mileage_based', 'hours_based') then
    raise exception 'Select a valid PM cadence';
  end if;
  if p_assignment_mode not in ('all_units', 'selected_units') then
    raise exception 'Select a valid assignment mode';
  end if;
  if (p_interval_km is null or p_interval_km <= 0)
     and (p_interval_hours is null or p_interval_hours <= 0)
     and (p_interval_days is null or p_interval_days <= 0)
  then
    raise exception 'At least one PM interval is required';
  end if;
  if p_interval_km is not null and p_interval_km <= 0 then raise exception 'Kilometre interval must be positive'; end if;
  if p_interval_hours is not null and p_interval_hours <= 0 then raise exception 'Hour interval must be positive'; end if;
  if p_interval_days is not null and p_interval_days <= 0 then raise exception 'Day interval must be positive'; end if;
  if coalesce(jsonb_typeof(p_tasks), 'null') <> 'array' then
    raise exception 'PM tasks must be an array';
  end if;
  if jsonb_array_length(p_tasks) = 0 then
    raise exception 'At least one PM task is required';
  end if;
  if jsonb_array_length(p_tasks) > 50 then raise exception 'A PM program can contain at most 50 tasks'; end if;

  select coalesce(array_agg(distinct selected.vehicle_id), array[]::uuid[])
  into v_target_vehicle_ids
  from unnest(coalesce(p_vehicle_ids, array[]::uuid[])) as selected(vehicle_id);

  if p_assignment_mode = 'selected_units' and cardinality(v_target_vehicle_ids) = 0 then
    raise exception 'Select at least one Fleet asset';
  end if;
  if exists (
    select 1
    from unnest(v_target_vehicle_ids) as selected(vehicle_id)
    where not exists (
      select 1 from public.fleet_vehicles fv
      where fv.fleet_id = p_fleet_id
        and fv.shop_id = v_shop_id
        and fv.vehicle_id = selected.vehicle_id
        and coalesce(fv.active, true)
    )
  ) then
    raise exception 'A selected asset is not active in this Fleet';
  end if;

  if p_action = 'create' then
    if nullif(btrim(coalesce(p_operation_key, '')), '') is null then
      raise exception 'Operation key is required';
    end if;
    select fp.id into v_program_id
    from public.fleet_programs fp
    where fp.fleet_id = p_fleet_id and fp.operation_key = p_operation_key;
    if v_program_id is not null then
      return jsonb_build_object('ok', true, 'action', p_action, 'programId', v_program_id, 'idempotent', true);
    end if;

    begin
      insert into public.fleet_programs (
        fleet_id, name, cadence, interval_km, interval_hours, interval_days,
        notes, assignment_mode, requires_fleet_approval, active, operation_key, updated_at
      ) values (
        p_fleet_id, btrim(p_name), p_cadence::public.fleet_program_cadence,
        p_interval_km, p_interval_hours, p_interval_days,
        nullif(btrim(coalesce(p_notes, '')), ''), p_assignment_mode,
        coalesce(p_requires_fleet_approval, true), true, p_operation_key, now()
      ) returning id into v_program_id;
    exception when unique_violation then
      select fp.id into v_program_id
      from public.fleet_programs fp
      where fp.fleet_id = p_fleet_id and fp.operation_key = p_operation_key;
      if v_program_id is null then raise; end if;
      return jsonb_build_object('ok', true, 'action', p_action, 'programId', v_program_id, 'idempotent', true);
    end;
  else
    if p_program_id is null then raise exception 'PM program is required'; end if;
    select fp.id into v_program_id
    from public.fleet_programs fp
    where fp.id = p_program_id and fp.fleet_id = p_fleet_id
    for update;
    if v_program_id is null then raise exception 'PM program not found'; end if;

    update public.fleet_programs
    set name = btrim(p_name),
        cadence = p_cadence::public.fleet_program_cadence,
        interval_km = p_interval_km,
        interval_hours = p_interval_hours,
        interval_days = p_interval_days,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        assignment_mode = p_assignment_mode,
        requires_fleet_approval = coalesce(p_requires_fleet_approval, true),
        active = true,
        updated_at = now()
    where id = v_program_id and fleet_id = p_fleet_id;
  end if;

  delete from public.fleet_program_tasks where program_id = v_program_id;
  for v_task in select value from jsonb_array_elements(p_tasks)
  loop
    if nullif(btrim(coalesce(v_task ->> 'description', '')), '') is null then
      raise exception 'Every PM task needs a description';
    end if;
    insert into public.fleet_program_tasks (
      program_id, display_order, description, job_type, default_labor_hours, section_key
    ) values (
      v_program_id,
      v_task_index,
      left(btrim(v_task ->> 'description'), 500),
      case when coalesce(v_task ->> 'jobType', 'maintenance') in ('maintenance', 'inspection', 'repair')
        then coalesce(v_task ->> 'jobType', 'maintenance') else 'maintenance' end,
      case when nullif(v_task ->> 'laborHours', '') is null then null
        else greatest((v_task ->> 'laborHours')::numeric, 0) end,
      nullif(left(coalesce(v_task ->> 'sectionKey', ''), 80), '')
    );
    v_task_index := v_task_index + 1;
  end loop;

  if p_assignment_mode = 'all_units' then
    delete from public.fleet_program_assignments
    where program_id = v_program_id and fleet_id = p_fleet_id;
    select coalesce(array_agg(fv.vehicle_id), array[]::uuid[])
    into v_target_vehicle_ids
    from public.fleet_vehicles fv
    where fv.fleet_id = p_fleet_id
      and fv.shop_id = v_shop_id
      and coalesce(fv.active, true);
  else
    delete from public.fleet_program_assignments assignment
    where assignment.program_id = v_program_id
      and assignment.fleet_id = p_fleet_id
      and not (assignment.vehicle_id = any(v_target_vehicle_ids));

    insert into public.fleet_program_assignments (
      shop_id, fleet_id, program_id, vehicle_id, created_by
    )
    select v_shop_id, p_fleet_id, v_program_id, selected.vehicle_id, v_user_id
    from unnest(v_target_vehicle_ids) as selected(vehicle_id)
    on conflict (program_id, vehicle_id) do nothing;
  end if;

  update public.fleet_pm_policies policy
  set active = false, updated_at = now()
  where policy.program_id = v_program_id
    and policy.fleet_id = p_fleet_id
    and policy.active
    and not (policy.vehicle_id = any(v_target_vehicle_ids));

  update public.fleet_pm_due_events due
  set status = 'dismissed', updated_at = now()
  where due.program_id = v_program_id
    and due.fleet_id = p_fleet_id
    and due.status in ('pending', 'deferred');

  update public.fleet_pm_policies policy
  set name = btrim(p_name),
      interval_km = coalesce(fv.custom_interval_km, p_interval_km),
      interval_hours = coalesce(fv.custom_interval_hours, p_interval_hours),
      interval_days = coalesce(fv.custom_interval_days, p_interval_days),
      requires_fleet_approval = coalesce(p_requires_fleet_approval, true),
      active = true,
      updated_at = now()
  from public.fleet_vehicles fv
  where policy.program_id = v_program_id
    and policy.fleet_id = p_fleet_id
    and policy.vehicle_id = fv.vehicle_id
    and fv.fleet_id = p_fleet_id
    and policy.vehicle_id = any(v_target_vehicle_ids);

  insert into public.fleet_pm_policies (
    shop_id, fleet_id, vehicle_id, program_id, name,
    interval_km, interval_hours, interval_days,
    anchor_odometer_km, anchor_engine_hours, anchor_date,
    requires_fleet_approval, active, created_by
  )
  select
    v_shop_id, p_fleet_id, fv.vehicle_id, v_program_id, btrim(p_name),
    coalesce(fv.custom_interval_km, p_interval_km),
    coalesce(fv.custom_interval_hours, p_interval_hours),
    coalesce(fv.custom_interval_days, p_interval_days),
    latest.odometer_km, latest.engine_hours, current_date,
    coalesce(p_requires_fleet_approval, true), true, v_user_id
  from public.fleet_vehicles fv
  left join lateral (
    select reading.odometer_km, reading.engine_hours
    from public.fleet_unit_readings reading
    where reading.fleet_id = p_fleet_id and reading.vehicle_id = fv.vehicle_id
    order by reading.recorded_at desc, reading.created_at desc
    limit 1
  ) latest on true
  where fv.fleet_id = p_fleet_id
    and fv.shop_id = v_shop_id
    and coalesce(fv.active, true)
    and fv.vehicle_id = any(v_target_vehicle_ids)
    and not exists (
      select 1 from public.fleet_pm_policies existing
      where existing.program_id = v_program_id
        and existing.vehicle_id = fv.vehicle_id
        and existing.active
    );

  insert into public.activity_logs (user_id, action, target_table, target_id, context)
  values (
    v_user_id,
    case when p_action = 'create' then 'fleet_pm_program_created' else 'fleet_pm_program_updated' end,
    'fleet_programs',
    v_program_id,
    jsonb_build_object(
      'fleet_id', p_fleet_id,
      'shop_id', v_shop_id,
      'assignment_mode', p_assignment_mode,
      'assigned_units', cardinality(v_target_vehicle_ids),
      'task_count', jsonb_array_length(p_tasks)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'programId', v_program_id,
    'assignedUnits', cardinality(v_target_vehicle_ids)
  );
end;
$function$;

revoke execute on function public.manage_fleet_pm_program(
  text,uuid,uuid,text,text,integer,integer,integer,text,uuid[],jsonb,text,boolean,text
) from public, anon;
grant execute on function public.manage_fleet_pm_program(
  text,uuid,uuid,text,text,integer,integer,integer,text,uuid[],jsonb,text,boolean,text
) to authenticated, service_role;

revoke execute on function public.enforce_fleet_pm_program_assignment() from public, anon, authenticated;
grant execute on function public.enforce_fleet_pm_program_assignment() to service_role;

commit;
