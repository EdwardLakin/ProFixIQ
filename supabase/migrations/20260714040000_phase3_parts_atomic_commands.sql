begin;

create table if not exists public.parts_operation_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  operation_key text not null,
  operation_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  result jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (shop_id, operation_key)
);

create index if not exists parts_operation_keys_aggregate_idx
  on public.parts_operation_keys(shop_id, aggregate_type, aggregate_id, created_at desc);

alter table public.parts_operation_keys enable row level security;

create policy parts_operation_keys_shop_select
  on public.parts_operation_keys
  for select
  to authenticated
  using (
    shop_id = nullif(current_setting('app.current_shop_id', true), '')::uuid
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.shop_id = parts_operation_keys.shop_id
    )
  );

create or replace function public.parts_assert_work_order_mutable(
  p_shop_id uuid,
  p_work_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_FINANCIALLY_LOCKED',
      detail = format('Quantity-changing parts operation is blocked for finalized work order %s', p_work_order_id),
      hint = 'Use an audited Phase 2 correction session before changing finalized parts quantities.';
  end if;
end;
$$;

create or replace function public.parts_begin_operation(
  p_shop_id uuid,
  p_operation_key text,
  p_operation_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_actor_user_id uuid
) returns public.parts_operation_keys
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.parts_operation_keys;
begin
  if coalesce(trim(p_operation_key), '') = '' then
    raise exception 'A stable operation key is required.';
  end if;
  if position(p_shop_id::text || ':' in p_operation_key) <> 1 then
    raise exception 'Operation key must be tenant scoped with the shop id prefix.';
  end if;

  select * into v_operation
  from public.parts_operation_keys
  where shop_id = p_shop_id and operation_key = p_operation_key
  for update;

  if found then
    if v_operation.operation_type <> p_operation_type
       or v_operation.aggregate_type <> p_aggregate_type
       or v_operation.aggregate_id <> p_aggregate_id then
      raise exception 'Operation key is already used for a different parts operation.';
    end if;
    return v_operation;
  end if;

  insert into public.parts_operation_keys(
    shop_id, operation_key, operation_type, aggregate_type, aggregate_id, created_by
  ) values (
    p_shop_id, trim(p_operation_key), p_operation_type, p_aggregate_type, p_aggregate_id, p_actor_user_id
  ) returning * into v_operation;

  return v_operation;
end;
$$;

create or replace function public.parts_complete_operation(
  p_operation_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.parts_operation_keys
  set result = coalesce(p_result, '{}'::jsonb), completed_at = coalesce(completed_at, now())
  where id = p_operation_id;
  return coalesce(p_result, '{}'::jsonb);
end;
$$;

create or replace function public.parts_commit_request_package_atomic(
  p_shop_id uuid,
  p_request_id uuid,
  p_operation_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.part_requests%rowtype;
  v_operation public.parts_operation_keys;
  v_item public.part_request_items%rowtype;
  v_line record;
  v_part record;
  v_work_order_part_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_qty numeric;
begin
  v_operation := public.parts_begin_operation(
    p_shop_id,
    p_operation_key,
    'commit_request_package',
    'part_request',
    p_request_id,
    p_actor_user_id
  );
  if v_operation.completed_at is not null then
    return coalesce(v_operation.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  select * into v_request
  from public.part_requests
  where id = p_request_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Parts request not found for shop.'; end if;
  if v_request.work_order_id is null then raise exception 'Parts request is not linked to a work order.'; end if;

  perform 1 from public.work_orders
  where id = v_request.work_order_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Work order not found for shop.'; end if;
  perform public.parts_assert_work_order_mutable(p_shop_id, v_request.work_order_id);

  -- Lock the complete package before validation or attachment.
  perform 1 from public.part_request_items
  where request_id = p_request_id and shop_id = p_shop_id
  order by id
  for update;

  if not exists (
    select 1 from public.part_request_items
    where request_id = p_request_id and shop_id = p_shop_id
  ) then
    raise exception 'Parts request contains no items.';
  end if;

  -- Validate every item before creating any work-order part.
  for v_item in
    select * from public.part_request_items
    where request_id = p_request_id and shop_id = p_shop_id
    order by id
  loop
    if v_item.part_id is null then raise exception 'Request item % has no selected inventory part.', v_item.id; end if;
    if v_item.work_order_line_id is null then raise exception 'Request item % is not linked to a repair line.', v_item.id; end if;
    if v_item.work_order_id is not null and v_item.work_order_id <> v_request.work_order_id then
      raise exception 'Request item % belongs to a different work order.', v_item.id;
    end if;
    v_qty := greatest(coalesce(v_item.qty_requested, v_item.qty, 0), 0);
    if v_qty <= 0 then raise exception 'Request item % quantity must be greater than zero.', v_item.id; end if;
    if coalesce(trim(v_item.description), '') = '' then raise exception 'Request item % requires a description.', v_item.id; end if;

    select id, work_order_id, shop_id into v_line
    from public.work_order_lines
    where id = v_item.work_order_line_id
    for update;
    if not found or v_line.shop_id <> p_shop_id or v_line.work_order_id <> v_request.work_order_id then
      raise exception 'Request item % repair line is outside the request work order/shop.', v_item.id;
    end if;

    select id, shop_id into v_part
    from public.parts
    where id = v_item.part_id
    for share;
    if not found or v_part.shop_id <> p_shop_id then
      raise exception 'Request item % selected part belongs to another shop.', v_item.id;
    end if;
  end loop;

  for v_item in
    select * from public.part_request_items
    where request_id = p_request_id and shop_id = p_shop_id
    order by id
  loop
    v_work_order_part_id := public.parts_ensure_work_order_part(v_item.id);
    v_ids := v_ids || jsonb_build_array(jsonb_build_object(
      'requestItemId', v_item.id,
      'workOrderPartId', v_work_order_part_id
    ));
    v_count := v_count + 1;
  end loop;

  return public.parts_complete_operation(
    v_operation.id,
    jsonb_build_object(
      'ok', true,
      'idempotent', false,
      'requestId', p_request_id,
      'committedCount', v_count,
      'items', v_ids
    )
  );
end;
$$;

create or replace function public.parts_update_attach_allocate_item_atomic(
  p_shop_id uuid,
  p_request_item_id uuid,
  p_part_id uuid,
  p_description text,
  p_qty numeric,
  p_unit_sell_price numeric,
  p_requested_part_number text,
  p_requested_manufacturer text,
  p_work_order_line_id uuid,
  p_po_id uuid,
  p_location_id uuid,
  p_create_allocation boolean,
  p_warning_accepted boolean,
  p_warning_reason text,
  p_operation_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.parts_operation_keys;
  v_item public.part_request_items%rowtype;
  v_request public.part_requests%rowtype;
  v_part public.parts%rowtype;
  v_line public.work_order_lines%rowtype;
  v_wop_id uuid;
  v_allocation jsonb;
  v_result jsonb;
begin
  if p_qty <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
  if p_unit_sell_price < 0 then raise exception 'Sell price cannot be negative.'; end if;
  if p_part_id is null then raise exception 'A selected inventory part is required.'; end if;
  if p_work_order_line_id is null then raise exception 'A work-order line is required.'; end if;
  if p_create_allocation and p_location_id is null then raise exception 'A location is required when allocating stock.'; end if;

  v_operation := public.parts_begin_operation(
    p_shop_id,
    p_operation_key,
    'update_attach_allocate_item',
    'part_request_item',
    p_request_item_id,
    p_actor_user_id
  );
  if v_operation.completed_at is not null then
    return coalesce(v_operation.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  select * into v_item from public.part_request_items
  where id = p_request_item_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Request item not found for shop.'; end if;

  select * into v_request from public.part_requests
  where id = v_item.request_id and shop_id = p_shop_id
  for update;
  if not found or v_request.work_order_id is null then raise exception 'Parent request is not linked to a work order.'; end if;

  perform 1 from public.work_orders
  where id = v_request.work_order_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Work order not found for shop.'; end if;
  perform public.parts_assert_work_order_mutable(p_shop_id, v_request.work_order_id);

  select * into v_line from public.work_order_lines
  where id = p_work_order_line_id and work_order_id = v_request.work_order_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Work-order line is outside the request work order/shop.'; end if;

  select * into v_part from public.parts
  where id = p_part_id and shop_id = p_shop_id
  for share;
  if not found then raise exception 'Selected part is outside the shop.'; end if;

  if p_po_id is not null then
    perform 1 from public.purchase_orders
    where id = p_po_id and shop_id = p_shop_id
    for update;
    if not found then raise exception 'Purchase order is outside the shop.'; end if;
  end if;

  update public.part_request_items
  set part_id = p_part_id,
      description = coalesce(nullif(trim(p_description), ''), description, v_part.name, 'Part'),
      qty = p_qty,
      qty_requested = p_qty,
      quoted_price = p_unit_sell_price,
      unit_price = p_unit_sell_price,
      requested_part_number = nullif(trim(p_requested_part_number), ''),
      requested_manufacturer = nullif(trim(p_requested_manufacturer), ''),
      work_order_id = v_request.work_order_id,
      work_order_line_id = p_work_order_line_id,
      po_id = p_po_id,
      updated_at = now()
  where id = p_request_item_id and shop_id = p_shop_id;

  v_wop_id := public.parts_ensure_work_order_part(p_request_item_id);

  if p_create_allocation then
    v_allocation := public.parts_allocate_request_item(
      p_request_item_id,
      p_location_id,
      p_qty,
      p_shop_id::text || ':allocate:' || trim(p_operation_key)
    );
  end if;

  if p_warning_accepted then
    if coalesce(trim(p_warning_reason), '') = '' then
      raise exception 'Mismatch acknowledgement reason is required.';
    end if;
    update public.work_order_parts
    set mismatch_acknowledged_at = now(),
        mismatch_acknowledged_by = p_actor_user_id,
        mismatch_warning_reason = trim(p_warning_reason),
        updated_at = now()
    where id = v_wop_id and shop_id = p_shop_id;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'requestItemId', p_request_item_id,
    'workOrderPartId', v_wop_id,
    'allocation', v_allocation
  );
  return public.parts_complete_operation(v_operation.id, v_result);
end;
$$;

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
  v_wop public.work_order_parts%rowtype;
  v_key text;
begin
  if p_qty <= 0 then raise exception 'Issue quantity must be greater than zero.'; end if;
  if coalesce(trim(p_operation_key), '') = '' then raise exception 'A stable operation key is required.'; end if;
  if position(p_shop_id::text || ':' in p_operation_key) <> 1 then
    raise exception 'Operation key must be tenant scoped with the shop id prefix.';
  end if;

  select * into v_line from public.work_order_lines
  where id = p_work_order_line_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Work-order line not found for shop.'; end if;
  perform public.parts_assert_work_order_mutable(p_shop_id, v_line.work_order_id);

  select * into v_wop
  from public.work_order_parts
  where shop_id = p_shop_id
    and work_order_id = v_line.work_order_id
    and work_order_line_id = p_work_order_line_id
    and part_id = p_part_id
    and is_active
  order by updated_at desc, id desc
  limit 1
  for update;
  if not found then raise exception 'No active canonical work-order part exists for this line and part.'; end if;

  v_key := p_shop_id::text || ':issue:' || trim(p_operation_key);
  return public.parts_issue_work_order_part(v_wop.id, p_location_id, p_qty, v_key);
end;
$$;

revoke all on function public.parts_assert_work_order_mutable(uuid,uuid) from public;
revoke all on function public.parts_begin_operation(uuid,text,text,text,uuid,uuid) from public;
revoke all on function public.parts_complete_operation(uuid,jsonb) from public;
revoke all on function public.parts_commit_request_package_atomic(uuid,uuid,text,uuid) from public;
revoke all on function public.parts_update_attach_allocate_item_atomic(uuid,uuid,uuid,text,numeric,numeric,text,text,uuid,uuid,uuid,boolean,boolean,text,text,uuid) from public;
revoke all on function public.parts_issue_by_line_part_atomic(uuid,uuid,uuid,uuid,numeric,text,uuid) from public;

grant execute on function public.parts_commit_request_package_atomic(uuid,uuid,text,uuid) to authenticated, service_role;
grant execute on function public.parts_update_attach_allocate_item_atomic(uuid,uuid,uuid,text,numeric,numeric,text,text,uuid,uuid,uuid,boolean,boolean,text,text,uuid) to authenticated, service_role;
grant execute on function public.parts_issue_by_line_part_atomic(uuid,uuid,uuid,uuid,numeric,text,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
