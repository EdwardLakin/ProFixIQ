-- Equipment wear limits (undercarriage module).
--
-- Isolated addition. A wear limit is the shop's reference for one measurement
-- type on one component: the dimension when new and the dimension at 100 %
-- worn (from the OEM manual or the shop's own standard), in the measurement
-- type's canonical unit. Percent worn is then a plain calculation from the
-- technician's recorded measurements; nothing here predicts or diagnoses.
--
-- Versioned and append-only: changing a limit inserts a new version, so a
-- percent-worn figure can always be traced to the limit in force. The current
-- limit is the latest version per (component, measurement type).
--
-- Access model (same as equipment_components / equipment_measurements): no
-- Data API access for anon/authenticated; the Equipment-entitled server routes
-- authorize first and write through the RPC below.
--
-- No pre-existing table, policy, grant, trigger or function is changed. The
-- new FKs only cascade rows of this new table.
--
-- Rollback boundary (nothing else depends on these):
--   drop function if exists public.equipment_wear_limit_set(uuid, uuid, uuid, text, numeric, numeric, text, text);
--   drop table if exists public.equipment_wear_limits;
--   drop function if exists public.equipment_wear_limits_guard();

create table if not exists public.equipment_wear_limits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  -- Monotonic version order per (component, measurement type).
  sequence bigint generated always as identity,
  component_id uuid not null references public.equipment_components (id) on delete cascade,
  measurement_type text not null,
  -- Canonical unit of the measurement type.
  unit text not null,
  new_value numeric(14, 4) not null,
  limit_value numeric(14, 4) not null,
  -- Where the figures come from (e.g. OEM manual page, shop standard).
  reference text,
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint equipment_wear_limits_type_format
    check (measurement_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint equipment_wear_limits_unit
    check (length(unit) between 1 and 16),
  constraint equipment_wear_limits_finite
    check (
      new_value::text not in ('NaN', 'Infinity', '-Infinity')
      and limit_value::text not in ('NaN', 'Infinity', '-Infinity')
    ),
  constraint equipment_wear_limits_distinct
    check (new_value <> limit_value),
  constraint equipment_wear_limits_reference_length
    check (coalesce(length(reference), 0) <= 500)
);

comment on table public.equipment_wear_limits is
  'Versioned, append-only wear limits (new and 100 % worn dimensions) per component and measurement type. Accessed only through the Equipment-entitled server routes.';

create index if not exists equipment_wear_limits_component_idx
  on public.equipment_wear_limits (component_id, measurement_type, sequence desc);
create index if not exists equipment_wear_limits_shop_idx
  on public.equipment_wear_limits (shop_id);

-- Tenant integrity and append-only history (new table only).
create or replace function public.equipment_wear_limits_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Equipment wear limits are append-only'
      using errcode = '42501';
  end if;

  select c.shop_id into v_shop
  from public.equipment_components c where c.id = new.component_id;
  if v_shop is null or v_shop <> new.shop_id then
    raise exception 'Wear limit component must belong to the same shop'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.equipment_wear_limits_guard()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_wear_limits_guard
  on public.equipment_wear_limits;
create trigger trg_equipment_wear_limits_guard
before insert or update on public.equipment_wear_limits
for each row execute function public.equipment_wear_limits_guard();

alter table public.equipment_wear_limits enable row level security;

revoke all on table public.equipment_wear_limits from public, anon, authenticated;
grant select, insert on table public.equipment_wear_limits to service_role;

-- Set the wear limit for a component + measurement type. Inserts a new
-- version unless the current version already has the same figures (so a
-- retried save is a no-op). Serialized per component + type. Returns the id of
-- the current version.
create or replace function public.equipment_wear_limit_set(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_component_id uuid,
  p_measurement_type text,
  p_new_value numeric,
  p_limit_value numeric,
  p_unit text,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.equipment_wear_limits%rowtype;
  v_component_shop uuid;
  v_id uuid;
begin
  if p_new_value is null or p_limit_value is null or p_unit is null
     or p_measurement_type is null then
    raise exception 'Wear limit is invalid' using errcode = '22023';
  end if;

  select c.shop_id into v_component_shop
  from public.equipment_components c where c.id = p_component_id
  for update;
  if v_component_shop is null or v_component_shop <> p_shop_id then
    raise exception 'Component not found' using errcode = 'P0002';
  end if;

  select * into v_current from public.equipment_wear_limits l
  where l.component_id = p_component_id and l.measurement_type = p_measurement_type
  order by l.sequence desc
  limit 1;
  if found
     and v_current.new_value = p_new_value
     and v_current.limit_value = p_limit_value
     and v_current.unit = p_unit
     and v_current.reference is not distinct from nullif(btrim(p_reference), '') then
    return v_current.id;
  end if;

  insert into public.equipment_wear_limits (
    shop_id, component_id, measurement_type, unit, new_value, limit_value,
    reference, created_by
  ) values (
    p_shop_id, p_component_id, p_measurement_type, p_unit, p_new_value,
    p_limit_value, nullif(btrim(p_reference), ''), p_actor_user_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.equipment_wear_limit_set(uuid, uuid, uuid, text, numeric, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.equipment_wear_limit_set(uuid, uuid, uuid, text, numeric, numeric, text, text)
  to service_role;
