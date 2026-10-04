begin;

-- Covers the vehicle_id foreign key flagged by the performance advisor.
create index if not exists portal_parts_quote_requests_vehicle_idx
  on public.portal_parts_quote_requests (vehicle_id);

-- Lets the worker rotate through pending requests fairly so a backlog of
-- requests that are still waiting on Parts pricing cannot starve newer ones.
alter table public.portal_parts_quote_requests
  add column if not exists pricing_checked_at timestamptz;

-- ---------------------------------------------------------------------------
-- Customer: request a parts-only quote. Creates no work order and no quote
-- line. The request is priced and ordered through the shop Parts system via a
-- linked part_requests row.
-- ---------------------------------------------------------------------------
create or replace function public.create_portal_parts_quote_request_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_actor_user_id uuid,
  p_description text,
  p_notes text,
  p_qty numeric,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_key text := nullif(trim(coalesce(p_operation_key, '')), '');
  v_qty numeric := greatest(1, least(99, coalesce(p_qty, 1)));
  v_now timestamptz := coalesce(p_at, now());
  v_customer public.customers%rowtype;
  v_existing public.portal_parts_quote_requests%rowtype;
  v_request public.portal_parts_quote_requests%rowtype;
  v_part_request public.part_requests%rowtype;
begin
  if v_description is null then
    raise exception using errcode = 'P0001', message = 'Parts quote request description is required.';
  end if;
  if p_actor_user_id is null or auth.uid() is distinct from p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
  end if;
  if v_key is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
    and shop_id = p_shop_id
  for update;
  if not found or v_customer.user_id is distinct from p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
  end if;
  if not public.profixiq_is_portal_customer_for(p_customer_id, p_shop_id) then
    raise exception using errcode = 'P0001', message = 'Portal invite required.';
  end if;

  select * into v_existing
  from public.portal_parts_quote_requests
  where operation_key = v_key;
  if found then
    if v_existing.customer_id is distinct from p_customer_id then
      raise exception using errcode = 'P0001', message = 'Portal customer actor mismatch.';
    end if;
    return jsonb_build_object(
      'ok', true,
      'requestId', v_existing.id,
      'partRequestId', v_existing.part_request_id,
      'status', v_existing.status,
      'idempotent', true
    );
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

  insert into public.part_requests (
    shop_id, work_order_id, job_id, requested_by, status, notes, created_at
  ) values (
    p_shop_id, null, null, p_actor_user_id, 'requested',
    concat_ws(E'\n', 'Customer portal parts quote request', v_notes),
    v_now
  ) returning * into v_part_request;

  insert into public.part_request_items (
    request_id, shop_id, work_order_id, work_order_line_id, quote_line_id,
    description, qty, qty_requested, qty_approved, status, approved
  ) values (
    v_part_request.id, p_shop_id, null, null, null,
    v_description, v_qty, v_qty, 0, 'requested', false
  );

  insert into public.portal_parts_quote_requests (
    shop_id, customer_id, vehicle_id, part_request_id, status,
    description, notes, qty, operation_key, created_by, created_at
  ) values (
    p_shop_id, p_customer_id, p_vehicle_id, v_part_request.id, 'requested',
    v_description, v_notes, v_qty, v_key, p_actor_user_id, v_now
  ) returning * into v_request;

  insert into public.activity_logs (user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id, 'portal_parts_quote_request', 'portal_parts_quote_requests', v_request.id,
    jsonb_build_object(
      'part_request_id', v_part_request.id,
      'vehicle_id', p_vehicle_id,
      'operation_key', v_key
    )
  );

  return jsonb_build_object(
    'ok', true,
    'requestId', v_request.id,
    'partRequestId', v_part_request.id,
    'status', v_request.status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.create_portal_parts_quote_request_atomic(
  uuid, uuid, uuid, uuid, text, text, numeric, text, timestamptz
) from public, anon;
grant execute on function public.create_portal_parts_quote_request_atomic(
  uuid, uuid, uuid, uuid, text, text, numeric, text, timestamptz
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Worker: price a request from its Parts items. Only service_role may call it.
-- Prices are frozen once the quote has been sent to the customer.
-- ---------------------------------------------------------------------------
create or replace function public.price_portal_parts_quote_request(
  p_request_id uuid,
  p_tax_rate numeric default 0,
  p_currency text default 'cad'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.portal_parts_quote_requests%rowtype;
  v_part_request_status text;
  v_currency text := case when lower(trim(coalesce(p_currency, ''))) = 'usd' then 'usd' else 'cad' end;
  v_tax_rate numeric := greatest(0, least(100, coalesce(p_tax_rate, 0)));
  v_count integer := 0;
  v_ready integer := 0;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_items jsonb := '[]'::jsonb;
begin
  select * into v_request
  from public.portal_parts_quote_requests
  where id = p_request_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_request.status not in ('requested', 'quoted') then
    return jsonb_build_object('ok', true, 'skipped', 'status_' || v_request.status, 'status', v_request.status);
  end if;
  if v_request.part_request_id is null then
    return jsonb_build_object('ok', true, 'skipped', 'no_part_request', 'status', v_request.status);
  end if;

  update public.portal_parts_quote_requests
  set pricing_checked_at = now()
  where id = v_request.id;

  select lower(coalesce(pr.status::text, ''))
    into v_part_request_status
  from public.part_requests pr
  where pr.id = v_request.part_request_id
    and pr.shop_id = v_request.shop_id;
  if v_part_request_status in ('cancelled', 'rejected', 'deferred') then
    return jsonb_build_object('ok', true, 'skipped', 'part_request_' || v_part_request_status, 'status', v_request.status);
  end if;

  with items as (
    select
      pri.id,
      pri.description,
      coalesce(nullif(trim(pri.requested_part_number), ''), nullif(trim(p.part_number), '')) as part_number,
      greatest(
        coalesce(pri.qty, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty_approved, 0),
        0
      ) as qty,
      coalesce(pri.quoted_price, pri.unit_price) as unit_price,
      pri.part_id,
      pri.requested_part_number,
      pri.requested_manufacturer,
      pri.created_at
    from public.part_request_items pri
    left join public.parts p
      on p.id = pri.part_id
     and p.shop_id = pri.shop_id
    where pri.request_id = v_request.part_request_id
      and pri.shop_id = v_request.shop_id
      and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled'
  ), active as (
    select * from items where qty > 0
  )
  select
    count(*)::integer,
    count(*) filter (
      where public.part_request_item_is_quote_ready(
        description, part_id, requested_part_number,
        requested_manufacturer, qty, unit_price
      )
    )::integer,
    coalesce(round(sum(
      case when public.part_request_item_is_quote_ready(
        description, part_id, requested_part_number,
        requested_manufacturer, qty, unit_price
      ) then qty * unit_price else 0 end
    ), 2), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'description', description,
      'part_number', part_number,
      'qty', qty,
      'unit_price', unit_price,
      'line_total', case when unit_price is null then null else round(qty * unit_price, 2) end
    ) order by created_at, id), '[]'::jsonb)
  into v_count, v_ready, v_subtotal, v_items
  from active;

  if v_count = 0 or v_ready < v_count or v_subtotal <= 0 then
    if v_request.status <> 'requested' then
      update public.portal_parts_quote_requests
      set status = 'requested', quoted_at = null
      where id = v_request.id;
    end if;
    return jsonb_build_object(
      'ok', true, 'status', 'requested', 'ready', false,
      'itemCount', v_count, 'quotedCount', v_ready
    );
  end if;

  v_tax := round(v_subtotal * v_tax_rate / 100, 2);

  update public.portal_parts_quote_requests
  set status = 'quoted',
      quoted_at = coalesce(quoted_at, now()),
      currency = v_currency,
      subtotal = v_subtotal,
      tax_rate = v_tax_rate,
      tax_total = v_tax,
      total = v_subtotal + v_tax,
      priced_items = v_items
  where id = v_request.id;

  return jsonb_build_object(
    'ok', true, 'status', 'quoted', 'ready', true,
    'itemCount', v_count, 'quotedCount', v_ready,
    'subtotal', v_subtotal, 'taxTotal', v_tax, 'total', v_subtotal + v_tax
  );
end;
$$;

revoke all on function public.price_portal_parts_quote_request(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.price_portal_parts_quote_request(uuid, numeric, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Worker: claim a priced request for sending, then mark it sent (or release
-- the claim after a failed delivery). One worker wins the claim per window.
-- ---------------------------------------------------------------------------
create or replace function public.claim_portal_parts_quote_request_send(
  p_request_id uuid,
  p_claim_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.portal_parts_quote_requests%rowtype;
begin
  update public.portal_parts_quote_requests
  set send_claimed_at = now()
  where id = p_request_id
    and status = 'quoted'
    and email_sent_at is null
    and (
      send_claimed_at is null
      or send_claimed_at < now() - make_interval(secs => greatest(30, coalesce(p_claim_seconds, 600)))
    )
  returning * into v_request;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  return jsonb_build_object(
    'claimed', true,
    'requestId', v_request.id,
    'shopId', v_request.shop_id,
    'customerId', v_request.customer_id,
    'description', v_request.description,
    'total', v_request.total,
    'currency', v_request.currency
  );
end;
$$;

revoke all on function public.claim_portal_parts_quote_request_send(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_portal_parts_quote_request_send(uuid, integer)
  to service_role;

create or replace function public.mark_portal_parts_quote_request_sent(
  p_request_id uuid,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.portal_parts_quote_requests%rowtype;
begin
  update public.portal_parts_quote_requests
  set status = 'sent',
      sent_at = coalesce(sent_at, coalesce(p_at, now())),
      email_sent_at = coalesce(p_at, now()),
      send_claimed_at = null
  where id = p_request_id
    and status = 'quoted'
  returning * into v_request;

  if not found then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  return jsonb_build_object('ok', true, 'changed', true, 'status', v_request.status);
end;
$$;

revoke all on function public.mark_portal_parts_quote_request_sent(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_portal_parts_quote_request_sent(uuid, timestamptz)
  to service_role;

create or replace function public.release_portal_parts_quote_request_send_claim(
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.portal_parts_quote_requests
  set send_claimed_at = null
  where id = p_request_id
    and status = 'quoted'
    and email_sent_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.release_portal_parts_quote_request_send_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.release_portal_parts_quote_request_send_claim(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Customer: approve or decline a sent quote. Approval releases the linked
-- parts request for ordering through the shared Parts lifecycle reconciler.
-- ---------------------------------------------------------------------------
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

  if v_decision = 'approve' then
    update public.portal_parts_quote_requests
    set status = 'approved', approved_at = v_now, approval_choice = v_choice
    where id = v_request.id;
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
      'choice', case when v_decision = 'approve' then v_choice else null end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'requestId', v_request.id,
    'status', case when v_decision = 'approve' then 'approved' else 'declined' end,
    'choice', case when v_decision = 'approve' then v_choice else null end,
    'idempotent', false
  );
end;
$$;

revoke all on function public.decide_portal_parts_quote_request_atomic(
  uuid, uuid, uuid, text, text, timestamptz
) from public, anon;
grant execute on function public.decide_portal_parts_quote_request_atomic(
  uuid, uuid, uuid, text, text, timestamptz
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Stripe: record a completed connected-account checkout. Idempotent per
-- checkout session; only an approved quote can be paid, and only in full.
-- ---------------------------------------------------------------------------
create or replace function public.record_portal_parts_quote_request_payment(
  p_request_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_connected_account_id text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.portal_parts_quote_requests%rowtype;
  v_expected_cents integer;
begin
  select * into v_request
  from public.portal_parts_quote_requests
  where id = p_request_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_request.paid_at is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'duplicate', v_request.stripe_checkout_session_id is distinct from p_session_id
    );
  end if;
  if v_request.status <> 'approved' then
    return jsonb_build_object('ok', false, 'error', 'not_approved', 'status', v_request.status);
  end if;

  v_expected_cents := round(coalesce(v_request.total, 0) * 100)::integer;
  if coalesce(p_amount_cents, 0) < v_expected_cents or v_expected_cents <= 0 then
    return jsonb_build_object(
      'ok', false, 'error', 'amount_mismatch',
      'expectedCents', v_expected_cents, 'paidCents', p_amount_cents
    );
  end if;

  update public.portal_parts_quote_requests
  set paid_at = coalesce(p_at, now()),
      amount_paid_cents = p_amount_cents,
      stripe_checkout_session_id = p_session_id,
      stripe_payment_intent_id = p_payment_intent_id,
      stripe_connected_account_id = p_connected_account_id
  where id = v_request.id;

  return jsonb_build_object('ok', true, 'idempotent', false, 'duplicate', false);
end;
$$;

revoke all on function public.record_portal_parts_quote_request_payment(
  uuid, text, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_portal_parts_quote_request_payment(
  uuid, text, text, integer, text, timestamptz
) to service_role;

commit;
