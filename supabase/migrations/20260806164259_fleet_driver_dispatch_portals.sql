-- Separate Fleet manager, dispatcher, and driver workflows while keeping the
-- existing inspection, defect, and service-request records authoritative.

begin;

-- Preserve historical role aliases while allowing Fleet to store the three
-- product roles explicitly for all newly managed memberships.
do $role_constraint$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.fleet_members'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format(
      'alter table public.fleet_members drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$role_constraint$;

alter table public.fleet_members
  add constraint fleet_members_role_check
  check (
    role in (
      'manager', 'dispatcher', 'driver',
      'fleet_manager', 'approver', 'viewer',
      'owner', 'admin', 'member', 'user'
    )
  ) not valid;

alter table public.fleet_members
  validate constraint fleet_members_role_check;

-- A Fleet pre-trip template is still a canonical inspection_templates row.
-- This table only supplies Fleet ownership, versioning, and vehicle-type
-- assignment so a second inspection-template system is not introduced.
create table if not exists public.fleet_pretrip_template_assignments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  inspection_template_id uuid not null references public.inspection_templates(id) on delete restrict,
  vehicle_type text not null,
  version integer not null check (version > 0),
  active boolean not null default true,
  operation_key text not null,
  failure_config jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint fleet_pretrip_template_vehicle_type_chk
    check (length(btrim(vehicle_type)) between 1 and 80),
  constraint fleet_pretrip_template_failure_config_chk
    check (jsonb_typeof(failure_config) = 'object'),
  constraint fleet_pretrip_template_operation_key_chk
    check (length(btrim(operation_key)) between 8 and 160),
  constraint fleet_pretrip_template_version_uniq
    unique (fleet_id, vehicle_type, version),
  constraint fleet_pretrip_template_operation_uniq
    unique (fleet_id, operation_key)
);

create unique index if not exists fleet_pretrip_template_one_active_type_uidx
  on public.fleet_pretrip_template_assignments (fleet_id, lower(vehicle_type))
  where active;

create index if not exists fleet_pretrip_template_fleet_history_idx
  on public.fleet_pretrip_template_assignments
  (fleet_id, lower(vehicle_type), version desc);

alter table public.fleet_pretrip_reports
  add column if not exists template_assignment_id uuid
    references public.fleet_pretrip_template_assignments(id) on delete set null,
  add column if not exists template_version integer,
  add column if not exists template_snapshot jsonb,
  add column if not exists trailer_vehicle_id uuid
    references public.vehicles(id) on delete set null;

alter table public.fleet_pretrip_reports
  drop constraint if exists fleet_pretrip_reports_template_snapshot_chk;

alter table public.fleet_pretrip_reports
  add constraint fleet_pretrip_reports_template_snapshot_chk
  check (
    template_snapshot is null
    or jsonb_typeof(template_snapshot) = 'object'
  ) not valid;

alter table public.fleet_pretrip_reports
  validate constraint fleet_pretrip_reports_template_snapshot_chk;

alter table public.fleet_unit_defects
  add column if not exists resolution_code text,
  add column if not exists notify_dispatcher boolean not null default true,
  add column if not exists intake_required boolean not null default true,
  add column if not exists marks_vehicle_attention boolean not null default false;

alter table public.fleet_unit_defects
  drop constraint if exists fleet_unit_defects_resolution_code_chk;

alter table public.fleet_unit_defects
  add constraint fleet_unit_defects_resolution_code_chk
  check (
    resolution_code is null
    or resolution_code in ('duplicate', 'not_issue', 'completed')
  ) not valid;

alter table public.fleet_unit_defects
  validate constraint fleet_unit_defects_resolution_code_chk;

create table if not exists public.fleet_defect_clarifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  defect_id uuid not null references public.fleet_unit_defects(id) on delete cascade,
  response_type text not null
    check (response_type in ('answer', 'photo', 'voice')),
  prompt text not null check (length(btrim(prompt)) between 1 and 1000),
  status text not null default 'requested'
    check (status in ('requested', 'responded', 'closed')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  response_text text,
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_defect_clarification_response_chk check (
    status <> 'responded'
    or (responded_by is not null and responded_at is not null)
  )
);

create unique index if not exists fleet_defect_one_open_clarification_uidx
  on public.fleet_defect_clarifications (defect_id)
  where status = 'requested';

create index if not exists fleet_defect_clarification_driver_idx
  on public.fleet_defect_clarifications (fleet_id, status, requested_at desc);

