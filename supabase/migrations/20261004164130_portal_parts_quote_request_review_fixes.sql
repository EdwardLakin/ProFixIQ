begin;

-- Review fixes for the customer parts quote flow.
--
-- 1. Approval re-verifies the quote. The customer approves the frozen
--    priced_items snapshot; if Parts edited the linked items after the quote
--    was sent, the approval is not accepted and the quote goes back to
--    'requested' so it is re-priced and re-sent.
-- 2. Customers can read a quote row directly only once the shop has sent it,
--    so totals and the item snapshot are not readable through PostgREST before
--    delivery. The portal itself reads through server routes.
--
-- 3. A parts-only quote creates no work order until the customer approves it.
--    On approval the quote is anchored to a new work order, an approved job
--    line and a new part request whose items copy the frozen snapshot (the
--    canonical PO / receiving / handoff path requires that anchor). The
--    portal row is re-pointed to the new request and the unanchored request is
--    cancelled.
--
-- decide_portal_parts_quote_request_atomic is redefined with the same
-- signature, owner and grants.

create or replace function public.decide_portal_parts_quote_request_atomic(
  p_request_id uuid,
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_choice text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_choice text := lower(trim(coalesce(p_choice, '')));
  v_now timestamptz := coalesce(p_at, now());
  v_customer public.customers%rowtype;
  v_request public.portal_parts_quote_requests%rowtype;
  v_changed boolean := false;
  v_vehicle public.vehicles%rowtype;
  v_old_part_request_id uuid;
  v_work_order_id uuid;
  v_line_id uuid;
  v_new_request_id uuid;
  v_title text;
begin
  if v_decision not in ('approve', 'decline') then
    raise exception using errcode = 'P0001', message = 'Decision must be approve or decline.';
  end if;
  if v_decision = 'approve' then
    if v_choice = '' then
      v_choice := 'order_parts';
    end if;
    if v_choice not in ('order_parts', 'book_install') then
      raise exception using errcode = 'P0001', message = 'Approval choice must be order_parts or book_install.';
    end if;
  end if;
  if p_actor_user_id is null or auth.uid() is distinct from p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;
  if not found or v_customer.user_id is distinct from p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
  end if;
  if not public.profixiq_is_portal_customer_for(p_customer_id, v_customer.shop_id) then
    raise exception using errcode = 'P0001', message = 'Portal invite required.';
  end if;

  select * into v_request
  from public.portal_parts_quote_requests
  where id = p_request_id
    and customer_id = p_customer_id
    and shop_id = v_customer.shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Parts quote was not found for this customer.';
  end if;

  if v_request.status = 'approved' and v_decision = 'approve' then
    return jsonb_build_object(
      'ok', true, 'requestId', v_request.id, 'status', v_request.status,
      'choice', v_request.approval_choice, 'idempotent', true
    );
  end if;
  if v_request.status = 'declined' and v_decision = 'decline' then
    return jsonb_build_object(
      'ok', true, 'requestId', v_request.id, 'status', v_request.status,
      'idempotent', true
    );
  end if;
  if v_request.status <> 'sent' then
    raise exception using errcode = 'P0001', message = 'This quote is no longer awaiting your decision.';
  end if;

  -- The customer reviewed the frozen snapshot. If Parts changed the linked
  -- items after the quote was sent, approving would release different parts or
  -- quantities than were reviewed (and paid for), so send the quote back to be
  -- re-priced and re-sent instead of accepting this approval.
  if v_decision = 'approve' and v_request.part_request_id is not null then
    select exists (
      with live as (
        select
          pri.id,
          pri.description,
          greatest(
            coalesce(pri.qty, 0),
            coalesce(pri.qty_requested, 0),
            coalesce(pri.qty_approved, 0),
            0
          ) as qty,
          coalesce(pri.quoted_price, pri.unit_price) as unit_price
        from public.part_request_items pri
        where pri.request_id = v_request.part_request_id
          and pri.shop_id = v_request.shop_id
          and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled'
      ), live_active as (
        select * from live where qty > 0
      ), snapshot as (
        select
          (entry ->> 'id')::uuid as id,
          entry ->> 'description' as description,
          (entry ->> 'qty')::numeric as qty,
          (entry ->> 'unit_price')::numeric as unit_price
        from jsonb_array_elements(v_request.priced_items) entry
      )
      select 1
      from live_active l
      full join snapshot s on s.id = l.id
      where l.id is null
         or s.id is null
         or l.qty is distinct from s.qty
         or l.unit_price is distinct from s.unit_price
         or l.description is distinct from s.description
    ) into v_changed;

    if v_changed then
      update public.portal_parts_quote_requests
      set status = 'requested',
          quoted_at = null,
          sent_at = null,
          email_sent_at = null,
          send_claimed_at = null
      where id = v_request.id;
      return jsonb_build_object('ok', false, 'error', 'quote_changed', 'requestId', v_request.id);
    end if;
  end if;

  if v_decision = 'approve' then
    v_old_part_request_id := v_request.part_request_id;
    v_title := left(v_request.description, 200);

    select * into v_vehicle
    from public.vehicles
    where id = v_request.vehicle_id
      and customer_id = p_customer_id
      and shop_id = v_request.shop_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'Vehicle does not belong to this customer and shop.';
    end if;

    insert into public.work_orders (
      shop_id, customer_id, vehicle_id, customer_name, status, approval_state,
      external_id, notes
    ) values (
      v_request.shop_id, p_customer_id, v_request.vehicle_id,
      nullif(trim(concat_ws(' ', v_customer.first_name, v_customer.last_name)), ''),
      'new', 'approved', 'portal_parts_quote:' || v_request.id::text,
      'Parts order approved by customer in the portal: ' || v_title
    ) returning id into v_work_order_id;

    insert into public.work_order_lines (
      work_order_id, shop_id, vehicle_id, description, complaint, notes,
      job_type, line_type, status, line_status, approval_state, external_id
    ) values (
      v_work_order_id, v_request.shop_id, v_request.vehicle_id,
      'Parts order: ' || v_title, v_title, v_request.notes,
      'repair', 'job', 'awaiting', 'authorized', 'approved',
      'portal_parts_quote:' || v_request.id::text
    ) returning id into v_line_id;

    insert into public.part_requests (
      shop_id, work_order_id, job_id, requested_by, status, notes, created_at
    ) values (
      v_request.shop_id, v_work_order_id, v_line_id, p_actor_user_id, 'requested',
      'Approved customer portal parts quote', v_now
    ) returning id into v_new_request_id;

    insert into public.part_request_items (
      request_id, shop_id, work_order_id, work_order_line_id, part_id, vendor_id,
      requested_part_number, requested_manufacturer, description,
      qty, qty_requested, qty_approved, unit_cost, unit_price, quoted_price,
      status, approved
    )
    select
      v_new_request_id, v_request.shop_id, v_work_order_id, v_line_id, old.part_id, old.vendor_id,
      old.requested_part_number, old.requested_manufacturer,
      coalesce(old.description, snap.description),
      snap.qty, snap.qty, snap.qty, old.unit_cost, snap.unit_price, snap.unit_price,
      'approved', true
    from (
      select
        (entry ->> 'id')::uuid as id,
        entry ->> 'description' as description,
        (entry ->> 'qty')::numeric as qty,
        (entry ->> 'unit_price')::numeric as unit_price
      from jsonb_array_elements(v_request.priced_items) entry
    ) snap
    join public.part_request_items old
      on old.id = snap.id and old.request_id = v_old_part_request_id
    where snap.qty > 0;

    update public.portal_parts_quote_requests
    set status = 'approved', approved_at = v_now, approval_choice = v_choice,
        part_request_id = v_new_request_id
    where id = v_request.id;

    update public.part_requests
    set status = 'cancelled'
    where id = v_old_part_request_id and shop_id = v_request.shop_id;

    v_request.part_request_id := v_new_request_id;
  else
    update public.portal_parts_quote_requests
    set status = 'declined', declined_at = v_now
    where id = v_request.id;
  end if;

  if v_request.part_request_id is not null then
    perform public.parts_reconcile_request_lifecycle(v_request.part_request_id);
  end if;

  insert into public.activity_logs (user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id, 'portal_parts_quote_' || v_decision, 'portal_parts_quote_requests', v_request.id,
    jsonb_build_object(
      'part_request_id', v_request.part_request_id,
      'work_order_id', v_work_order_id,
      'choice', case when v_decision = 'approve' then v_choice else null end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'requestId', v_request.id,
    'status', case when v_decision = 'approve' then 'approved' else 'declined' end,
    'choice', case when v_decision = 'approve' then v_choice else null end,
    'workOrderId', v_work_order_id,
    'idempotent', false
  );
end;
$$;

alter policy portal_parts_quote_requests_customer_select
  on public.portal_parts_quote_requests
  using (
    status in ('sent', 'approved', 'declined')
    and public.profixiq_is_portal_customer_for(customer_id, shop_id)
  );

commit;
