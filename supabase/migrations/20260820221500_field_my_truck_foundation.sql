begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Compatibility repair for the workspace authorization foundation: the
-- canonical service role had work-order assignment authority before the
-- capability presets were introduced and Mobile handoff depends on it.
insert into public.workspace_role_capability_presets (
  capability_key,
  role_key,
  effect
) values (
  'work_order.assignment.manage',
  'service',
  'allow'
)
on conflict (capability_key, role_key) do update
set effect = excluded.effect,
    updated_at = now();

-- Field-owned service-truck operating log. This deliberately extends the
-- existing service_vehicles aggregate instead of reusing Fleet assets or
-- exposing Fleet maintenance navigation inside the Field product.
create table if not exists public.field_truck_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  service_vehicle_id uuid not null references public.service_vehicles(id) on delete restrict,
  operation_key text not null,
  record_type text not null,
  title text not null,
  occurred_on date,
  odometer numeric(12,1),
  odometer_unit text,
  amount numeric(12,2),
  currency text,
  vendor text,
  due_on date,
  due_odometer numeric(12,1),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'open',
  notes text,
  file_bucket text,
  file_path text,
  original_filename text,
  content_type text,
  file_size_bytes bigint,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_truck_records_type_ck check (
    record_type in ('odometer','maintenance','expense','reminder','downtime','document')
  ),
  constraint field_truck_records_operation_key_ck check (
    length(trim(operation_key)) between 8 and 160
  ),
  constraint field_truck_records_title_ck check (
    length(trim(title)) between 1 and 180
  ),
  constraint field_truck_records_status_ck check (
    status in ('open','completed','cancelled')
  ),
  constraint field_truck_records_odometer_ck check (
    odometer is null or odometer >= 0
  ),
  constraint field_truck_records_due_odometer_ck check (
    due_odometer is null or due_odometer >= 0
  ),
  constraint field_truck_records_amount_ck check (
    amount is null or amount >= 0
  ),
  constraint field_truck_records_currency_ck check (
    (amount is null and currency is null)
    or (amount is not null and currency ~ '^[A-Z]{3}$')
  ),
  constraint field_truck_records_file_size_ck check (
    file_size_bytes is null or file_size_bytes between 1 and 4194304
  ),
  constraint field_truck_records_shape_ck check (
    (record_type = 'odometer' and odometer is not null and status = 'completed')
    or (record_type = 'maintenance' and status = 'completed')
    or (record_type = 'expense' and amount is not null and status = 'completed')
    or (record_type = 'reminder' and status in ('open','completed')
        and (due_odometer is null or odometer_unit is not null))
    or (record_type = 'downtime' and starts_at is not null
        and ((status = 'open' and ends_at is null)
          or (status = 'completed' and ends_at is not null)))
    or (record_type = 'document' and status = 'completed')
  ),
  constraint field_truck_records_downtime_window_ck check (
    record_type <> 'downtime'
    or (starts_at is not null and (ends_at is null or ends_at > starts_at))
  ),
  constraint field_truck_records_reminder_due_ck check (
    record_type <> 'reminder' or due_on is not null or due_odometer is not null
  ),
  constraint field_truck_records_document_file_ck check (
    record_type <> 'document' or file_path is not null
  ),
  constraint field_truck_records_file_metadata_ck check (
    (file_path is null and file_bucket is null and original_filename is null
      and content_type is null and file_size_bytes is null)
    or
    (file_path is not null and file_bucket is not null and original_filename is not null
      and content_type is not null and file_size_bytes is not null)
  ),
  constraint field_truck_records_file_path_scope_ck check (
    file_path is null
    or (
      file_bucket = 'field-truck-files'
      and split_part(file_path, '/', 1) = shop_id::text
      and split_part(file_path, '/', 2) = service_vehicle_id::text
      and (
        (record_type = 'document' and split_part(file_path, '/', 3) = 'documents')
        or (record_type = 'expense' and split_part(file_path, '/', 3) = 'receipts')
      )
      and split_part(file_path, '/', 4) = id::text
      and split_part(file_path, '/', 5) <> ''
      and split_part(file_path, '/', 6) = ''
    )
  )
);

