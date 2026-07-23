begin;

create unique index if not exists work_orders_portal_quote_source_row_id_unique
  on public.work_orders (source_row_id)
  where source_row_id is not null
    and source_row_id like 'portal_quote:%';

create or replace function public.create_portal_quote_request_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_request_kind text,
  p_description text,
  p_notes text,
  p_qty numeric,
  p_fulfillment text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(trim(coalesce(p_request_kind, '')));
  v_fulfillment text := lower(trim(coalesce(p_fulfillment, '')));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_operation_key text := nullif(trim(coalesce(p_operation_key, '')), '');
  v_qty numeric := greatest(1, least(99, coalesce(p_qty, 1)));
  v_now timestamptz := coalesce(p_at, now());
  v_customer public.customers%rowtype;
  v_work_order public.work_orders%rowtype;
  v_quote_line public.work_order_quote_lines%rowtype;
  v_part_request public.part_requests%rowtype;
  v_existing jsonb;
  v_result jsonb;
begin
  if v_kind not in ('repair', 'parts_only') then
    raise exception using errcode = 'P0001', message = 'Quote request kind must be repair or parts_only.';
  end if;
  if v_description is null then
    raise exception using errcode = 'P0001', message = 'Quote request description is required.';
  end if;
  if p_actor_user_id is null or auth.uid() is distinct from p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
  end if;
  if v_operation_key is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if v_kind = 'parts_only' then
    v_fulfillment := 'pickup';
  else
    v_fulfillment := 'appointment';
  end if;

  select result into v_existing
  from public.portal_lifecycle_operation_keys
  where operation_name = 'portal_quote_request'
    and operation_key = v_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
    and shop_id = p_shop_id
  for update;
  if not found or v_customer.user_id is distinct from p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
  end if;

  if p_vehicle_id is null or not exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.customer_id = p_customer_id
      and v.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Vehicle does not belong to this customer and shop.';
  end if;

  if p_work_order_id is not null then
    select * into v_work_order
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.customer_id = p_customer_id
      and wo.shop_id = p_shop_id
      and wo.vehicle_id = p_vehicle_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Work order is not owned by this portal customer.';
    end if;
    if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
      raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: quote requests cannot change this work order.';
    end if;
  else
    insert into public.work_orders (
      shop_id, customer_id, vehicle_id, status, approval_state,
      source_row_id, notes, created_at
    ) values (
      p_shop_id, p_customer_id, p_vehicle_id, 'new', null,
      'portal_quote:' || p_customer_id::text || ':' || v_operation_key,
      'Customer portal quote request', v_now
    ) returning * into v_work_order;
  end if;

  insert into public.work_order_quote_lines (
    shop_id, work_order_id, work_order_line_id, vehicle_id,
    description, notes, stage, status, job_type, qty,
    external_id, metadata, created_by, created_at, updated_at
  ) values (
    p_shop_id, v_work_order.id, null, p_vehicle_id,
    v_description, nullif(trim(coalesce(p_notes, '')), ''),
    'advisor_pending', case when v_kind = 'parts_only' then 'pending_parts' else 'draft' end,
    'customer_request', v_qty,
    'portal_quote:' || v_operation_key,
    jsonb_build_object(
      'source', 'portal',
      'line_kind', 'quote_only',
      'request_kind', v_kind,
      'fulfillment', v_fulfillment,
      'requested_qty', v_qty,
      'customer_request', true
    ),
    p_actor_user_id, v_now, v_now
  ) returning * into v_quote_line;

  if v_kind = 'parts_only' then
    insert into public.part_requests (
      shop_id, work_order_id, job_id, quote_line_id,
      requested_by, status, notes, created_at
    ) values (
      p_shop_id, v_work_order.id, null, v_quote_line.id,
      p_actor_user_id, 'requested',
      concat_ws(E'\n', 'Customer portal parts-only quote for pickup', nullif(trim(coalesce(p_notes, '')), '')),
      v_now
    ) returning * into v_part_request;

    insert into public.part_request_items (
      request_id, shop_id, work_order_id, work_order_line_id, quote_line_id,
      description, qty, qty_requested, qty_approved, status, approved
    ) values (
      v_part_request.id, p_shop_id, v_work_order.id, null, v_quote_line.id,
      v_description, v_qty, v_qty, 0, 'requested', false
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', v_work_order.id,
    'quoteLineId', v_quote_line.id,
    'partRequestId', case when v_kind = 'parts_only' then v_part_request.id else null end,
    'requestKind', v_kind,
    'idempotent', false
  );

  insert into public.portal_lifecycle_operation_keys (
    operation_name, operation_key, actor_user_id, customer_id, shop_id, result
  ) values (
    'portal_quote_request', v_operation_key, p_actor_user_id,
    p_customer_id, p_shop_id, v_result
  ) on conflict (operation_name, operation_key) do nothing;

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id, 'portal_quote_request', 'work_order_quote_lines', v_quote_line.id,
    jsonb_build_object(
      'work_order_id', v_work_order.id,
      'request_kind', v_kind,
      'fulfillment', v_fulfillment,
      'operation_key', v_operation_key
    )
  );

  return v_result;
end;
$$;

revoke all on function public.create_portal_quote_request_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, text, timestamptz
) from public, anon;
grant execute on function public.create_portal_quote_request_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, text, timestamptz
) to authenticated, service_role;

