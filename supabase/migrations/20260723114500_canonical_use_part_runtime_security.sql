begin;

-- The lifecycle SQL was originally installed manually in production. Complete
-- the migration-owned allocation shape so clean replay can execute the same
-- runtime functions instead of only compiling their deferred PL/pgSQL bodies.
alter table public.parts
  add column if not exists default_price numeric(10,2);

alter table public.work_order_part_allocations
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists work_order_id uuid,
  add column if not exists source_request_item_id uuid;

-- The checked-in bootstrap still has the legacy integer column, while the
-- deployed lifecycle SQL accepts fractional quantities. Keep both paths exact.
do $$
declare
  v_data_type text;
  v_precision integer;
  v_scale integer;
  v_trigger_definitions text[];
  v_trigger_names text[];
  v_trigger_index integer;
begin
  select data_type, numeric_precision, numeric_scale
    into v_data_type, v_precision, v_scale
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'work_order_parts'
    and column_name = 'quantity';

  if v_data_type is distinct from 'numeric'
     or v_precision is distinct from 12
     or v_scale is distinct from 2 then
    -- PostgreSQL will not alter a column named in an UPDATE OF trigger. Keep
    -- every matching deployed trigger definition, remove it transactionally,
    -- and restore the exact definition after the type change. A later failure
    -- rolls the whole migration (including these drops) back.
    select
      coalesce(
        array_agg(trigger_row.tgname order by trigger_row.tgname),
        array[]::text[]
      ),
      coalesce(
        array_agg(
          pg_get_triggerdef(trigger_row.oid, true)
          order by trigger_row.tgname
        ),
        array[]::text[]
      )
      into v_trigger_names, v_trigger_definitions
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.work_order_parts'::regclass
      and not trigger_row.tgisinternal
      and pg_get_triggerdef(trigger_row.oid, true) ~* '\mquantity\M';

    for v_trigger_index in
      1..coalesce(array_length(v_trigger_names, 1), 0)
    loop
      execute format(
        'drop trigger %I on public.work_order_parts',
        v_trigger_names[v_trigger_index]
      );
    end loop;

    execute $ddl$
      alter table public.work_order_parts
      alter column quantity type numeric(12,2)
      using quantity::numeric(12,2)
    $ddl$;

    for v_trigger_index in
      1..coalesce(array_length(v_trigger_definitions, 1), 0)
    loop
      execute v_trigger_definitions[v_trigger_index];
    end loop;
  end if;
end
$$;

update public.work_order_part_allocations allocation
set work_order_id = line.work_order_id
from public.work_order_lines line
where line.id = allocation.work_order_line_id
  and allocation.work_order_id is null;

-- Recover lineage only when an existing allocation audit move identifies one
-- WOP and every tenant/work-order/line/part/location field agrees. Rows without
-- that durable evidence remain blocked below rather than being guessed.
update public.work_order_part_allocations allocation
set work_order_part_id = work_order_part.id
from public.stock_moves move
join public.work_order_parts work_order_part
  on work_order_part.id = move.work_order_part_id
where allocation.work_order_part_id is null
  and allocation.stock_move_id = move.id
  and move.shop_id = allocation.shop_id
  and move.part_id = allocation.part_id
  and move.location_id = allocation.location_id
  and work_order_part.shop_id = allocation.shop_id
  and work_order_part.work_order_id = allocation.work_order_id
  and work_order_part.work_order_line_id = allocation.work_order_line_id
  and work_order_part.part_id = allocation.part_id;

-- 3a4dfee can insert a bare allocation before the render fails. It has no WOP
-- anchor or durable operation key, so issuing, merging, or deleting it would
-- guess at user intent. Stop safely and require explicit reconciliation.
do $$
declare
  v_orphan_count bigint;
  v_orphan_sample jsonb;
