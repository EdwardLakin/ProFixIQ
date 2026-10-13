-- Equipment fluid / oil sample history.
--
-- Isolated addition. A fluid sample records what an oil-analysis lab reported
-- for one fluid (engine oil, hydraulic, transmission, ...) on an Equipment
-- asset (vehicle), optionally against a specific component: when it was
-- sampled, the asset and fluid meters at the time, the lab, its report number,
-- the lab's own overall status and each analyte result (iron, silicon,
-- viscosity, ...) with the lab's own flag. Every status and flag is a recorded
-- fact as the lab reported it; nothing here computes a condition, threshold or
-- recommendation.
--
-- A sample and its results are written together by one RPC and are
-- append-only; a mistaken sample is voided once (with a reason), never edited
-- or deleted. A lab report number is unique per shop and asset among live
-- samples, so the same report cannot be entered twice.
--
-- Access model (same as the other equipment tables): no Data API access for
-- anon/authenticated; the Equipment-entitled server routes authorize first and
-- write through the RPCs below. Retried writes are idempotent by operation key.
--
-- No pre-existing table, policy, grant, trigger or function is changed. The
-- new FKs only cascade (or null) rows of these new tables.
--
-- Rollback boundary (nothing else depends on these):
--   drop function if exists public.equipment_fluid_sample_void(uuid, uuid, uuid, text, uuid);
--   drop function if exists public.equipment_fluid_sample_record(uuid, uuid, uuid, jsonb, jsonb, uuid);
--   drop table if exists public.equipment_fluid_sample_operations;
--   drop table if exists public.equipment_fluid_sample_results;
--   drop table if exists public.equipment_fluid_samples;
--   drop function if exists public.equipment_fluid_sample_results_guard();
--   drop function if exists public.equipment_fluid_samples_guard();

create table if not exists public.equipment_fluid_samples (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  sequence bigint generated always as identity,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  component_id uuid references public.equipment_components (id) on delete set null,
  fluid_type text not null,
  sampled_at timestamptz not null,
  -- Asset hour meter when the sample was taken.
  asset_hours integer,
  -- Age of the fluid in service when sampled (since the last change).
  fluid_hours numeric(10, 1),
  fluid_distance numeric(12, 1),
  fluid_distance_unit text,
  lab_name text,
  lab_report_number text,
  -- The lab's overall status as reported by the lab; never computed here.
  lab_status text not null default 'unknown',
  notes text,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,

  constraint equipment_fluid_samples_fluid_type check (
    fluid_type is not null and fluid_type in (
      'engine_oil', 'hydraulic', 'transmission', 'coolant', 'final_drive',
      'differential', 'fuel', 'other'
    )
  ),
  constraint equipment_fluid_samples_lab_status check (
    lab_status is not null and lab_status in ('normal', 'caution', 'critical', 'unknown')
  ),
  constraint equipment_fluid_samples_meters check (
    coalesce(asset_hours, 0) between 0 and 10000000
    and coalesce(fluid_hours, 0) between 0 and 1000000
    and coalesce(fluid_distance, 0) between 0 and 10000000
  ),
  constraint equipment_fluid_samples_distance_unit check (
    (fluid_distance is null and fluid_distance_unit is null)
    or (fluid_distance is not null and fluid_distance_unit is not null
        and fluid_distance_unit in ('km', 'mi'))
  ),
  constraint equipment_fluid_samples_text_lengths check (
    coalesce(length(lab_name), 0) <= 120
    and (lab_report_number is null or length(btrim(lab_report_number)) between 1 and 80)
    and coalesce(length(notes), 0) <= 2000
  ),
  constraint equipment_fluid_samples_void check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and length(btrim(coalesce(void_reason, ''))) between 1 and 500)
  )
);

comment on table public.equipment_fluid_samples is
  'Append-only Equipment fluid / oil samples with the lab''s reported status; voided (with a reason), never edited. Accessed only through the Equipment-entitled server routes.';

create index if not exists equipment_fluid_samples_vehicle_idx
  on public.equipment_fluid_samples (vehicle_id, sampled_at desc, sequence desc);
create index if not exists equipment_fluid_samples_shop_idx
  on public.equipment_fluid_samples (shop_id);
