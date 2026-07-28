-- Fleet operations core:
-- request builder provenance, unit readings, PM due events, and reviewable AI evidence.

alter type public.ai_training_source add value if not exists 'fleet';

alter table public.ai_events
  drop constraint if exists ai_events_event_type_check;

alter table public.ai_events
  add constraint ai_events_event_type_check
  check (
    event_type = any (
      array[
        'quote_created',
        'quote_updated',
        'work_order_created',
        'work_order_updated',
        'inspection_created',
        'inspection_updated',
        'booking_created',
        'booking_updated',
        'message',
        'customer_added',
        'vehicle_added',
        'parts_added',
        'labor_added',
        'fleet_pretrip_submitted',
        'fleet_pm_due',
        'fleet_request_created',
        'fleet_work_deferred',
        'fleet_work_declined',
        'fleet_work_completed'
      ]::text[]
    )
  );

alter table public.fleet_service_requests
  add column if not exists operation_key text,
  add column if not exists requested_for_date date,
  add column if not exists submitted_at timestamptz,
  add column if not exists source_pm_due_event_id uuid;

alter table public.fleet_service_requests
  drop constraint if exists fleet_service_requests_status_check;

alter table public.fleet_service_requests
  add constraint fleet_service_requests_status_check
  check (
    status = any (
      array[
        'open',
        'scheduled',
        'deferred',
        'declined',
        'completed',
        'cancelled'
      ]::text[]
    )
  );

alter table public.work_order_lines
  add column if not exists source_fleet_service_request_line_id uuid;

create table if not exists public.fleet_service_request_lines (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  service_request_id uuid not null references public.fleet_service_requests(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  line_kind text not null
    check (line_kind in ('menu', 'diagnostic', 'inspection', 'pm_package', 'custom')),
  source_menu_item_id uuid references public.menu_items(id) on delete set null,
  source_inspection_template_id uuid references public.inspection_templates(id) on delete set null,
  source_fleet_program_id uuid references public.fleet_programs(id) on delete set null,
  description text not null,
  notes text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  requested_labor_hours numeric(10,2) check (requested_labor_hours is null or requested_labor_hours >= 0),
  unit_price_snapshot numeric(14,2) check (unit_price_snapshot is null or unit_price_snapshot >= 0),
  price_status text not null default 'advisor_pending'
    check (price_status in ('advisor_pending', 'priced', 'approved', 'declined', 'deferred')),
  source_snapshot jsonb not null default '{}'::jsonb,
  work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fleet_unit_readings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  odometer_km numeric(12,1) check (odometer_km is null or odometer_km >= 0),
  engine_hours numeric(12,1) check (engine_hours is null or engine_hours >= 0),
  source_type text not null
    check (source_type in ('pretrip', 'work_order', 'manual', 'import')),
  source_id uuid,
  operation_key text,
  confidence numeric(5,4) not null default 1
    check (confidence >= 0 and confidence <= 1),
  recorded_at timestamptz not null default now(),
  recorded_by uuid default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (odometer_km is not null or engine_hours is not null)
);

create table if not exists public.fleet_pm_policies (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  program_id uuid not null references public.fleet_programs(id) on delete cascade,
  name text not null,
  interval_km numeric(12,1) check (interval_km is null or interval_km > 0),
  interval_hours numeric(12,1) check (interval_hours is null or interval_hours > 0),
  interval_days integer check (interval_days is null or interval_days > 0),
  anchor_odometer_km numeric(12,1) check (anchor_odometer_km is null or anchor_odometer_km >= 0),
  anchor_engine_hours numeric(12,1) check (anchor_engine_hours is null or anchor_engine_hours >= 0),
  anchor_date date not null default current_date,
  last_completed_at timestamptz,
  last_completed_work_order_id uuid references public.work_orders(id) on delete set null,
  requires_fleet_approval boolean not null default true,
  active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (interval_km is not null or interval_hours is not null or interval_days is not null)
);

create table if not exists public.fleet_pm_due_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  policy_id uuid not null references public.fleet_pm_policies(id) on delete cascade,
  program_id uuid not null references public.fleet_programs(id) on delete cascade,
  triggering_reading_id uuid references public.fleet_unit_readings(id) on delete set null,
  service_request_id uuid references public.fleet_service_requests(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'deferred', 'converted', 'completed', 'dismissed')),
  due_reasons text[] not null default '{}',
  due_snapshot jsonb not null default '{}'::jsonb,
  evidence_snapshot_id uuid references public.ai_evidence_snapshots(id) on delete set null,
  first_due_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  deferred_until date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fleet_service_requests
  drop constraint if exists fleet_service_requests_source_pm_due_event_id_fkey;
alter table public.fleet_service_requests
  add constraint fleet_service_requests_source_pm_due_event_id_fkey
  foreign key (source_pm_due_event_id)
  references public.fleet_pm_due_events(id)
  on delete set null
  not valid;
