-- Equipment PM plans (preventive maintenance by hours, distance, cycles and
-- calendar days).
--
-- Isolated addition. A PM plan is a shop's maintenance interval for one
-- Equipment asset (vehicle): every N engine hours, distance, cycles and/or
-- days, whichever comes first. A completion records when the PM was done and
-- the meters at that time; the next due point is plain arithmetic from the
-- latest completion (or the plan's starting point) plus the interval. Nothing
-- here predicts failure or decides what work to do.
--
-- Plans are edited through the RPC with optimistic concurrency, and every
-- saved version is kept in an append-only revision log. Completions are
-- append-only; a mistaken completion is voided (with a reason), never edited
-- or deleted.
--
-- Access model (same as the other equipment tables): no Data API access for
-- anon/authenticated; the Equipment-entitled server routes authorize first and
-- write through the RPCs below. Retried writes are idempotent by operation key.
--
-- No pre-existing table, policy, grant, trigger or function is changed. The
-- new FKs only cascade (or null) rows of these new tables.
--
-- Rollback boundary (nothing else depends on these):
--   drop function if exists public.equipment_pm_completion_void(uuid, uuid, uuid, text, uuid);
--   drop function if exists public.equipment_pm_complete(uuid, uuid, uuid, jsonb, uuid);
--   drop function if exists public.equipment_pm_plan_save(uuid, uuid, uuid, uuid, integer, jsonb, uuid);
--   drop table if exists public.equipment_pm_operations;
--   drop table if exists public.equipment_pm_completions;
--   drop table if exists public.equipment_pm_plan_revisions;
--   drop table if exists public.equipment_pm_plans;
--   drop function if exists public.equipment_pm_completions_guard();
--   drop function if exists public.equipment_pm_plans_guard();

create table if not exists public.equipment_pm_plans (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  name text not null,
  instructions text,
  interval_hours integer,
  interval_distance numeric(12, 1),
  distance_unit text,
  interval_cycles integer,
  interval_days integer,
  -- Starting point used until the first completion is recorded.
  start_date date not null,
  start_hours integer,
  start_distance numeric(12, 1),
  start_cycles integer,
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),

  constraint equipment_pm_plans_name check (length(btrim(name)) between 1 and 120),
  constraint equipment_pm_plans_instructions check (coalesce(length(instructions), 0) <= 2000),
  constraint equipment_pm_plans_has_interval check (
    interval_hours is not null or interval_distance is not null
    or interval_cycles is not null or interval_days is not null
  ),
  constraint equipment_pm_plans_intervals_positive check (
    coalesce(interval_hours, 1) between 1 and 1000000
    and coalesce(interval_distance, 1) between 0.1 and 10000000
    and coalesce(interval_cycles, 1) between 1 and 100000000
    and coalesce(interval_days, 1) between 1 and 3660
  ),
  constraint equipment_pm_plans_distance_unit check (
    (interval_distance is null and distance_unit is null and start_distance is null)
    or (interval_distance is not null and distance_unit is not null and distance_unit in ('km', 'mi'))
  ),
  constraint equipment_pm_plans_starts_nonnegative check (
    coalesce(start_hours, 0) >= 0
    and coalesce(start_distance, 0) >= 0
    and coalesce(start_cycles, 0) >= 0
  ),
  constraint equipment_pm_plans_version check (version >= 1)
);

comment on table public.equipment_pm_plans is
  'Equipment PM intervals per asset (hours, distance, cycles, days; whichever comes first). Accessed only through the Equipment-entitled server routes.';

create index if not exists equipment_pm_plans_vehicle_idx
  on public.equipment_pm_plans (vehicle_id, active);
create index if not exists equipment_pm_plans_shop_idx
  on public.equipment_pm_plans (shop_id);

-- Every saved version of a plan (append-only), for audit.
create table if not exists public.equipment_pm_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  plan_id uuid not null references public.equipment_pm_plans (id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  unique (plan_id, version)
);

create index if not exists equipment_pm_plan_revisions_shop_idx
  on public.equipment_pm_plan_revisions (shop_id);

create table if not exists public.equipment_pm_completions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  sequence bigint generated always as identity,
  plan_id uuid not null references public.equipment_pm_plans (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  completed_on date not null,
  -- Meters when the PM was done (the next interval counts from these).
  asset_hours integer,
  distance numeric(12, 1),
  distance_unit text,
  cycles integer,
  work_order_id uuid references public.work_orders (id) on delete set null,
  notes text,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,

  constraint equipment_pm_completions_meters check (
    coalesce(asset_hours, 0) >= 0 and coalesce(distance, 0) >= 0 and coalesce(cycles, 0) >= 0
  ),
  constraint equipment_pm_completions_distance_unit check (
    (distance is null and distance_unit is null)
    or (distance is not null and distance_unit is not null and distance_unit in ('km', 'mi'))
  ),
  constraint equipment_pm_completions_notes check (coalesce(length(notes), 0) <= 1000),
  constraint equipment_pm_completions_void check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and length(btrim(coalesce(void_reason, ''))) between 1 and 500)
  )
);

