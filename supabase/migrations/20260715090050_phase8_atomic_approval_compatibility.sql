begin;

create or replace function public.reconcile_work_order_approval_state_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_at timestamptz default now()
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_at, now());
  v_line_pending integer := 0;
  v_line_approved integer := 0;
  v_line_declined integer := 0;
  v_quote_pending integer := 0;
  v_quote_approved integer := 0;
  v_quote_declined integer := 0;
  v_pending integer := 0;
  v_approved integer := 0;
  v_declined integer := 0;
  v_rollup text := 'pending';
begin
  perform 1
  from public.work_orders
  where id = p_work_order_id
    and shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for shop.';
  end if;

  select
    count(*) filter (where lower(coalesce(approval_state::text, '')) = 'pending'),
    count(*) filter (where lower(coalesce(approval_state::text, '')) = 'approved'),
    count(*) filter (where lower(coalesce(approval_state::text, '')) = 'declined')
  into v_line_pending, v_line_approved, v_line_declined
  from public.work_order_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and voided_at is null;

  select
    count(*) filter (where not (
      lower(coalesce(status::text, '')) in ('approved', 'converted', 'declined', 'deferred', 'rejected', 'cancelled', 'canceled')
      or stage::text in ('customer_approved', 'customer_declined', 'customer_deferred')
      or approved_at is not null
      or declined_at is not null
      or work_order_line_id is not null
    )),
    count(*) filter (where
      lower(coalesce(status::text, '')) in ('approved', 'converted')
      or stage::text = 'customer_approved'
      or approved_at is not null
      or work_order_line_id is not null
    ),
    count(*) filter (where
      lower(coalesce(status::text, '')) in ('declined', 'deferred', 'rejected', 'cancelled', 'canceled')
      or stage::text in ('customer_declined', 'customer_deferred')
      or declined_at is not null
    )
  into v_quote_pending, v_quote_approved, v_quote_declined
  from public.work_order_quote_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and (
      sent_to_customer_at is not null
      or lower(coalesce(status::text, '')) in (
        'sent', 'ready_to_send', 'quoted', 'approved', 'converted',
        'declined', 'deferred', 'rejected', 'cancelled', 'canceled'
      )
    );

  v_pending := v_line_pending + v_quote_pending;
  v_approved := v_line_approved + v_quote_approved;
  v_declined := v_line_declined + v_quote_declined;

  v_rollup := case
    when v_pending > 0 and v_approved > 0 then 'partial'
    when v_pending > 0 then 'pending'
    when v_approved > 0 and v_declined > 0 then 'partial'
    when v_approved > 0 then 'approved'
    when v_declined > 0 then 'declined'
    else 'pending'
  end;

  update public.work_orders
  set approval_state = v_rollup,
      customer_approval_at = case
        when v_rollup in ('approved', 'partial') then coalesce(customer_approval_at, v_now)
        else customer_approval_at
      end,
      customer_agreed_at = case
        when v_rollup in ('approved', 'partial') then coalesce(customer_agreed_at, v_now)
        else customer_agreed_at
      end,
      customer_approved_by = case
        when v_rollup in ('approved', 'partial') then coalesce(customer_approved_by, p_actor_user_id)
        else customer_approved_by
      end,
      updated_at = v_now
  where id = p_work_order_id
    and shop_id = p_shop_id;

  return v_rollup;
end;
$$;

create or replace function public.apply_approval_compatibility_bundle_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_approved_line_ids uuid[],
  p_declined_line_ids uuid[],
  p_approved_quote_line_ids uuid[],
  p_declined_quote_line_ids uuid[],
  p_signature_url text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_at, now());
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_quote_approve_result jsonb := '{}'::jsonb;
  v_quote_decline_result jsonb := '{}'::jsonb;
  v_rollup text;
  v_approved_lines uuid[] := array(
    select distinct value
    from unnest(coalesce(p_approved_line_ids, array[]::uuid[])) value
    where value is not null
    order by value
  );
  v_declined_lines uuid[] := array(
    select distinct value
    from unnest(coalesce(p_declined_line_ids, array[]::uuid[])) value
    where value is not null
    order by value
  );
  v_approved_quotes uuid[] := array(
    select distinct value
    from unnest(coalesce(p_approved_quote_line_ids, array[]::uuid[])) value
    where value is not null
    order by value
  );
  v_declined_quotes uuid[] := array(
    select distinct value
    from unnest(coalesce(p_declined_quote_line_ids, array[]::uuid[])) value
    where value is not null
    order by value
  );
