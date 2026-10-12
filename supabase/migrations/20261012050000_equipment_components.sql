-- Equipment component hierarchy.
--
-- Isolated addition. Components (engine, hydraulic system, final drives,
-- undercarriage, boom, ...) get their own identity and history because they
-- are rebuilt and swapped between machines. A component is optionally
-- installed on a canonical vehicles asset and optionally nested under a
-- parent component; every change is recorded in an append-only event log.
--
-- Access model (same as equipment_asset_profiles): no Data API access for
-- anon/authenticated. All reads and writes go through the authenticated,
-- tenant-scoped, Equipment-entitled server routes, which use the service role
-- only after authorization. Writes use the RPCs below so moves, history and
-- child components stay consistent under concurrency.
--
-- No pre-existing table, policy, grant, trigger or function is changed. New
-- FKs reference vehicles / shops / work_orders; their delete actions apply only
-- to rows of these new tables, and the new-table triggers accept those
-- cascades so existing vehicle / work-order deletion keeps working: an
-- installed component whose asset is deleted returns to stock, and history
-- keeps its rows with the deleted reference cleared.
--
-- Rollback boundary (nothing else depends on these):
--   drop function if exists public.equipment_component_seed(uuid, uuid, uuid, jsonb, integer);
--   drop function if exists public.equipment_component_move(uuid, uuid, uuid, text, uuid, uuid, text, integer, integer, timestamptz, uuid, text, text, uuid);
--   drop function if exists public.equipment_component_save(uuid, uuid, uuid, jsonb, uuid, uuid, integer, uuid);
--   drop table if exists public.equipment_component_operations;
--   drop table if exists public.equipment_component_events;
--   drop table if exists public.equipment_components;
--   drop function if exists public.equipment_component_claim_operation(uuid, uuid, uuid, text);
--   drop function if exists public.equipment_component_life(text, integer, integer, integer);
--   drop function if exists public.equipment_components_enforce_scope();
--   drop function if exists public.equipment_component_events_guard();

create table if not exists public.equipment_components (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  component_type text not null,
  position text,
  label text not null,
  manufacturer text,
  model text,
  serial_number text,
  part_number text,
  status text not null default 'in_stock',
  installed_vehicle_id uuid references public.vehicles (id) on delete set null,
  parent_component_id uuid references public.equipment_components (id) on delete set null,
  installed_at timestamptz,
  installed_asset_hours integer,
  component_hours_at_install integer,
  attributes jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint equipment_components_type_format
    check (component_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint equipment_components_position_format
    check (position is null or position ~ '^[a-z0-9][a-z0-9_]{0,31}$'),
  constraint equipment_components_status
    check (status in ('installed', 'in_stock', 'in_repair', 'scrapped')),
  constraint equipment_components_installed_has_asset
    check ((status = 'installed') = (installed_vehicle_id is not null)),
  constraint equipment_components_not_own_parent
    check (parent_component_id is null or parent_component_id <> id),
  constraint equipment_components_hours_non_negative
    check (
      coalesce(installed_asset_hours, 0) >= 0
      and coalesce(component_hours_at_install, 0) >= 0
    ),
  constraint equipment_components_attributes_object
    check (jsonb_typeof(attributes) = 'object'),
  constraint equipment_components_text_lengths
    check (
      length(label) between 1 and 120
      and coalesce(length(manufacturer), 0) <= 120
      and coalesce(length(model), 0) <= 120
      and coalesce(length(serial_number), 0) <= 120
      and coalesce(length(part_number), 0) <= 120
    )
);

comment on table public.equipment_components is
  'Equipment components with their own identity and history. Accessed only through the Equipment-entitled server routes.';

create index if not exists equipment_components_shop_vehicle_idx
  on public.equipment_components (shop_id, installed_vehicle_id);
create index if not exists equipment_components_parent_idx
  on public.equipment_components (parent_component_id)
  where parent_component_id is not null;
create index if not exists equipment_components_vehicle_idx
  on public.equipment_components (installed_vehicle_id)
  where installed_vehicle_id is not null;
-- One live component per serial within a shop and type.
create unique index if not exists equipment_components_shop_type_serial_key
  on public.equipment_components (shop_id, component_type, lower(serial_number))
  where serial_number is not null and status <> 'scrapped';

create table if not exists public.equipment_component_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  component_id uuid not null references public.equipment_components (id) on delete cascade,
  -- Monotonic insertion order; breaks ties between same-time lifecycle
  -- events (e.g. removed then installed during a move).
  sequence bigint generated always as identity,
  event_type text not null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  asset_hours integer,
  component_hours integer,
  occurred_at timestamptz not null default now(),
  work_order_id uuid references public.work_orders (id) on delete set null,
  notes text,
  -- For 'updated': the identity fields changed, as {field: {from, to}}.
  details jsonb,
  recorded_by uuid,
  created_at timestamptz not null default now(),

  constraint equipment_component_events_type
    check (
      event_type in (
        'created', 'updated', 'installed', 'removed', 'rebuilt', 'repaired',
        'inspected', 'scrapped'
      )
    ),
  constraint equipment_component_events_details_object
    check (details is null or jsonb_typeof(details) = 'object'),
  constraint equipment_component_events_hours_non_negative
    check (coalesce(asset_hours, 0) >= 0 and coalesce(component_hours, 0) >= 0),
  constraint equipment_component_events_notes_length
    check (coalesce(length(notes), 0) <= 2000)
);