create unique index if not exists service_vehicles_shop_id_id_unique
  on public.service_vehicles(shop_id, id);

-- My Truck assignments are feature-owned authorization relationships. They do
-- not trust service_vehicles.primary_user_id, which remains writable by legacy
-- scheduler roles for unrelated dispatch workflows.
create table if not exists public.field_service_vehicle_assignments (
  shop_id uuid not null references public.shops(id) on delete cascade,
  service_vehicle_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, service_vehicle_id),
  unique (shop_id, profile_id),
  constraint field_service_vehicle_assignments_vehicle_shop_fk
    foreign key (shop_id, service_vehicle_id)
    references public.service_vehicles(shop_id, id)
    on delete cascade
);

insert into public.field_service_vehicle_assignments (
  shop_id, service_vehicle_id, profile_id, assigned_by_profile_id
)
select
  vehicle.shop_id, vehicle.id, vehicle.primary_user_id, vehicle.primary_user_id
from public.service_vehicles vehicle
join public.mobile_field_operators operator
  on operator.shop_id = vehicle.shop_id
 and operator.profile_id = vehicle.primary_user_id
 and operator.enabled
where vehicle.primary_user_id is not null
  and vehicle.active
  and vehicle.capabilities @> '{"mobile_v1":true}'::jsonb
on conflict do nothing;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.field_truck_records'::regclass
      and conname = 'field_truck_records_vehicle_shop_fk'
  ) then
    alter table public.field_truck_records
      add constraint field_truck_records_vehicle_shop_fk
      foreign key (shop_id, service_vehicle_id)
      references public.service_vehicles(shop_id, id)
      on delete restrict;
  end if;
end
$do$;

create index if not exists field_truck_records_vehicle_timeline_idx
  on public.field_truck_records(service_vehicle_id, created_at desc);
create unique index if not exists field_truck_records_operation_key_unique
  on public.field_truck_records(shop_id, service_vehicle_id, operation_key);
create index if not exists field_truck_records_open_alerts_idx
  on public.field_truck_records(service_vehicle_id, record_type, due_on, due_odometer)
  where status = 'open' and record_type in ('reminder','downtime');
create index if not exists field_truck_records_expense_date_idx
  on public.field_truck_records(service_vehicle_id, occurred_on desc)
  where record_type in ('expense','maintenance');

create or replace function public.field_truck_records_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists field_truck_records_touch_updated_at
  on public.field_truck_records;
create trigger field_truck_records_touch_updated_at
before update on public.field_truck_records
for each row execute function public.field_truck_records_touch_updated_at();

drop trigger if exists field_service_vehicle_assignments_touch_updated_at
  on public.field_service_vehicle_assignments;
create trigger field_service_vehicle_assignments_touch_updated_at
before update on public.field_service_vehicle_assignments
for each row execute function public.field_truck_records_touch_updated_at();

-- One authenticated Field operator can access only their explicitly assigned,
-- active service vehicle. A same-shop membership alone is insufficient.
create or replace function public.field_actor_can_access_service_vehicle(
  p_shop_id uuid,
  p_service_vehicle_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.field_service_vehicle_assignments assignment
    join public.profiles profile
      on profile.id = assignment.profile_id
     and profile.shop_id = assignment.shop_id
    join public.service_vehicles vehicle
      on vehicle.id = assignment.service_vehicle_id
     and vehicle.shop_id = assignment.shop_id
     and vehicle.active
     and vehicle.capabilities @> '{"mobile_v1":true}'::jsonb
    where assignment.shop_id = p_shop_id
      and assignment.service_vehicle_id = p_service_vehicle_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
      and public.mobile_profile_has_field_service_access(profile.shop_id, profile.id)
  );
$$;

revoke all on function public.field_actor_can_access_service_vehicle(uuid, uuid)
  from public, anon;
grant execute on function public.field_actor_can_access_service_vehicle(uuid, uuid)
  to authenticated, service_role;

alter table public.field_truck_records enable row level security;