begin
  select count(*)
    into v_orphan_count
  from public.work_order_part_allocations
  where work_order_part_id is null;

  if v_orphan_count > 0 then
    select coalesce(jsonb_agg(to_jsonb(sample)), '[]'::jsonb)
      into v_orphan_sample
    from (
      select
        id,
        shop_id,
        work_order_id,
        work_order_line_id,
        part_id,
        location_id,
        qty
      from public.work_order_part_allocations
      where work_order_part_id is null
      order by created_at, id
      limit 10
    ) sample;

    raise exception using
      errcode = 'P0001',
      message = 'PARTS_ORPHAN_ALLOCATIONS_BLOCK_MIGRATION',
      detail = format(
        '%s allocation(s) have no work_order_part_id or idempotency receipt. Sample: %s',
        v_orphan_count,
        v_orphan_sample::text
      ),
      hint =
        'Reconcile each allocation to user intent before applying this migration; do not delete or issue it automatically.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_attribute child_column
      on child_column.attrelid = constraint_row.conrelid
     and child_column.attnum = any(constraint_row.conkey)
    where constraint_row.contype = 'f'
      and constraint_row.conrelid =
        'public.work_order_part_allocations'::regclass
      and constraint_row.confrelid = 'public.work_orders'::regclass
      and child_column.attname = 'work_order_id'
  ) then
    alter table public.work_order_part_allocations
      add constraint wopa_work_order_id_fkey
      foreign key (work_order_id)
      references public.work_orders(id)
      on delete cascade
      not valid;
    alter table public.work_order_part_allocations
      validate constraint wopa_work_order_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_attribute child_column
      on child_column.attrelid = constraint_row.conrelid
     and child_column.attnum = any(constraint_row.conkey)
    where constraint_row.contype = 'f'
      and constraint_row.conrelid =
        'public.work_order_part_allocations'::regclass
      and constraint_row.confrelid = 'public.part_request_items'::regclass
      and child_column.attname = 'source_request_item_id'
  ) then
    alter table public.work_order_part_allocations
      add constraint work_order_part_allocations_source_request_item_id_fkey
      foreign key (source_request_item_id)
      references public.part_request_items(id)
      on delete set null
      not valid;
    alter table public.work_order_part_allocations
      validate constraint
        work_order_part_allocations_source_request_item_id_fkey;
  end if;
end
$$;

do $$
declare
  v_duplicate_count bigint;
begin
  select count(*)
    into v_duplicate_count
  from (
    select work_order_part_id, location_id
    from public.work_order_part_allocations
    where work_order_part_id is not null
    group by work_order_part_id, location_id
    having count(*) > 1
  ) duplicate_allocations;

  if v_duplicate_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_ALLOCATION_DUPLICATES_BLOCK_MIGRATION',
      detail = format(
        '%s duplicate work-order-part/location allocation group(s) require reconciliation.',
        v_duplicate_count
      );
  end if;
end
$$;

do $$
declare
  v_mismatch_count bigint;
  v_mismatch_sample jsonb;
begin
  select count(*)
    into v_mismatch_count
  from public.work_order_part_allocations allocation
  join public.work_order_parts work_order_part
    on work_order_part.id = allocation.work_order_part_id
  where work_order_part.shop_id is distinct from allocation.shop_id
     or work_order_part.work_order_id is distinct from allocation.work_order_id
     or work_order_part.work_order_line_id is distinct from
       allocation.work_order_line_id
     or work_order_part.part_id is distinct from allocation.part_id;

  if v_mismatch_count > 0 then
    select coalesce(jsonb_agg(to_jsonb(sample)), '[]'::jsonb)
      into v_mismatch_sample
    from (
      select
        allocation.id,
        allocation.work_order_part_id,
        allocation.shop_id as allocation_shop_id,
        work_order_part.shop_id as work_order_part_shop_id,
        allocation.work_order_id as allocation_work_order_id,
        work_order_part.work_order_id as work_order_part_work_order_id,
        allocation.work_order_line_id as allocation_line_id,
        work_order_part.work_order_line_id as work_order_part_line_id,
        allocation.part_id as allocation_part_id,
        work_order_part.part_id as work_order_part_part_id
      from public.work_order_part_allocations allocation
      join public.work_order_parts work_order_part
        on work_order_part.id = allocation.work_order_part_id
      where work_order_part.shop_id is distinct from allocation.shop_id
         or work_order_part.work_order_id is distinct from
           allocation.work_order_id
         or work_order_part.work_order_line_id is distinct from
           allocation.work_order_line_id
         or work_order_part.part_id is distinct from allocation.part_id
      order by allocation.created_at, allocation.id
      limit 10
    ) sample;

    raise exception using
      errcode = 'P0001',
      message = 'PARTS_ALLOCATION_SCOPE_MISMATCH_BLOCKS_MIGRATION',
      detail = format(
        '%s allocation(s) disagree with their work-order-part scope. Sample: %s',
        v_mismatch_count,
        v_mismatch_sample::text
      ),
      hint =
        'Reconcile the allocation and work-order-part lineage before applying this migration.';
  end if;