begin
  if p_actor_user_id is null or nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'Authenticated actor and stable operation key are required.';
  end if;

  if cardinality(v_approved_lines) + cardinality(v_declined_lines)
     + cardinality(v_approved_quotes) + cardinality(v_declined_quotes) = 0 then
    raise exception using errcode = 'P0001', message = 'At least one approval decision is required.';
  end if;

  if exists (
    select 1 from unnest(v_approved_lines) a join unnest(v_declined_lines) d on d = a
  ) or exists (
    select 1 from unnest(v_approved_quotes) a join unnest(v_declined_quotes) d on d = a
  ) then
    raise exception using errcode = 'P0001', message = 'The same item cannot be both approved and declined.';
  end if;

  select result into v_existing
  from public.quote_lifecycle_operation_keys
  where shop_id = p_shop_id
    and operation_name = 'approval_compatibility_bundle'
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
    and shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for shop.';
  end if;

  if p_customer_id is not null then
    if v_work_order.customer_id is distinct from p_customer_id then
      raise exception using errcode = 'P0001', message = 'Customer does not own this work order.';
    end if;
    if not exists (
      select 1 from public.customers c
      where c.id = p_customer_id
        and c.user_id = p_actor_user_id
        and c.shop_id = p_shop_id
    ) then
      raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
    end if;
  elsif not exists (
    select 1 from public.profiles p
    where p.id = p_actor_user_id
      and p.shop_id = p_shop_id
      and lower(coalesce(p.role::text, '')) in ('owner', 'admin', 'manager', 'advisor')
  ) then
    raise exception using errcode = 'P0001', message = 'Staff approval actor is not authorized.';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: approval decisions cannot change this work order.';
  end if;

  perform 1
  from public.work_order_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
  order by id
  for update;

  perform 1
  from public.work_order_quote_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
  order by id
  for update;

  if cardinality(v_approved_lines) + cardinality(v_declined_lines) > 0 and (
    select count(*)
    from public.work_order_lines
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and id = any(v_approved_lines || v_declined_lines)
  ) <> cardinality(v_approved_lines || v_declined_lines) then
    raise exception using errcode = 'P0001', message = 'One or more work-order lines are invalid for this work order.';
  end if;

  if cardinality(v_approved_quotes) > 0 then
    v_quote_approve_result := public.apply_customer_quote_decision_atomic(
      p_shop_id,
      p_work_order_id,
      v_approved_quotes,
      'approve',
      false,
      p_customer_id,
      p_actor_user_id,
      p_operation_key || ':quote-approve',
      v_now
    );
  end if;

  if cardinality(v_declined_quotes) > 0 then
    v_quote_decline_result := public.apply_customer_quote_decision_atomic(
      p_shop_id,
      p_work_order_id,
      v_declined_quotes,
      'decline',
      false,
      p_customer_id,
      p_actor_user_id,
      p_operation_key || ':quote-decline',
      v_now
    );
  end if;

  if cardinality(v_approved_lines) > 0 then
    update public.work_order_lines
    set approval_state = 'approved',
        status = 'awaiting',
        line_status = 'authorized',
        approval_at = coalesce(approval_at, v_now),
        approval_by = p_actor_user_id,
        hold_reason = null,
        updated_at = v_now
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and id = any(v_approved_lines)
      and lower(coalesce(status::text, '')) not in (
        'completed', 'ready_to_invoice', 'invoiced', 'voided', 'cancelled', 'canceled'
      );
  end if;

  if cardinality(v_declined_lines) > 0 then
    update public.work_order_lines
    set approval_state = 'declined',
        status = 'on_hold',
        line_status = 'declined',
        approval_at = v_now,
        approval_by = p_actor_user_id,
        hold_reason = coalesce(nullif(trim(hold_reason), ''), 'Customer declined'),
        updated_at = v_now
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and id = any(v_declined_lines)
      and lower(coalesce(status::text, '')) not in (
        'completed', 'ready_to_invoice', 'invoiced', 'voided', 'cancelled', 'canceled'
      );
  end if;

  v_rollup := public.reconcile_work_order_approval_state_atomic(
    p_shop_id,
    p_work_order_id,
    p_actor_user_id,
    v_now
  );

  update public.work_orders
  set customer_approval_signature_path = nullif(trim(coalesce(p_signature_url, '')), ''),
      customer_approval_signature_url = nullif(trim(coalesce(p_signature_url, '')), ''),
      customer_signature_url = nullif(trim(coalesce(p_signature_url, '')), ''),
      updated_at = v_now
  where id = p_work_order_id
    and shop_id = p_shop_id
    and p_signature_url is not null;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'workOrderId', p_work_order_id,
    'approvalState', v_rollup,
    'approvedLineIds', to_jsonb(v_approved_lines),
    'declinedLineIds', to_jsonb(v_declined_lines),
    'approvedQuoteLineIds', to_jsonb(v_approved_quotes),
    'declinedQuoteLineIds', to_jsonb(v_declined_quotes),
    'quoteApproveResult', v_quote_approve_result,
    'quoteDeclineResult', v_quote_decline_result
  );

  insert into public.quote_lifecycle_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'approval_compatibility_bundle', p_operation_key,
    p_actor_user_id, p_work_order_id, v_result
  );

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id,
    'approval_compatibility_bundle',
    'work_orders',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'customer_id', p_customer_id,
      'operation_key', p_operation_key,
      'approval_state', v_rollup
    )
  );

  return v_result;
end;
$$;

revoke all on function public.reconcile_work_order_approval_state_atomic(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.reconcile_work_order_approval_state_atomic(uuid, uuid, uuid, timestamptz) to authenticated, service_role;

revoke all on function public.apply_approval_compatibility_bundle_atomic(uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, timestamptz) from public, anon;
grant execute on function public.apply_approval_compatibility_bundle_atomic(uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
