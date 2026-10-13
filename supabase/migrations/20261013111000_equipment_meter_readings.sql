-- Equipment meter readings (engine hours, odometer and cycles over time).
--
-- Isolated addition. Today an asset's meters are single current values
-- (vehicles.engine_hours / vehicles.mileage and the Equipment profile's
-- current_cycles). This adds an append-only log of dated readings so the shop
-- can see the meter history and the usage rate (plain arithmetic: change per
-- day between readings). A reading never changes the asset's current meters;
-- nothing here predicts failure or decides what work to do.
--
-- Readings are append-only; a mistaken reading is voided once (with a
-- reason), never edited or deleted. A reading that is lower than an earlier
-- one is kept as recorded (the history shows it as a fact).
--
-- Access model (same as the other equipment tables): no Data API access for
-- anon/authenticated; the Equipment-entitled server routes authorize first and
-- write through the RPCs below. Retried writes are idempotent by operation key.
--
-- No pre-existing table, policy, grant, trigger or function is changed. The
-- new FKs only cascade rows of these new tables.
--
-- Rollback boundary (nothing else depends on these):
--   drop function if exists public.equipment_meter_reading_void(uuid, uuid, uuid, text, uuid);
--   drop function if exists public.equipment_meter_reading_record(uuid, uuid, uuid, jsonb, uuid);
--   drop table if exists public.equipment_meter_operations;
--   drop table if exists public.equipment_meter_readings;
--   drop function if exists public.equipment_meter_readings_guard();

create table if not exists public.equipment_meter_readings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  sequence bigint generated always as identity,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  read_at timestamptz not null,
  engine_hours numeric(12, 1),
  odometer numeric(12, 1),
  odometer_unit text,
  cycles bigint,
  source text not null default 'manual',
  notes text,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,

  constraint equipment_meter_readings_has_meter check (
    engine_hours is not null or odometer is not null or cycles is not null
  ),
  constraint equipment_meter_readings_nonnegative check (
    coalesce(engine_hours, 0) between 0 and 10000000
    and coalesce(odometer, 0) between 0 and 100000000
    and coalesce(cycles, 0) between 0 and 10000000000
  ),
  constraint equipment_meter_readings_odometer_unit check (
    (odometer is null and odometer_unit is null)
    or (odometer is not null and odometer_unit is not null and odometer_unit in ('km', 'mi'))
  ),
  constraint equipment_meter_readings_source check (
    source is not null and source in ('manual', 'inspection', 'service', 'telematics')
  ),
  constraint equipment_meter_readings_notes check (coalesce(length(notes), 0) <= 1000),
  constraint equipment_meter_readings_void check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and length(btrim(coalesce(void_reason, ''))) between 1 and 500)
  )
);

comment on table public.equipment_meter_readings is
  'Append-only dated Equipment meter readings (engine hours, odometer, cycles); voided (with a reason), never edited. Does not change the asset''s current meters. Accessed only through the Equipment-entitled server routes.';

create index if not exists equipment_meter_readings_vehicle_idx
  on public.equipment_meter_readings (vehicle_id, read_at desc, sequence desc);
create index if not exists equipment_meter_readings_shop_idx
  on public.equipment_meter_readings (shop_id);

-- Idempotency receipts: a retried record/void with the same key returns the
-- original result instead of repeating it.
create table if not exists public.equipment_meter_operations (
  shop_id uuid not null references public.shops (id) on delete cascade,
  operation_key uuid not null,
  kind text not null,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  -- Fingerprint of the request; a reused key with a different payload is
  -- refused instead of returning the earlier result.
  request_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (shop_id, operation_key),
  constraint equipment_meter_operations_kind check (kind is not null and kind in ('record', 'void'))
);

create index if not exists equipment_meter_operations_vehicle_idx
  on public.equipment_meter_operations (vehicle_id);