comment on table public.equipment_pm_completions is
  'Append-only Equipment PM completions with the meters at the time; voided (with a reason), never edited. Accessed only through the Equipment-entitled server routes.';

create index if not exists equipment_pm_completions_plan_idx
  on public.equipment_pm_completions (plan_id, completed_on desc, sequence desc);
create index if not exists equipment_pm_completions_vehicle_idx
  on public.equipment_pm_completions (vehicle_id);
create index if not exists equipment_pm_completions_shop_idx
  on public.equipment_pm_completions (shop_id);
create index if not exists equipment_pm_completions_work_order_idx
  on public.equipment_pm_completions (work_order_id)
  where work_order_id is not null;

-- Idempotency receipts: a retried save/complete/void with the same key returns
-- the original result instead of repeating it.
create table if not exists public.equipment_pm_operations (
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
  constraint equipment_pm_operations_kind check (kind in ('save_plan', 'complete', 'void'))
);

create index if not exists equipment_pm_operations_vehicle_idx
  on public.equipment_pm_operations (vehicle_id);

-- Tenant integrity for plans (new table only): the asset must be in the
-- plan's shop, and a plan never moves to another shop or asset.
create or replace function public.equipment_pm_plans_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  if tg_op = 'UPDATE'
     and (new.shop_id <> old.shop_id or new.vehicle_id <> old.vehicle_id) then
    raise exception 'A PM plan cannot move to another shop or asset'
      using errcode = '42501';
  end if;
  select v.shop_id into v_shop from public.vehicles v where v.id = new.vehicle_id;
  if v_shop is null or v_shop <> new.shop_id then
    raise exception 'PM plan asset must belong to the same shop'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.equipment_pm_plans_guard()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_pm_plans_guard on public.equipment_pm_plans;
create trigger trg_equipment_pm_plans_guard
before insert or update on public.equipment_pm_plans
for each row execute function public.equipment_pm_plans_guard();

