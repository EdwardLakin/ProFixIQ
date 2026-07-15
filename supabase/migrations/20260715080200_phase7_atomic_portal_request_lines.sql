begin;

create or replace function public.add_portal_request_line_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_line_kind text,
  p_source_id uuid,
  p_description text,
  p_notes text,
  p_line_type text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(trim(coalesce(p_line_kind, '')));
  v_now timestamptz := coalesce(p_at, now());
  v_work_order public.work_orders%rowtype;
  v_customer public.customers%rowtype;
  v_menu public.menu_items%rowtype;
  v_template public.inspection_templates%rowtype;
  v_existing jsonb;
  v_line public.work_order_lines%rowtype;
  v_parts jsonb := '[]'::jsonb;
  v_description text;
  v_line_type text;
begin
  if v_kind not in ('custom','menu','inspection') then
    raise exception using errcode = 'P0001', message = 'Unsupported portal request line kind.';
  end if;
  if p_actor_user_id is null or nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'Authenticated actor and stable operation key are required.';
  end if;

  select result into v_existing
  from public.portal_lifecycle_operation_keys
  where operation_name = 'portal_request_line_' || v_kind
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;
  if not found or v_customer.user_id is distinct from p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
    and customer_id = p_customer_id
    and shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order is not owned by this portal customer.';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: portal request lines cannot change this work order.';
  end if;

  if lower(coalesce(v_work_order.status::text, '')) in ('cancelled','canceled','closed','invoiced') then
    raise exception using errcode = 'P0001', message = 'Work order no longer accepts portal request lines.';
  end if;

  if v_kind = 'custom' then
    v_description := nullif(trim(coalesce(p_description, '')), '');
    if v_description is null then
      raise exception using errcode = 'P0001', message = 'Custom request description is required.';
    end if;
    v_line_type := case when lower(trim(coalesce(p_line_type, ''))) = 'info' then 'info' else 'job' end;

    insert into public.work_order_lines(
      work_order_id, shop_id, vehicle_id, complaint, notes, status,
      approval_state, line_type, punchable, labor_time, price_estimate,
      external_id, created_at
    ) values (
      v_work_order.id, v_work_order.shop_id, v_work_order.vehicle_id,
      v_description, nullif(trim(coalesce(p_notes, '')), ''),
      'awaiting_approval', 'pending', v_line_type,
      case when v_line_type = 'info' then false else null end,
      null, null, 'portal_request:' || p_operation_key, v_now
    ) returning * into v_line;

  elsif v_kind = 'menu' then
    select * into v_menu
    from public.menu_items
    where id = p_source_id and shop_id = p_shop_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'Menu item not found for this shop.';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'name', trim(coalesce(mip.name, '')),
      'qty', coalesce(mip.quantity, 1),
      'unitCost', mip.unit_cost
    )) filter (where nullif(trim(coalesce(mip.name, '')), '') is not null), '[]'::jsonb)
    into v_parts
    from public.menu_item_parts mip
    where mip.menu_item_id = v_menu.id;

    v_description := coalesce(
      nullif(trim(v_menu.description), ''),
      nullif(trim(v_menu.complaint), ''),
      'Service'
    );

    insert into public.work_order_lines(
      work_order_id, shop_id, vehicle_id, menu_item_id, complaint,
      labor_time, price_estimate, status, approval_state, parts_needed,
      external_id, created_at
    ) values (
      v_work_order.id, v_work_order.shop_id, v_work_order.vehicle_id,
      v_menu.id, v_description,
      coalesce(v_menu.labor_hours, v_menu.base_labor_hours),
      coalesce(v_menu.total_price, v_menu.base_price),
      'awaiting_approval', 'pending', v_parts,
      'portal_request:' || p_operation_key, v_now
    ) returning * into v_line;

  else
    select * into v_template
    from public.inspection_templates
    where id = p_source_id and shop_id = p_shop_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'Inspection template not found for this shop.';
    end if;
    if v_template.is_active is false then
      raise exception using errcode = 'P0001', message = 'Inspection template is inactive.';
    end if;

    v_description := coalesce(
      nullif(trim(v_template.name), ''),
      nullif(trim(v_template.title), ''),
      nullif(trim(v_template.description), ''),
      'Inspection'
    );

    insert into public.work_order_lines(
      work_order_id, shop_id, vehicle_id, job_type, description,
      status, line_status, approval_state, inspection_template_id,
      external_id, created_at
    ) values (
      v_work_order.id, v_work_order.shop_id, v_work_order.vehicle_id,
      'inspection', v_description, 'awaiting_approval', 'pending', 'pending',
      v_template.id, 'portal_request:' || p_operation_key, v_now
    ) returning * into v_line;
  end if;

  v_existing := jsonb_build_object(
    'ok', true,
    'line', to_jsonb(v_line),
    'kind', v_kind,
    'idempotent', false
  );

  insert into public.portal_lifecycle_operation_keys(
    operation_name, operation_key, actor_user_id, customer_id, shop_id, result
  ) values (
    'portal_request_line_' || v_kind, p_operation_key, p_actor_user_id,
    p_customer_id, p_shop_id, v_existing
  ) on conflict (operation_name, operation_key) do nothing;

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id, 'portal_request_line_' || v_kind, 'work_order_lines', v_line.id,
    jsonb_build_object('work_order_id', p_work_order_id, 'operation_key', p_operation_key)
  );

  return v_existing;
end;
$$;

revoke all on function public.add_portal_request_line_atomic(uuid, uuid, uuid, uuid, text, uuid, text, text, text, text, timestamptz) from public;
grant execute on function public.add_portal_request_line_atomic(uuid, uuid, uuid, uuid, text, uuid, text, text, text, text, timestamptz) to authenticated, service_role;

commit;
