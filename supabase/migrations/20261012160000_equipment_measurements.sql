-- Equipment measurements as first-class data.
--
-- Isolated addition. A measurement is one typed, numeric reading taken on an
-- asset (canonical vehicles row) and optionally a specific component (track
-- shoe height, tire pressure, blow-by, temperatures, ...). The value is stored
-- in the measurement type's canonical unit together with exactly what the
-- technician entered. History is append-only: a mistake is fixed by a
-- correction row (new value or void, with a reason) that supersedes the
-- original; nothing is edited or deleted in place.
--
-- Facts only: no thresholds, predictions or diagnoses are stored here. The
-- technician makes the diagnosis and repair decision.
--
-- Access model (same as equipment_components): no Data API access for
-- anon/authenticated. Reads and writes go through the authenticated,
-- tenant-scoped, Equipment-entitled server routes, which use the service role
-- only after authorization. Writes use the RPCs below.
--
-- No pre-existing table, policy, grant, trigger or function is changed. New
-- FKs reference shops / vehicles / equipment_components / work_orders /
-- inspections; their delete actions apply only to rows of these new tables,
-- and the new-table trigger accepts those cascades so existing deletes keep
-- working (an asset's measurements are deleted with the asset; a deleted
-- component, work order or inspection reference is cleared).
--
-- Rollback boundary (nothing else depends on these):
--   drop function if exists public.equipment_measurement_correct(uuid, uuid, uuid, numeric, text, numeric, text, boolean, text, uuid);
--   drop function if exists public.equipment_measurement_record(uuid, uuid, uuid, jsonb, integer, timestamptz, uuid, uuid, uuid);
--   drop table if exists public.equipment_measurement_operations;
--   drop table if exists public.equipment_measurements;
--   drop function if exists public.equipment_measurements_guard();

create table if not exists public.equipment_measurements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  -- Monotonic insertion order; breaks ties between same-time readings.
  sequence bigint generated always as identity,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  component_id uuid references public.equipment_components (id) on delete set null,
  measurement_type text not null,
  position text,
  -- Value in the measurement type's canonical unit.
  value numeric(14, 4) not null,
  unit text not null,
  -- Exactly what was entered.
  entered_value numeric(14, 4) not null,
  entered_unit text not null,
  asset_hours integer,
  measured_at timestamptz not null default now(),
  work_order_id uuid references public.work_orders (id) on delete set null,
  inspection_id uuid references public.inspections (id) on delete set null,
  notes text,
  -- Corrections supersede an earlier reading (value change or void).
  corrects_measurement_id uuid references public.equipment_measurements (id) on delete cascade,
  voided boolean not null default false,
  correction_reason text,
  recorded_by uuid,
  created_at timestamptz not null default now(),

  constraint equipment_measurements_type_format
    check (measurement_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint equipment_measurements_position_format
    check (position is null or position ~ '^[a-z0-9][a-z0-9_]{0,31}$'),
  constraint equipment_measurements_units
    check (
      length(unit) between 1 and 16
      and length(entered_unit) between 1 and 16
    ),
  constraint equipment_measurements_finite
    check (
      value::text not in ('NaN', 'Infinity', '-Infinity')
      and entered_value::text not in ('NaN', 'Infinity', '-Infinity')
    ),
  constraint equipment_measurements_hours_non_negative
    check (asset_hours is null or asset_hours >= 0),
  constraint equipment_measurements_notes_length
    check (coalesce(length(notes), 0) <= 1000),
  constraint equipment_measurements_correction_shape
    check (
      (corrects_measurement_id is null and not voided and correction_reason is null)
      or (
        corrects_measurement_id is not null
        and correction_reason is not null
        and length(correction_reason) between 1 and 500
      )
    )
);

comment on table public.equipment_measurements is
  'Append-only Equipment measurements (typed numeric readings per asset/component). Accessed only through the Equipment-entitled server routes.';

create index if not exists equipment_measurements_vehicle_series_idx
  on public.equipment_measurements (vehicle_id, measurement_type, measured_at desc, sequence desc);
create index if not exists equipment_measurements_component_idx
  on public.equipment_measurements (component_id, measured_at desc)
  where component_id is not null;
create index if not exists equipment_measurements_shop_idx
  on public.equipment_measurements (shop_id);
create index if not exists equipment_measurements_work_order_idx
  on public.equipment_measurements (work_order_id)
  where work_order_id is not null;
create index if not exists equipment_measurements_inspection_idx
  on public.equipment_measurements (inspection_id)
  where inspection_id is not null;
-- A reading is superseded at most once; the latest correction is current.
create unique index if not exists equipment_measurements_corrects_key
  on public.equipment_measurements (corrects_measurement_id)
  where corrects_measurement_id is not null;