alter table public.field_service_vehicle_assignments enable row level security;

revoke all on table public.field_service_vehicle_assignments
  from public, anon, authenticated;
grant select on table public.field_service_vehicle_assignments to authenticated;
grant all on table public.field_service_vehicle_assignments to service_role;

drop policy if exists field_service_vehicle_assignments_self_select
  on public.field_service_vehicle_assignments;
create policy field_service_vehicle_assignments_self_select
on public.field_service_vehicle_assignments for select to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = field_service_vehicle_assignments.profile_id
      and profile.shop_id = field_service_vehicle_assignments.shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
      and public.mobile_profile_has_field_service_access(profile.shop_id, profile.id)
  )
);

revoke all on table public.field_truck_records from public, anon;
revoke all on table public.field_truck_records from authenticated;
grant select, insert on table public.field_truck_records to authenticated;
grant all on table public.field_truck_records to service_role;

drop policy if exists field_truck_records_assigned_select
  on public.field_truck_records;
create policy field_truck_records_assigned_select
on public.field_truck_records for select to authenticated
using (
  public.field_actor_can_access_service_vehicle(shop_id, service_vehicle_id)
);

drop policy if exists field_truck_records_assigned_insert
  on public.field_truck_records;
create policy field_truck_records_assigned_insert
on public.field_truck_records for insert to authenticated
with check (
  public.field_actor_can_access_service_vehicle(shop_id, service_vehicle_id)
  and exists (
    select 1
    from public.profiles profile
    where profile.id = created_by_profile_id
      and profile.shop_id = shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
  )
);

-- State changes are command-owned. Direct table updates stay revoked so an
-- assigned operator cannot mutate arbitrary record types or transitions.
create or replace function public.field_transition_truck_record(
  p_record_id uuid,
  p_action text,
  p_ended_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.field_truck_records%rowtype;
  v_updated public.field_truck_records%rowtype;
  v_ended_at timestamptz;
begin
  select * into v_record
  from public.field_truck_records
  where id = p_record_id
  for update;

  if not found
    or not public.field_actor_can_access_service_vehicle(
      v_record.shop_id,
      v_record.service_vehicle_id
    ) then
    raise exception 'Truck record was not found or is not accessible.'
      using errcode = '42501';
  end if;

  if p_action = 'complete'
    and v_record.record_type = 'reminder'
    and v_record.status = 'completed' then
    return to_jsonb(v_record) || jsonb_build_object('replayed', true);
  end if;

  if p_action = 'complete'
    and v_record.record_type = 'reminder'
    and v_record.status = 'open' then
    update public.field_truck_records
      set status = 'completed'
      where id = p_record_id
      returning * into v_updated;
    return to_jsonb(v_updated);
  end if;

  if p_action = 'reopen'
    and v_record.record_type = 'reminder'
    and v_record.status = 'open' then
    return to_jsonb(v_record) || jsonb_build_object('replayed', true);
  end if;

  if p_action = 'reopen'
    and v_record.record_type = 'reminder'
    and v_record.status = 'completed' then
    update public.field_truck_records
      set status = 'open'
      where id = p_record_id
      returning * into v_updated;
    return to_jsonb(v_updated);
  end if;

  if p_action = 'end_downtime'
    and v_record.record_type = 'downtime'
    and v_record.status = 'completed'
    and v_record.ends_at is not null then
    return to_jsonb(v_record) || jsonb_build_object('replayed', true);
  end if;

  if p_action = 'end_downtime'
    and v_record.record_type = 'downtime'
    and v_record.status = 'open'
    and v_record.ends_at is null then
    v_ended_at := coalesce(p_ended_at, now());
    if v_record.starts_at is null or v_ended_at <= v_record.starts_at then
      raise exception 'Downtime must end after it starts.'
        using errcode = '22007';
    end if;
    update public.field_truck_records
      set status = 'completed', ends_at = v_ended_at
      where id = p_record_id
      returning * into v_updated;
    return to_jsonb(v_updated);
  end if;

  raise exception 'Truck record transition is not allowed.'
    using errcode = '22023';
end;
$$;

revoke all on function public.field_transition_truck_record(uuid, text, timestamptz)
  from public, anon;
grant execute on function public.field_transition_truck_record(uuid, text, timestamptz)
  to authenticated, service_role;

-- Field owners/admins can assign one active Field truck to a team operator.
-- The command stays inside the Field setup surface and never exposes Fleet.
create or replace function public.field_assign_service_vehicle(
  p_shop_id uuid,
  p_service_vehicle_id uuid,
  p_profile_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vehicle public.service_vehicles%rowtype;
  v_actor_profile_id uuid;
begin
  select actor.id
    into v_actor_profile_id
  from public.profiles actor
  where actor.shop_id = p_shop_id
    and (actor.id = auth.uid() or actor.user_id = auth.uid())
    and lower(coalesce(actor.role, '')) in ('owner','admin')
  order by (actor.id = auth.uid()) desc, actor.id
  limit 1;

  if v_actor_profile_id is null then
    raise exception 'Field truck assignment requires owner or admin access.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.mobile_field_operators operator
      on operator.shop_id = profile.shop_id
     and operator.profile_id = profile.id
     and operator.enabled
    where profile.id = p_profile_id
      and profile.shop_id = p_shop_id
  ) then
    raise exception 'The selected profile is not an enabled Field operator.'
      using errcode = '22023';
  end if;

  select * into v_vehicle
  from public.service_vehicles
  where id = p_service_vehicle_id
    and shop_id = p_shop_id
    and active
    and capabilities @> '{"mobile_v1":true}'::jsonb
  for update;
  if not found then
    raise exception 'The selected Field truck is unavailable.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'field-truck-profile:' || p_shop_id::text || ':' || p_profile_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'field-truck-vehicle:' || p_shop_id::text || ':' || p_service_vehicle_id::text,
      0
    )
  );

  delete from public.field_service_vehicle_assignments assignment
  where assignment.shop_id = p_shop_id
    and (
      assignment.profile_id = p_profile_id
      or assignment.service_vehicle_id = p_service_vehicle_id
    );

  insert into public.field_service_vehicle_assignments (
    shop_id, service_vehicle_id, profile_id, assigned_by_profile_id
  ) values (
    p_shop_id, p_service_vehicle_id, p_profile_id, v_actor_profile_id
  );

  return jsonb_build_object(
    'serviceVehicleId', p_service_vehicle_id,
    'profileId', p_profile_id
  );