create table if not exists public.fleet_driver_evidence (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  pretrip_report_id uuid not null references public.fleet_pretrip_reports(id) on delete cascade,
  defect_id uuid references public.fleet_unit_defects(id) on delete cascade,
  clarification_id uuid references public.fleet_defect_clarifications(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  item_id text,
  media_type text not null check (media_type in ('photo', 'voice')),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_at timestamptz not null default now(),
  constraint fleet_driver_evidence_path_chk
    check (storage_path !~ '(^|/)\.\.(/|$)' and storage_path !~ '^/'),
  constraint fleet_driver_evidence_clarification_chk
    check (clarification_id is null or defect_id is not null)
);

create index if not exists fleet_driver_evidence_pretrip_idx
  on public.fleet_driver_evidence (pretrip_report_id, created_at);

create index if not exists fleet_driver_evidence_defect_idx
  on public.fleet_driver_evidence (defect_id, created_at)
  where defect_id is not null;

alter table public.fleet_pretrip_template_assignments enable row level security;
alter table public.fleet_defect_clarifications enable row level security;
alter table public.fleet_driver_evidence enable row level security;

revoke all on table public.fleet_pretrip_template_assignments from anon, authenticated;
revoke all on table public.fleet_defect_clarifications from anon, authenticated;
revoke all on table public.fleet_driver_evidence from anon, authenticated;

grant select on table public.fleet_pretrip_template_assignments to authenticated;
grant select on table public.fleet_defect_clarifications to authenticated;
grant select on table public.fleet_driver_evidence to authenticated;
grant all on table public.fleet_pretrip_template_assignments to service_role;
grant all on table public.fleet_defect_clarifications to service_role;
grant all on table public.fleet_driver_evidence to service_role;

drop policy if exists "fleet_pretrip_templates.select.scope"
  on public.fleet_pretrip_template_assignments;
create policy "fleet_pretrip_templates.select.scope"
on public.fleet_pretrip_template_assignments
for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_pretrip_template_assignments.shop_id
      and p.role in ('owner', 'admin', 'manager')
  )
  or exists (
    select 1
    from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_pretrip_template_assignments.fleet_id
      and (
        fleet_pretrip_template_assignments.active
        or m.role in ('owner', 'admin', 'manager', 'fleet_manager')
      )
  )
);

drop policy if exists "fleet_defect_clarifications.select.scope"
  on public.fleet_defect_clarifications;
create policy "fleet_defect_clarifications.select.scope"
on public.fleet_defect_clarifications
for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_defect_clarifications.shop_id
      and p.role in ('owner', 'admin', 'manager')
  )
  or exists (
    select 1
    from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_defect_clarifications.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
  )
  or exists (
    select 1
    from public.fleet_unit_defects d
    where d.id = fleet_defect_clarifications.defect_id
      and d.reported_by = (select auth.uid())
  )
);

drop policy if exists "fleet_driver_evidence.select.scope"
  on public.fleet_driver_evidence;
create policy "fleet_driver_evidence.select.scope"
on public.fleet_driver_evidence
for select to authenticated
using (
  uploaded_by = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_driver_evidence.shop_id
      and p.role in ('owner', 'admin', 'manager')
  )
  or exists (
    select 1
    from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_driver_evidence.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
  )
);

-- Drivers can read only their own submissions and active assignments. Fleet
-- managers and dispatchers retain their Fleet-wide operational views.
drop policy if exists "fleet_unit_defects.select.scope" on public.fleet_unit_defects;
create policy "fleet_unit_defects.select.scope"
on public.fleet_unit_defects
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_unit_defects.shop_id
      and p.role in ('owner', 'admin', 'manager', 'advisor')
  )
  or reported_by = (select auth.uid())
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_unit_defects.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
  )
);

drop policy if exists "fleet_pretrip_reports.select.member" on public.fleet_pretrip_reports;
create policy "fleet_pretrip_reports.select.member"
on public.fleet_pretrip_reports
for select to authenticated
using (
  driver_profile_id = (select auth.uid())
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_pretrip_reports.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
  )
);

-- All report creation goes through submit_fleet_pretrip_report so assignment,
-- local service date, meter monotonicity, template snapshot, and evidence are
-- validated atomically. Retire the broad legacy member mutation policies.
drop policy if exists "fleet_pretrip_reports.insert.member"
  on public.fleet_pretrip_reports;
drop policy if exists "fleet_pretrip_reports.update.management"
  on public.fleet_pretrip_reports;
drop policy if exists "fleet_pretrip_reports.delete.management"
  on public.fleet_pretrip_reports;
drop policy if exists "fleet_pretrip_reports.staff.same_shop_all"
  on public.fleet_pretrip_reports;

drop policy if exists "fleet_pretrip_reports.staff.same_shop_select"
  on public.fleet_pretrip_reports;
create policy "fleet_pretrip_reports.staff.same_shop_select"
on public.fleet_pretrip_reports
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_pretrip_reports.shop_id
      and p.role in ('owner', 'admin', 'manager')
  )
);

revoke insert, update, delete on table public.fleet_pretrip_reports
  from authenticated;
grant select on table public.fleet_pretrip_reports to authenticated;
grant all on table public.fleet_pretrip_reports to service_role;

drop policy if exists "fleet_dispatch_assignments.select.member"
  on public.fleet_dispatch_assignments;
drop policy if exists "Fleet dispatch visible to driver"
  on public.fleet_dispatch_assignments;
create policy "fleet_dispatch_assignments.select.member"
on public.fleet_dispatch_assignments
for select to authenticated
using (
  (driver_profile_id = (select auth.uid()) and active)
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_dispatch_assignments.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
  )
);

drop policy if exists "fleet_request_lines.select.scope"
  on public.fleet_service_request_lines;
create policy "fleet_request_lines.select.scope"
on public.fleet_service_request_lines
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_service_request_lines.shop_id
      and p.role in ('owner', 'admin', 'manager', 'advisor')
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_service_request_lines.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
  )
);

drop policy if exists "fleet_pretrip_compliance.select.scope"
  on public.fleet_pretrip_compliance;
create policy "fleet_pretrip_compliance.select.scope"
on public.fleet_pretrip_compliance
for select to authenticated
using (
  driver_profile_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.shop_id = fleet_pretrip_compliance.shop_id
      and p.role in ('owner', 'admin', 'manager', 'advisor')
  )
  or exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_pretrip_compliance.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
  )
);

drop policy if exists "fleet_service_requests.select.member"
  on public.fleet_service_requests;
create policy "fleet_service_requests.select.member"
on public.fleet_service_requests
for select to authenticated
using (
  exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_service_requests.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
  )
);