end
$$;

create unique index if not exists uq_wopa_work_order_part_location
  on public.work_order_part_allocations(work_order_part_id, location_id)
  where work_order_part_id is not null;

create unique index if not exists uq_wop_allocation_scope
  on public.work_order_parts(
    id,
    shop_id,
    work_order_id,
    work_order_line_id,
    part_id
  );

alter table public.work_order_part_allocations
  alter column work_order_id set not null,
  alter column work_order_part_id set not null;

alter table public.work_order_part_allocations
  drop constraint if exists
    work_order_part_allocations_work_order_part_id_fkey;
alter table public.work_order_part_allocations
  add constraint work_order_part_allocations_work_order_part_id_fkey
  foreign key (
    work_order_part_id,
    shop_id,
    work_order_id,
    work_order_line_id,
    part_id
  )
  references public.work_order_parts (
    id,
    shop_id,
    work_order_id,
    work_order_line_id,
    part_id
  )
  on delete cascade
  not valid;
alter table public.work_order_part_allocations
  validate constraint
    work_order_part_allocations_work_order_part_id_fkey;

-- These helpers existed only in the legacy manual SQL. Defining them in the
-- ordered migration chain makes lifecycle RPCs executable on a clean database.
create or replace function public.parts_lifecycle_assert_shop_access(
  p_shop_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
begin
  if p_shop_id is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_SHOP_SCOPE_REQUIRED';
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if v_actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_AUTHENTICATION_REQUIRED';
  end if;

  select lower(trim(coalesce(profile.role::text, '')))
    into v_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = v_actor_id or profile.user_id = v_actor_id)
  order by (profile.id = v_actor_id) desc
  limit 1;

  if v_role is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_SHOP_ACCESS_DENIED';
  end if;

  if v_role not in (
    'owner',
    'admin',
    'manager',
    'advisor',
    'service',
    'parts',
    'lead_hand',
    'leadhand',
    'lead hand',
    'lead',
    'foreman'
  ) then
    raise exception using
      errcode = '42501',
      message = 'PARTS_ROLE_ACCESS_DENIED';
  end if;
end;
$$;

create or replace function public.parts_lifecycle_assert_line_access(
  p_shop_id uuid,
  p_work_order_line_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_profile_id uuid;
  v_role text;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if v_actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_AUTHENTICATION_REQUIRED';
  end if;

  select
    profile.id,
    lower(trim(coalesce(profile.role::text, '')))
  into v_profile_id, v_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = v_actor_id or profile.user_id = v_actor_id)
  order by (profile.id = v_actor_id) desc
  limit 1;

  if v_role is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_SHOP_ACCESS_DENIED';
  end if;

  if v_role in (
    'owner',
    'admin',
    'manager',
    'advisor',
    'service',
    'parts',
    'lead_hand',
    'leadhand',
    'lead hand',
    'lead',
    'foreman'
  ) then
    return;
  end if;

  if v_role in ('mechanic', 'tech', 'technician')
     and exists (
       select 1
       from public.work_order_lines line
       where line.id = p_work_order_line_id
         and line.shop_id = p_shop_id
         and (
           line.assigned_tech_id = v_profile_id
           or line.assigned_tech_id = v_actor_id
           or line.assigned_to = v_profile_id
           or line.assigned_to = v_actor_id
           or exists (
             select 1
             from public.work_order_line_technicians assignment
             where assignment.work_order_line_id = line.id
               and assignment.technician_id in (
                 v_profile_id,
                 v_actor_id
               )
           )
         )
     ) then
    return;
  end if;

  raise exception using
    errcode = '42501',
    message = 'PARTS_LINE_ACCESS_DENIED';
end;
$$;