comment on table public.equipment_component_events is
  'Append-only Equipment component history (install/remove/rebuild/repair/inspect/scrap).';

create index if not exists equipment_component_events_component_idx
  on public.equipment_component_events (component_id, occurred_at desc, sequence desc);
create index if not exists equipment_component_events_vehicle_idx
  on public.equipment_component_events (vehicle_id)
  where vehicle_id is not null;
create index if not exists equipment_component_events_work_order_idx
  on public.equipment_component_events (work_order_id)
  where work_order_id is not null;
create index if not exists equipment_component_events_shop_idx
  on public.equipment_component_events (shop_id);

-- Idempotency receipts: a retried create/action with the same operation key
-- returns the original outcome instead of repeating it.
create table if not exists public.equipment_component_operations (
  shop_id uuid not null references public.shops (id) on delete cascade,
  operation_key uuid not null,
  component_id uuid not null references public.equipment_components (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, operation_key)
);

create index if not exists equipment_component_operations_component_idx
  on public.equipment_component_operations (component_id);

-- Component life (hours) at a given asset meter: life at install plus asset
-- hours since install. Unknown (null) when not installed or the meter is
-- missing or went backwards.
create or replace function public.equipment_component_life(
  p_status text,
  p_hours_at_install integer,
  p_installed_asset_hours integer,
  p_current_asset_hours integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status = 'installed'
      and p_installed_asset_hours is not null
      and p_current_asset_hours is not null
      and p_current_asset_hours >= p_installed_asset_hours
    then coalesce(p_hours_at_install, 0) + (p_current_asset_hours - p_installed_asset_hours)
    else null
  end;
$$;

-- Tenant and hierarchy integrity for components (new table only).
create or replace function public.equipment_components_enforce_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle_shop uuid;
  v_parent public.equipment_components%rowtype;
  v_cursor uuid;
  v_depth integer := 0;
  v_asset_deleted boolean := false;
begin
  -- The installed asset was deleted (FK set-null cascade): the component
  -- returns to stock with its known life instead of blocking the delete.
  if tg_op = 'UPDATE'
     and old.installed_vehicle_id is not null
     and new.installed_vehicle_id is null
     and not exists (select 1 from public.vehicles v where v.id = old.installed_vehicle_id) then
    v_asset_deleted := true;
    if new.status = 'installed' then
      new.status := 'in_stock';
    end if;
    new.installed_at := null;
    new.installed_asset_hours := null;
  end if;

  if new.installed_vehicle_id is not null then
    select v.shop_id into v_vehicle_shop
    from public.vehicles v where v.id = new.installed_vehicle_id;
    if v_vehicle_shop is null or v_vehicle_shop <> new.shop_id then
      raise exception 'Component asset must belong to the same shop'
        using errcode = '23514';
    end if;
  end if;

  if new.parent_component_id is not null then
    select * into v_parent
    from public.equipment_components c where c.id = new.parent_component_id;
    if not found or v_parent.shop_id <> new.shop_id then
      raise exception 'Parent component must belong to the same shop'
        using errcode = '23514';
    end if;
    -- During an asset-delete cascade the parent may not be cleared yet.
    if v_parent.installed_vehicle_id is distinct from new.installed_vehicle_id
       and not (v_asset_deleted and v_parent.installed_vehicle_id = old.installed_vehicle_id) then
      raise exception 'A component must be on the same asset as its parent'
        using errcode = '23514';
    end if;

    -- Reject cycles by walking the ancestor chain.
    v_cursor := new.parent_component_id;
    while v_cursor is not null loop
      if v_cursor = new.id then
        raise exception 'Component hierarchy cannot contain a cycle'
          using errcode = '23514';
      end if;
      v_depth := v_depth + 1;
      if v_depth > 20 then
        raise exception 'Component hierarchy is too deep' using errcode = '23514';
      end if;
      select c.parent_component_id into v_cursor
      from public.equipment_components c where c.id = v_cursor;
    end loop;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.equipment_components_enforce_scope()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_components_enforce_scope
  on public.equipment_components;
create trigger trg_equipment_components_enforce_scope
before insert or update on public.equipment_components
for each row execute function public.equipment_components_enforce_scope();

-- History is append-only and tenant-consistent (new table only). The only
-- update allowed is a FK cascade clearing a deleted asset or work order.
create or replace function public.equipment_component_events_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
  v_work_order_vehicle uuid;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'vehicle_id' - 'work_order_id')
         = (to_jsonb(old) - 'vehicle_id' - 'work_order_id')
       and (new.vehicle_id is null or new.vehicle_id = old.vehicle_id)
       and (new.work_order_id is null or new.work_order_id = old.work_order_id)
       and (new.vehicle_id is null and old.vehicle_id is not null
            and not exists (select 1 from public.vehicles v where v.id = old.vehicle_id)
         or new.work_order_id is null and old.work_order_id is not null
            and not exists (select 1 from public.work_orders w where w.id = old.work_order_id)) then
      return new;
    end if;
    raise exception 'Equipment component history is append-only'
      using errcode = '42501';
  end if;

  select c.shop_id into v_shop
  from public.equipment_components c where c.id = new.component_id;
  if v_shop is null or v_shop <> new.shop_id then
    raise exception 'Component event shop must match its component'
      using errcode = '23514';
  end if;

  if new.vehicle_id is not null then
    select v.shop_id into v_shop from public.vehicles v where v.id = new.vehicle_id;
    if v_shop is null or v_shop <> new.shop_id then
      raise exception 'Component event asset must belong to the same shop'
        using errcode = '23514';
    end if;
  end if;

  if new.work_order_id is not null then
    select w.shop_id, w.vehicle_id into v_shop, v_work_order_vehicle
    from public.work_orders w where w.id = new.work_order_id;
    if v_shop is null or v_shop <> new.shop_id then
      raise exception 'Component event work order must belong to the same shop'
        using errcode = '23514';
    end if;
    if new.vehicle_id is not null and v_work_order_vehicle is distinct from new.vehicle_id then
      raise exception 'Component event work order must be for the component asset'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.equipment_component_events_guard()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_component_events_guard
  on public.equipment_component_events;