drop policy if exists "fleet_vehicles.select.member" on public.fleet_vehicles;
create policy "fleet_vehicles.select.member"
on public.fleet_vehicles
for select to authenticated
using (
  exists (
    select 1 from public.fleet_members m
    where m.user_id = (select auth.uid())
      and m.fleet_id = fleet_vehicles.fleet_id
      and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
  )
  or exists (
    select 1 from public.fleet_dispatch_assignments a
    where a.fleet_id = fleet_vehicles.fleet_id
      and a.vehicle_id = fleet_vehicles.vehicle_id
      and a.driver_profile_id = (select auth.uid())
      and a.active
  )
);

-- Private bucket. Uploads and signed reads are performed only after server-side
-- Fleet authorization; no authenticated storage.objects policy is granted.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'fleet-driver-evidence',
  'fleet-driver-evidence',
  false,
  15728640,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav',
    'audio/x-m4a'
  ]::text[]
)
on conflict (id) do nothing;

create or replace function public.save_fleet_pretrip_template(
  p_fleet_id uuid,
  p_name text,
  p_vehicle_type text,
  p_sections jsonb,
  p_failure_config jsonb,
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
  v_version integer;
  v_template_id uuid;
  v_assignment_id uuid;
  v_section jsonb;
  v_item jsonb;
  v_item_ids text[] := '{}'::text[];
  v_item_id text;
  v_item_count integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Template name is required';
  end if;
  if length(btrim(p_name)) > 120 then raise exception 'Template name is too long'; end if;
  if nullif(btrim(coalesce(p_vehicle_type, '')), '') is null
     or length(btrim(p_vehicle_type)) > 80 then
    raise exception 'Vehicle type is required';
  end if;
  if nullif(btrim(coalesce(p_operation_key, '')), '') is null
     or length(btrim(p_operation_key)) < 8
     or length(btrim(p_operation_key)) > 160 then
    raise exception 'Valid operation key is required';
  end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'At least one inspection section is required';
  end if;
  if jsonb_array_length(p_sections) > 30 then
    raise exception 'A template can contain at most 30 sections';
  end if;
  if jsonb_typeof(coalesce(p_failure_config, '{}'::jsonb)) <> 'object' then
    raise exception 'Failure configuration must be an object';
  end if;

  select f.shop_id into v_shop_id
  from public.fleets f
  where f.id = p_fleet_id
  for update;
  if v_shop_id is null then raise exception 'Fleet not found'; end if;

  if not (
    exists (
      select 1 from public.fleet_members m
      where m.user_id = v_user_id
        and m.fleet_id = p_fleet_id
        and m.role in ('owner', 'admin', 'manager', 'fleet_manager')
    )
    or exists (
      select 1 from public.profiles p
      where p.id = v_user_id
        and p.shop_id = v_shop_id
        and p.role in ('owner', 'admin', 'manager')
        and exists (
          select 1 from public.fleet_members m
          where m.user_id = v_user_id and m.fleet_id = p_fleet_id
        )
    )
  ) then
    raise exception 'Fleet manager access required';
  end if;

  select a.id, a.inspection_template_id, a.version
  into v_assignment_id, v_template_id, v_version
  from public.fleet_pretrip_template_assignments a
  where a.fleet_id = p_fleet_id
    and a.operation_key = btrim(p_operation_key);

  if v_assignment_id is not null then
    return jsonb_build_object(
      'ok', true,
      'assignmentId', v_assignment_id,
      'templateId', v_template_id,
      'version', v_version,
      'replayed', true
    );
  end if;

  for v_section in select value from jsonb_array_elements(p_sections)
  loop
    if jsonb_typeof(v_section) <> 'object'
       or nullif(btrim(coalesce(v_section ->> 'title', '')), '') is null
       or jsonb_typeof(v_section -> 'items') <> 'array'
       or jsonb_array_length(v_section -> 'items') = 0 then
      raise exception 'Every section requires a title and at least one item';
    end if;

    for v_item in select value from jsonb_array_elements(v_section -> 'items')
    loop
      v_item_count := v_item_count + 1;
      if v_item_count > 200 then raise exception 'A template can contain at most 200 items'; end if;
      v_item_id := nullif(btrim(coalesce(v_item ->> 'id', '')), '');
      if jsonb_typeof(v_item) <> 'object'
         or v_item_id is null
         or v_item_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
         or nullif(btrim(coalesce(v_item ->> 'label', v_item ->> 'item', '')), '') is null
         or coalesce(v_item ->> 'type', '') not in ('pass_fail', 'number', 'photo', 'voice') then
        raise exception 'Every item requires a unique id, label, and supported field type';
      end if;
      if v_item_id = any(v_item_ids) then raise exception 'Inspection item ids must be unique'; end if;
      v_item_ids := array_append(v_item_ids, v_item_id);
    end loop;
  end loop;

  select coalesce(max(a.version), 0) + 1 into v_version
  from public.fleet_pretrip_template_assignments a
  where a.fleet_id = p_fleet_id
    and lower(a.vehicle_type) = lower(btrim(p_vehicle_type));

  insert into public.inspection_templates (
    user_id, shop_id, template_name, sections, description, tags,
    vehicle_type, is_public
  ) values (
    v_user_id,
    v_shop_id,
    btrim(p_name),
    p_sections,
    'Fleet driver pre-trip template',
    array['fleet-pretrip', 'fleet-driver'],
    btrim(p_vehicle_type),
    false
  ) returning id into v_template_id;

  update public.fleet_pretrip_template_assignments
  set active = false,
      retired_at = coalesce(retired_at, now())
  where fleet_id = p_fleet_id
    and lower(vehicle_type) = lower(btrim(p_vehicle_type))
    and active;

  insert into public.fleet_pretrip_template_assignments (
    shop_id, fleet_id, inspection_template_id, vehicle_type, version,
    active, operation_key, failure_config, created_by
  ) values (
    v_shop_id, p_fleet_id, v_template_id, btrim(p_vehicle_type), v_version,
    true, btrim(p_operation_key), coalesce(p_failure_config, '{}'::jsonb), v_user_id
  ) returning id into v_assignment_id;

  insert into public.activity_logs (user_id, action, target_table, target_id, context)
  values (
    v_user_id,
    'fleet_pretrip_template_published',
    'fleet_pretrip_template_assignments',
    v_assignment_id,
    jsonb_build_object(
      'shop_id', v_shop_id,
      'fleet_id', p_fleet_id,
      'inspection_template_id', v_template_id,
      'vehicle_type', btrim(p_vehicle_type),
      'version', v_version
    )
  );

  return jsonb_build_object(
    'ok', true,
    'assignmentId', v_assignment_id,
    'templateId', v_template_id,
    'version', v_version,
    'replayed', false
  );
end;
$function$;

-- The legacy queue treated every Fleet member as an operations user. The
-- dispatcher gate is intentionally manager/dispatcher-only; drivers receive
-- their own issue timeline through the scoped driver dashboard instead.
create or replace function public.get_fleet_defect_queue(
  p_fleet_id uuid default null
)
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

  select p.shop_id, p.role in ('owner', 'admin', 'manager')
  into v_profile_shop_id, v_is_internal
  from public.profiles p
  where p.id = v_user_id;

  select coalesce(array_agg(m.fleet_id), '{}'::uuid[])
  into v_allowed_fleets
  from public.fleet_members m
  where m.user_id = v_user_id
    and m.role in (
      'owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver'
    );

  if not v_is_internal and cardinality(v_allowed_fleets) = 0 then
    raise exception 'Fleet dispatch access required';
  end if;
  if p_fleet_id is not null and not (
    (
      v_is_internal
      and exists (
        select 1 from public.fleets f
        where f.id = p_fleet_id and f.shop_id = v_profile_shop_id
      )
    )
    or p_fleet_id = any(v_allowed_fleets)
  ) then
    raise exception 'Fleet dispatch access required';
  end if;

  select jsonb_build_object(
    'canManage', true,
    'summary', jsonb_build_object(
      'open', count(*) filter (where d.state = 'open'),
      'acknowledged', count(*) filter (where d.state = 'acknowledged'),
      'deferred', count(*) filter (where d.state = 'deferred'),
      'converted', count(*) filter (where d.state = 'converted'),
      'missedPretrips', (
        select count(*)
        from public.fleet_pretrip_compliance c
        where c.status = 'missed'
          and (p_fleet_id is null or c.fleet_id = p_fleet_id)
          and (
            (v_is_internal and c.shop_id = v_profile_shop_id)
            or c.fleet_id = any(v_allowed_fleets)
          )
      )
    ),
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'fleetId', d.fleet_id,
          'vehicleId', d.vehicle_id,
          'pretripId', d.source_pretrip_id,
          'unitLabel', coalesce(
            nullif(fv.nickname, ''), nullif(v.unit_number, ''),
            nullif(v.license_plate, ''), nullif(v.vin, ''), 'Unit'
          ),
          'driverName', r.driver_name,
          'label', d.label,
          'severity', d.severity,
          'state', d.state,
          'description', d.description,
          'reportedAt', d.reported_at,
          'deferredUntil', d.deferred_until,
          'serviceRequestId', d.service_request_id,
          'workOrderId', d.work_order_id
        )
        order by
          case d.severity
            when 'safety' then 0
            when 'compliance' then 1
            when 'maintenance' then 2
            else 3
          end,
          d.reported_at desc
      ) filter (where d.id is not null),
      '[]'::jsonb
    ),
    'missed', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'fleetId', c.fleet_id,
            'vehicleId', c.vehicle_id,
            'driverProfileId', c.driver_profile_id,
            'serviceDate', c.service_date,
            'dueAt', c.due_at,
            'status', c.status,
            'unitLabel', coalesce(
              nullif(a.unit_label, ''), nullif(v2.unit_number, ''),
              nullif(v2.license_plate, ''), nullif(v2.vin, ''), 'Unit'
            ),
            'driverName', coalesce(
              nullif(a.driver_name, ''), nullif(p2.full_name, ''),
              nullif(p2.email, ''), 'Driver'
            )
          )
          order by c.due_at desc
        ),
        '[]'::jsonb
      )
      from public.fleet_pretrip_compliance c
      join public.fleet_dispatch_assignments a on a.id = c.assignment_id
      join public.vehicles v2 on v2.id = c.vehicle_id
      left join public.profiles p2 on p2.id = c.driver_profile_id
      where c.status = 'missed'
        and (p_fleet_id is null or c.fleet_id = p_fleet_id)
        and (
          (v_is_internal and c.shop_id = v_profile_shop_id)
          or c.fleet_id = any(v_allowed_fleets)
        )
    )
  )
  into v_result
  from public.fleet_unit_defects d
  join public.fleet_pretrip_reports r on r.id = d.source_pretrip_id
  join public.vehicles v on v.id = d.vehicle_id
  left join public.fleet_vehicles fv
    on fv.fleet_id = d.fleet_id and fv.vehicle_id = d.vehicle_id
  where d.state <> 'resolved'
    and (p_fleet_id is null or d.fleet_id = p_fleet_id)
    and d.intake_required
    and (
      (v_is_internal and d.shop_id = v_profile_shop_id)
      or d.fleet_id = any(v_allowed_fleets)
    );

  return coalesce(
    v_result,
    jsonb_build_object(
      'canManage', true,
      'summary', jsonb_build_object(
        'open', 0,
        'acknowledged', 0,
        'deferred', 0,
        'converted', 0,
        'missedPretrips', 0
      ),
      'items', '[]'::jsonb,
      'missed', '[]'::jsonb
    )
  );