create or replace function public.parts_lifecycle_status(
  p_requested numeric,
  p_ordered numeric,
  p_received numeric,
  p_allocated numeric,
  p_consumed numeric,
  p_returned numeric,
  p_cancelled numeric
) returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_cancelled, 0) >= greatest(
      coalesce(p_requested, 0) - coalesce(p_consumed, 0),
      0
    ) and coalesce(p_consumed, 0) = 0 then 'cancelled'
    when coalesce(p_returned, 0) > 0
      and coalesce(p_returned, 0) < coalesce(p_consumed, 0)
      then 'partially_returned'
    when coalesce(p_returned, 0) > 0
      and coalesce(p_returned, 0) >= coalesce(p_consumed, 0)
      then 'returned'
    when coalesce(p_consumed, 0) > 0
      and coalesce(p_consumed, 0) < coalesce(p_requested, 0)
      then 'partially_consumed'
    when coalesce(p_consumed, 0) > 0
      and coalesce(p_consumed, 0) >= coalesce(p_requested, 0)
      then 'consumed'
    when coalesce(p_allocated, 0) > 0
      and coalesce(p_allocated, 0) < coalesce(p_requested, 0)
      then 'partially_allocated'
    when coalesce(p_allocated, 0) > 0
      and coalesce(p_allocated, 0) >= coalesce(p_requested, 0)
      then 'reserved'
    when coalesce(p_received, 0) > 0
      and coalesce(p_received, 0) < coalesce(p_ordered, p_requested, 0)
      then 'partially_received'
    when coalesce(p_received, 0) > 0 then 'received'
    when coalesce(p_ordered, 0) > 0
      and coalesce(p_ordered, 0) < coalesce(p_requested, 0)
      then 'partially_ordered'
    when coalesce(p_ordered, 0) > 0 then 'ordered'
    else 'requested'
  end;
$$;

create or replace function public.parts_on_hand(
  p_shop_id uuid,
  p_part_id uuid,
  p_location_id uuid default null
) returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(move.qty_change), 0)::numeric
  from public.stock_moves move
  where move.shop_id = p_shop_id
    and move.part_id = p_part_id
    and (p_location_id is null or move.location_id = p_location_id)
    and lower(move.reason::text) not in ('wo_allocate', 'wo_release');
$$;

create or replace function public.parts_allocated(
  p_shop_id uuid,
  p_part_id uuid,
  p_location_id uuid default null
) returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(allocation.qty), 0)::numeric
  from public.work_order_part_allocations allocation
  where allocation.shop_id = p_shop_id
    and allocation.part_id = p_part_id
    and (
      p_location_id is null
      or allocation.location_id = p_location_id
    );
$$;

create or replace function public.parts_available(
  p_shop_id uuid,
  p_part_id uuid,
  p_location_id uuid default null
) returns numeric
language sql
stable
set search_path = public
as $$
  select public.parts_on_hand(p_shop_id, p_part_id, p_location_id)
    - public.parts_allocated(p_shop_id, p_part_id, p_location_id);
$$;