alter table public.fleet_service_requests
  validate constraint fleet_service_requests_source_pm_due_event_id_fkey;

alter table public.work_order_lines
  drop constraint if exists work_order_lines_source_fleet_service_request_line_id_fkey;
alter table public.work_order_lines
  add constraint work_order_lines_source_fleet_service_request_line_id_fkey
  foreign key (source_fleet_service_request_line_id)
  references public.fleet_service_request_lines(id)
  on delete set null
  not valid;
alter table public.work_order_lines
  validate constraint work_order_lines_source_fleet_service_request_line_id_fkey;

create unique index if not exists fleet_service_requests_operation_key_uidx
  on public.fleet_service_requests (shop_id, operation_key)
  where operation_key is not null;
create index if not exists fleet_service_request_lines_request_idx
  on public.fleet_service_request_lines (service_request_id, created_at);
create index if not exists fleet_service_request_lines_fleet_vehicle_idx
  on public.fleet_service_request_lines (fleet_id, vehicle_id);
create unique index if not exists fleet_unit_readings_operation_key_uidx
  on public.fleet_unit_readings (shop_id, operation_key)
  where operation_key is not null;
create index if not exists fleet_unit_readings_vehicle_recorded_idx
  on public.fleet_unit_readings (vehicle_id, recorded_at desc);
create index if not exists fleet_pm_policies_fleet_vehicle_idx
  on public.fleet_pm_policies (fleet_id, vehicle_id)
  where active = true;
create unique index if not exists fleet_pm_policies_active_program_vehicle_uidx
  on public.fleet_pm_policies (program_id, vehicle_id)
  where active = true;
create unique index if not exists fleet_pm_due_events_active_uidx
  on public.fleet_pm_due_events (policy_id, vehicle_id)
  where status in ('pending', 'deferred', 'converted');
create index if not exists fleet_pm_due_events_fleet_status_idx
  on public.fleet_pm_due_events (fleet_id, status, first_due_at desc);

alter table public.fleet_service_request_lines enable row level security;
alter table public.fleet_unit_readings enable row level security;
alter table public.fleet_pm_policies enable row level security;
alter table public.fleet_pm_due_events enable row level security;

revoke all on table public.fleet_service_request_lines from anon;
revoke all on table public.fleet_unit_readings from anon;
revoke all on table public.fleet_pm_policies from anon;
revoke all on table public.fleet_pm_due_events from anon;

grant select, insert, update on table public.fleet_service_request_lines to authenticated;
grant select, insert on table public.fleet_unit_readings to authenticated;
grant select, insert, update on table public.fleet_pm_policies to authenticated;
grant select, insert, update on table public.fleet_pm_due_events to authenticated;
grant all on table public.fleet_service_request_lines to service_role;
grant all on table public.fleet_unit_readings to service_role;
grant all on table public.fleet_pm_policies to service_role;
grant all on table public.fleet_pm_due_events to service_role;

create policy "fleet_request_lines.select.scope"
on public.fleet_service_request_lines
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_service_request_lines.shop_id
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_service_request_lines.fleet_id
  )
);

create policy "fleet_request_lines.insert.management"
on public.fleet_service_request_lines
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.shop_id = fleet_service_request_lines.shop_id
        and p.role in ('owner', 'admin', 'manager')
    )
    or exists (
      select 1 from public.fleet_members m
      where m.user_id = (select auth.uid())
        and m.fleet_id = fleet_service_request_lines.fleet_id
        and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
    )
  )
);

create policy "fleet_service_requests.insert.approver"
on public.fleet_service_requests
for insert to authenticated
with check (
  created_by_profile_id = (select auth.uid())
  and exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_service_requests.fleet_id
      and m.role = 'approver'
  )
);

create policy "fleet_request_lines.update.management"
on public.fleet_service_request_lines
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_service_request_lines.shop_id
      and p.role in ('owner', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_service_request_lines.shop_id
      and p.role in ('owner', 'admin', 'manager')
  )
);

create policy "fleet_readings.select.scope"
on public.fleet_unit_readings
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_unit_readings.shop_id
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_unit_readings.fleet_id
  )
);

create policy "fleet_readings.insert.scope"
on public.fleet_unit_readings
for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.shop_id = fleet_unit_readings.shop_id
    )
    or exists (
      select 1 from public.fleet_members m
      where m.user_id = (select auth.uid())
        and m.fleet_id = fleet_unit_readings.fleet_id
    )
  )
);

create policy "fleet_pm_policies.select.scope"
on public.fleet_pm_policies
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_pm_policies.shop_id
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_pm_policies.fleet_id
  )
);