end;
$function$;

create or replace function public.submit_fleet_pretrip_report(
  p_report_id uuid,
  p_fleet_id uuid,
  p_vehicle_id uuid,
  p_trailer_vehicle_id uuid,
  p_odometer_km numeric,
  p_checklist jsonb,
  p_notes text,
  p_template_assignment_id uuid,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_profile public.profiles%rowtype;
  v_member_role text;
  v_is_internal boolean := false;
  v_inspection_date date;
  v_timezone text;
  v_has_defects boolean := false;
  v_defect_count integer := 0;
  v_template_version integer;
  v_template_snapshot jsonb;
  v_evidence jsonb;
  v_storage_path text;
  v_media_type text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_report_id is null then raise exception 'Report id is required'; end if;
  if jsonb_typeof(coalesce(p_checklist, '{}'::jsonb)) <> 'object' then
    raise exception 'Checklist must be an object';
  end if;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then
    raise exception 'Evidence must be an array';
  end if;

  select f.shop_id into v_shop_id
  from public.fleets f
  where f.id = p_fleet_id and f.active;
  if v_shop_id is null then raise exception 'Fleet not found'; end if;

  select * into v_profile from public.profiles p where p.id = v_user_id;
  if v_profile.id is null then raise exception 'Driver profile is unavailable'; end if;

  select m.role into v_member_role
  from public.fleet_members m
  where m.user_id = v_user_id and m.fleet_id = p_fleet_id;

  v_is_internal := v_profile.shop_id = v_shop_id
    and v_profile.role in ('owner', 'admin', 'manager', 'advisor');

  if v_member_role is null then raise exception 'Fleet membership required'; end if;
  if not v_is_internal
     and v_member_role not in ('driver', 'viewer', 'member', 'user') then
    raise exception 'Fleet driver access required';
  end if;
  if not v_is_internal
     and not exists (
       select 1 from public.fleet_dispatch_assignments a
       where a.shop_id = v_shop_id
         and a.fleet_id = p_fleet_id
         and a.vehicle_id = p_vehicle_id
         and a.driver_profile_id = v_user_id
         and a.active
     ) then
    raise exception 'This unit is not assigned to your driver account';
  end if;

  if not exists (
    select 1 from public.fleet_vehicles fv
    where fv.fleet_id = p_fleet_id
      and fv.vehicle_id = p_vehicle_id
      and (fv.shop_id is null or fv.shop_id = v_shop_id)
      and coalesce(fv.active, true)
  ) then
    raise exception 'Vehicle is not available in this Fleet';
  end if;

  if p_trailer_vehicle_id is not null and (
    p_trailer_vehicle_id = p_vehicle_id
    or not exists (
      select 1 from public.fleet_vehicles fv
      where fv.fleet_id = p_fleet_id
        and fv.vehicle_id = p_trailer_vehicle_id
        and (fv.shop_id is null or fv.shop_id = v_shop_id)
        and coalesce(fv.active, true)
    )
  ) then
    raise exception 'Trailer is not available in this Fleet';
  end if;

  select coalesce(nullif(s.timezone, ''), 'America/Los_Angeles')
  into v_timezone from public.shops s where s.id = v_shop_id;
  v_inspection_date := (now() at time zone v_timezone)::date;

  select count(*)::integer into v_defect_count
  from jsonb_each_text(coalesce(p_checklist -> 'defects', '{}'::jsonb))
  where value = 'defect';
  v_has_defects := v_defect_count > 0;

  if p_template_assignment_id is not null then
    select a.version,
           jsonb_build_object(
             'assignmentId', a.id,
             'templateId', a.inspection_template_id,
             'name', it.template_name,
             'vehicleType', a.vehicle_type,
             'version', a.version,
             'sections', it.sections,
             'failureConfig', a.failure_config
           )
    into v_template_version, v_template_snapshot
    from public.fleet_pretrip_template_assignments a
    join public.inspection_templates it on it.id = a.inspection_template_id
    where a.id = p_template_assignment_id
      and a.fleet_id = p_fleet_id
      and a.shop_id = v_shop_id
      and a.active;
    if v_template_version is null then raise exception 'Active pre-trip template not found'; end if;
  else
    v_template_snapshot := p_checklist -> 'template';
  end if;

  for v_evidence in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    v_storage_path := nullif(btrim(coalesce(v_evidence ->> 'storagePath', '')), '');
    v_media_type := v_evidence ->> 'mediaType';
    if v_storage_path is null
       or v_storage_path not like p_fleet_id::text || '/' || p_report_id::text || '/%'
       or v_storage_path ~ '(^|/)\.\.(/|$)'
       or v_media_type not in ('photo', 'voice')
       or nullif(v_evidence ->> 'mimeType', '') is null
       or coalesce((v_evidence ->> 'sizeBytes')::bigint, 0) <= 0
       or coalesce((v_evidence ->> 'sizeBytes')::bigint, 0) > 15728640 then
      raise exception 'Invalid Fleet evidence metadata';
    end if;
  end loop;

  insert into public.fleet_pretrip_reports (
    id, fleet_id, shop_id, vehicle_id, trailer_vehicle_id,
    driver_profile_id, driver_name, inspection_date, odometer_km,
    checklist, notes, has_defects, status, template_assignment_id,
    template_version, template_snapshot
  ) values (
    p_report_id, p_fleet_id, v_shop_id, p_vehicle_id, p_trailer_vehicle_id,
    v_user_id,
    coalesce(nullif(btrim(v_profile.full_name), ''), nullif(btrim(v_profile.email), ''), 'Driver'),
    v_inspection_date, p_odometer_km, p_checklist,
    nullif(btrim(coalesce(p_notes, '')), ''), v_has_defects,
    case when v_has_defects then 'open' else 'reviewed' end,
    p_template_assignment_id, v_template_version, v_template_snapshot
  );

  insert into public.fleet_driver_evidence (
    shop_id, fleet_id, vehicle_id, pretrip_report_id, uploaded_by,
    item_id, media_type, storage_path, mime_type, size_bytes
  )
  select
    v_shop_id, p_fleet_id, p_vehicle_id, p_report_id, v_user_id,
    nullif(value ->> 'itemId', ''), value ->> 'mediaType',
    value ->> 'storagePath', value ->> 'mimeType', (value ->> 'sizeBytes')::bigint
  from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb));

  return jsonb_build_object(
    'ok', true,
    'id', p_report_id,
    'hasDefects', v_has_defects,
    'defectCount', v_defect_count,
    'status', case when v_has_defects then 'open' else 'reviewed' end
  );
