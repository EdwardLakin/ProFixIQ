begin;

create or replace function public.work_order_delete_draft_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_operation_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authenticated_user_id uuid := auth.uid();
  v_actor_role text;
  v_work_order public.work_orders%rowtype;
  v_operation public.parts_operation_keys;
  v_result jsonb;
begin
  if p_shop_id is null or p_work_order_id is null then
    raise exception using
      errcode = '22023',
      message = 'WORK_ORDER_DELETE_SCOPE_REQUIRED';
  end if;

  if coalesce(trim(p_operation_key), '') = ''
     or p_operation_key <> (
       p_shop_id::text || ':delete-draft-work-order:' || p_work_order_id::text
     ) then
    raise exception using
      errcode = '22023',
      message = 'WORK_ORDER_DELETE_OPERATION_KEY_INVALID';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if v_authenticated_user_id is null then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_DELETE_AUTHENTICATION_REQUIRED';
    end if;

    if p_actor_user_id is null
       or v_authenticated_user_id is distinct from p_actor_user_id then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_DELETE_ACTOR_MISMATCH';
    end if;

    select lower(trim(coalesce(profile.role::text, '')))
      into v_actor_role
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (
        profile.id = v_authenticated_user_id
        or profile.user_id = v_authenticated_user_id
      )
    order by (profile.id = v_authenticated_user_id) desc
    limit 1;

    if v_actor_role is null then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_DELETE_SHOP_ACCESS_DENIED';
    end if;

    if v_actor_role not in ('owner', 'admin') then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_DELETE_ROLE_ACCESS_DENIED';
    end if;
  end if;

  v_operation := public.parts_begin_operation(
    p_shop_id,
    p_operation_key,
    'delete_draft_work_order',
    'work_order',
    p_work_order_id,
    p_actor_user_id
  );
  if v_operation.completed_at is not null then
    return coalesce(v_operation.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  select work_order_row.*
    into v_work_order
  from public.work_orders work_order_row
  where work_order_row.id = p_work_order_id
    and work_order_row.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'WORK_ORDER_DELETE_NOT_FOUND_FOR_SHOP';
  end if;

  if lower(coalesce(v_work_order.status::text, '')) not in (
    'awaiting',
    'awaiting_inspection',
    'draft',
    'new',
    'pending',
    'queued'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_NOT_DRAFT';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id)
     or coalesce(v_work_order.invoice_total, 0) <> 0
     or coalesce(v_work_order.labor_total, 0) <> 0
     or coalesce(v_work_order.parts_total, 0) <> 0
     or v_work_order.customer_approval_at is not null
     or v_work_order.customer_agreed_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_FINANCIAL_OR_APPROVAL_HISTORY';
  end if;

  if exists (
    select 1
    from public.invoices invoice_row
    where invoice_row.shop_id = p_shop_id
      and invoice_row.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.payments payment_row
    where payment_row.shop_id = p_shop_id
      and payment_row.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.supplier_orders supplier_order
    where supplier_order.shop_id = p_shop_id
      and supplier_order.work_order_id = p_work_order_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_FINANCIAL_OR_SUPPLIER_HISTORY';
  end if;

  if exists (
    select 1
    from public.work_order_line_labor_segments labor_segment
    where labor_segment.shop_id = p_shop_id
      and labor_segment.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.inspections inspection_row
    where inspection_row.shop_id = p_shop_id
      and inspection_row.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.inspection_sessions inspection_session
    where inspection_session.work_order_id = p_work_order_id
  ) or exists (
    select 1
    from public.work_order_quote_lines quote_line
    where quote_line.shop_id = p_shop_id
      and quote_line.work_order_id = p_work_order_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_OPERATIONAL_HISTORY';
  end if;

  if exists (
    select 1
    from public.work_order_parts work_order_part
    where work_order_part.shop_id = p_shop_id
      and work_order_part.work_order_id = p_work_order_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_PARTS_HISTORY';
  end if;

  if exists (
    select 1
    from public.part_requests request_row
    where request_row.shop_id = p_shop_id
      and request_row.work_order_id = p_work_order_id
      and lower(coalesce(request_row.status::text, '')) not in (
        'cancelled',
        'deferred',
        'quoted',
        'rejected',
        'requested'
      )
  ) or exists (
    select 1
    from public.part_request_items item
    join public.part_requests request_row
      on request_row.id = item.request_id
     and request_row.shop_id = p_shop_id
    where request_row.work_order_id = p_work_order_id
      and (
        lower(coalesce(item.status::text, '')) not in (
          'awaiting_customer_approval',
          'cancelled',
          'quoted',
          'requested'
        )
        or coalesce(item.approved, false)
        or coalesce(item.qty_approved, 0) > 0
        or coalesce(item.qty_reserved, 0) > 0
        or coalesce(item.qty_picked, 0) > 0
        or coalesce(item.qty_ordered, 0) > 0
        or coalesce(item.qty_received, 0) > 0
        or coalesce(item.qty_consumed, 0) > 0
        or coalesce(item.qty_returned, 0) > 0
        or item.po_id is not null
        or item.source_work_order_part_id is not null
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_ACTIVE_PARTS_HISTORY';
  end if;

  if exists (
    select 1
    from public.work_order_lines work_order_line
    where work_order_line.shop_id = p_shop_id
      and work_order_line.work_order_id = p_work_order_id
      and (
        lower(coalesce(work_order_line.status::text, '')) not in (
          'awaiting',
          'awaiting_approval',
          'new',
          'pending',
          'queued'
        )
        or work_order_line.punched_in_at is not null
        or work_order_line.punched_out_at is not null
        or nullif(trim(coalesce(work_order_line.cause, '')), '') is not null
        or nullif(trim(coalesce(work_order_line.correction, '')), '') is not null
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_ACTIVE_LABOR_HISTORY';
  end if;

  delete from public.part_request_items item
  using public.part_requests request_row
  where item.request_id = request_row.id
    and request_row.shop_id = p_shop_id
    and request_row.work_order_id = p_work_order_id;

  delete from public.part_request_lines request_line
  using public.part_requests request_row
  where request_line.request_id = request_row.id
    and request_row.shop_id = p_shop_id
    and request_row.work_order_id = p_work_order_id;

  delete from public.part_requests request_row
  where request_row.shop_id = p_shop_id
    and request_row.work_order_id = p_work_order_id;

  delete from public.work_order_lines work_order_line
  where work_order_line.shop_id = p_shop_id
    and work_order_line.work_order_id = p_work_order_id;

  delete from public.work_orders work_order_row
  where work_order_row.id = p_work_order_id
    and work_order_row.shop_id = p_shop_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_DELETE_FAILED';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'deleted', true,
    'work_order_id', p_work_order_id
  );
  return public.parts_complete_operation(v_operation.id, v_result);
end;
$$;

revoke all on function public.work_order_delete_draft_atomic(
  uuid,
  uuid,
  text,
  uuid
) from public, anon;

grant execute on function public.work_order_delete_draft_atomic(
  uuid,
  uuid,
  text,
  uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
