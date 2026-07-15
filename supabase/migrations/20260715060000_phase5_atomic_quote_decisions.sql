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
drop policy if exists quote_lifecycle_operation_keys_shop_select on public.quote_lifecycle_operation_keys;
create policy quote_lifecycle_operation_keys_shop_select
  on public.quote_lifecycle_operation_keys
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
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
  v_quote public.work_order_quote_lines%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_now timestamptz := coalesce(p_at, now());
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_selected uuid[] := array(
    select distinct value
    from unnest(coalesce(p_quote_line_ids, array[]::uuid[])) value
    where value is not null
    order by value
  );
  v_materialized uuid[] := array[]::uuid[];
  v_declined_remaining uuid[] := array[]::uuid[];
  v_work_order_line_id uuid;
  v_approval_state text := 'pending';
  v_approved integer := 0;
  v_declined integer := 0;
  v_pending integer := 0;
  v_row_count integer := 0;
  v_requests_relinked integer := 0;
  v_items_relinked integer := 0;
  v_requests_already integer := 0;
  v_items_already integer := 0;
begin
  if v_decision not in ('approve', 'decline', 'defer') then
    raise exception using errcode = 'P0001', message = 'Unsupported quote decision.';
  end if;
  if coalesce(array_length(v_selected, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'At least one quote line is required.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select result into v_existing
  from public.quote_lifecycle_operation_keys
  where shop_id = p_shop_id
    and operation_name = 'customer_quote_decision'
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id and shop_id = p_shop_id
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
  from public.work_order_quote_lines
  where shop_id = p_shop_id and work_order_id = p_work_order_id
  order by id
  for update;

  if (
    select count(*) from public.work_order_quote_lines
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and id = any(v_selected)
  ) <> cardinality(v_selected) then
    raise exception using errcode = 'P0001', message = 'One or more quote lines were not found for this work order.';
  end if;

  for v_quote in
    select * from public.work_order_quote_lines
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and id = any(v_selected)
    order by id
  loop
    if v_decision = 'approve' then
      if lower(coalesce(v_quote.status::text, '')) in ('declined', 'deferred', 'rejected', 'cancelled') then
        raise exception using errcode = 'P0001', message = 'Quote line cannot be approved from its current status.';
      end if;
      if lower(coalesce(v_quote.status::text, '')) not in ('sent', 'ready_to_send', 'quoted', 'approved', 'converted')
         and v_quote.sent_to_customer_at is null then
        raise exception using errcode = 'P0001', message = 'Quote line has not been sent to the customer.';
      end if;

      v_work_order_line_id := v_quote.work_order_line_id;
      if v_work_order_line_id is null then
        select id into v_work_order_line_id
        from public.work_order_lines
        where shop_id = p_shop_id
          and work_order_id = p_work_order_id
          and (external_id = 'quote_line:' || v_quote.id::text or source_row_id = v_quote.id)
        order by created_at
        limit 1
        for update;
      end if;

      if v_work_order_line_id is null then
        insert into public.work_order_lines(
          shop_id, work_order_id, vehicle_id, description, job_type,
          status, line_status, approval_state, approval_at, approval_by,
          quoted_at, labor_time, price_estimate, complaint, cause,
          correction, notes, external_id, source_row_id, intake_json
        ) values (
          p_shop_id,
          p_work_order_id,
          v_quote.vehicle_id,
          coalesce(nullif(trim(v_quote.description), ''), nullif(trim(v_quote.ai_complaint), ''), 'Approved quote line'),
          coalesce(nullif(trim(v_quote.job_type::text), ''), 'repair'),
          'awaiting',
          'authorized',
          'approved',
          v_now,
          p_actor_user_id,
          coalesce(v_quote.sent_to_customer_at, v_quote.created_at, v_now),
          coalesce(v_quote.labor_hours, v_quote.est_labor_hours),
          coalesce(v_quote.grand_total, v_quote.subtotal, coalesce(v_quote.labor_total, 0) + coalesce(v_quote.parts_total, 0)),
          coalesce(nullif(trim(v_quote.ai_complaint), ''), nullif(trim(v_quote.notes), ''), nullif(trim(v_quote.description), '')),
          nullif(trim(v_quote.ai_cause), ''),
          nullif(trim(v_quote.ai_correction), ''),
          nullif(trim(v_quote.notes), ''),
          'quote_line:' || v_quote.id::text,
          v_quote.id,
          jsonb_build_object(
            'source', 'work_order_quote_lines',
            'quote_line_id', v_quote.id,
            'quote_line_metadata', coalesce(v_quote.metadata, '{}'::jsonb),
            'customer_approved_at', v_now,
            'customer_approved_by', p_actor_user_id,
            'labor_total', v_quote.labor_total,
            'parts_total', v_quote.parts_total,
            'subtotal', v_quote.subtotal,
            'tax_total', v_quote.tax_total,
            'grand_total', v_quote.grand_total
          )
        ) returning id into v_work_order_line_id;
      end if;

      if exists (
        select 1 from public.part_requests
        where shop_id = p_shop_id
          and work_order_id = p_work_order_id
          and quote_line_id = v_quote.id
          and job_id is not null
          and job_id <> v_work_order_line_id
      ) or exists (
        select 1 from public.part_request_items
        where shop_id = p_shop_id
          and work_order_id = p_work_order_id
          and quote_line_id = v_quote.id
          and work_order_line_id is not null
          and work_order_line_id <> v_work_order_line_id
      ) then
        raise exception using errcode = 'P0001', message = 'PART_RELINK_CONFLICT: quote parts are linked to another work-order line.';
      end if;

      v_requests_already := v_requests_already + (
        select count(*) from public.part_requests
        where shop_id = p_shop_id and work_order_id = p_work_order_id
          and quote_line_id = v_quote.id and job_id = v_work_order_line_id
      );
      v_items_already := v_items_already + (
        select count(*) from public.part_request_items
        where shop_id = p_shop_id and work_order_id = p_work_order_id
          and quote_line_id = v_quote.id and work_order_line_id = v_work_order_line_id
      );

      update public.part_requests
      set job_id = v_work_order_line_id
      where shop_id = p_shop_id and work_order_id = p_work_order_id
        and quote_line_id = v_quote.id and job_id is null;
      get diagnostics v_row_count = row_count;
      v_requests_relinked := v_requests_relinked + v_row_count;

      update public.part_request_items
      set work_order_line_id = v_work_order_line_id
      where shop_id = p_shop_id and work_order_id = p_work_order_id
        and quote_line_id = v_quote.id and work_order_line_id is null;
      get diagnostics v_row_count = row_count;
      v_items_relinked := v_items_relinked + v_row_count;

      update public.work_order_quote_lines
      set status = 'converted',
          stage = 'customer_approved',
          approved_at = coalesce(approved_at, v_now),
          declined_at = null,
          work_order_line_id = v_work_order_line_id,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'customer_decision', 'approve',
            'customer_decision_at', v_now,
            'customer_actor_user_id', p_actor_user_id,
            'customer_id', p_customer_id,
            'materialized_work_order_line_id', v_work_order_line_id
          ),
          updated_at = v_now
      where id = v_quote.id;

      v_materialized := array_append(v_materialized, v_work_order_line_id);
    elsif v_decision = 'decline' then
      update public.work_order_quote_lines
      set status = 'declined', stage = 'customer_declined',
          declined_at = coalesce(declined_at, v_now),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'customer_decision', 'decline', 'customer_decision_at', v_now,
            'customer_actor_user_id', p_actor_user_id, 'customer_id', p_customer_id
          ),
          updated_at = v_now
      where id = v_quote.id;
    else
      update public.work_order_quote_lines
      set status = 'deferred', stage = 'customer_deferred', declined_at = null,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'customer_decision', 'defer', 'customer_decision_at', v_now,
            'customer_actor_user_id', p_actor_user_id, 'customer_id', p_customer_id
          ),
          updated_at = v_now
      where id = v_quote.id;
    end if;
  end loop;

  if p_decline_remaining and v_decision = 'approve' then
    select coalesce(array_agg(id order by id), array[]::uuid[])
      into v_declined_remaining
    from public.work_order_quote_lines
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and not (id = any(v_selected))
      and lower(coalesce(status::text, '')) = 'sent';

    update public.work_order_quote_lines
    set status = 'declined', stage = 'customer_declined',
        declined_at = coalesce(declined_at, v_now),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'customer_decision', 'decline', 'customer_decision_at', v_now,
          'customer_actor_user_id', p_actor_user_id, 'customer_id', p_customer_id,
          'declined_as_remaining', true
        ),
        updated_at = v_now
    where id = any(v_declined_remaining);
  end if;

  select
    count(*) filter (where lower(coalesce(status::text, '')) in ('approved', 'converted') or stage::text = 'customer_approved' or approved_at is not null or work_order_line_id is not null),
    count(*) filter (where lower(coalesce(status::text, '')) in ('declined', 'deferred') or stage::text in ('customer_declined', 'customer_deferred') or declined_at is not null),
    count(*) filter (where not (
      lower(coalesce(status::text, '')) in ('approved', 'converted', 'declined', 'deferred')
      or stage::text in ('customer_approved', 'customer_declined', 'customer_deferred')
      or approved_at is not null or declined_at is not null or work_order_line_id is not null
    ))
  into v_approved, v_declined, v_pending
  from public.work_order_quote_lines
  where shop_id = p_shop_id and work_order_id = p_work_order_id
    and (sent_to_customer_at is not null or lower(coalesce(status::text, '')) in ('sent', 'approved', 'converted', 'declined', 'deferred'));

  if v_approved > 0 and v_pending = 0 and v_declined = 0 then
    v_approval_state := 'approved';
  elsif v_approved > 0 then
    v_approval_state := 'partial';
  elsif v_approved = 0 and v_pending = 0 and v_declined > 0 then
    v_approval_state := 'declined';
  end if;

  update public.work_orders
  set approval_state = v_approval_state,
      customer_approval_at = case when v_approval_state in ('approved', 'partial') then v_now else customer_approval_at end,
      customer_agreed_at = case when v_approval_state in ('approved', 'partial') then v_now else customer_agreed_at end,
      customer_approved_by = case when v_approval_state in ('approved', 'partial') then p_actor_user_id else customer_approved_by end,
      updated_at = v_now
  where id = p_work_order_id and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'quote_line_ids', to_jsonb(v_selected),
    'work_order_line_ids', to_jsonb(v_materialized),
    'declined_remaining_quote_line_ids', to_jsonb(v_declined_remaining),
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
    p_shop_id, 'customer_quote_decision', p_operation_key,
    p_actor_user_id, p_work_order_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz) from public, anon;
grant execute on function public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz) to authenticated, service_role;
notify pgrst, 'reload schema';

commit;