create policy "fleet_pm_policies.write.management"
on public.fleet_pm_policies
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_pm_policies.shop_id
      and p.role in ('owner', 'admin', 'manager')
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_pm_policies.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_pm_policies.shop_id
      and p.role in ('owner', 'admin', 'manager')
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_pm_policies.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher')
  )
);

create policy "fleet_pm_due_events.select.scope"
on public.fleet_pm_due_events
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_pm_due_events.shop_id
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_pm_due_events.fleet_id
  )
);

create policy "fleet_pm_due_events.update.management"
on public.fleet_pm_due_events
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_pm_due_events.shop_id
      and p.role in ('owner', 'admin', 'manager')
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_pm_due_events.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher')
  )
);

create policy "fleet_programs.select.member"
on public.fleet_programs
for select to authenticated
using (
  exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_programs.fleet_id
  )
);

create policy "fleet_programs.write.fleet_manager"
on public.fleet_programs
for all to authenticated
using (
  exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_programs.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher')
  )
)
with check (
  exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_programs.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher')
  )
);

create policy "fleet_program_tasks.select.member"
on public.fleet_program_tasks
for select to authenticated
using (
  exists (
    select 1
    from public.fleet_programs fp
    join public.fleet_members m on m.fleet_id = fp.fleet_id
    where fp.id = fleet_program_tasks.program_id
      and m.user_id = (select auth.uid())
  )
);

create policy "fleet_program_tasks.write.fleet_manager"
on public.fleet_program_tasks
for all to authenticated
using (
  exists (
    select 1
    from public.fleet_programs fp
    join public.fleet_members m on m.fleet_id = fp.fleet_id
    where fp.id = fleet_program_tasks.program_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher')
  )
)
with check (
  exists (
    select 1
    from public.fleet_programs fp
    join public.fleet_members m on m.fleet_id = fp.fleet_id
    where fp.id = fleet_program_tasks.program_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher')
  )
);

create policy "menu_items.select.fleet_member"
on public.menu_items
for select to authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.fleets f
    join public.fleet_members m on m.fleet_id = f.id
    where f.shop_id = menu_items.shop_id
      and m.user_id = (select auth.uid())
  )
);

create policy "inspection_templates.select.fleet_member"
on public.inspection_templates
for select to authenticated
using (
  exists (
    select 1
    from public.fleets f
    join public.fleet_members m on m.fleet_id = f.id
    where f.shop_id = inspection_templates.shop_id
      and m.user_id = (select auth.uid())
  )
);

create policy "ai_evidence_snapshots.select.fleet_member"
on public.ai_evidence_snapshots
for select to authenticated
using (
  domain = 'fleet'
  and exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id::text = ai_evidence_snapshots.metadata ->> 'fleet_id'
  )
);

create policy "ai_recommendations.select.fleet_member"
on public.ai_recommendations
for select to authenticated
using (
  domain = 'fleet'
  and exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id::text = ai_recommendations.metadata ->> 'fleet_id'
  )
);

