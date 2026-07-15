begin;

create table if not exists public.quote_lifecycle_operation_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  operation_name text not null,
  operation_key text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, operation_name, operation_key)
);

alter table public.quote_lifecycle_operation_keys enable row level security;

drop policy if exists quote_lifecycle_operation_keys_shop_select
  on public.quote_lifecycle_operation_keys;
create policy quote_lifecycle_operation_keys_shop_select
  on public.quote_lifecycle_operation_keys
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = quote_lifecycle_operation_keys.shop_id
    )
  );

create or replace function public.apply_customer_quote_decision_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[],
  p_decision text,
  p_decline_remaining boolean,
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_line public.work_order_quote_lines%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_now timestamptz := coalesce(p_at, now());
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_selected_ids uuid[] := array(
    select distinct x
    from unnest(coalesce(p_quote_line_ids, array[]::uuid[])) x
    where x is not null
    order by x
  );
  v_materialized_ids uuid[] := array[]::uuid[];
  v_declined_ids uuid[] := array[]::uuid[];
  v_materialized_id uuid;
  v_approval_state text := 'pending';
  v_approved_count integer := 0;
  v_declined_count integer := 0;
  v_pending_count integer := 0;
  v_requests_relinked integer := 0;
  v_items_relinked integer := 0;
  v_requests_already integer := 0;
  v_items_already integer := 0;
  v_customer_visible_count integer := 0;