create trigger trg_equipment_component_events_guard
before insert or update on public.equipment_component_events
for each row execute function public.equipment_component_events_guard();

alter table public.equipment_components enable row level security;
alter table public.equipment_component_events enable row level security;
alter table public.equipment_component_operations enable row level security;

revoke all on table public.equipment_components from public, anon, authenticated;
revoke all on table public.equipment_component_events from public, anon, authenticated;
revoke all on table public.equipment_component_operations from public, anon, authenticated;
grant all on table public.equipment_components to service_role;
grant select, insert on table public.equipment_component_events to service_role;
grant select, insert on table public.equipment_component_operations to service_role;

revoke all on function public.equipment_component_life(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.equipment_component_life(text, integer, integer, integer)
  to service_role;

-- Claim an idempotency receipt. Returns the component id of an earlier
-- operation with the same key (a replay), or null when this call owns it.
create or replace function public.equipment_component_claim_operation(
  p_shop_id uuid,
  p_operation_key uuid,
  p_component_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_component_operations%rowtype;
begin
  if p_operation_key is null then
    return null;
  end if;
  insert into public.equipment_component_operations (shop_id, operation_key, component_id, action)
  values (p_shop_id, p_operation_key, p_component_id, p_action)
  on conflict (shop_id, operation_key) do nothing;
  if found then
    return null;
  end if;
  select * into v_existing from public.equipment_component_operations o
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  if v_existing.action <> p_action
     or (p_component_id is not null and v_existing.component_id <> p_component_id) then
    raise exception 'Operation key was already used for a different request'
      using errcode = '22023';
  end if;
  return v_existing.component_id;
end;
$$;

revoke all on function public.equipment_component_claim_operation(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.equipment_component_claim_operation(uuid, uuid, uuid, text)
  to service_role;

-- Create or update a component's identity fields.
--   Create: starts in stock, or installs atomically on p_install_vehicle_id
--   (optionally under p_parent_component_id) in the same transaction.
--   Update: identity changes are recorded as an 'updated' event with the
--   previous and new values.
-- p_operation_key makes a create retry-safe. Returns the component id.
create or replace function public.equipment_component_save(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_component_id uuid,
  p_fields jsonb,
  p_install_vehicle_id uuid default null,
  p_parent_component_id uuid default null,
  p_asset_hours integer default null,
  p_operation_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_old public.equipment_components%rowtype;
  v_new public.equipment_components%rowtype;
  v_details jsonb := '{}'::jsonb;
  v_field text;
  v_replayed uuid;
begin
  if p_shop_id is null or p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'Component input is invalid' using errcode = '22023';
  end if;

  if p_component_id is null then
    -- Same-key creates are serialized; a replay returns the original id.
    v_id := gen_random_uuid();
    if p_operation_key is not null then
      perform pg_advisory_xact_lock(
        hashtextextended('equipment_component_create:' || p_shop_id::text || ':' || p_operation_key::text, 0));
      select o.component_id into v_replayed
      from public.equipment_component_operations o
      where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
      if v_replayed is not null then
        if not exists (
          select 1 from public.equipment_component_operations o
          where o.shop_id = p_shop_id and o.operation_key = p_operation_key and o.action = 'create'
        ) then
          raise exception 'Operation key was already used for a different request'
            using errcode = '22023';
        end if;
        return v_replayed;
      end if;
    end if;

    insert into public.equipment_components (
      id, shop_id, component_type, position, label, manufacturer, model,
      serial_number, part_number, attributes, status, created_by, updated_by
    ) values (
      v_id,
      p_shop_id,
      p_fields ->> 'component_type',
      nullif(p_fields ->> 'position', ''),
      p_fields ->> 'label',
      nullif(p_fields ->> 'manufacturer', ''),
      nullif(p_fields ->> 'model', ''),
      nullif(p_fields ->> 'serial_number', ''),
      nullif(p_fields ->> 'part_number', ''),
      coalesce(p_fields -> 'attributes', '{}'::jsonb),
      'in_stock',
      p_actor_user_id,
      p_actor_user_id
    );

    if p_operation_key is not null then
      insert into public.equipment_component_operations (shop_id, operation_key, component_id, action)
      values (p_shop_id, p_operation_key, v_id, 'create');
    end if;

    insert into public.equipment_component_events (
      shop_id, component_id, event_type, recorded_by
    ) values (p_shop_id, v_id, 'created', p_actor_user_id);

    if p_install_vehicle_id is not null then
      update public.equipment_components c
      set status = 'installed', installed_vehicle_id = p_install_vehicle_id,
          parent_component_id = p_parent_component_id,
          installed_at = now(), installed_asset_hours = p_asset_hours,
          updated_by = p_actor_user_id
      where c.id = v_id;

      insert into public.equipment_component_events (
        shop_id, component_id, event_type, vehicle_id, asset_hours,
        component_hours, recorded_by
      ) values (
        p_shop_id, v_id, 'installed', p_install_vehicle_id, p_asset_hours,
        null, p_actor_user_id
      );
    end if;
    return v_id;
  end if;

  select * into v_old from public.equipment_components c
  where c.id = p_component_id and c.shop_id = p_shop_id
  for update;
  if not found then
    raise exception 'Component not found' using errcode = 'P0002';
  end if;

  update public.equipment_components c
  set component_type = p_fields ->> 'component_type',
      position = nullif(p_fields ->> 'position', ''),
      label = p_fields ->> 'label',
      manufacturer = nullif(p_fields ->> 'manufacturer', ''),
      model = nullif(p_fields ->> 'model', ''),
      serial_number = nullif(p_fields ->> 'serial_number', ''),
      part_number = nullif(p_fields ->> 'part_number', ''),
      attributes = coalesce(p_fields -> 'attributes', '{}'::jsonb),
      updated_by = p_actor_user_id
  where c.id = p_component_id
  returning * into v_new;

  foreach v_field in array array[
    'component_type', 'position', 'label', 'manufacturer', 'model',
    'serial_number', 'part_number', 'attributes'
  ] loop
    if (to_jsonb(v_old) -> v_field) is distinct from (to_jsonb(v_new) -> v_field) then
      v_details := v_details || jsonb_build_object(
        v_field,
        jsonb_build_object('from', to_jsonb(v_old) -> v_field, 'to', to_jsonb(v_new) -> v_field)
      );
    end if;
  end loop;

  if v_details <> '{}'::jsonb then
    insert into public.equipment_component_events (
      shop_id, component_id, event_type, vehicle_id, details, recorded_by
    ) values (
      p_shop_id, p_component_id, 'updated', v_new.installed_vehicle_id,
      v_details, p_actor_user_id
    );
  end if;
  return p_component_id;
end;
$$;

-- Move a component or record work on it, atomically, with history.
--   install  : onto p_vehicle_id (optionally under p_parent_component_id);
--              removes it from any previous asset first. Children follow.
--   remove   : off its asset into stock (or 'in_repair' via p_target_status).
--   rebuilt  : records a rebuild; component life restarts at 0 hours.
--   repaired / inspected : records work without moving the component.
--   scrapped : removes and retires the component.
-- Meters: p_asset_hours is the meter of the asset the event happens on (the
-- target when installing). When installing onto a different asset,
-- p_source_asset_hours is the meter of the asset being left; every component
-- in the moved subtree carries its own life measured on that meter.
-- p_operation_key makes the call retry-safe (a replay is a no-op).
create or replace function public.equipment_component_move(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_component_id uuid,
  p_action text,
  p_vehicle_id uuid default null,
  p_parent_component_id uuid default null,
  p_position text default null,
  p_asset_hours integer default null,
  p_source_asset_hours integer default null,
  p_occurred_at timestamptz default null,
  p_work_order_id uuid default null,
  p_notes text default null,
  p_target_status text default null,
  p_operation_key uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_component public.equipment_components%rowtype;
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_subtree uuid[];
  v_child record;
  v_life integer;
  v_leaving boolean;
  v_moving_assets boolean;
  v_meter integer;
begin
  if p_action not in ('install', 'remove', 'rebuilt', 'repaired', 'inspected', 'scrapped') then
    raise exception 'Unknown component action' using errcode = '22023';
  end if;
  if p_occurred_at is not null and p_occurred_at > now() + interval '1 day' then
    raise exception 'Component events cannot be dated in the future' using errcode = '22023';
  end if;

  select * into v_component
  from public.equipment_components c
  where c.id = p_component_id
  for update;
  if not found or v_component.shop_id <> p_shop_id then
    raise exception 'Component not found' using errcode = 'P0002';
  end if;

  -- A retried request with the same key is a no-op.
  if public.equipment_component_claim_operation(p_shop_id, p_operation_key, p_component_id, p_action) is not null then
    return;
  end if;

  if v_component.status = 'scrapped' then
    raise exception 'Scrapped components cannot change' using errcode = '23514';
  end if;
  if p_action = 'install' and p_vehicle_id is null then
    raise exception 'An asset is required to install a component' using errcode = '22023';
  end if;

  -- The component and all its descendants, locked in a stable order.
  with recursive subtree(id, depth) as (
    select p_component_id, 0
    union all
    select c.id, s.depth + 1 from public.equipment_components c
    join subtree s on c.parent_component_id = s.id
    where s.depth < 20
  )
  select array_agg(id order by id) into v_subtree from subtree;
  perform 1 from public.equipment_components c
  where c.id = any(v_subtree) order by c.id for update;

  v_moving_assets := p_action = 'install'
    and v_component.status = 'installed'
    and v_component.installed_vehicle_id <> p_vehicle_id;
  -- Meter of the asset the subtree is on now (life accrued there).
  v_meter := case when v_moving_assets then p_source_asset_hours else p_asset_hours end;
  v_life := public.equipment_component_life(
    v_component.status, v_component.component_hours_at_install,
    v_component.installed_asset_hours, v_meter);

  -- Leaving an asset is recorded for every installed component in the
  -- subtree with its own life; repositioning within the same asset is not.
  v_leaving := v_component.status = 'installed'
    and (p_action in ('remove', 'scrapped') or v_moving_assets);
  if v_leaving then
    insert into public.equipment_component_events (
      shop_id, component_id, event_type, vehicle_id, asset_hours,
      component_hours, occurred_at, work_order_id, notes, recorded_by
    )
    select p_shop_id, c.id, 'removed', c.installed_vehicle_id, v_meter,
      public.equipment_component_life(c.status, c.component_hours_at_install, c.installed_asset_hours, v_meter),
      v_at,
      -- A work order for the destination does not belong to the old asset.
      case when v_moving_assets then null else p_work_order_id end,
      case when c.id = p_component_id then p_notes else 'Moved with parent component' end,
      p_actor_user_id
    from public.equipment_components c
    where c.id = any(v_subtree) and c.status = 'installed'
    order by c.id = p_component_id desc, c.id;
  end if;

  if p_action = 'install' then
    -- Move the component first, then its descendants parent-first, so each
    -- row's same-asset-as-parent check sees its parent already moved.
    update public.equipment_components c
    set installed_vehicle_id = p_vehicle_id, status = 'installed',
        parent_component_id = p_parent_component_id,
        position = coalesce(nullif(p_position, ''), c.position),
        installed_at = v_at, installed_asset_hours = p_asset_hours,
        component_hours_at_install = coalesce(v_life, c.component_hours_at_install),
        updated_by = p_actor_user_id
    where c.id = p_component_id;

    for v_child in
      with recursive subtree(id, depth) as (
        select c.id, 1 from public.equipment_components c
        where c.parent_component_id = p_component_id
        union all
        select c.id, s.depth + 1 from public.equipment_components c
        join subtree s on c.parent_component_id = s.id
        where s.depth < 20
      )
      select id from subtree order by depth, id
    loop
      update public.equipment_components c
      set installed_vehicle_id = p_vehicle_id, status = 'installed',
          installed_at = v_at, installed_asset_hours = p_asset_hours,
          component_hours_at_install = coalesce(
            public.equipment_component_life(
              c.status, c.component_hours_at_install, c.installed_asset_hours, v_meter),
            c.component_hours_at_install),
          updated_by = p_actor_user_id
      where c.id = v_child.id;
    end loop;

    insert into public.equipment_component_events (
      shop_id, component_id, event_type, vehicle_id, asset_hours,
      component_hours, occurred_at, work_order_id, notes, recorded_by
    )
    select p_shop_id, c.id, 'installed', p_vehicle_id, p_asset_hours,
      c.component_hours_at_install, v_at, p_work_order_id,
      case when c.id = p_component_id then p_notes else 'Moved with parent component' end,
      p_actor_user_id
    from public.equipment_components c
    where c.id = any(v_subtree)
    order by c.id = p_component_id desc, c.id;
    return;
  end if;

  if p_action in ('remove', 'scrapped') then
    -- Children stay attached to the removed parent and leave the asset with
    -- it, each keeping its own life; update parent-first so each same-asset
    -- check sees its parent moved.
    update public.equipment_components c
    set installed_vehicle_id = null,
        status = case
          when p_action = 'scrapped' then 'scrapped'
          when p_target_status = 'in_repair' then 'in_repair'
          else 'in_stock' end,
        parent_component_id = null,
        installed_at = null, installed_asset_hours = null,
        component_hours_at_install = coalesce(v_life, c.component_hours_at_install),
        updated_by = p_actor_user_id
    where c.id = p_component_id;

    for v_child in
      with recursive subtree(id, depth) as (
        select c.id, 1 from public.equipment_components c
        where c.parent_component_id = p_component_id
        union all
        select c.id, s.depth + 1 from public.equipment_components c
        join subtree s on c.parent_component_id = s.id
        where s.depth < 20
      )
      select id from subtree order by depth, id
    loop
      update public.equipment_components c
      set installed_vehicle_id = null,
          status = case when c.status = 'installed' then 'in_stock' else c.status end,
          installed_at = null, installed_asset_hours = null,
          component_hours_at_install = coalesce(
            public.equipment_component_life(
              c.status, c.component_hours_at_install, c.installed_asset_hours, v_meter),
            c.component_hours_at_install),
          updated_by = p_actor_user_id
      where c.id = v_child.id;
    end loop;

    if p_action = 'scrapped' then
      insert into public.equipment_component_events (
        shop_id, component_id, event_type, asset_hours, component_hours,
        occurred_at, work_order_id, notes, recorded_by
      ) values (
        p_shop_id, p_component_id, 'scrapped', p_asset_hours,
        coalesce(v_life, v_component.component_hours_at_install), v_at,
        p_work_order_id, p_notes, p_actor_user_id
      );
    end if;
    return;
  end if;

  -- rebuilt / repaired / inspected: record work in place.
  insert into public.equipment_component_events (
    shop_id, component_id, event_type, vehicle_id, asset_hours,
    component_hours, occurred_at, work_order_id, notes, recorded_by
  ) values (
    p_shop_id, p_component_id, p_action, v_component.installed_vehicle_id,
    p_asset_hours, coalesce(v_life, v_component.component_hours_at_install),
    v_at, p_work_order_id, p_notes, p_actor_user_id
  );

  if p_action = 'rebuilt' then
    update public.equipment_components c
    set component_hours_at_install = 0,
        installed_asset_hours = case
          when c.status = 'installed' then p_asset_hours else c.installed_asset_hours end,
        status = case when c.status = 'in_repair' then 'in_stock' else c.status end,
        updated_by = p_actor_user_id
    where c.id = p_component_id;
  end if;
end;
$$;

-- Idempotently create and install a standard component hierarchy on an
-- asset. p_items: [{key, parent_key, component_type, position, label}].
-- Items whose (type, position) is already installed on the asset are skipped.
-- Returns the number of components created.
create or replace function public.equipment_component_seed(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_vehicle_id uuid,
  p_items jsonb,
  p_asset_hours integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle_shop uuid;
  v_item jsonb;
  v_keys jsonb := '{}'::jsonb;
  v_parent uuid;
  v_existing uuid;
  v_id uuid;
  v_created integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Template items are invalid' using errcode = '22023';
  end if;

  select v.shop_id into v_vehicle_shop
  from public.vehicles v where v.id = p_vehicle_id for update;
  if v_vehicle_shop is null or v_vehicle_shop <> p_shop_id then
    raise exception 'Asset not found' using errcode = 'P0002';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_parent := case
      when v_item ? 'parent_key' and v_item ->> 'parent_key' is not null
        then (v_keys ->> (v_item ->> 'parent_key'))::uuid
      else null end;

    select c.id into v_existing
    from public.equipment_components c
    where c.shop_id = p_shop_id
      and c.installed_vehicle_id = p_vehicle_id
      and c.component_type = v_item ->> 'component_type'
      and c.position is not distinct from nullif(v_item ->> 'position', '')
    limit 1;

    if v_existing is not null then
      v_keys := v_keys || jsonb_build_object(v_item ->> 'key', v_existing);
      continue;
    end if;

    insert into public.equipment_components (
      shop_id, component_type, position, label, status, installed_vehicle_id,
      parent_component_id, installed_at, installed_asset_hours,
      created_by, updated_by
    ) values (
      p_shop_id, v_item ->> 'component_type', nullif(v_item ->> 'position', ''),
      v_item ->> 'label', 'installed', p_vehicle_id, v_parent, now(),
      p_asset_hours, p_actor_user_id, p_actor_user_id
    )
    returning id into v_id;

    insert into public.equipment_component_events (
      shop_id, component_id, event_type, vehicle_id, asset_hours, notes, recorded_by
    ) values (
      p_shop_id, v_id, 'installed', p_vehicle_id, p_asset_hours,
      'Added from the standard component list', p_actor_user_id
    );

    v_keys := v_keys || jsonb_build_object(v_item ->> 'key', v_id);
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.equipment_component_save(uuid, uuid, uuid, jsonb, uuid, uuid, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.equipment_component_move(
  uuid, uuid, uuid, text, uuid, uuid, text, integer, integer, timestamptz, uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.equipment_component_seed(uuid, uuid, uuid, jsonb, integer)
  from public, anon, authenticated;

grant execute on function public.equipment_component_save(uuid, uuid, uuid, jsonb, uuid, uuid, integer, uuid)
  to service_role;
grant execute on function public.equipment_component_move(
  uuid, uuid, uuid, text, uuid, uuid, text, integer, integer, timestamptz, uuid, text, text, uuid
) to service_role;
grant execute on function public.equipment_component_seed(uuid, uuid, uuid, jsonb, integer)
  to service_role;