create or replace function public.book_portal_repair_quote_atomic(
  p_quote_line_id uuid,
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_visit_type text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit_type text := lower(trim(coalesce(p_visit_type, '')));
  v_operation_key text := nullif(trim(coalesce(p_operation_key, '')), '');
  v_now timestamptz := coalesce(p_at, now());
  v_customer public.customers%rowtype;
  v_quote_line public.work_order_quote_lines%rowtype;
  v_work_order public.work_orders%rowtype;
  v_booking public.bookings%rowtype;
  v_existing jsonb;
  v_result jsonb;
begin
  if v_visit_type not in ('waiter', 'drop_off') then
    raise exception using errcode = 'P0001', message = 'Visit type must be waiter or drop_off.';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception using errcode = 'P0001', message = 'Invalid booking window.';
  end if;
  if p_actor_user_id is null or auth.uid() is distinct from p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
  end if;
  if v_operation_key is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select result into v_existing
  from public.portal_lifecycle_operation_keys
  where operation_name = 'portal_repair_quote_booking'
    and operation_key = v_operation_key;
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

  select * into v_quote_line
  from public.work_order_quote_lines q
  where q.id = p_quote_line_id
    and q.shop_id = v_customer.shop_id
    and coalesce(q.metadata->>'request_kind', '') = 'repair'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Repair quote was not found for this customer.';
  end if;

  select * into v_work_order
  from public.work_orders wo
  where wo.id = v_quote_line.work_order_id
    and wo.customer_id = p_customer_id
    and wo.shop_id = v_customer.shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Quote work order is not owned by this portal customer.';
  end if;
  if v_quote_line.approved_at is null and v_quote_line.work_order_line_id is null then
    raise exception using errcode = 'P0001', message = 'Approve this repair quote before booking it.';
  end if;

  select * into v_booking
  from public.bookings b
  where b.work_order_id = v_work_order.id
    and lower(coalesce(b.status::text, '')) not in ('cancelled', 'canceled')
  order by b.created_at desc
  limit 1;
  if found then
    v_result := jsonb_build_object(
      'ok', true,
      'workOrderId', v_work_order.id,
      'bookingId', v_booking.id,
      'idempotent', true
    );
    return v_result;
  end if;

  insert into public.bookings (
    shop_id, customer_id, vehicle_id, work_order_id,
    starts_at, ends_at, status, notes
  ) values (
    v_work_order.shop_id, v_work_order.customer_id, v_work_order.vehicle_id,
    v_work_order.id, p_starts_at, p_ends_at, 'pending',
    'Booked from approved customer portal repair quote'
  ) returning * into v_booking;

  update public.work_orders
  set scheduled_at = p_starts_at,
      is_waiter = (v_visit_type = 'waiter'),
      status = 'planned',
      approval_state = 'approved',
      updated_at = v_now
  where id = v_work_order.id;

  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', v_work_order.id,
    'bookingId', v_booking.id,
    'idempotent', false
  );

  insert into public.portal_lifecycle_operation_keys (
    operation_name, operation_key, actor_user_id, customer_id, shop_id, result
  ) values (
    'portal_repair_quote_booking', v_operation_key, p_actor_user_id,
    p_customer_id, v_work_order.shop_id, v_result
  ) on conflict (operation_name, operation_key) do nothing;

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id, 'portal_repair_quote_booking', 'bookings', v_booking.id,
    jsonb_build_object(
      'work_order_id', v_work_order.id,
      'quote_line_id', v_quote_line.id,
      'operation_key', v_operation_key
    )
  );

  return v_result;
exception
  when exclusion_violation then
    raise exception using errcode = 'P0001', message = 'This time overlaps an existing booking.';
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'This quote already has an appointment.';
end;
$$;

revoke all on function public.book_portal_repair_quote_atomic(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, timestamptz
) from public, anon;
grant execute on function public.book_portal_repair_quote_atomic(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, timestamptz
) to authenticated, service_role;

create or replace function public.add_portal_diagnostic_line_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_description text,
  p_notes text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_line_id uuid;
begin
  if p_actor_user_id is null or auth.uid() is distinct from p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
  end if;

  v_result := public.add_portal_request_line_atomic(
    p_shop_id,
    p_customer_id,
    p_work_order_id,
    p_actor_user_id,
    'custom',
    null,
    p_description,
    p_notes,
    'job',
    p_operation_key,
    p_at
  );

  v_line_id := nullif(v_result->'line'->>'id', '')::uuid;
  if v_line_id is null then
    raise exception using errcode = 'P0001', message = 'Diagnostic request did not return its line.';
  end if;

  update public.work_order_lines
  set job_type = 'diagnostic',
      description = coalesce(nullif(trim(description), ''), complaint),
      updated_at = coalesce(p_at, now())
  where id = v_line_id
    and shop_id = p_shop_id
    and work_order_id = p_work_order_id;

  return jsonb_set(
    jsonb_set(v_result, '{kind}', '"diagnostic"'::jsonb, true),
    '{line,job_type}', '"diagnostic"'::jsonb, true
  );
end;
$$;

revoke all on function public.add_portal_diagnostic_line_atomic(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz
) from public, anon;
grant execute on function public.add_portal_diagnostic_line_atomic(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz
) to authenticated, service_role;

commit;