create index if not exists equipment_fluid_samples_component_idx
  on public.equipment_fluid_samples (component_id)
  where component_id is not null;
-- One live sample per lab report number on an asset (stops duplicate entry).
create unique index if not exists equipment_fluid_samples_lab_report_key
  on public.equipment_fluid_samples (shop_id, vehicle_id, lower(btrim(lab_report_number)))
  where lab_report_number is not null and voided_at is null;

-- Analyte results of a sample, as the lab reported them.
create table if not exists public.equipment_fluid_sample_results (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  sample_id uuid not null references public.equipment_fluid_samples (id) on delete cascade,
  -- Entry order on the lab report.
  position integer not null,
  analyte text not null,
  value numeric not null,
  unit text,
  -- The lab's flag for this result as reported (null when none was given).
  lab_flag text,
  created_at timestamptz not null default now(),

  unique (sample_id, analyte),
  constraint equipment_fluid_sample_results_analyte check (
    analyte is not null and analyte ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint equipment_fluid_sample_results_value check (
    value is not null and value <> 'NaN'::numeric and value between -1000000000 and 1000000000
  ),
  constraint equipment_fluid_sample_results_unit check (
    unit is null or length(btrim(unit)) between 1 and 24
  ),
  constraint equipment_fluid_sample_results_lab_flag check (
    lab_flag is null or lab_flag in ('normal', 'caution', 'critical')
  ),
  constraint equipment_fluid_sample_results_position check (position between 0 and 199)
);

comment on table public.equipment_fluid_sample_results is
  'Append-only analyte results of an Equipment fluid sample with the lab''s own flags. Accessed only through the Equipment-entitled server routes.';

create index if not exists equipment_fluid_sample_results_shop_idx
  on public.equipment_fluid_sample_results (shop_id);

-- Idempotency receipts: a retried record/void with the same key returns the
-- original result instead of repeating it.
create table if not exists public.equipment_fluid_sample_operations (
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
  constraint equipment_fluid_sample_operations_kind check (
    kind is not null and kind in ('record', 'void')
  )
);

create index if not exists equipment_fluid_sample_operations_vehicle_idx
  on public.equipment_fluid_sample_operations (vehicle_id);

-- Tenant integrity and append-only history for samples (new table only). The
-- only updates allowed are a one-time void and a FK cascade clearing a
-- deleted component reference.
create or replace function public.equipment_fluid_samples_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
  v_installed_on uuid;
  v_place_type text;
  v_place_vehicle uuid;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason', 'component_id'])
       is distinct from
       (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason', 'component_id']) then
      raise exception 'Equipment fluid samples are append-only'
        using errcode = '42501';
    end if;
    if new.component_id is distinct from old.component_id
       and not (
         new.component_id is null
         and not exists (select 1 from public.equipment_components c where c.id = old.component_id)
       ) then
      raise exception 'Equipment fluid samples are append-only'
        using errcode = '42501';
    end if;
    if (new.voided_at, new.voided_by, new.void_reason)
       is distinct from (old.voided_at, old.voided_by, old.void_reason)
       and old.voided_at is not null then
      raise exception 'This sample is already voided'
        using errcode = '42501';
    end if;
    return new;
  end if;

  select v.shop_id into v_shop from public.vehicles v where v.id = new.vehicle_id;
  if v_shop is null or v_shop <> new.shop_id then
    raise exception 'Fluid sample asset must belong to the same shop'
      using errcode = '23514';
  end if;

  if new.component_id is not null then
    select c.shop_id, c.installed_vehicle_id into v_shop, v_installed_on
    from public.equipment_components c where c.id = new.component_id;
    if v_shop is null or v_shop <> new.shop_id then
      raise exception 'Fluid sample component must belong to the same shop'
        using errcode = '23514';
    end if;
    -- Where was the component when sampled? The last install/remove at or
    -- before that time decides; before tracking began, its first known
    -- placement counts (same rule as equipment measurements).
    select e.event_type, e.vehicle_id into v_place_type, v_place_vehicle
    from public.equipment_component_events e
    where e.component_id = new.component_id
      and e.event_type in ('installed', 'removed')
      and e.occurred_at <= new.sampled_at
    order by e.occurred_at desc, e.sequence desc
    limit 1;
    if v_place_type is null then
      select e.event_type, e.vehicle_id into v_place_type, v_place_vehicle
      from public.equipment_component_events e
      where e.component_id = new.component_id
        and e.event_type in ('installed', 'removed')
      order by e.occurred_at asc, e.sequence asc
      limit 1;
    end if;
    if v_place_type is null then
      if v_installed_on is distinct from new.vehicle_id then
        raise exception 'Fluid sample component must be installed on the asset'
          using errcode = '23514';
      end if;
    elsif v_place_type <> 'installed' or v_place_vehicle is distinct from new.vehicle_id then
      raise exception 'Fluid sample component must be installed on the asset at that time'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.equipment_fluid_samples_guard()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_fluid_samples_guard on public.equipment_fluid_samples;
create trigger trg_equipment_fluid_samples_guard
before insert or update on public.equipment_fluid_samples
for each row execute function public.equipment_fluid_samples_guard();

-- Results are written only with their sample (in the sample's own
-- transaction), match its shop, and are never changed afterwards.
create or replace function public.equipment_fluid_sample_results_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sample public.equipment_fluid_samples%rowtype;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Equipment fluid sample results are append-only'
      using errcode = '42501';
  end if;

  select * into v_sample from public.equipment_fluid_samples s where s.id = new.sample_id;
  if not found or v_sample.shop_id <> new.shop_id then
    raise exception 'Fluid sample result must match its sample''s shop'
      using errcode = '23514';
  end if;
  -- now() is the transaction start time: results can only be added in the
  -- same transaction that created the sample, never to an existing sample.
  if v_sample.created_at <> now() or v_sample.voided_at is not null then
    raise exception 'Results can only be recorded with their sample'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.equipment_fluid_sample_results_guard()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_fluid_sample_results_guard on public.equipment_fluid_sample_results;
create trigger trg_equipment_fluid_sample_results_guard
before insert or update on public.equipment_fluid_sample_results
for each row execute function public.equipment_fluid_sample_results_guard();

alter table public.equipment_fluid_samples enable row level security;
alter table public.equipment_fluid_sample_results enable row level security;
alter table public.equipment_fluid_sample_operations enable row level security;

revoke all on table public.equipment_fluid_samples from public, anon, authenticated;
revoke all on table public.equipment_fluid_sample_results from public, anon, authenticated;
revoke all on table public.equipment_fluid_sample_operations from public, anon, authenticated;
grant select on table public.equipment_fluid_samples to service_role;
grant select on table public.equipment_fluid_sample_results to service_role;
grant select on table public.equipment_fluid_sample_operations to service_role;

-- Record a fluid sample with its analyte results, atomically. p_sample carries
-- the fields, already validated by the caller:
--   component_id, fluid_type, sampled_at, asset_hours, fluid_hours,
--   fluid_distance, fluid_distance_unit, lab_name, lab_report_number,
--   lab_status, notes
-- p_results is an array (0-100) of {analyte, value, unit, lab_flag}.
-- Returns {"id": ...}; a replay with the same p_operation_key returns the
-- original result.
create or replace function public.equipment_fluid_sample_record(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_vehicle_id uuid,
  p_sample jsonb,
  p_results jsonb,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_fluid_sample_operations%rowtype;
  v_hash text;
  v_vehicle_shop uuid;
  v_sampled_at timestamptz;
  v_id uuid;
  v_item jsonb;
  v_position integer := 0;
  v_result jsonb;
begin
  if p_sample is null or jsonb_typeof(p_sample) <> 'object' then
    raise exception 'Fluid sample is invalid' using errcode = '22023';
  end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array'
     or jsonb_array_length(p_results) > 100 then
    raise exception 'Fluid sample results are invalid' using errcode = '22023';
  end if;
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;

  select v.shop_id into v_vehicle_shop from public.vehicles v where v.id = p_vehicle_id;
  if v_vehicle_shop is null or v_vehicle_shop <> p_shop_id then
    raise exception 'Asset not found' using errcode = 'P0002';
  end if;

  v_hash := md5(jsonb_build_object(
    'vehicle_id', p_vehicle_id, 'sample', p_sample, 'results', p_results
  )::text);

  insert into public.equipment_fluid_sample_operations (shop_id, operation_key, kind, vehicle_id, request_hash)
  values (p_shop_id, p_operation_key, 'record', p_vehicle_id, v_hash)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_fluid_sample_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'record' or v_existing.vehicle_id <> p_vehicle_id
       or v_existing.request_hash <> v_hash or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  v_sampled_at := coalesce((p_sample ->> 'sampled_at')::timestamptz, now());
  if v_sampled_at > now() + interval '1 day' then
    raise exception 'A sample cannot be dated in the future' using errcode = '22023';
  end if;

  insert into public.equipment_fluid_samples (
    shop_id, vehicle_id, component_id, fluid_type, sampled_at, asset_hours,
    fluid_hours, fluid_distance, fluid_distance_unit, lab_name,
    lab_report_number, lab_status, notes, recorded_by
  ) values (
    p_shop_id,
    p_vehicle_id,
    nullif(p_sample ->> 'component_id', '')::uuid,
    p_sample ->> 'fluid_type',
    v_sampled_at,
    (p_sample ->> 'asset_hours')::integer,
    (p_sample ->> 'fluid_hours')::numeric,
    (p_sample ->> 'fluid_distance')::numeric,
    nullif(p_sample ->> 'fluid_distance_unit', ''),
    nullif(btrim(p_sample ->> 'lab_name'), ''),
    nullif(btrim(p_sample ->> 'lab_report_number'), ''),
    coalesce(nullif(p_sample ->> 'lab_status', ''), 'unknown'),
    nullif(btrim(p_sample ->> 'notes'), ''),
    p_actor_user_id
  )
  returning id into v_id;

  for v_item in select value from jsonb_array_elements(p_results)
  loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'value') <> 'number' then
      raise exception 'Fluid sample result is invalid' using errcode = '22023';
    end if;
    insert into public.equipment_fluid_sample_results (
      shop_id, sample_id, position, analyte, value, unit, lab_flag
    ) values (
      p_shop_id,
      v_id,
      v_position,
      v_item ->> 'analyte',
      (v_item ->> 'value')::numeric,
      nullif(btrim(v_item ->> 'unit'), ''),
      nullif(v_item ->> 'lab_flag', '')
    );
    v_position := v_position + 1;
  end loop;

  v_result := jsonb_build_object('id', v_id);
  update public.equipment_fluid_sample_operations o
  set result = v_result
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_result;
end;
$$;

-- Void a mistaken sample (once, with a reason). The sample and its results
-- stay in history. Returns {"id": ...}; a replay with the same
-- p_operation_key returns the original.
create or replace function public.equipment_fluid_sample_void(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_sample_id uuid,
  p_reason text,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_fluid_sample_operations%rowtype;
  v_hash text;
  v_sample public.equipment_fluid_samples%rowtype;
  v_result jsonb;
begin
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_sample from public.equipment_fluid_samples s
  where s.id = p_sample_id
  for update;
  if not found or v_sample.shop_id <> p_shop_id then
    raise exception 'Sample not found' using errcode = 'P0002';
  end if;

  v_hash := md5(jsonb_build_object('sample_id', p_sample_id, 'reason', btrim(p_reason))::text);

  insert into public.equipment_fluid_sample_operations (shop_id, operation_key, kind, vehicle_id, request_hash)
  values (p_shop_id, p_operation_key, 'void', v_sample.vehicle_id, v_hash)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_fluid_sample_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'void' or v_existing.vehicle_id <> v_sample.vehicle_id
       or v_existing.request_hash <> v_hash or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  if v_sample.voided_at is not null then
    raise exception 'This sample is already voided' using errcode = '22023';
  end if;

  update public.equipment_fluid_samples s set
    voided_at = now(),
    voided_by = p_actor_user_id,
    void_reason = btrim(p_reason)
  where s.id = p_sample_id;

  v_result := jsonb_build_object('id', p_sample_id);
  update public.equipment_fluid_sample_operations o
  set result = v_result
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_result;
end;
$$;

revoke all on function public.equipment_fluid_sample_record(uuid, uuid, uuid, jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.equipment_fluid_sample_void(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.equipment_fluid_sample_record(uuid, uuid, uuid, jsonb, jsonb, uuid)
  to service_role;
grant execute on function public.equipment_fluid_sample_void(uuid, uuid, uuid, text, uuid)
  to service_role;