end;
$$;

revoke all on function public.field_assign_service_vehicle(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.field_assign_service_vehicle(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function public.field_storage_path_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.field_storage_path_uuid(text) from public, anon;
grant execute on function public.field_storage_path_uuid(text)
  to authenticated, service_role;

-- Private Field-only files. Object paths are always:
--   <shop uuid>/<service vehicle uuid>/<documents|receipts>/<record uuid>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'field-truck-files',
  'field-truck-files',
  false,
  4194304,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists field_truck_files_assigned_select on storage.objects;
create policy field_truck_files_assigned_select
on storage.objects for select to authenticated
using (
  bucket_id = 'field-truck-files'
  and public.field_actor_can_access_service_vehicle(
    public.field_storage_path_uuid((storage.foldername(name))[1]),
    public.field_storage_path_uuid((storage.foldername(name))[2])
  )
);

drop policy if exists field_truck_files_assigned_insert on storage.objects;
create policy field_truck_files_assigned_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'field-truck-files'
  and (storage.foldername(name))[3] in ('documents','receipts')
  and public.field_actor_can_access_service_vehicle(
    public.field_storage_path_uuid((storage.foldername(name))[1]),
    public.field_storage_path_uuid((storage.foldername(name))[2])
  )
);

comment on table public.field_service_vehicle_assignments is
  'Protected Field-only truck assignment relation used by My Truck authorization.';

comment on table public.field_truck_records is
  'Field-only operating ledger for an assigned service truck: mileage, maintenance, costs, reminders, downtime, documents, and receipt metadata.';

notify pgrst, 'reload schema';

commit;