-- Tenant integrity and append-only history for completions (new table only).
-- The only updates allowed are a one-time void and a FK cascade clearing a
-- deleted work order reference.
create or replace function public.equipment_pm_completions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_shop uuid;
  v_plan_vehicle uuid;
  v_wo_shop uuid;
  v_wo_vehicle uuid;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason', 'work_order_id'])
       is distinct from
       (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason', 'work_order_id']) then
      raise exception 'Equipment PM completions are append-only'
        using errcode = '42501';
    end if;
    if new.work_order_id is distinct from old.work_order_id and new.work_order_id is not null then
      raise exception 'Equipment PM completions are append-only'
        using errcode = '42501';
    end if;
    if (new.voided_at, new.voided_by, new.void_reason)
       is distinct from (old.voided_at, old.voided_by, old.void_reason)
       and old.voided_at is not null then
      raise exception 'This completion is already voided'
        using errcode = '42501';
    end if;
    return new;
  end if;

  select p.shop_id, p.vehicle_id into v_plan_shop, v_plan_vehicle
  from public.equipment_pm_plans p where p.id = new.plan_id;
  if v_plan_shop is null or v_plan_shop <> new.shop_id or v_plan_vehicle <> new.vehicle_id then
    raise exception 'PM completion must match its plan''s shop and asset'
      using errcode = '23514';
  end if;
  if new.work_order_id is not null then
    select w.shop_id, w.vehicle_id into v_wo_shop, v_wo_vehicle
    from public.work_orders w where w.id = new.work_order_id;
    if v_wo_shop is null or v_wo_shop <> new.shop_id
       or v_wo_vehicle is distinct from new.vehicle_id then
      raise exception 'PM completion work order must be for the same asset'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.equipment_pm_completions_guard()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_pm_completions_guard on public.equipment_pm_completions;
create trigger trg_equipment_pm_completions_guard
before insert or update on public.equipment_pm_completions
for each row execute function public.equipment_pm_completions_guard();

alter table public.equipment_pm_plans enable row level security;
alter table public.equipment_pm_plan_revisions enable row level security;
alter table public.equipment_pm_completions enable row level security;
alter table public.equipment_pm_operations enable row level security;

revoke all on table public.equipment_pm_plans from public, anon, authenticated;
revoke all on table public.equipment_pm_plan_revisions from public, anon, authenticated;
revoke all on table public.equipment_pm_completions from public, anon, authenticated;
revoke all on table public.equipment_pm_operations from public, anon, authenticated;
grant select on table public.equipment_pm_plans to service_role;
grant select on table public.equipment_pm_plan_revisions to service_role;
grant select on table public.equipment_pm_completions to service_role;
grant select on table public.equipment_pm_operations to service_role;

-- Create (p_plan_id null) or update a PM plan. p_plan carries the plan fields,
-- already validated by the caller:
--   name, instructions, interval_hours, interval_distance, distance_unit,
--   interval_cycles, interval_days, start_date, start_hours, start_distance,
--   start_cycles, active
-- An update requires p_expected_version to match (40001 otherwise). Returns
-- {"id": ..., "version": ...}; a replay with the same p_operation_key returns
-- the original result.
create or replace function public.equipment_pm_plan_save(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_vehicle_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_plan jsonb,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_pm_operations%rowtype;
  v_hash text;
  v_vehicle_shop uuid;
  v_current public.equipment_pm_plans%rowtype;
  v_saved public.equipment_pm_plans%rowtype;
  v_result jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'PM plan is invalid' using errcode = '22023';
  end if;
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;

  select v.shop_id into v_vehicle_shop from public.vehicles v where v.id = p_vehicle_id;
  if v_vehicle_shop is null or v_vehicle_shop <> p_shop_id then
    raise exception 'Asset not found' using errcode = 'P0002';
  end if;

  v_hash := md5(jsonb_build_object(
    'vehicle_id', p_vehicle_id, 'plan_id', p_plan_id,
    'expected_version', p_expected_version, 'plan', p_plan
  )::text);

  insert into public.equipment_pm_operations (shop_id, operation_key, kind, vehicle_id, request_hash)
  values (p_shop_id, p_operation_key, 'save_plan', p_vehicle_id, v_hash)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_pm_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'save_plan' or v_existing.vehicle_id <> p_vehicle_id
       or v_existing.request_hash <> v_hash or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  if p_plan_id is null then
    insert into public.equipment_pm_plans (
      shop_id, vehicle_id, name, instructions, interval_hours, interval_distance,
      distance_unit, interval_cycles, interval_days, start_date, start_hours,
      start_distance, start_cycles, active, created_by, updated_by
    ) values (
      p_shop_id,
      p_vehicle_id,
      btrim(p_plan ->> 'name'),
      nullif(btrim(p_plan ->> 'instructions'), ''),
      (p_plan ->> 'interval_hours')::integer,
      (p_plan ->> 'interval_distance')::numeric,
      nullif(p_plan ->> 'distance_unit', ''),
      (p_plan ->> 'interval_cycles')::integer,
      (p_plan ->> 'interval_days')::integer,
      coalesce((p_plan ->> 'start_date')::date, current_date),
      (p_plan ->> 'start_hours')::integer,
      (p_plan ->> 'start_distance')::numeric,
      (p_plan ->> 'start_cycles')::integer,
      coalesce((p_plan ->> 'active')::boolean, true),
      p_actor_user_id,
      p_actor_user_id
    )
    returning * into v_saved;
  else
    select * into v_current from public.equipment_pm_plans p
    where p.id = p_plan_id
    for update;
    if not found or v_current.shop_id <> p_shop_id or v_current.vehicle_id <> p_vehicle_id then
      raise exception 'PM plan not found' using errcode = 'P0002';
    end if;
    if p_expected_version is null or v_current.version <> p_expected_version then
      raise exception 'The PM plan was changed by someone else'
        using errcode = '40001';
    end if;

    update public.equipment_pm_plans p set
      name = btrim(p_plan ->> 'name'),
      instructions = nullif(btrim(p_plan ->> 'instructions'), ''),
      interval_hours = (p_plan ->> 'interval_hours')::integer,
      interval_distance = (p_plan ->> 'interval_distance')::numeric,
      distance_unit = nullif(p_plan ->> 'distance_unit', ''),
      interval_cycles = (p_plan ->> 'interval_cycles')::integer,
      interval_days = (p_plan ->> 'interval_days')::integer,
      start_date = coalesce((p_plan ->> 'start_date')::date, v_current.start_date),
      start_hours = (p_plan ->> 'start_hours')::integer,
      start_distance = (p_plan ->> 'start_distance')::numeric,
      start_cycles = (p_plan ->> 'start_cycles')::integer,
      active = coalesce((p_plan ->> 'active')::boolean, v_current.active),
      version = v_current.version + 1,
      updated_by = p_actor_user_id,
      updated_at = now()
    where p.id = p_plan_id
    returning * into v_saved;
  end if;

  insert into public.equipment_pm_plan_revisions (shop_id, plan_id, version, snapshot, changed_by)
  values (
    p_shop_id,
    v_saved.id,
    v_saved.version,
    to_jsonb(v_saved) - array['shop_id', 'created_at', 'created_by'],
    p_actor_user_id
  );

  v_result := jsonb_build_object('id', v_saved.id, 'version', v_saved.version);
  update public.equipment_pm_operations o
  set result = v_result
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_result;
end;
$$;

-- Record a PM completion. p_completion carries:
--   completed_on, asset_hours, distance, distance_unit, cycles,
--   work_order_id, notes
-- The plan must be active and in the caller's shop. Returns
-- {"id": ...}; a replay with the same p_operation_key returns the original.
create or replace function public.equipment_pm_complete(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_plan_id uuid,
  p_completion jsonb,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_pm_operations%rowtype;
  v_hash text;
  v_plan public.equipment_pm_plans%rowtype;
  v_on date;
  v_id uuid;
  v_result jsonb;
begin
  if p_completion is null or jsonb_typeof(p_completion) <> 'object' then
    raise exception 'PM completion is invalid' using errcode = '22023';
  end if;
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;

  select * into v_plan from public.equipment_pm_plans p
  where p.id = p_plan_id
  for update;
  if not found or v_plan.shop_id <> p_shop_id then
    raise exception 'PM plan not found' using errcode = 'P0002';
  end if;

  v_hash := md5(jsonb_build_object('plan_id', p_plan_id, 'completion', p_completion)::text);

  insert into public.equipment_pm_operations (shop_id, operation_key, kind, vehicle_id, request_hash)
  values (p_shop_id, p_operation_key, 'complete', v_plan.vehicle_id, v_hash)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_pm_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'complete' or v_existing.vehicle_id <> v_plan.vehicle_id
       or v_existing.request_hash <> v_hash or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  if not v_plan.active then
    raise exception 'This PM plan is archived' using errcode = '22023';
  end if;

  v_on := coalesce((p_completion ->> 'completed_on')::date, current_date);
  if v_on > current_date + 1 then
    raise exception 'A completion cannot be dated in the future' using errcode = '22023';
  end if;

  insert into public.equipment_pm_completions (
    shop_id, plan_id, vehicle_id, completed_on, asset_hours, distance,
    distance_unit, cycles, work_order_id, notes, recorded_by
  ) values (
    p_shop_id,
    p_plan_id,
    v_plan.vehicle_id,
    v_on,
    (p_completion ->> 'asset_hours')::integer,
    (p_completion ->> 'distance')::numeric,
    nullif(p_completion ->> 'distance_unit', ''),
    (p_completion ->> 'cycles')::integer,
    nullif(p_completion ->> 'work_order_id', '')::uuid,
    nullif(btrim(p_completion ->> 'notes'), ''),
    p_actor_user_id
  )
  returning id into v_id;

  v_result := jsonb_build_object('id', v_id);
  update public.equipment_pm_operations o
  set result = v_result
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_result;
end;
$$;

-- Void a mistaken completion (once, with a reason). The completion stays in
-- history; the next due point falls back to the previous completion. Returns
-- {"id": ...}; a replay with the same p_operation_key returns the original.
create or replace function public.equipment_pm_completion_void(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_completion_id uuid,
  p_reason text,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_pm_operations%rowtype;
  v_hash text;
  v_completion public.equipment_pm_completions%rowtype;
  v_result jsonb;
begin
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_completion from public.equipment_pm_completions c
  where c.id = p_completion_id
  for update;
  if not found or v_completion.shop_id <> p_shop_id then
    raise exception 'Completion not found' using errcode = 'P0002';
  end if;

  v_hash := md5(jsonb_build_object('completion_id', p_completion_id, 'reason', btrim(p_reason))::text);

  insert into public.equipment_pm_operations (shop_id, operation_key, kind, vehicle_id, request_hash)
  values (p_shop_id, p_operation_key, 'void', v_completion.vehicle_id, v_hash)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_pm_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'void' or v_existing.vehicle_id <> v_completion.vehicle_id
       or v_existing.request_hash <> v_hash or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  if v_completion.voided_at is not null then
    raise exception 'This completion is already voided' using errcode = '22023';
  end if;

  update public.equipment_pm_completions c set
    voided_at = now(),
    voided_by = p_actor_user_id,
    void_reason = btrim(p_reason)
  where c.id = p_completion_id;

  v_result := jsonb_build_object('id', p_completion_id);
  update public.equipment_pm_operations o
  set result = v_result
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_result;
end;
$$;

revoke all on function public.equipment_pm_plan_save(uuid, uuid, uuid, uuid, integer, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.equipment_pm_complete(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.equipment_pm_completion_void(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.equipment_pm_plan_save(uuid, uuid, uuid, uuid, integer, jsonb, uuid)
  to service_role;
grant execute on function public.equipment_pm_complete(uuid, uuid, uuid, jsonb, uuid)
  to service_role;
grant execute on function public.equipment_pm_completion_void(uuid, uuid, uuid, text, uuid)
  to service_role;