-- Idempotency receipts: a retried record/correct with the same key returns
-- the original result instead of repeating it.
create table if not exists public.equipment_measurement_operations (
  shop_id uuid not null references public.shops (id) on delete cascade,
  operation_key uuid not null,
  kind text not null,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (shop_id, operation_key),
  constraint equipment_measurement_operations_kind check (kind in ('record', 'correct'))
);

create index if not exists equipment_measurement_operations_vehicle_idx
  on public.equipment_measurement_operations (vehicle_id);

-- Tenant integrity and append-only history (new table only). The only update
-- allowed is a FK cascade clearing a deleted component, work order or
-- inspection reference.
create or replace function public.equipment_measurements_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
  v_vehicle uuid;
  v_installed_on uuid;
  v_original public.equipment_measurements%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'component_id' - 'work_order_id' - 'inspection_id')
         = (to_jsonb(old) - 'component_id' - 'work_order_id' - 'inspection_id')
       and (new.component_id is null or new.component_id = old.component_id)
       and (new.work_order_id is null or new.work_order_id = old.work_order_id)
       and (new.inspection_id is null or new.inspection_id = old.inspection_id)
       and (
         (new.component_id is null and old.component_id is not null
           and not exists (select 1 from public.equipment_components c where c.id = old.component_id))
         or (new.work_order_id is null and old.work_order_id is not null
           and not exists (select 1 from public.work_orders w where w.id = old.work_order_id))
         or (new.inspection_id is null and old.inspection_id is not null
           and not exists (select 1 from public.inspections i where i.id = old.inspection_id))
       ) then
      return new;
    end if;
    raise exception 'Equipment measurements are append-only'
      using errcode = '42501';
  end if;

  select v.shop_id into v_shop from public.vehicles v where v.id = new.vehicle_id;
  if v_shop is null or v_shop <> new.shop_id then
    raise exception 'Measurement asset must belong to the same shop'
      using errcode = '23514';
  end if;

  if new.corrects_measurement_id is not null then
    -- A correction keeps the original reading's context.
    select * into v_original
    from public.equipment_measurements m where m.id = new.corrects_measurement_id;
    if not found or v_original.shop_id <> new.shop_id
       or v_original.vehicle_id <> new.vehicle_id
       or v_original.measurement_type <> new.measurement_type
       or v_original.position is distinct from new.position
       or v_original.component_id is distinct from new.component_id then
      raise exception 'A correction must match the reading it corrects'
        using errcode = '23514';
    end if;
  elsif new.component_id is not null then
    select c.shop_id, c.installed_vehicle_id into v_shop, v_installed_on
    from public.equipment_components c where c.id = new.component_id;
    if v_shop is null or v_shop <> new.shop_id then
      raise exception 'Measurement component must belong to the same shop'
        using errcode = '23514';
    end if;
    if v_installed_on is distinct from new.vehicle_id then
      raise exception 'Measurement component must be installed on the asset'
        using errcode = '23514';
    end if;
  end if;

  if new.work_order_id is not null then
    select w.shop_id, w.vehicle_id into v_shop, v_vehicle
    from public.work_orders w where w.id = new.work_order_id;
    if v_shop is null or v_shop <> new.shop_id then
      raise exception 'Measurement work order must belong to the same shop'
        using errcode = '23514';
    end if;
    if v_vehicle is distinct from new.vehicle_id then
      raise exception 'Measurement work order must be for the asset'
        using errcode = '23514';
    end if;
  end if;

  if new.inspection_id is not null then
    select i.shop_id, i.vehicle_id into v_shop, v_vehicle
    from public.inspections i where i.id = new.inspection_id;
    if v_shop is null or v_shop <> new.shop_id then
      raise exception 'Measurement inspection must belong to the same shop'
        using errcode = '23514';
    end if;
    if v_vehicle is not null and v_vehicle <> new.vehicle_id then
      raise exception 'Measurement inspection must be for the asset'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.equipment_measurements_guard()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_measurements_guard
  on public.equipment_measurements;
create trigger trg_equipment_measurements_guard
before insert or update on public.equipment_measurements
for each row execute function public.equipment_measurements_guard();

alter table public.equipment_measurements enable row level security;
alter table public.equipment_measurement_operations enable row level security;

revoke all on table public.equipment_measurements from public, anon, authenticated;
revoke all on table public.equipment_measurement_operations from public, anon, authenticated;
grant select, insert on table public.equipment_measurements to service_role;
grant select on table public.equipment_measurement_operations to service_role;