begin
  if v_decision not in ('approve','decline','defer') then
    raise exception using errcode = 'P0001', message = 'Unsupported quote decision.';
  end if;
  if coalesce(array_length(v_selected_ids, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'At least one quote line is required.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select qok.result
    into v_existing
  from public.quote_lifecycle_operation_keys qok
  where qok.shop_id = p_shop_id
    and qok.operation_name = 'customer_quote_decision'
    and qok.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select *
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for shop.';
  end if;

  if p_customer_id is not null and v_work_order.customer_id is distinct from p_customer_id then
    raise exception using errcode = 'P0001', message = 'Customer does not own this work order.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: quote decisions cannot change after invoice finalization.';
  end if;

  perform 1
  from public.work_order_quote_lines ql
  where ql.shop_id = p_shop_id
    and ql.work_order_id = p_work_order_id
  order by ql.id
  for update;

  if (
    select count(*)
    from public.work_order_quote_lines ql
    where ql.shop_id = p_shop_id
      and ql.work_order_id = p_work_order_id
      and ql.id = any(v_selected_ids)
  ) <> coalesce(array_length(v_selected_ids, 1), 0) then
    raise exception using errcode = 'P0001', message = 'One or more quote lines were not found for this work order.';
  end if;

  for v_line in
    select *
    from public.work_order_quote_lines ql
    where ql.shop_id = p_shop_id
      and ql.work_order_id = p_work_order_id
      and ql.id = any(v_selected_ids)
    order by ql.id
  loop
    if v_decision = 'approve' then
      if lower(coalesce(v_line.status::text, '')) in ('declined','deferred','rejected','cancelled') then
        raise exception using errcode = 'P0001', message = 'Quote line cannot be approved from its current status.';
      end if;
      if lower(coalesce(v_line.status::text, '')) not in ('sent','ready_to_send','quoted','approved','converted')
         and v_line.sent_to_customer_at is null then
        raise exception using errcode = 'P0001', message = 'Quote line has not been sent to the customer.';
      end if;

      v_materialized_id := v_line.work_order_line_id;
      if v_materialized_id is null then
        select wol.id
          into v_materialized_id
        from public.work_order_lines wol
        where wol.shop_id = p_shop_id
          and wol.work_order_id = p_work_order_id
          and (
            wol.external_id = 'quote_line:' || v_line.id::text
            or wol.source_row_id = v_line.id
          )
        order by wol.created_at
        limit 1
        for update;
      end if;

      if v_materialized_id is null then
        insert into public.work_order_lines(
          shop_id,
          work_order_id,
          vehicle_id,
          description,
          job_type,
          status,
          line_status,
          approval_state,
          approval_at,
          approval_by,
          quoted_at,
          labor_time,
          price_estimate,
          complaint,
          cause,
          correction,
          notes,
          external_id,
          source_row_id,
          source_intake_id,
          intake_json
        ) values (
          p_shop_id,
          p_work_order_id,
          v_line.vehicle_id,
          coalesce(nullif(trim(v_line.description), ''), nullif(trim(v_line.ai_complaint), ''), 'Approved quote line'),
          coalesce(nullif(trim(v_line.job_type::text), ''), 'repair'),
          'awaiting',
          'authorized',
          'approved',
          v_now,
          p_actor_user_id,
          coalesce(v_line.sent_to_customer_at, v_line.created_at, v_now),
          coalesce(v_line.labor_hours, v_line.est_labor_hours),
          coalesce(v_line.grand_total, v_line.subtotal, coalesce(v_line.labor_total, 0) + coalesce(v_line.parts_total, 0)),
          coalesce(nullif(trim(v_line.ai_complaint), ''), nullif(trim(v_line.notes), ''), nullif(trim(v_line.description), '')),
          nullif(trim(v_line.ai_cause), ''),
          nullif(trim(v_line.ai_correction), ''),
          nullif(trim(v_line.notes), ''),
          'quote_line:' || v_line.id::text,
          v_line.id,
          nullif(trim(coalesce(v_line.metadata ->> 'source_inspection_id', '')), ''),
          jsonb_build_object(
            'source', 'work_order_quote_lines',
            'quote_line_id', v_line.id,
            'quote_line_metadata', coalesce(v_line.metadata, '{}'::jsonb),
            'customer_approved_at', v_now,
            'customer_approved_by', p_actor_user_id,
            'labor_total', v_line.labor_total,
            'parts_total', v_line.parts_total,
            'subtotal', v_line.subtotal,
            'tax_total', v_line.tax_total,
            'grand_total', v_line.grand_total
          )
        ) returning id into v_materialized_id;
      end if;

      if exists (
        select 1
        from public.part_requests pr
        where pr.shop_id = p_shop_id
          and pr.work_order_id = p_work_order_id
          and pr.quote_line_id = v_line.id
          and pr.job_id is not null
          and pr.job_id <> v_materialized_id
      ) then
        raise exception using errcode = 'P0001', message = 'PART_RELINK_CONFLICT: a parts request is linked to another work-order line.';
      end if;
      if exists (
        select 1
        from public.part_request_items pri
        where pri.shop_id = p_shop_id
          and pri.work_order_id = p_work_order_id
          and pri.quote_line_id = v_line.id
          and pri.work_order_line_id is not null
          and pri.work_order_line_id <> v_materialized_id
      ) then
        raise exception using errcode = 'P0001', message = 'PART_RELINK_CONFLICT: a parts request item is linked to another work-order line.';
      end if;

      select count(*) into v_requests_already
      from public.part_requests pr
      where pr.shop_id = p_shop_id
        and pr.work_order_id = p_work_order_id
        and pr.quote_line_id = v_line.id
        and pr.job_id = v_materialized_id;
      select count(*) into v_items_already
      from public.part_request_items pri
      where pri.shop_id = p_shop_id
        and pri.work_order_id = p_work_order_id
        and pri.quote_line_id = v_line.id
        and pri.work_order_line_id = v_materialized_id;

      update public.part_requests
      set job_id = v_materialized_id
      where shop_id = p_shop_id
        and work_order_id = p_work_order_id
        and quote_line_id = v_line.id
        and job_id is null;
      get diagnostics v_requests_relinked = v_requests_relinked + row_count;

      update public.part_request_items
      set work_order_line_id = v_materialized_id
      where shop_id = p_shop_id
        and work_order_id = p_work_order_id
        and quote_line_id = v_line.id
        and work_order_line_id is null;
      get diagnostics v_items_relinked = v_items_relinked + row_count;

      update public.work_order_quote_lines
      set status = 'converted',
          stage = 'customer_approved',
          approved_at = coalesce(approved_at, v_now),
          declined_at = null,
          work_order_line_id = v_materialized_id,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'customer_decision', 'approve',
            'customer_decision_at', v_now,
            'customer_actor_user_id', p_actor_user_id,
            'customer_id', p_customer_id,
            'materialized_work_order_line_id', v_materialized_id
          ),
          updated_at = v_now
      where id = v_line.id;

      v_materialized_ids := array_append(v_materialized_ids, v_materialized_id);
    elsif v_decision = 'decline' then
      update public.work_order_quote_lines
      set status = 'declined',
          stage = 'customer_declined',
          declined_at = coalesce(declined_at, v_now),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'customer_decision', 'decline',
            'customer_decision_at', v_now,
            'customer_actor_user_id', p_actor_user_id,
            'customer_id', p_customer_id
          ),
          updated_at = v_now
      where id = v_line.id;
      v_declined_ids := array_append(v_declined_ids, v_line.id);
    else
      update public.work_order_quote_lines
      set status = 'deferred',
          stage = 'customer_deferred',
          declined_at = null,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'customer_decision', 'defer',
            'customer_decision_at', v_now,
            'customer_actor_user_id', p_actor_user_id,
            'customer_id', p_customer_id
          ),
          updated_at = v_now
      where id = v_line.id;
    end if;
  end loop;

  if p_decline_remaining and v_decision = 'approve' then
    update public.work_order_quote_lines ql
    set status = 'declined',
        stage = 'customer_declined',
        declined_at = coalesce(ql.declined_at, v_now),
        metadata = coalesce(ql.metadata, '{}'::jsonb) || jsonb_build_object(
          'customer_decision', 'decline',
          'customer_decision_at', v_now,
          'customer_actor_user_id', p_actor_user_id,
          'customer_id', p_customer_id,
          'declined_as_remaining', true
        ),
        updated_at = v_now
    where ql.shop_id = p_shop_id
      and ql.work_order_id = p_work_order_id
      and ql.id <> all(v_selected_ids)
      and lower(coalesce(ql.status::text, '')) = 'sent'
    returning ql.id into v_materialized_id;

    select coalesce(array_agg(ql.id order by ql.id), array[]::uuid[])
      into v_declined_ids
    from public.work_order_quote_lines ql
    where ql.shop_id = p_shop_id
      and ql.work_order_id = p_work_order_id
      and (ql.metadata ->> 'declined_as_remaining')::boolean is true
      and ql.updated_at = v_now;
  end if;

  select
    count(*) filter (
      where lower(coalesce(ql.status::text, '')) in ('approved','converted')
         or lower(coalesce(ql.stage::text, '')) = 'customer_approved'
         or ql.approved_at is not null
         or ql.work_order_line_id is not null
    ),
    count(*) filter (
      where lower(coalesce(ql.status::text, '')) in ('declined','deferred')
         or lower(coalesce(ql.stage::text, '')) in ('customer_declined','customer_deferred')
         or ql.declined_at is not null
    ),
    count(*) filter (
      where not (
        lower(coalesce(ql.status::text, '')) in ('approved','converted','declined','deferred')
        or lower(coalesce(ql.stage::text, '')) in ('customer_approved','customer_declined','customer_deferred')
        or ql.approved_at is not null
        or ql.declined_at is not null
        or ql.work_order_line_id is not null
      )
    ),
    count(*)
  into v_approved_count, v_declined_count, v_pending_count, v_customer_visible_count
  from public.work_order_quote_lines ql
  where ql.shop_id = p_shop_id
    and ql.work_order_id = p_work_order_id
    and (
      ql.sent_to_customer_at is not null
      or lower(coalesce(ql.status::text, '')) in ('sent','approved','converted','declined','deferred')
    );

  if v_approved_count > 0 and v_pending_count = 0 and v_declined_count = 0 then
    v_approval_state := 'approved';
  elsif v_approved_count > 0 then
    v_approval_state := 'partial';
  elsif v_approved_count = 0 and v_pending_count = 0 and v_declined_count > 0 then
    v_approval_state := 'declined';
  else
    v_approval_state := 'pending';
  end if;

  update public.work_orders
  set approval_state = v_approval_state,
      customer_approval_at = case when v_approval_state in ('approved','partial') then v_now else customer_approval_at end,
      customer_agreed_at = case when v_approval_state in ('approved','partial') then v_now else customer_agreed_at end,
      customer_approved_by = case when v_approval_state in ('approved','partial') then p_actor_user_id else customer_approved_by end,
      updated_at = v_now
  where id = p_work_order_id
    and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'quote_line_ids', to_jsonb(v_selected_ids),
    'work_order_line_ids', to_jsonb(v_materialized_ids),
    'declined_remaining_quote_line_ids', to_jsonb(v_declined_ids),
    'approval_state', v_approval_state,
    'part_relink', jsonb_build_object(
      'partRequestsRelinked', v_requests_relinked,
      'partRequestItemsRelinked', v_items_relinked,
      'partRequestsAlreadyLinked', v_requests_already,
      'partRequestItemsAlreadyLinked', v_items_already,
      'conflicts', '[]'::jsonb
    )
  );

  insert into public.quote_lifecycle_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'customer_quote_decision', p_operation_key, p_actor_user_id, p_work_order_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz) from public, anon;
grant execute on function public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
