-- Equipment PM work orders: link a shop's work orders to a PM plan.
--
-- Isolated addition. A link says "this work order is doing this PM" so the
-- plan card can show the open work order (nobody starts a duplicate) and,
-- once the work order is completed, offer to record the PM completion. The
-- completion itself is still recorded by a person through
-- equipment_pm_complete; nothing here records it automatically.
--
-- Links are append-only: a mistaken link is unlinked once (kept in history),
-- never edited or deleted. The work order must be in the plan's shop, for the
-- plan's asset, and a work order (not an estimate).
--
-- Access model (same as the other equipment tables): no Data API access for
-- anon/authenticated; the Equipment-entitled server routes authorize first and
-- write through the RPCs below. Retried writes are idempotent by operation key.
--
-- No pre-existing table, policy, grant, trigger or function is changed. The
-- new FKs only cascade rows of these new tables (deleting a work order, plan,
-- asset or shop removes its links).
--
-- Rollback boundary (nothing else depends on these):
--   drop function if exists public.equipment_pm_work_order_unlink(uuid, uuid, uuid, uuid);
--   drop function if exists public.equipment_pm_work_order_link(uuid, uuid, uuid, uuid, uuid);
--   drop table if exists public.equipment_pm_work_order_operations;
--   drop table if exists public.equipment_pm_work_orders;
--   drop function if exists public.equipment_pm_work_orders_guard();

create table if not exists public.equipment_pm_work_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  plan_id uuid not null references public.equipment_pm_plans (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  linked_by uuid,
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  unlinked_by uuid,

  constraint equipment_pm_work_orders_unlink check (unlinked_at is not null or unlinked_by is null)
);

comment on table public.equipment_pm_work_orders is
  'Append-only links from Equipment PM plans to the work orders doing them; unlinked once, never edited. Accessed only through the Equipment-entitled server routes.';

-- One current link per plan and work order.
create unique index if not exists equipment_pm_work_orders_active_uidx
  on public.equipment_pm_work_orders (plan_id, work_order_id)
  where unlinked_at is null;
create index if not exists equipment_pm_work_orders_vehicle_idx
  on public.equipment_pm_work_orders (vehicle_id, unlinked_at);
create index if not exists equipment_pm_work_orders_work_order_idx
  on public.equipment_pm_work_orders (work_order_id);
create index if not exists equipment_pm_work_orders_shop_idx
  on public.equipment_pm_work_orders (shop_id);

-- Idempotency receipts for link/unlink (a retried request with the same key
-- returns the original result; a reused key with a different payload is
-- refused).
create table if not exists public.equipment_pm_work_order_operations (
  shop_id uuid not null references public.shops (id) on delete cascade,
  operation_key uuid not null,
  kind text not null,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  request_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (shop_id, operation_key),
  constraint equipment_pm_work_order_operations_kind check (
    kind is not null and kind in ('link', 'unlink')
  )
);

create index if not exists equipment_pm_work_order_operations_vehicle_idx
  on public.equipment_pm_work_order_operations (vehicle_id);

-- Tenant integrity and append-only history (new table only). The only update
-- allowed is a one-time unlink.
create or replace function public.equipment_pm_work_orders_guard()
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
  v_wo_type text;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['unlinked_at', 'unlinked_by'])
       is distinct from (to_jsonb(old) - array['unlinked_at', 'unlinked_by']) then
      raise exception 'Equipment PM work order links are append-only'
        using errcode = '42501';
    end if;
    if old.unlinked_at is not null then
      raise exception 'This work order is already unlinked'
        using errcode = '42501';
    end if;
    if new.unlinked_at is null then
      raise exception 'Equipment PM work order links are append-only'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.unlinked_at is not null then
    raise exception 'A new PM work order link cannot start unlinked'
      using errcode = '23514';
  end if;
  select p.shop_id, p.vehicle_id into v_plan_shop, v_plan_vehicle
  from public.equipment_pm_plans p where p.id = new.plan_id;
  if v_plan_shop is null or v_plan_shop <> new.shop_id or v_plan_vehicle <> new.vehicle_id then
    raise exception 'PM work order link must match its plan''s shop and asset'
      using errcode = '23514';
  end if;
  select w.shop_id, w.vehicle_id, w.record_type into v_wo_shop, v_wo_vehicle, v_wo_type
  from public.work_orders w where w.id = new.work_order_id;
  if v_wo_shop is null or v_wo_shop <> new.shop_id
     or v_wo_vehicle is distinct from new.vehicle_id
     or lower(regexp_replace(btrim(coalesce(v_wo_type, '')), '[\s-]+', '_', 'g')) = 'estimate' then
    raise exception 'PM work order must be one of the asset''s work orders'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.equipment_pm_work_orders_guard()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_pm_work_orders_guard on public.equipment_pm_work_orders;
create trigger trg_equipment_pm_work_orders_guard
before insert or update on public.equipment_pm_work_orders
for each row execute function public.equipment_pm_work_orders_guard();