create or replace function public.parts_reconcile_work_order_part(
  p_work_order_part_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.work_order_parts
  set lifecycle_status = public.parts_lifecycle_status(
        quantity_requested,
        quantity_ordered,
        quantity_received,
        quantity_allocated,
        quantity_consumed,
        quantity_returned,
        quantity_cancelled
      ),
      updated_at = now()
  where id = p_work_order_part_id;
end;
$$;

-- Harden the low-level issue primitive because authenticated clients can invoke
-- SECURITY DEFINER functions directly, bypassing application route checks.
create or replace function public.parts_issue_work_order_part(
  p_work_order_part_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wop public.work_order_parts%rowtype;
  v_location public.stock_locations%rowtype;
  v_existing public.stock_moves%rowtype;
  v_alloc public.work_order_part_allocations%rowtype;
  v_move_id uuid;
  v_item public.part_request_items%rowtype;
  v_net_issued numeric;
  v_status public.part_request_item_status;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Issue quantity must be greater than zero.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'A stable idempotency key is required.';
  end if;
  if length(trim(p_idempotency_key)) > 300 then
    raise exception 'Issue idempotency key is too long.';
  end if;

  select *
    into v_wop
  from public.work_order_parts
  where id = p_work_order_part_id
    and is_active
  for update;
  if not found then
    raise exception 'Active work-order part not found.';
  end if;

  if v_wop.work_order_line_id is null then
    perform public.parts_lifecycle_assert_shop_access(v_wop.shop_id);
  else
    perform public.parts_lifecycle_assert_line_access(
      v_wop.shop_id,
      v_wop.work_order_line_id
    );
  end if;

  if position(v_wop.shop_id::text || ':' in trim(p_idempotency_key)) <> 1 then
    raise exception 'Issue idempotency key must be tenant scoped.';
  end if;

  select *
    into v_location
  from public.stock_locations
  where id = p_location_id
    and shop_id = v_wop.shop_id
  for update;
  if not found then
    raise exception 'Inventory location is outside the work-order shop.';
  end if;

  select *
    into v_existing
  from public.stock_moves
  where shop_id = v_wop.shop_id
    and idempotency_key = trim(p_idempotency_key)
  for update;
  if found then
    if v_existing.work_order_part_id is distinct from v_wop.id
       or v_existing.part_id is distinct from v_wop.part_id
       or v_existing.location_id is distinct from p_location_id
       or lower(v_existing.reason::text) <> 'consume'
       or v_existing.qty_change is distinct from -p_qty
       or v_existing.lifecycle_quantity is distinct from p_qty then
      raise exception using
        errcode = 'P0001',
        message = 'PARTS_IDEMPOTENCY_KEY_CONFLICT';
    end if;

    return coalesce(v_existing.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'work_order_part_id', v_wop.id,
        'stock_move_id', v_existing.id,
        'issued_qty', p_qty
      );
  end if;

  perform public.parts_assert_work_order_mutable(
    v_wop.shop_id,
    v_wop.work_order_id
  );

  select *
    into v_alloc
  from public.work_order_part_allocations
  where work_order_part_id = v_wop.id
    and location_id = p_location_id
  for update;
  if not found or v_alloc.qty < p_qty then
    raise exception 'Allocation is insufficient for issue.';
  end if;
  if coalesce(v_wop.quantity_allocated, 0) < p_qty then
    raise exception 'Cannot issue more than allocated quantity.';
  end if;
  if public.parts_on_hand(
    v_wop.shop_id,
    v_wop.part_id,
    p_location_id
  ) < p_qty then
    raise exception 'Cannot issue more than physical on-hand quantity.';
  end if;

  if v_wop.source_parts_request_item_id is not null then
    select *
      into v_item
    from public.part_request_items
    where id = v_wop.source_parts_request_item_id
      and shop_id = v_wop.shop_id
    for update;
    if not found then
      raise exception 'Source request item is outside the work-order shop.';
    end if;
  end if;

  insert into public.stock_moves (
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by,
    shop_id,
    idempotency_key,
    work_order_part_id,
    part_request_item_id,
    metadata,
    lifecycle_quantity
  ) values (
    v_wop.part_id,
    p_location_id,
    -p_qty,
    'consume',
    'work_order_part',
    v_wop.id,
    auth.uid(),
    v_wop.shop_id,
    trim(p_idempotency_key),
    v_wop.id,
    v_wop.source_parts_request_item_id,
    jsonb_build_object('qty_issued', p_qty, 'operation', 'issue'),
    p_qty
  ) returning id into v_move_id;

  if v_alloc.qty = p_qty then
    delete from public.work_order_part_allocations
    where id = v_alloc.id;
  else
    update public.work_order_part_allocations
    set qty = v_alloc.qty - p_qty
    where id = v_alloc.id;
  end if;

  update public.work_order_parts
  set quantity_allocated = greatest(
        coalesce(quantity_allocated, 0) - p_qty,
        0
      ),
      quantity_consumed = coalesce(quantity_consumed, 0) + p_qty,
      updated_at = now()
  where id = v_wop.id;

  if v_wop.source_parts_request_item_id is not null then
    v_net_issued := coalesce(v_item.qty_consumed, 0)
      + p_qty
      - coalesce(v_item.qty_returned, 0);
    v_status := case
      when v_net_issued < greatest(
        coalesce(v_item.qty_requested, v_item.qty, 0),
        0
      ) then 'partially_consumed'::public.part_request_item_status
      else 'consumed'::public.part_request_item_status
    end;

    update public.part_request_items
    set qty_reserved = greatest(coalesce(qty_reserved, 0) - p_qty, 0),
        qty_consumed = coalesce(qty_consumed, 0) + p_qty,
        status = v_status,
        updated_at = now()
    where id = v_wop.source_parts_request_item_id;
  end if;

  perform public.parts_reconcile_work_order_part(v_wop.id);

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'work_order_part_id', v_wop.id,
    'stock_move_id', v_move_id,
    'issued_qty', p_qty,
    'net_issued_qty',
      coalesce(v_wop.quantity_consumed, 0)
        + p_qty
        - coalesce(v_wop.quantity_returned, 0),
    'on_hand_after', public.parts_on_hand(
      v_wop.shop_id,
      v_wop.part_id,
      p_location_id
    )
  );
end;
$$;

-- Canonical Add Part / Use Part command. PostgreSQL functions are atomic, so a
-- failure rolls back the WOP, allocation audit, allocation, counters, and issue.
create or replace function public.parts_attach_and_issue_line_part_atomic(
  p_work_order_line_id uuid,
  p_part_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_part public.parts%rowtype;
  v_location public.stock_locations%rowtype;
  v_wop public.work_order_parts%rowtype;
  v_existing public.stock_moves%rowtype;
  v_allocation_move_id uuid;
  v_allocation_id uuid;
  v_allocation_qty numeric;
  v_effective_cost numeric;
  v_sell_price numeric;
  v_result jsonb;
  v_existing_operation text;
  v_requested_cost_json jsonb :=
    coalesce(to_jsonb(p_unit_cost), 'null'::jsonb);
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Use Part quantity must be greater than zero.';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Use Part unit cost cannot be negative.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'A stable idempotency key is required.';
  end if;
  if length(trim(p_idempotency_key)) > 280 then
    raise exception 'Use Part idempotency key is too long.';
  end if;

  select *
    into v_line
  from public.work_order_lines
  where id = p_work_order_line_id
  for update;
  if not found or v_line.shop_id is null or v_line.work_order_id is null then
    raise exception 'Work-order line is missing its work order or shop.';
  end if;

  perform public.parts_lifecycle_assert_line_access(
    v_line.shop_id,
    v_line.id
  );

  if position(v_line.shop_id::text || ':' in trim(p_idempotency_key)) <> 1 then
    raise exception 'Use Part idempotency key must be tenant scoped.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(trim(p_idempotency_key), 0)
  );

  select *
    into v_existing
  from public.stock_moves
  where shop_id = v_line.shop_id
    and idempotency_key = trim(p_idempotency_key)
  for update;
  if found then
    v_existing_operation :=
      coalesce(v_existing.metadata ->> 'operation', '');

    if v_existing.part_id is distinct from p_part_id
       or v_existing.location_id is distinct from p_location_id
       or lower(v_existing.reason::text) <> 'consume'
       or v_existing.qty_change is distinct from -p_qty
       or v_existing.lifecycle_quantity is distinct from p_qty
       or not exists (
         select 1
         from public.work_order_parts existing_wop
         where existing_wop.id = v_existing.work_order_part_id
           and existing_wop.shop_id = v_line.shop_id
           and existing_wop.work_order_id = v_line.work_order_id
           and existing_wop.work_order_line_id = v_line.id
           and existing_wop.part_id = p_part_id
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'PARTS_IDEMPOTENCY_KEY_CONFLICT';
    end if;

    if v_existing_operation = 'attach_and_issue_line_part' then
      if coalesce(v_existing.metadata ->> 'work_order_line_id', '') <>
           v_line.id::text
         or coalesce(
           v_existing.metadata -> 'requested_unit_cost',
           'null'::jsonb
         ) is distinct from v_requested_cost_json then
        raise exception using
          errcode = 'P0001',
          message = 'PARTS_IDEMPOTENCY_KEY_CONFLICT';
      end if;
    elsif v_existing_operation = 'issue'
      and position(
        v_line.shop_id::text
          || ':issue:'
          || v_line.shop_id::text
          || ':legacy-consume:'
        in trim(p_idempotency_key)
      ) = 1
      and p_unit_cost is null then
      return coalesce(v_existing.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'ok', true,
          'idempotent', true,
          'operation', 'legacy_issue_replay',
          'work_order_id', v_line.work_order_id,
          'work_order_line_id', v_line.id,
          'work_order_part_id', v_existing.work_order_part_id,
          'stock_move_id', v_existing.id,
          'issued_qty', p_qty
        );
    else
      raise exception using
        errcode = 'P0001',
        message = 'PARTS_IDEMPOTENCY_KEY_CONFLICT';
    end if;

    return coalesce(v_existing.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'work_order_part_id', v_existing.work_order_part_id,
        'stock_move_id', v_existing.id,
        'issued_qty', p_qty
      );
  end if;

  perform public.parts_assert_work_order_mutable(
    v_line.shop_id,
    v_line.work_order_id
  );

  select *
    into v_part
  from public.parts
  where id = p_part_id
    and shop_id = v_line.shop_id
  for share;
  if not found then
    raise exception 'Inventory part is outside the work-order shop.';
  end if;

  select *
    into v_location
  from public.stock_locations
  where id = p_location_id
    and shop_id = v_line.shop_id
  for update;
  if not found then
    raise exception 'Inventory location is outside the work-order shop.';
  end if;

  if public.parts_available(
    v_line.shop_id,
    p_part_id,
    p_location_id
  ) < p_qty then
    raise exception 'Insufficient available stock.';
  end if;

  v_effective_cost := coalesce(
    p_unit_cost,
    v_part.default_cost,
    v_part.cost,
    0
  );
  v_sell_price := coalesce(v_part.price, v_part.default_price, 0);

  select *
    into v_wop
  from public.work_order_parts
  where shop_id = v_line.shop_id
    and work_order_id = v_line.work_order_id
    and work_order_line_id = v_line.id
    and part_id = p_part_id
    and source_parts_request_item_id is null
    and is_active
  order by updated_at desc, id desc
  limit 1
  for update;

  if found then
    update public.work_order_parts
    set quantity = quantity + p_qty,
        quantity_requested = coalesce(quantity_requested, 0) + p_qty,
        quantity_received = coalesce(quantity_received, 0) + p_qty,
        unit_price = coalesce(unit_price, v_sell_price),
        total_price = round(
          (coalesce(quantity_requested, 0) + p_qty)
            * coalesce(unit_sell_price_snapshot, unit_price, v_sell_price, 0),
          2
        ),
        unit_cost_snapshot = coalesce(
          unit_cost_snapshot,
          v_effective_cost
        ),
        unit_sell_price_snapshot = coalesce(
          unit_sell_price_snapshot,
          v_sell_price
        ),
        updated_at = now()
    where id = v_wop.id
    returning * into v_wop;
  else
    insert into public.work_order_parts (
      work_order_id,
      work_order_line_id,
      shop_id,
      part_id,
      quantity,
      unit_price,
      total_price,
      description_snapshot,
      manufacturer_snapshot,
      supplier_snapshot,
      vendor_snapshot,
      part_number_snapshot,
      sku_snapshot,
      quantity_requested,
      quantity_received,
      quantity_allocated,
      quantity_consumed,
      quantity_returned,
      quantity_cancelled,
      unit_cost_snapshot,
      unit_sell_price_snapshot,
      lifecycle_status,
      updated_at,
      is_active
    ) values (
      v_line.work_order_id,
      v_line.id,
      v_line.shop_id,
      p_part_id,
      p_qty,
      v_sell_price,
      round(p_qty * v_sell_price, 2),
      coalesce(nullif(trim(v_part.name), ''), 'Part'),
      nullif(trim(v_part.manufacturer), ''),
      nullif(trim(v_part.supplier), ''),
      null,
      nullif(trim(v_part.part_number), ''),
      nullif(trim(v_part.sku), ''),
      p_qty,
      p_qty,
      0,
      0,
      0,
      0,
      v_effective_cost,
      v_sell_price,
      'received',
      now(),
      true
    ) returning * into v_wop;
  end if;

  insert into public.stock_moves (
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by,
    shop_id,
    idempotency_key,
    work_order_part_id,
    metadata,
    lifecycle_quantity
  ) values (
    p_part_id,
    p_location_id,
    0,
    'wo_allocate',
    'work_order_part',
    v_wop.id,
    auth.uid(),
    v_line.shop_id,
    trim(p_idempotency_key) || ':allocate',
    v_wop.id,
    jsonb_build_object(
      'operation', 'allocate_for_direct_use',
      'qty_reserved', p_qty,
      'work_order_line_id', v_line.id,
      'requested_unit_cost', v_requested_cost_json,
      'effective_unit_cost', v_effective_cost
    ),
    p_qty
  ) returning id into v_allocation_move_id;

  insert into public.work_order_part_allocations (
    work_order_line_id,
    work_order_id,
    shop_id,
    part_id,
    location_id,
    qty,
    unit_cost,
    stock_move_id,
    source_request_item_id,
    work_order_part_id
  ) values (
    v_line.id,
    v_line.work_order_id,
    v_line.shop_id,
    p_part_id,
    p_location_id,
    p_qty,
    v_effective_cost,
    v_allocation_move_id,
    null,
    v_wop.id
  )
  on conflict (work_order_part_id, location_id)
    where work_order_part_id is not null
  do update set
    qty = public.work_order_part_allocations.qty + excluded.qty,
    unit_cost = excluded.unit_cost,
    stock_move_id = excluded.stock_move_id
  returning id, qty into v_allocation_id, v_allocation_qty;

  update public.work_order_parts
  set quantity_allocated = coalesce(quantity_allocated, 0) + p_qty,
      updated_at = now()
  where id = v_wop.id;

  update public.stock_moves
  set metadata = metadata || jsonb_build_object(
    'allocation_id', v_allocation_id,
    'allocation_qty_after', v_allocation_qty
  )
  where id = v_allocation_move_id;

  v_result := public.parts_issue_work_order_part(
    v_wop.id,
    p_location_id,
    p_qty,
    trim(p_idempotency_key)
  );

  v_result := v_result || jsonb_build_object(
    'operation', 'attach_and_issue_line_part',
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', v_line.id,
    'part_id', p_part_id,
    'location_id', p_location_id,
    'requested_unit_cost', v_requested_cost_json,
    'effective_unit_cost', v_effective_cost,
    'allocation_id', v_allocation_id,
    'allocation_stock_move_id', v_allocation_move_id
  );

  update public.stock_moves
  set metadata = coalesce(metadata, '{}'::jsonb) || v_result
  where id = (v_result ->> 'stock_move_id')::uuid;

  return v_result;
end;
$$;

-- Keep the legacy route signature as a thin compatibility delegate so every
-- direct line/part issue executes the same canonical transaction.
create or replace function public.parts_issue_by_line_part_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_part_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_operation_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
begin
  select *
    into v_line
  from public.work_order_lines
  where id = p_work_order_line_id
  for update;
  if not found or v_line.shop_id is distinct from p_shop_id then
    raise exception 'Work-order line not found for shop.';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_actor_user_id then
    raise exception using
      errcode = '42501',
      message = 'PARTS_ACTOR_MISMATCH';
  end if;
  if position(p_shop_id::text || ':' in trim(p_operation_key)) <> 1 then
    raise exception 'Operation key must be tenant scoped with the shop id prefix.';
  end if;

  return public.parts_attach_and_issue_line_part_atomic(
    p_work_order_line_id,
    p_part_id,
    p_location_id,
    p_qty,
    null,
    p_shop_id::text || ':issue:' || trim(p_operation_key)
  );
end;
$$;

revoke all on function public.parts_lifecycle_assert_shop_access(uuid)
  from public, anon, authenticated;
revoke all on function public.parts_lifecycle_assert_line_access(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.parts_reconcile_work_order_part(uuid)
  from public, anon, authenticated;

revoke all on function public.parts_on_hand(uuid,uuid,uuid)
  from public, anon;
revoke all on function public.parts_allocated(uuid,uuid,uuid)
  from public, anon;
revoke all on function public.parts_available(uuid,uuid,uuid)
  from public, anon;
grant execute on function public.parts_on_hand(uuid,uuid,uuid)
  to authenticated, service_role;
grant execute on function public.parts_allocated(uuid,uuid,uuid)
  to authenticated, service_role;
grant execute on function public.parts_available(uuid,uuid,uuid)
  to authenticated, service_role;

revoke all on function public.parts_issue_work_order_part(
  uuid,
  uuid,
  numeric,
  text
) from public, anon;
grant execute on function public.parts_issue_work_order_part(
  uuid,
  uuid,
  numeric,
  text
) to authenticated, service_role;

revoke all on function public.parts_attach_and_issue_line_part_atomic(
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  text
) from public, anon;
grant execute on function public.parts_attach_and_issue_line_part_atomic(
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  text
) to authenticated, service_role;

revoke all on function public.parts_issue_by_line_part_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  uuid
) from public, anon;
grant execute on function public.parts_issue_by_line_part_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