end;
$function$;

create or replace function public.manage_fleet_driver_intake(
  p_action text,
  p_defect_ids uuid[],
  p_action_date date default null,
  p_reason text default null,
  p_response_type text default null,
  p_resolution_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_defect record;
  v_result jsonb;
  v_clarification_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if coalesce(cardinality(p_defect_ids), 0) = 0 then
    raise exception 'Select at least one defect';
  end if;

  perform 1 from public.fleet_unit_defects d
  where d.id = any(p_defect_ids)
  for update;

  if (
    select count(*) from public.fleet_unit_defects d where d.id = any(p_defect_ids)
  ) <> cardinality(p_defect_ids) then
    raise exception 'One or more defects were not found';
  end if;

  if p_action in ('schedule', 'escalate') and exists (
    select 1 from public.fleet_unit_defects d
    where d.id = any(p_defect_ids)
      and (d.service_request_id is not null or d.state = 'converted')
  ) then
    raise exception 'One or more defects have already been escalated';
  end if;

  if p_action = 'acknowledge' then
    v_result := public.manage_fleet_unit_defects(
      'acknowledge', p_defect_ids, null, null, null
    );
  elsif p_action = 'monitor' then
    v_result := public.manage_fleet_unit_defects(
      'defer', p_defect_ids, p_action_date, p_reason, null
    );
  elsif p_action = 'close' then
    if p_resolution_code not in ('duplicate', 'not_issue') then
      raise exception 'Choose duplicate or not an issue';
    end if;
    v_result := public.manage_fleet_unit_defects(
      'resolve', p_defect_ids, null, p_reason, null
    );
    update public.fleet_unit_defects
    set resolution_code = p_resolution_code,
        updated_at = now()
    where id = any(p_defect_ids);
  elsif p_action = 'schedule' then
    if p_action_date is null or p_action_date < current_date then
      raise exception 'A current or future schedule date is required';
    end if;
    v_result := public.manage_fleet_unit_defects(
      'create_request', p_defect_ids, null, p_reason, p_action_date
    );
  elsif p_action = 'escalate' then
    v_result := public.manage_fleet_unit_defects(
      'create_request', p_defect_ids, null, p_reason, null
    );
  elsif p_action = 'request_info' then
    if cardinality(p_defect_ids) <> 1 then
      raise exception 'Request information for one defect at a time';
    end if;
    if p_response_type not in ('answer', 'photo', 'voice') then
      raise exception 'Choose an answer, photo, or voice response';
    end if;
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'A clear driver question is required';
    end if;

    select d.* into v_defect
    from public.fleet_unit_defects d
    where d.id = p_defect_ids[1];

    if not (
      exists (
        select 1 from public.profiles p
        where p.id = v_user_id
          and p.shop_id = v_defect.shop_id
          and p.role in ('owner', 'admin', 'manager')
      )
      or exists (
        select 1 from public.fleet_members m
        where m.user_id = v_user_id
          and m.fleet_id = v_defect.fleet_id
          and m.role in ('owner', 'admin', 'manager', 'fleet_manager', 'dispatcher', 'approver')
      )
    ) then
      raise exception 'Fleet dispatch access required';
    end if;

    insert into public.fleet_defect_clarifications (
      shop_id, fleet_id, vehicle_id, defect_id, response_type,
      prompt, status, requested_by
    ) values (
      v_defect.shop_id, v_defect.fleet_id, v_defect.vehicle_id,
      v_defect.id, p_response_type, left(btrim(p_reason), 1000),
      'requested', v_user_id
    ) returning id into v_clarification_id;

    update public.fleet_unit_defects
    set state = 'acknowledged',
        acknowledged_at = coalesce(acknowledged_at, now()),
        acknowledged_by = coalesce(acknowledged_by, v_user_id),
        updated_at = now()
    where id = v_defect.id
      and state in ('open', 'acknowledged', 'deferred');

    v_result := jsonb_build_object(
      'ok', true,
      'action', 'request_info',
      'updated', 1,
      'clarificationId', v_clarification_id
    );
  else
    raise exception 'Unsupported intake action';
  end if;

  return v_result;
end;
$function$;

create or replace function public.respond_fleet_defect_clarification(
  p_clarification_id uuid,
  p_response_text text,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request public.fleet_defect_clarifications%rowtype;
  v_defect public.fleet_unit_defects%rowtype;
  v_evidence jsonb;
  v_photo_count integer := 0;
  v_voice_count integer := 0;
  v_storage_path text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then
    raise exception 'Evidence must be an array';
  end if;

  select * into v_request
  from public.fleet_defect_clarifications c
  where c.id = p_clarification_id
  for update;
  if v_request.id is null or v_request.status <> 'requested' then
    raise exception 'Clarification request is no longer open';
  end if;

  select * into v_defect
  from public.fleet_unit_defects d
  where d.id = v_request.defect_id;
  if v_defect.id is null or v_defect.reported_by is distinct from v_user_id then
    raise exception 'This clarification does not belong to your driver account';
  end if;

  for v_evidence in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    v_storage_path := nullif(btrim(coalesce(v_evidence ->> 'storagePath', '')), '');
    if v_storage_path is null
       or v_storage_path not like v_request.fleet_id::text || '/clarifications/' || v_request.id::text || '/%'
       or v_storage_path ~ '(^|/)\.\.(/|$)'
       or (v_evidence ->> 'mediaType') not in ('photo', 'voice')
       or nullif(v_evidence ->> 'mimeType', '') is null
       or coalesce((v_evidence ->> 'sizeBytes')::bigint, 0) <= 0
       or coalesce((v_evidence ->> 'sizeBytes')::bigint, 0) > 15728640 then
      raise exception 'Invalid Fleet evidence metadata';
    end if;
    if v_evidence ->> 'mediaType' = 'photo' then v_photo_count := v_photo_count + 1; end if;
    if v_evidence ->> 'mediaType' = 'voice' then v_voice_count := v_voice_count + 1; end if;
  end loop;

  if v_request.response_type = 'answer'
     and nullif(btrim(coalesce(p_response_text, '')), '') is null then
    raise exception 'A quick answer is required';
  end if;
  if v_request.response_type = 'photo' and v_photo_count = 0 then
    raise exception 'A photo is required';
  end if;
  if v_request.response_type = 'voice' and v_voice_count = 0 then
    raise exception 'A voice note is required';
  end if;

  insert into public.fleet_driver_evidence (
    shop_id, fleet_id, vehicle_id, pretrip_report_id, defect_id,
    clarification_id, uploaded_by, item_id, media_type, storage_path,
    mime_type, size_bytes
  )
  select
    v_request.shop_id, v_request.fleet_id, v_request.vehicle_id,
    v_defect.source_pretrip_id, v_defect.id, v_request.id, v_user_id,
    nullif(value ->> 'itemId', ''), value ->> 'mediaType',
    value ->> 'storagePath', value ->> 'mimeType',
    (value ->> 'sizeBytes')::bigint
  from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb));

  update public.fleet_defect_clarifications
  set status = 'responded',
      response_text = nullif(left(btrim(coalesce(p_response_text, '')), 2000), ''),
      responded_by = v_user_id,
      responded_at = now(),
      updated_at = now()
  where id = v_request.id;

  return jsonb_build_object('ok', true, 'clarificationId', v_request.id);