alter table public.equipment_pm_work_orders enable row level security;
alter table public.equipment_pm_work_order_operations enable row level security;

revoke all on table public.equipment_pm_work_orders from public, anon, authenticated;
revoke all on table public.equipment_pm_work_order_operations from public, anon, authenticated;
grant select on table public.equipment_pm_work_orders to service_role;
grant select on table public.equipment_pm_work_order_operations to service_role;

-- Link a work order to a PM plan. The plan must be active and in the caller's
-- shop; the work order must be a work order for the plan's asset in the same
-- shop. Linking a work order that is already linked to the plan returns the
-- existing link. Returns {"id": ...}; a replay with the same p_operation_key
-- returns the original result.
create or replace function public.equipment_pm_work_order_link(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_plan_id uuid,
  p_work_order_id uuid,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_pm_work_order_operations%rowtype;
  v_hash text;
  v_plan public.equipment_pm_plans%rowtype;
  v_id uuid;
  v_result jsonb;
begin
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;
  if p_work_order_id is null then
    raise exception 'A work order is required' using errcode = '22023';
  end if;

  select * into v_plan from public.equipment_pm_plans p
  where p.id = p_plan_id
  for update;
  if not found or v_plan.shop_id <> p_shop_id then
    raise exception 'PM plan not found' using errcode = 'P0002';
  end if;

  v_hash := md5(jsonb_build_object('plan_id', p_plan_id, 'work_order_id', p_work_order_id)::text);

  insert into public.equipment_pm_work_order_operations (shop_id, operation_key, kind, vehicle_id, request_hash)
  values (p_shop_id, p_operation_key, 'link', v_plan.vehicle_id, v_hash)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_pm_work_order_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'link' or v_existing.vehicle_id <> v_plan.vehicle_id
       or v_existing.request_hash <> v_hash or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  if not v_plan.active then
    raise exception 'This PM plan is archived' using errcode = '22023';
  end if;

  select l.id into v_id from public.equipment_pm_work_orders l
  where l.plan_id = p_plan_id and l.work_order_id = p_work_order_id and l.unlinked_at is null;
  if v_id is null then
    -- The guard trigger checks the work order's shop, asset and record type.
    insert into public.equipment_pm_work_orders (shop_id, plan_id, vehicle_id, work_order_id, linked_by)
    values (p_shop_id, p_plan_id, v_plan.vehicle_id, p_work_order_id, p_actor_user_id)
    returning id into v_id;
  end if;

  v_result := jsonb_build_object('id', v_id);
  update public.equipment_pm_work_order_operations o
  set result = v_result
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_result;
end;
$$;

-- Unlink a mistaken link (once). The link stays in history. Returns
-- {"id": ...}; a replay with the same p_operation_key returns the original.
create or replace function public.equipment_pm_work_order_unlink(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_link_id uuid,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.equipment_pm_work_order_operations%rowtype;
  v_hash text;
  v_link public.equipment_pm_work_orders%rowtype;
  v_result jsonb;
begin
  if p_operation_key is null then
    raise exception 'An operation key is required' using errcode = '22023';
  end if;

  select * into v_link from public.equipment_pm_work_orders l
  where l.id = p_link_id
  for update;
  if not found or v_link.shop_id <> p_shop_id then
    raise exception 'Work order link not found' using errcode = 'P0002';
  end if;

  v_hash := md5(jsonb_build_object('link_id', p_link_id)::text);

  insert into public.equipment_pm_work_order_operations (shop_id, operation_key, kind, vehicle_id, request_hash)
  values (p_shop_id, p_operation_key, 'unlink', v_link.vehicle_id, v_hash)
  on conflict (shop_id, operation_key) do nothing;
  if not found then
    select * into v_existing from public.equipment_pm_work_order_operations o
    where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
    if v_existing.kind <> 'unlink' or v_existing.vehicle_id <> v_link.vehicle_id
       or v_existing.request_hash <> v_hash or v_existing.result is null then
      raise exception 'Operation key was already used for a different request'
        using errcode = '22023';
    end if;
    return v_existing.result;
  end if;

  if v_link.unlinked_at is not null then
    raise exception 'This work order is already unlinked' using errcode = '22023';
  end if;

  update public.equipment_pm_work_orders l set
    unlinked_at = now(),
    unlinked_by = p_actor_user_id
  where l.id = p_link_id;

  v_result := jsonb_build_object('id', p_link_id);
  update public.equipment_pm_work_order_operations o
  set result = v_result
  where o.shop_id = p_shop_id and o.operation_key = p_operation_key;
  return v_result;
end;
$$;

revoke all on function public.equipment_pm_work_order_link(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.equipment_pm_work_order_unlink(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.equipment_pm_work_order_link(uuid, uuid, uuid, uuid, uuid)
  to service_role;
grant execute on function public.equipment_pm_work_order_unlink(uuid, uuid, uuid, uuid)
  to service_role;