-- Tenant integrity and append-only history for readings (new table only).
-- The asset must be in the reading's shop; the only update allowed is a
-- one-time void.
create or replace function public.equipment_meter_readings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason'])
       is distinct from
       (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason']) then
      raise exception 'Equipment meter readings are append-only'
        using errcode = '42501';
    end if;
    if (new.voided_at, new.voided_by, new.void_reason)
       is distinct from (old.voided_at, old.voided_by, old.void_reason)
       and old.voided_at is not null then
      raise exception 'This reading is already voided'
        using errcode = '42501';
    end if;
    return new;
  end if;

  select v.shop_id into v_shop from public.vehicles v where v.id = new.vehicle_id;
  if v_shop is null or v_shop <> new.shop_id then
    raise exception 'Meter reading asset must belong to the same shop'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.equipment_meter_readings_guard()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_meter_readings_guard on public.equipment_meter_readings;
create trigger trg_equipment_meter_readings_guard
before insert or update on public.equipment_meter_readings
for each row execute function public.equipment_meter_readings_guard();

alter table public.equipment_meter_readings enable row level security;
alter table public.equipment_meter_operations enable row level security;

revoke all on table public.equipment_meter_readings from public, anon, authenticated;
revoke all on table public.equipment_meter_operations from public, anon, authenticated;
grant select on table public.equipment_meter_readings to service_role;
grant select on table public.equipment_meter_operations to service_role;

-- Record a meter reading. p_reading carries, already validated by the caller:
--   read_at, engine_hours, odometer, odometer_unit, cycles, source, notes
-- At least one meter is required (23514 otherwise). Returns {"id": ...}; a
-- replay with the same p_operation_key returns the original result.
create or replace function public.equipment_meter_reading_record(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_vehicle_id uuid,
  p_reading jsonb,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_meter_operations%rowtype;
  v_hash text;
  v_vehicle_shop uuid;
  v_read_at timestamptz;
  v_id uuid;
  v_result jsonb;
begin
  if p_reading is null or jsonb_typeof(p_reading) <> 'object' then
    raise exception 'Meter reading is invalid' using errcode = '22023';
  end if;
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;

  select v.shop_id into v_vehicle_shop from public.vehicles v where v.id = p_vehicle_id;
  if v_vehicle_shop is null or v_vehicle_shop <> p_shop_id then
    raise exception 'Asset not found' using errcode = 'P0002';
  end if;

  v_hash := md5(jsonb_build_object('vehicle_id', p_vehicle_id, 'reading', p_reading)::text);

  insert into public.equipment_meter_operations (shop_id, operation_key, kind, vehicle_id, request_hash)
  values (p_shop_id, p_operation_key, 'record', p_vehicle_id, v_hash)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_meter_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'record' or v_existing.vehicle_id <> p_vehicle_id
       or v_existing.request_hash <> v_hash or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  v_read_at := coalesce((p_reading ->> 'read_at')::timestamptz, now());
  -- One day of grace for clocks and time zones.
  if v_read_at > now() + interval '1 day' then
    raise exception 'A reading cannot be dated in the future' using errcode = '22023';
  end if;

  insert into public.equipment_meter_readings (
    shop_id, vehicle_id, read_at, engine_hours, odometer, odometer_unit,
    cycles, source, notes, recorded_by
  ) values (
    p_shop_id,
    p_vehicle_id,
    v_read_at,
    (p_reading ->> 'engine_hours')::numeric,
    (p_reading ->> 'odometer')::numeric,
    nullif(p_reading ->> 'odometer_unit', ''),
    (p_reading ->> 'cycles')::bigint,
    coalesce(nullif(p_reading ->> 'source', ''), 'manual'),
    nullif(btrim(p_reading ->> 'notes'), ''),
    p_actor_user_id
  )
  returning id into v_id;

  v_result := jsonb_build_object('id', v_id);
  update public.equipment_meter_operations o
  set result = v_result
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_result;
end;
$$;

-- Void a mistaken reading (once, with a reason). The reading stays in
-- history. Returns {"id": ...}; a replay with the same p_operation_key
-- returns the original result.
create or replace function public.equipment_meter_reading_void(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_reading_id uuid,
  p_reason text,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_meter_operations%rowtype;
  v_hash text;
  v_reading public.equipment_meter_readings%rowtype;
  v_result jsonb;
begin
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_reading from public.equipment_meter_readings r
  where r.id = p_reading_id
  for update;
  if not found or v_reading.shop_id <> p_shop_id then
    raise exception 'Reading not found' using errcode = 'P0002';
  end if;

  v_hash := md5(jsonb_build_object('reading_id', p_reading_id, 'reason', btrim(p_reason))::text);

  insert into public.equipment_meter_operations (shop_id, operation_key, kind, vehicle_id, request_hash)
  values (p_shop_id, p_operation_key, 'void', v_reading.vehicle_id, v_hash)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_meter_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'void' or v_existing.vehicle_id <> v_reading.vehicle_id
       or v_existing.request_hash <> v_hash or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  if v_reading.voided_at is not null then
    raise exception 'This reading is already voided' using errcode = '22023';
  end if;

  update public.equipment_meter_readings r set
    voided_at = now(),
    voided_by = p_actor_user_id,
    void_reason = btrim(p_reason)
  where r.id = p_reading_id;

  v_result := jsonb_build_object('id', p_reading_id);
  update public.equipment_meter_operations o
  set result = v_result
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_result;
end;
$$;

revoke all on function public.equipment_meter_reading_record(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.equipment_meter_reading_void(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.equipment_meter_reading_record(uuid, uuid, uuid, jsonb, uuid)
  to service_role;
grant execute on function public.equipment_meter_reading_void(uuid, uuid, uuid, text, uuid)
  to service_role;