end;
$function$;

-- Custom template defect labels and severities come from the server-validated
-- template snapshot. Legacy fixed checklist keys keep their existing mapping.
create or replace function public.capture_fleet_pretrip_defects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item record;
  v_descriptor jsonb;
  v_custom jsonb;
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
      v_custom := coalesce(new.checklist -> 'defectMeta' -> v_item.key, '{}'::jsonb);
      insert into public.fleet_unit_defects (
        shop_id, fleet_id, vehicle_id, source_pretrip_id, defect_key,
        label, severity, state, description, reported_by, reported_at,
        notify_dispatcher, intake_required, marks_vehicle_attention
      ) values (
        new.shop_id,
        new.fleet_id,
        new.vehicle_id,
        new.id,
        v_item.key,
        left(coalesce(nullif(btrim(v_custom ->> 'label'), ''), v_descriptor ->> 'label'), 240),
        case
          when v_custom ->> 'severity' in ('safety', 'compliance', 'maintenance', 'recommend')
            then v_custom ->> 'severity'
          else v_descriptor ->> 'severity'
        end,
        'open',
        nullif(btrim(coalesce(new.notes, '')), ''),
        new.driver_profile_id,
        new.created_at,
        coalesce(lower(v_custom -> 'failureActions' ->> 'notifyDispatcher') <> 'false', true),
        coalesce(lower(v_custom -> 'failureActions' ->> 'flagForReview') <> 'false', true),
        coalesce(lower(v_custom -> 'failureActions' ->> 'markVehicleAttention') = 'true', false)
      )
      on conflict (source_pretrip_id, defect_key) do nothing;
    end loop;
    if exists (
      select 1 from public.fleet_unit_defects d
      where d.source_pretrip_id = new.id and d.notify_dispatcher
    ) then
      perform public.sync_fleet_defect_notification(new.id);
    end if;
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
      select coalesce(nullif(s.timezone, ''), 'America/Los_Angeles')
      into v_timezone
      from public.shops s where s.id = new.shop_id;

      v_due_at := (new.inspection_date + v_assignment.pretrip_due_local_time)
        at time zone v_timezone;

      insert into public.fleet_pretrip_compliance (
        shop_id, fleet_id, assignment_id, vehicle_id, driver_profile_id,
        service_date, due_at, status, pretrip_report_id, completed_at, updated_at
      ) values (
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
      set status = 'resolved',
          resolved_at = coalesce(resolved_at, now()),
          updated_at = now()
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

revoke execute on function public.save_fleet_pretrip_template(
  uuid, text, text, jsonb, jsonb, text
) from public, anon;
grant execute on function public.save_fleet_pretrip_template(
  uuid, text, text, jsonb, jsonb, text
) to authenticated, service_role;

revoke execute on function public.submit_fleet_pretrip_report(
  uuid, uuid, uuid, uuid, numeric, jsonb, text, uuid, jsonb
) from public, anon;
grant execute on function public.submit_fleet_pretrip_report(
  uuid, uuid, uuid, uuid, numeric, jsonb, text, uuid, jsonb
) to authenticated, service_role;

revoke execute on function public.manage_fleet_driver_intake(
  text, uuid[], date, text, text, text
) from public, anon;
grant execute on function public.manage_fleet_driver_intake(
  text, uuid[], date, text, text, text
) to authenticated, service_role;

revoke execute on function public.respond_fleet_defect_clarification(
  uuid, text, jsonb
) from public, anon;
grant execute on function public.respond_fleet_defect_clarification(
  uuid, text, jsonb
) to authenticated, service_role;

create or replace function public.manage_fleet_workspace(
  p_action text,
  p_fleet_id uuid,
  p_member_user_id uuid default null,
  p_role text default null,
  p_name text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_existing_role text;
  v_manager_count integer;
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
    raise exception 'Fleet management access required';
  end if;

  if p_action = 'update_workspace' then
    if nullif(btrim(coalesce(p_name, '')), '') is null then raise exception 'Fleet name is required'; end if;
    if length(btrim(p_name)) > 120 then raise exception 'Fleet name is too long'; end if;
    if nullif(btrim(coalesce(p_contact_email, '')), '') is not null
       and position('@' in btrim(p_contact_email)) <= 1 then
      raise exception 'Enter a valid contact email';
    end if;

    update public.fleets
    set name = btrim(p_name),
        contact_name = nullif(btrim(coalesce(p_contact_name, '')), ''),
        contact_email = lower(nullif(btrim(coalesce(p_contact_email, '')), '')),
        contact_phone = nullif(btrim(coalesce(p_contact_phone, '')), ''),
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        updated_at = now()
    where id = p_fleet_id and shop_id = v_shop_id;

    insert into public.activity_logs (user_id, action, target_table, target_id, context)
    values (
      v_user_id, 'fleet_workspace_updated', 'fleets', p_fleet_id,
      jsonb_build_object('shop_id', v_shop_id)
    );
  elsif p_action in ('update_member_role', 'remove_member') then
    if p_member_user_id is null then raise exception 'Fleet member is required'; end if;
    if p_member_user_id = v_user_id then raise exception 'You cannot change your own Fleet access'; end if;

    select m.role into v_existing_role
    from public.fleet_members m
    where m.fleet_id = p_fleet_id
      and m.shop_id = v_shop_id
      and m.user_id = p_member_user_id
    for update;
    if v_existing_role is null then raise exception 'Fleet member not found'; end if;
    if v_existing_role in ('owner', 'admin') then
      raise exception 'Protected Fleet owners must be managed by support';
    end if;

    if v_existing_role in ('owner', 'admin', 'manager', 'fleet_manager') then
      select count(*)::integer into v_manager_count
      from public.fleet_members m
      where m.fleet_id = p_fleet_id
        and m.shop_id = v_shop_id
        and m.role in ('owner', 'admin', 'manager', 'fleet_manager');

      if v_manager_count <= 1
         and (p_action = 'remove_member' or coalesce(p_role, '') <> 'manager') then
        raise exception 'Every Fleet workspace must keep at least one manager';
      end if;
    end if;

    if p_action = 'update_member_role' then
      if coalesce(p_role, '') not in ('manager', 'dispatcher', 'driver') then
        raise exception 'Select a valid Fleet role';
      end if;

      update public.fleet_members
      set role = p_role,
          shop_id = v_shop_id,
          updated_at = now()
      where fleet_id = p_fleet_id
        and shop_id = v_shop_id
        and user_id = p_member_user_id;

      insert into public.activity_logs (user_id, action, target_table, target_id, context)
      values (
        v_user_id,
        'fleet_member_role_updated',
        'fleet_members',
        p_member_user_id,
        jsonb_build_object(
          'fleet_id', p_fleet_id,
          'shop_id', v_shop_id,
          'previous_role', v_existing_role,
          'new_role', p_role
        )
      );
    else
      if exists (
        select 1 from public.fleet_dispatch_assignments assignment
        where assignment.fleet_id = p_fleet_id
          and assignment.shop_id = v_shop_id
          and assignment.driver_profile_id = p_member_user_id
          and assignment.active
      ) then
        raise exception 'Reassign active assets before removing this driver';
      end if;

      delete from public.fleet_members
      where fleet_id = p_fleet_id
        and shop_id = v_shop_id
        and user_id = p_member_user_id;

      insert into public.activity_logs (user_id, action, target_table, target_id, context)
      values (
        v_user_id,
        'fleet_member_removed',
        'fleet_members',
        p_member_user_id,
        jsonb_build_object(
          'fleet_id', p_fleet_id,
          'shop_id', v_shop_id,
          'previous_role', v_existing_role
        )
      );
    end if;
  else
    raise exception 'Unsupported Fleet workspace action';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'fleetId', p_fleet_id,
    'memberUserId', p_member_user_id
  );
end;
$function$;

commit;