create or replace function public.create_fleet_service_request_atomic(
  p_fleet_id uuid,
  p_vehicle_id uuid,
  p_title text,
  p_summary text,
  p_requested_for_date date,
  p_lines jsonb,
  p_operation_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_request_id uuid;
  v_line jsonb;
  v_line_kind text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_operation_key is null or btrim(p_operation_key) = '' then
    raise exception 'Operation key is required';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one structured request line is required';
  end if;

  select f.shop_id into v_shop_id
  from public.fleets f
  where f.id = p_fleet_id;

  if v_shop_id is null then
    raise exception 'Fleet not found';
  end if;

  if not exists (
    select 1 from public.fleet_vehicles fv
    where fv.fleet_id = p_fleet_id
      and fv.vehicle_id = p_vehicle_id
      and coalesce(fv.active, true)
  ) then
    raise exception 'Unit is not active in this fleet';
  end if;

  if not (
    exists (
      select 1 from public.profiles p
      where p.id = v_user_id
        and p.shop_id = v_shop_id
        and p.role in ('owner', 'admin', 'manager')
    )
    or exists (
      select 1 from public.fleet_members m
      where m.user_id = v_user_id
        and m.fleet_id = p_fleet_id
        and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
    )
  ) then
    raise exception 'Fleet management access required';
  end if;

  select sr.id into v_request_id
  from public.fleet_service_requests sr
  where sr.shop_id = v_shop_id
    and sr.operation_key = p_operation_key;

  if v_request_id is not null then
    return v_request_id;
  end if;

  insert into public.fleet_service_requests (
    shop_id,
    fleet_id,
    vehicle_id,
    title,
    summary,
    severity,
    status,
    requested_for_date,
    submitted_at,
    created_by_profile_id,
    operation_key
  )
  values (
    v_shop_id,
    p_fleet_id,
    p_vehicle_id,
    left(coalesce(nullif(btrim(p_title), ''), 'Fleet service request'), 160),
    left(coalesce(nullif(btrim(p_summary), ''), 'Structured fleet request'), 4000),
    'recommend',
    'open',
    p_requested_for_date,
    now(),
    v_user_id,
    p_operation_key
  )
  returning id into v_request_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_kind := coalesce(v_line ->> 'lineKind', 'custom');
    if v_line_kind not in ('menu', 'diagnostic', 'inspection', 'pm_package', 'custom') then
      raise exception 'Unsupported request line kind: %', v_line_kind;
    end if;

    if nullif(v_line ->> 'sourceMenuItemId', '') is not null
      and not exists (
        select 1 from public.menu_items mi
        where mi.id = (v_line ->> 'sourceMenuItemId')::uuid
          and mi.shop_id = v_shop_id
          and mi.is_active
      )
    then
      raise exception 'Menu item is not available to this fleet';
    end if;

    if nullif(v_line ->> 'sourceInspectionTemplateId', '') is not null
      and not exists (
        select 1 from public.inspection_templates it
        where it.id = (v_line ->> 'sourceInspectionTemplateId')::uuid
          and it.shop_id = v_shop_id
      )
    then
      raise exception 'Inspection template is not available to this fleet';
    end if;

    if nullif(v_line ->> 'sourceFleetProgramId', '') is not null
      and not exists (
        select 1 from public.fleet_programs fp
        where fp.id = (v_line ->> 'sourceFleetProgramId')::uuid
          and fp.fleet_id = p_fleet_id
      )
    then
      raise exception 'PM package is not available to this fleet';
    end if;

    insert into public.fleet_service_request_lines (
      shop_id,
      fleet_id,
      service_request_id,
      vehicle_id,
      line_kind,
      source_menu_item_id,
      source_inspection_template_id,
      source_fleet_program_id,
      description,
      notes,
      quantity,
      requested_labor_hours,
      unit_price_snapshot,
      price_status,
      source_snapshot,
      created_by
    )
    values (
      v_shop_id,
      p_fleet_id,
      v_request_id,
      p_vehicle_id,
      v_line_kind,
      nullif(v_line ->> 'sourceMenuItemId', '')::uuid,
      nullif(v_line ->> 'sourceInspectionTemplateId', '')::uuid,
      nullif(v_line ->> 'sourceFleetProgramId', '')::uuid,
      left(coalesce(nullif(btrim(v_line ->> 'description'), ''), 'Requested service'), 1000),
      nullif(left(coalesce(v_line ->> 'notes', ''), 4000), ''),
      greatest(coalesce((v_line ->> 'quantity')::numeric, 1), 0.01),
      nullif(v_line ->> 'requestedLaborHours', '')::numeric,
      nullif(v_line ->> 'unitPriceSnapshot', '')::numeric,
      case
        when v_line_kind = 'menu' and nullif(v_line ->> 'unitPriceSnapshot', '') is not null
          then 'priced'
        else 'advisor_pending'
      end,
      coalesce(v_line -> 'sourceSnapshot', '{}'::jsonb),
      v_user_id
    );
  end loop;

  return v_request_id;
end;
$$;

create or replace function public.convert_fleet_service_request_to_work_order_atomic(
  p_service_request_id uuid
)
returns table (work_order_id uuid, conversion_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.fleet_service_requests%rowtype;
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
      and p.role in ('owner', 'admin', 'manager')
  ) then
    raise exception 'Shop staff review is required';
  end if;

  if v_request.work_order_id is not null then
    return query select v_request.work_order_id, 'already_linked'::text;
    return;
  end if;

  if not exists (
    select 1 from public.fleet_service_request_lines l
    where l.service_request_id = v_request.id
  ) then
    raise exception 'Structured request lines are required before conversion';
  end if;

  insert into public.work_orders (
    shop_id,
    vehicle_id,
    status,
    approval_state,
    source_fleet_service_request_id,
    created_by,
    notes
  )
  values (
    v_request.shop_id,
    v_request.vehicle_id,
    'awaiting_approval',
    'pending',
    v_request.id,
    v_user_id,
    concat('Fleet request: ', v_request.title, E'\n', v_request.summary)
  )
  returning id into v_work_order_id;

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
      when l.line_kind = 'diagnostic' then 'diagnostic'
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
$$;

create or replace function public.evaluate_fleet_pm_due_events(
  p_fleet_id uuid,
  p_vehicle_id uuid default null
)
returns table (due_event_id uuid, vehicle_id uuid, policy_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_policy record;
  v_vehicle_id uuid;
  v_reading public.fleet_unit_readings%rowtype;
  v_due_reasons text[];
  v_due_snapshot jsonb;
  v_event_id uuid;
  v_event_created boolean;
  v_evidence_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not (
    exists (
      select 1 from public.profiles p
      join public.fleets f on f.shop_id = p.shop_id
      where p.id = v_user_id and f.id = p_fleet_id
    )
    or exists (
      select 1 from public.fleet_members m
      where m.user_id = v_user_id and m.fleet_id = p_fleet_id
    )
  ) then
    raise exception 'Fleet access required';
  end if;

  -- Existing fleet-authored PM programs become per-unit policies automatically.
  -- Unit overrides win, and the first trustworthy reading becomes the anchor.
  insert into public.fleet_pm_policies (
    shop_id,
    fleet_id,
    vehicle_id,
    program_id,
    name,
    interval_km,
    interval_hours,
    interval_days,
    anchor_odometer_km,
    anchor_engine_hours,
    anchor_date,
    created_by
  )
  select
    f.shop_id,
    fp.fleet_id,
    fv.vehicle_id,
    fp.id,
    fp.name,
    coalesce(fv.custom_interval_km, fp.interval_km),
    coalesce(fv.custom_interval_hours, fp.interval_hours),
    coalesce(fv.custom_interval_days, fp.interval_days),
    latest.odometer_km,
    latest.engine_hours,
    current_date,
    v_user_id
  from public.fleet_programs fp
  join public.fleets f on f.id = fp.fleet_id
  join public.fleet_vehicles fv
    on fv.fleet_id = fp.fleet_id
   and coalesce(fv.active, true)
  left join lateral (
    select r.odometer_km, r.engine_hours
    from public.fleet_unit_readings r
    where r.fleet_id = fp.fleet_id
      and r.vehicle_id = fv.vehicle_id
    order by r.recorded_at desc, r.created_at desc
    limit 1
  ) latest on true
  where fp.fleet_id = p_fleet_id
    and (p_vehicle_id is null or fv.vehicle_id = p_vehicle_id)
    and (
      coalesce(fv.custom_interval_km, fp.interval_km) is not null
      or coalesce(fv.custom_interval_hours, fp.interval_hours) is not null
      or coalesce(fv.custom_interval_days, fp.interval_days) is not null
    )
  on conflict (program_id, vehicle_id)
    where active = true
  do nothing;

  for v_policy in
    select p.*
    from public.fleet_pm_policies p
    where p.fleet_id = p_fleet_id
      and p.active
      and (p_vehicle_id is null or p.vehicle_id is null or p.vehicle_id = p_vehicle_id)
  loop
    for v_vehicle_id in
      select fv.vehicle_id
      from public.fleet_vehicles fv
      where fv.fleet_id = p_fleet_id
        and coalesce(fv.active, true)
        and (p_vehicle_id is null or fv.vehicle_id = p_vehicle_id)
        and (v_policy.vehicle_id is null or fv.vehicle_id = v_policy.vehicle_id)
    loop
      select r.* into v_reading
      from public.fleet_unit_readings r
      where r.fleet_id = p_fleet_id
        and r.vehicle_id = v_vehicle_id
      order by r.recorded_at desc, r.created_at desc
      limit 1;

      if v_policy.anchor_odometer_km is null and v_reading.odometer_km is not null then
        update public.fleet_pm_policies
        set anchor_odometer_km = v_reading.odometer_km,
            updated_at = now()
        where id = v_policy.id;
        v_policy.anchor_odometer_km := v_reading.odometer_km;
      end if;

      if v_policy.anchor_engine_hours is null and v_reading.engine_hours is not null then
        update public.fleet_pm_policies
        set anchor_engine_hours = v_reading.engine_hours,
            updated_at = now()
        where id = v_policy.id;
        v_policy.anchor_engine_hours := v_reading.engine_hours;
      end if;

      v_due_reasons := array[]::text[];

      if v_policy.interval_km is not null
        and v_reading.odometer_km is not null
        and v_policy.anchor_odometer_km is not null
        and v_reading.odometer_km >= v_policy.anchor_odometer_km + v_policy.interval_km
      then
        v_due_reasons := array_append(v_due_reasons, 'odometer');
      end if;

      if v_policy.interval_hours is not null
        and v_reading.engine_hours is not null
        and v_policy.anchor_engine_hours is not null
        and v_reading.engine_hours >= v_policy.anchor_engine_hours + v_policy.interval_hours
      then
        v_due_reasons := array_append(v_due_reasons, 'engine_hours');
      end if;

      if v_policy.interval_days is not null
        and current_date >= v_policy.anchor_date + v_policy.interval_days
      then
        v_due_reasons := array_append(v_due_reasons, 'calendar');
      end if;

      if cardinality(v_due_reasons) = 0 then
        continue;
      end if;

      v_due_snapshot := jsonb_build_object(
        'policy_id', v_policy.id,
        'program_id', v_policy.program_id,
        'policy_name', v_policy.name,
        'due_reasons', to_jsonb(v_due_reasons),
        'current_odometer_km', v_reading.odometer_km,
        'current_engine_hours', v_reading.engine_hours,
        'anchor_odometer_km', v_policy.anchor_odometer_km,
        'anchor_engine_hours', v_policy.anchor_engine_hours,
        'anchor_date', v_policy.anchor_date,
        'interval_km', v_policy.interval_km,
        'interval_hours', v_policy.interval_hours,
        'interval_days', v_policy.interval_days,
        'reading_id', v_reading.id,
        'reading_recorded_at', v_reading.recorded_at
      );

      v_event_id := null;
      v_event_created := false;

      insert into public.fleet_pm_due_events (
        shop_id,
        fleet_id,
        vehicle_id,
        policy_id,
        program_id,
        triggering_reading_id,
        due_reasons,
        due_snapshot
      )
      values (
        v_policy.shop_id,
        v_policy.fleet_id,
        v_vehicle_id,
        v_policy.id,
        v_policy.program_id,
        v_reading.id,
        v_due_reasons,
        v_due_snapshot
      )
      on conflict (policy_id, vehicle_id)
        where status in ('pending', 'deferred', 'converted')
      do update
        set due_reasons = excluded.due_reasons,
            due_snapshot = excluded.due_snapshot,
            triggering_reading_id = excluded.triggering_reading_id,
            last_evaluated_at = now(),
            updated_at = now()
      returning id, (xmax = 0) into v_event_id, v_event_created;

      if v_event_created then
        insert into public.ai_evidence_snapshots (
          shop_id,
          subject_type,
          subject_id,
          domain,
          evidence_kind,
          snapshot,
          source_refs,
          missing_data,
          freshness_at,
          confidence,
          created_by,
          metadata
        )
        values (
          v_policy.shop_id,
          'fleet_unit',
          v_vehicle_id,
          'fleet',
          'pm_due_event',
          v_due_snapshot,
          jsonb_build_array(
            jsonb_build_object('table', 'fleet_pm_policies', 'id', v_policy.id),
            jsonb_build_object('table', 'fleet_unit_readings', 'id', v_reading.id)
          ),
          case
            when v_reading.id is null then '["current_unit_reading"]'::jsonb
            else '[]'::jsonb
          end,
          coalesce(v_reading.recorded_at, now()),
          case when v_reading.id is null then 0.7 else 0.95 end,
          v_user_id,
          jsonb_build_object('fleet_id', v_policy.fleet_id, 'policy_id', v_policy.id, 'due_event_id', v_event_id)
        )
        returning id into v_evidence_id;

        update public.fleet_pm_due_events
        set evidence_snapshot_id = v_evidence_id
        where id = v_event_id;

        insert into public.ai_recommendations (
          shop_id,
          domain,
          recommendation_type,
          subject_type,
          subject_id,
          title,
          summary,
          priority,
          confidence,
          risk_tier,
          evidence_snapshot_id,
          evidence_snapshot_ids,
          missing_data,
          recommended_action,
          requires_approval,
          source,
          created_by,
          metadata
        )
        values (
          v_policy.shop_id,
          'fleet',
          'pm_due',
          'fleet_unit',
          v_vehicle_id,
          concat(v_policy.name, ' is due'),
          concat('Due by ', array_to_string(v_due_reasons, ', '), '. Review the evidence before creating work.'),
          'high',
          case when v_reading.id is null then 0.7 else 0.95 end,
          'low',
          v_evidence_id,
          array[v_evidence_id],
          case
            when v_reading.id is null then '["current_unit_reading"]'::jsonb
            else '[]'::jsonb
          end,
          jsonb_build_object(
            'action', 'review_pm_due_event',
            'due_event_id', v_event_id,
            'program_id', v_policy.program_id
          ),
          true,
          'fleet_pm_policy_engine',
          v_user_id,
          jsonb_build_object('fleet_id', v_policy.fleet_id, 'policy_id', v_policy.id, 'due_event_id', v_event_id)
        );
      end if;

      due_event_id := v_event_id;
      vehicle_id := v_vehicle_id;
      policy_id := v_policy.id;
      created := v_event_created;
      return next;
    end loop;
  end loop;
end;
$$;

create or replace function public.capture_pretrip_unit_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.odometer_km is null then
    return new;
  end if;

  insert into public.fleet_unit_readings (
    shop_id,
    fleet_id,
    vehicle_id,
    odometer_km,
    engine_hours,
    source_type,
    source_id,
    operation_key,
    confidence,
    recorded_at,
    recorded_by,
    metadata
  )
  values (
    new.shop_id,
    new.fleet_id,
    new.vehicle_id,
    new.odometer_km,
    null,
    'pretrip',
    new.id,
    concat('pretrip:', new.id),
    1,
    coalesce(new.created_at, now()),
    coalesce(new.driver_profile_id, auth.uid()),
    jsonb_build_object(
      'driver_name', new.driver_name,
      'has_defects', new.has_defects,
      'inspection_date', new.inspection_date
    )
  )
  on conflict (shop_id, operation_key)
    where operation_key is not null
  do nothing;

  return new;
end;
$$;

create or replace function public.capture_fleet_ai_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_entity_id uuid;
  v_entity_table text;
  v_shop_id uuid;
  v_payload jsonb;
  v_evidence_id uuid;
  v_pm_due_event_id uuid;
begin
  if tg_table_name = 'fleet_pretrip_reports' then
    v_event_type := 'fleet_pretrip_submitted';
    v_entity_id := new.id;
    v_entity_table := 'fleet_pretrip_reports';
    v_shop_id := new.shop_id;
    v_payload := jsonb_build_object(
      'fleet_id', new.fleet_id,
      'vehicle_id', new.vehicle_id,
      'has_defects', new.has_defects,
      'odometer_km', new.odometer_km,
      'status', new.status
    );
  elsif tg_table_name = 'fleet_pm_due_events' then
    v_event_type := 'fleet_pm_due';
    v_entity_id := new.id;
    v_entity_table := 'fleet_pm_due_events';
    v_shop_id := new.shop_id;
    v_payload := jsonb_build_object(
      'fleet_id', new.fleet_id,
      'vehicle_id', new.vehicle_id,
      'policy_id', new.policy_id,
      'program_id', new.program_id,
      'due_reasons', new.due_reasons,
      'evidence_snapshot_id', new.evidence_snapshot_id
    );
  elsif tg_table_name = 'fleet_service_requests' then
    if tg_op = 'INSERT' then
      v_event_type := 'fleet_request_created';
    elsif new.status = 'deferred' and old.status is distinct from new.status then
      v_event_type := 'fleet_work_deferred';
    else
      return new;
    end if;
    v_entity_id := new.id;
    v_entity_table := 'fleet_service_requests';
    v_shop_id := new.shop_id;
    v_payload := jsonb_build_object(
      'fleet_id', new.fleet_id,
      'vehicle_id', new.vehicle_id,
      'status', new.status,
      'work_order_id', new.work_order_id
    );
  elsif tg_table_name = 'work_orders' then
    if new.source_fleet_service_request_id is null
      or lower(coalesce(new.status, '')) not in ('completed', 'closed', 'invoiced', 'paid')
      or old.status is not distinct from new.status
    then
      return new;
    end if;
    v_event_type := 'fleet_work_completed';
    v_entity_id := new.id;
    v_entity_table := 'work_orders';
    v_shop_id := new.shop_id;
    v_payload := jsonb_build_object(
      'vehicle_id', new.vehicle_id,
      'service_request_id', new.source_fleet_service_request_id,
      'status', new.status,
      'invoice_total', new.invoice_total
    );

    select sr.source_pm_due_event_id
      into v_pm_due_event_id
    from public.fleet_service_requests sr
    where sr.id = new.source_fleet_service_request_id;

    if v_pm_due_event_id is not null then
      update public.fleet_pm_policies p
      set last_completed_at = now(),
          last_completed_work_order_id = new.id,
          anchor_date = current_date,
          anchor_odometer_km = coalesce(
            (
              select r.odometer_km
              from public.fleet_unit_readings r
              where r.vehicle_id = new.vehicle_id
                and r.odometer_km is not null
              order by r.recorded_at desc, r.created_at desc
              limit 1
            ),
            p.anchor_odometer_km
          ),
          anchor_engine_hours = coalesce(
            (
              select r.engine_hours
              from public.fleet_unit_readings r
              where r.vehicle_id = new.vehicle_id
                and r.engine_hours is not null
              order by r.recorded_at desc, r.created_at desc
              limit 1
            ),
            p.anchor_engine_hours
          ),
          updated_at = now()
      from public.fleet_pm_due_events due
      where due.id = v_pm_due_event_id
        and p.id = due.policy_id;

      update public.fleet_pm_due_events
      set status = 'completed',
          completed_at = now(),
          updated_at = now()
      where id = v_pm_due_event_id;
    end if;
  elsif tg_table_name = 'work_order_quote_lines' then
    if new.status not in ('declined', 'deferred')
      or old.status is not distinct from new.status
      or not exists (
        select 1 from public.work_orders wo
        where wo.id = new.work_order_id
          and wo.source_fleet_service_request_id is not null
      )
    then
      return new;
    end if;
    v_event_type := case when new.status = 'deferred' then 'fleet_work_deferred' else 'fleet_work_declined' end;
    v_entity_id := new.id;
    v_entity_table := 'work_order_quote_lines';
    select wo.shop_id into v_shop_id
    from public.work_orders wo
    where wo.id = new.work_order_id;
    v_payload := jsonb_build_object(
      'work_order_id', new.work_order_id,
      'description', new.description,
      'status', new.status,
      'stage', new.stage
    );
  else
    return new;
  end if;

  insert into public.ai_events (
    shop_id,
    user_id,
    event_type,
    entity_id,
    entity_table,
    payload,
    training_source,
    source_id
  )
  values (
    v_shop_id,
    auth.uid(),
    v_event_type,
    v_entity_id,
    v_entity_table,
    v_payload,
    'fleet',
    v_entity_id
  );

  if tg_table_name = 'fleet_pretrip_reports' and new.has_defects then
    insert into public.ai_evidence_snapshots (
      shop_id,
      subject_type,
      subject_id,
      domain,
      evidence_kind,
      snapshot,
      source_refs,
      missing_data,
      freshness_at,
      confidence,
      created_by,
      metadata
    )
    values (
      new.shop_id,
      'fleet_unit',
      new.vehicle_id,
      'fleet',
      'pretrip_defects',
      jsonb_build_object(
        'pretrip_id', new.id,
        'inspection_date', new.inspection_date,
        'odometer_km', new.odometer_km,
        'checklist', new.checklist,
        'notes', new.notes,
        'driver_name', new.driver_name
      ),
      jsonb_build_array(
        jsonb_build_object('table', 'fleet_pretrip_reports', 'id', new.id)
      ),
      '[]'::jsonb,
      coalesce(new.created_at, now()),
      1,
      new.driver_profile_id,
      jsonb_build_object(
        'fleet_id', new.fleet_id,
        'pretrip_id', new.id
      )
    )
    returning id into v_evidence_id;

    insert into public.ai_recommendations (
      shop_id,
      domain,
      recommendation_type,
      subject_type,
      subject_id,
      title,
      summary,
      priority,
      confidence,
      risk_tier,
      evidence_snapshot_id,
      evidence_snapshot_ids,
      recommended_action,
      requires_approval,
      source,
      created_by,
      metadata
    )
    values (
      new.shop_id,
      'fleet',
      'pretrip_defect_review',
      'fleet_unit',
      new.vehicle_id,
      'Pre-trip defects need review',
      'Review the driver-recorded defects and decide whether to create structured service work.',
      'high',
      1,
      'medium',
      v_evidence_id,
      array[v_evidence_id],
      jsonb_build_object(
        'action', 'review_pretrip',
        'pretrip_id', new.id
      ),
      true,
      'fleet_pretrip_event',
      new.driver_profile_id,
      jsonb_build_object(
        'fleet_id', new.fleet_id,
        'pretrip_id', new.id
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists fleet_pretrip_ai_event on public.fleet_pretrip_reports;
create trigger fleet_pretrip_ai_event
after insert on public.fleet_pretrip_reports
for each row execute function public.capture_fleet_ai_event();

drop trigger if exists fleet_pretrip_reading on public.fleet_pretrip_reports;
create trigger fleet_pretrip_reading
after insert on public.fleet_pretrip_reports
for each row execute function public.capture_pretrip_unit_reading();

drop trigger if exists fleet_pm_due_ai_event on public.fleet_pm_due_events;
create trigger fleet_pm_due_ai_event
after insert on public.fleet_pm_due_events
for each row execute function public.capture_fleet_ai_event();

drop trigger if exists fleet_service_request_ai_event on public.fleet_service_requests;
create trigger fleet_service_request_ai_event
after insert or update of status on public.fleet_service_requests
for each row execute function public.capture_fleet_ai_event();

drop trigger if exists fleet_work_order_ai_event on public.work_orders;
create trigger fleet_work_order_ai_event
after update of status on public.work_orders
for each row execute function public.capture_fleet_ai_event();

drop trigger if exists fleet_quote_decision_ai_event on public.work_order_quote_lines;
create trigger fleet_quote_decision_ai_event
after update of status on public.work_order_quote_lines
for each row execute function public.capture_fleet_ai_event();

revoke all on function public.create_fleet_service_request_atomic(uuid, uuid, text, text, date, jsonb, text) from public, anon;
grant execute on function public.create_fleet_service_request_atomic(uuid, uuid, text, text, date, jsonb, text) to authenticated, service_role;

revoke all on function public.convert_fleet_service_request_to_work_order_atomic(uuid) from public, anon;
grant execute on function public.convert_fleet_service_request_to_work_order_atomic(uuid) to authenticated, service_role;

revoke all on function public.evaluate_fleet_pm_due_events(uuid, uuid) from public, anon;
grant execute on function public.evaluate_fleet_pm_due_events(uuid, uuid) to authenticated, service_role;

revoke all on function public.capture_fleet_ai_event() from public, anon, authenticated;
grant execute on function public.capture_fleet_ai_event() to service_role;

revoke all on function public.capture_pretrip_unit_reading() from public, anon, authenticated;
grant execute on function public.capture_pretrip_unit_reading() to service_role;
