begin;

create or replace function public.apply_portal_line_decision_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_work_order_id uuid,
  p_line_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_now timestamptz := coalesce(p_at, now());
  v_customer public.customers%rowtype;
  v_work_order public.work_orders%rowtype;
  v_line public.work_order_lines%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_pending integer := 0;
  v_approved integer := 0;
  v_declined integer := 0;
  v_rollup text;
begin
  if v_decision not in ('approve','decline','defer') then
    raise exception using errcode = 'P0001', message = 'Unsupported portal line decision.';
  end if;
  if p_actor_user_id is null or nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'Authenticated actor and stable operation key are required.';
  end if;

  select result into v_existing
  from public.portal_lifecycle_operation_keys
  where operation_name = 'portal_line_decision'
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
    and shop_id = p_shop_id
    and customer_id = p_customer_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order is not owned by this portal customer.';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: portal decisions cannot change this work order.';
  end if;

  select * into v_line
  from public.work_order_lines
  where id = p_line_id
    and work_order_id = p_work_order_id
    and shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for this portal decision.';
  end if;

  if lower(coalesce(v_line.status::text, '')) in ('completed','ready_to_invoice','invoiced','voided','cancelled','canceled') then
    raise exception using errcode = 'P0001', message = 'This line is no longer eligible for a portal decision.';
  end if;

  if v_decision = 'approve' then
    update public.work_order_lines
    set approval_state = 'approved',
        status = 'awaiting',
        line_status = 'authorized',
        approval_at = coalesce(approval_at, v_now),
        approval_by = p_actor_user_id,
        hold_reason = null,
        updated_at = v_now
    where id = p_line_id;
  elsif v_decision = 'decline' then
    update public.work_order_lines
    set approval_state = 'declined',
        status = 'on_hold',
        line_status = 'declined',
        approval_at = v_now,
        approval_by = p_actor_user_id,
        hold_reason = coalesce(nullif(trim(hold_reason), ''), 'Customer declined'),
        updated_at = v_now
    where id = p_line_id;
  else
    update public.work_order_lines
    set approval_state = 'pending',
        status = 'awaiting_approval',
        line_status = 'pending',
        approval_at = null,
        approval_by = null,
        updated_at = v_now
    where id = p_line_id;
  end if;

  select
    count(*) filter (where lower(coalesce(approval_state::text, '')) = 'pending'),
    count(*) filter (where lower(coalesce(approval_state::text, '')) = 'approved'),
    count(*) filter (where lower(coalesce(approval_state::text, '')) = 'declined')
  into v_pending, v_approved, v_declined
  from public.work_order_lines
  where work_order_id = p_work_order_id
    and shop_id = p_shop_id
    and voided_at is null;

  v_rollup := case
    when v_pending > 0 and v_approved > 0 then 'partial'
    when v_pending > 0 then 'pending'
    when v_approved > 0 then 'approved'
    when v_declined > 0 then 'declined'
    else 'pending'
  end;

  update public.work_orders
  set approval_state = v_rollup,
      customer_approval_at = v_now,
      customer_approved_by = p_actor_user_id,
      updated_at = v_now
  where id = p_work_order_id;

  select jsonb_build_object(
    'ok', true,
    'lineId', wol.id,
    'workOrderId', wol.work_order_id,
    'approvalState', wol.approval_state,
    'status', wol.status,
    'workOrderApprovalState', v_rollup,
    'decision', v_decision,
    'idempotent', false
  ) into v_result
  from public.work_order_lines wol
  where wol.id = p_line_id;

  insert into public.portal_lifecycle_operation_keys(
    operation_name, operation_key, actor_user_id, customer_id, shop_id, result
  ) values (
    'portal_line_decision', p_operation_key, p_actor_user_id,
    p_customer_id, p_shop_id, v_result
  ) on conflict (operation_name, operation_key) do nothing;

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id, 'portal_line_' || v_decision, 'work_order_lines', p_line_id,
    jsonb_build_object('work_order_id', p_work_order_id, 'operation_key', p_operation_key)
  );

  return v_result;
end;
$$;

revoke all on function public.apply_portal_line_decision_atomic(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz) from public;
grant execute on function public.apply_portal_line_decision_atomic(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz) to authenticated, service_role;

commit;