-- Record a batch of readings taken together on one asset, atomically.
-- p_items: [{measurement_type, position, component_id, value, unit,
--            entered_value, entered_unit, notes}], 1..100 items. Values are
-- already normalized to the canonical unit by the caller (the measurement
-- catalog lives in the application). Returns the new ids as a JSON array; a
-- replay with the same p_operation_key returns the original ids.
create or replace function public.equipment_measurement_record(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_vehicle_id uuid,
  p_items jsonb,
  p_asset_hours integer default null,
  p_measured_at timestamptz default null,
  p_work_order_id uuid default null,
  p_inspection_id uuid default null,
  p_operation_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_existing public.equipment_measurement_operations%rowtype;
  v_at timestamptz := coalesce(p_measured_at, now());
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Measurements are invalid' using errcode = '22023';
  end if;
  if p_measured_at is not null and p_measured_at > now() + interval '1 day' then
    raise exception 'Measurements cannot be dated in the future' using errcode = '22023';
  end if;
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;

  insert into public.equipment_measurement_operations (shop_id, operation_key, kind, vehicle_id)
  values (p_shop_id, p_operation_key, 'record', p_vehicle_id)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_measurement_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'record' or v_existing.vehicle_id <> p_vehicle_id
       or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.equipment_measurements (
      shop_id, vehicle_id, component_id, measurement_type, position,
      value, unit, entered_value, entered_unit, asset_hours, measured_at,
      work_order_id, inspection_id, notes, recorded_by
    ) values (
      p_shop_id,
      p_vehicle_id,
      nullif(v_item ->> 'component_id', '')::uuid,
      v_item ->> 'measurement_type',
      nullif(v_item ->> 'position', ''),
      (v_item ->> 'value')::numeric,
      v_item ->> 'unit',
      (v_item ->> 'entered_value')::numeric,
      v_item ->> 'entered_unit',
      p_asset_hours,
      v_at,
      p_work_order_id,
      p_inspection_id,
      nullif(v_item ->> 'notes', ''),
      p_actor_user_id
    )
    returning id into v_id;
    v_ids := v_ids || to_jsonb(v_id);
  end loop;

  update public.equipment_measurement_operations o
  set result = v_ids
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_ids;
end;
$$;

-- Correct (new value) or void a reading. The correction supersedes the
-- current reading of that series entry; the original stays in history.
-- Returns the correction's id; a replay with the same key returns it again.
create or replace function public.equipment_measurement_correct(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_measurement_id uuid,
  p_value numeric,
  p_unit text,
  p_entered_value numeric,
  p_entered_unit text,
  p_void boolean,
  p_reason text,
  p_operation_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.equipment_measurements%rowtype;
  v_existing public.equipment_measurement_operations%rowtype;
  v_id uuid;
begin
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;

  select * into v_original from public.equipment_measurements m
  where m.id = p_measurement_id
  for update;
  if not found or v_original.shop_id <> p_shop_id then
    raise exception 'Measurement not found' using errcode = 'P0002';
  end if;

  insert into public.equipment_measurement_operations (shop_id, operation_key, kind, vehicle_id)
  values (p_shop_id, p_operation_key, 'correct', v_original.vehicle_id)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_measurement_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'correct' or v_existing.result is null
       or exists (
         select 1 from public.equipment_measurements m
         where m.id = (v_existing.result ->> 0)::uuid
           and m.corrects_measurement_id <> p_measurement_id
       ) then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return (v_existing.result ->> 0)::uuid;
  end if;

  if v_original.voided then
    raise exception 'A voided reading cannot be corrected' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.equipment_measurements m
    where m.corrects_measurement_id = p_measurement_id
  ) then
    raise exception 'This reading was already corrected' using errcode = '23505';
  end if;

  insert into public.equipment_measurements (
    shop_id, vehicle_id, component_id, measurement_type, position,
    value, unit, entered_value, entered_unit, asset_hours, measured_at,
    work_order_id, inspection_id, notes, corrects_measurement_id, voided,
    correction_reason, recorded_by
  ) values (
    p_shop_id, v_original.vehicle_id, v_original.component_id,
    v_original.measurement_type, v_original.position,
    case when coalesce(p_void, false) then v_original.value else p_value end,
    case when coalesce(p_void, false) then v_original.unit else p_unit end,
    case when coalesce(p_void, false) then v_original.entered_value else p_entered_value end,
    case when coalesce(p_void, false) then v_original.entered_unit else p_entered_unit end,
    v_original.asset_hours, v_original.measured_at,
    v_original.work_order_id, v_original.inspection_id, v_original.notes,
    p_measurement_id, coalesce(p_void, false), nullif(btrim(p_reason), ''),
    p_actor_user_id
  )
  returning id into v_id;

  update public.equipment_measurement_operations o
  set result = jsonb_build_array(v_id)
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_id;
end;
$$;

revoke all on function public.equipment_measurement_record(
  uuid, uuid, uuid, jsonb, integer, timestamptz, uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.equipment_measurement_correct(
  uuid, uuid, uuid, numeric, text, numeric, text, boolean, text, uuid
) from public, anon, authenticated;

grant execute on function public.equipment_measurement_record(
  uuid, uuid, uuid, jsonb, integer, timestamptz, uuid, uuid, uuid
) to service_role;
grant execute on function public.equipment_measurement_correct(
  uuid, uuid, uuid, numeric, text, numeric, text, boolean, text, uuid
) to service_role;
