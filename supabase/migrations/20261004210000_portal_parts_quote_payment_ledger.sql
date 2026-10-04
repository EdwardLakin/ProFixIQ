begin;

-- Customer parts quote payments: ledger, invoice credit, refunds and disputes.
-- (Approved task-specific contract change on finalize_invoice_version.)
--
-- 1. portal_parts_quote_requests (feature-owned table) gains the work order
--    created at approval, a link to its payments ledger row, refund/dispute
--    state, a staff-alert flag, and what was applied to an invoice.
-- 2. decide_portal_parts_quote_request_atomic (feature-owned) records the
--    work order it creates on the quote.
-- 3. A paid quote is written to the existing payments ledger exactly once.
-- 4. finalize_invoice_version (existing, protected) gets ONE added guarded
--    step at its end: apply this work order's paid parts-quote prepayments to
--    the new invoice version through post_payment_event, so the customer is not
--    billed the same parts twice. It does nothing when there are none and can
--    never block invoicing.
-- 5. Stripe refunds and disputes on a parts quote charge update the quote and
--    its ledger row, raise a staff alert, and (when the payment was applied to
--    an invoice) post the matching event through post_payment_event.
--
-- CREATE OR REPLACE keeps each function's owner and grants.

alter table public.portal_parts_quote_requests
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null,
  add column if not exists payments_ledger_id uuid references public.payments(id) on delete set null,
  add column if not exists refunded_cents integer not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists dispute_status text,
  add column if not exists disputed_at timestamptz,
  add column if not exists payment_attention text,
  add column if not exists payment_attention_at timestamptz,
  add column if not exists prepaid_applied_cents integer not null default 0,
  add column if not exists prepaid_applied_version_id uuid references public.invoice_versions(id) on delete set null;

alter table public.portal_parts_quote_requests
  add constraint portal_parts_quote_requests_dispute_status_check
    check (dispute_status is null or dispute_status in ('open', 'won', 'lost')),
  add constraint portal_parts_quote_requests_payment_attention_check
    check (payment_attention is null or payment_attention in (
      'refunded', 'partially_refunded', 'dispute_open', 'dispute_lost',
      'credit_unapplied', 'ledger_mismatch'
    )),
  add constraint portal_parts_quote_requests_refunded_cents_check
    check (refunded_cents >= 0),
  add constraint portal_parts_quote_requests_prepaid_applied_cents_check
    check (prepaid_applied_cents >= 0);

create index if not exists portal_parts_quote_requests_work_order_idx
  on public.portal_parts_quote_requests (work_order_id);
create index if not exists portal_parts_quote_requests_payments_ledger_idx
  on public.portal_parts_quote_requests (payments_ledger_id);
create index if not exists portal_parts_quote_requests_applied_version_idx
  on public.portal_parts_quote_requests (prepaid_applied_version_id);
create unique index if not exists portal_parts_quote_requests_payment_intent_unique
  on public.portal_parts_quote_requests (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Deterministic, observable backfill: quotes approved before work_order_id was
-- stored are matched through the external id the approval stamped on the order.
update public.portal_parts_quote_requests q
set work_order_id = wo.id
from public.work_orders wo
where q.work_order_id is null
  and q.status = 'approved'
  and wo.shop_id = q.shop_id
  and wo.external_id = 'portal_parts_quote:' || q.id::text;

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
        part_request_id = v_new_request_id, work_order_id = v_work_order_id
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

-- ---------------------------------------------------------------------------
-- Ledger: one payments row per paid quote (idempotent).
-- ---------------------------------------------------------------------------
create or replace function public.record_portal_parts_quote_request_ledger_payment(
  p_request_id uuid,
  p_platform_fee_cents integer default 0,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.portal_parts_quote_requests%rowtype;
  v_payment_id uuid;
begin
  select * into v_request
  from public.portal_parts_quote_requests
  where id = p_request_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_request.paid_at is null or v_request.stripe_checkout_session_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_paid');
  end if;
  if v_request.payments_ledger_id is not null then
    return jsonb_build_object('ok', true, 'idempotent', true, 'paymentId', v_request.payments_ledger_id);
  end if;

  insert into public.payments (
    shop_id, work_order_id, customer_id, stripe_session_id,
    stripe_checkout_session_id, stripe_payment_intent_id,
    stripe_connected_account_id, amount_cents, amount, currency, status,
    paid_at, description, platform_fee_cents, metadata
  ) values (
    v_request.shop_id, v_request.work_order_id, v_request.customer_id,
    v_request.stripe_checkout_session_id, v_request.stripe_checkout_session_id,
    v_request.stripe_payment_intent_id, v_request.stripe_connected_account_id,
    v_request.amount_paid_cents, round(v_request.amount_paid_cents / 100.0, 2),
    v_request.currency, 'paid', coalesce(v_request.paid_at, p_at),
    left('Parts quote: ' || v_request.description, 500),
    greatest(coalesce(p_platform_fee_cents, 0), 0),
    jsonb_build_object(
      'purpose', 'portal_parts_quote_payment',
      'parts_quote_request_id', v_request.id
    )
  )
  on conflict do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select id into v_payment_id
    from public.payments
    where stripe_session_id = v_request.stripe_checkout_session_id
      and shop_id = v_request.shop_id;
  end if;
  if v_payment_id is null then
    return jsonb_build_object('ok', false, 'error', 'ledger_conflict');
  end if;

  update public.portal_parts_quote_requests
  set payments_ledger_id = v_payment_id
  where id = v_request.id;

  return jsonb_build_object('ok', true, 'idempotent', false, 'paymentId', v_payment_id);
end;
$$;

revoke all on function public.record_portal_parts_quote_request_ledger_payment(
  uuid, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_portal_parts_quote_request_ledger_payment(
  uuid, integer, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- Invoice credit: apply a work order's paid parts-quote prepayments to an
-- issued invoice version through the canonical payment ledger.
-- ---------------------------------------------------------------------------
create or replace function public.apply_portal_parts_quote_prepayments(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_invoice_version_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.portal_parts_quote_requests%rowtype;
  v_version public.invoice_versions%rowtype;
  v_available integer;
  v_apply integer;
  v_applied_total integer := 0;
begin
  for v_quote in
    select q.*
    from public.portal_parts_quote_requests q
    where q.shop_id = p_shop_id
      and q.work_order_id = p_work_order_id
      and q.paid_at is not null
      and coalesce(q.amount_paid_cents, 0) > 0
    order by q.paid_at, q.id
    for update
  loop
    -- Money that is disputed or lost is not a credit.
    if coalesce(v_quote.dispute_status, '') in ('open', 'lost') then
      continue;
    end if;
    v_available := v_quote.amount_paid_cents - v_quote.refunded_cents;
    if v_available <= 0 then
      continue;
    end if;
    -- Already credited to an invoice version that is still live.
    if v_quote.prepaid_applied_version_id is not null and exists (
      select 1 from public.invoice_versions iv
      where iv.id = v_quote.prepaid_applied_version_id
        and iv.lifecycle_status in ('issued', 'partially_paid', 'paid')
    ) then
      continue;
    end if;

    select * into v_version
    from public.invoice_versions
    where id = p_invoice_version_id
      and shop_id = p_shop_id
      and work_order_id = p_work_order_id
    for update;
    if not found or v_version.lifecycle_status not in ('issued', 'partially_paid') then
      exit;
    end if;
    if lower(v_version.currency) is distinct from lower(v_quote.currency) then
      update public.portal_parts_quote_requests
      set payment_attention = 'credit_unapplied', payment_attention_at = now()
      where id = v_quote.id;
      continue;
    end if;

    v_apply := least(v_available, floor(greatest(v_version.outstanding_total, 0) * 100)::integer);
    if v_apply <= 0 then
      update public.portal_parts_quote_requests
      set payment_attention = 'credit_unapplied', payment_attention_at = now()
      where id = v_quote.id;
      continue;
    end if;

    begin
      perform public.post_payment_event(
        p_shop_id, p_work_order_id, p_invoice_version_id, 'payment_succeeded',
        round(v_apply / 100.0, 2), upper(v_quote.currency), 'card', 'stripe',
        'portal-parts-quote:' || v_quote.stripe_checkout_session_id || ':' || p_invoice_version_id::text,
        v_quote.stripe_payment_intent_id,
        'portal-parts-quote-prepay:' || v_quote.id::text || ':' || p_invoice_version_id::text,
        null, now(),
        jsonb_build_object(
          'purpose', 'portal_parts_quote_payment',
          'parts_quote_request_id', v_quote.id,
          'applied_as', 'prepayment'
        )
      );
      update public.portal_parts_quote_requests
      set prepaid_applied_cents = v_apply,
          prepaid_applied_version_id = p_invoice_version_id,
          payment_attention = case
            when v_apply < v_available then 'credit_unapplied'
            else payment_attention
          end,
          payment_attention_at = case
            when v_apply < v_available then now()
            else payment_attention_at
          end
      where id = v_quote.id;
      v_applied_total := v_applied_total + v_apply;
    exception when others then
      update public.portal_parts_quote_requests
      set payment_attention = 'ledger_mismatch', payment_attention_at = now()
      where id = v_quote.id;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'appliedCents', v_applied_total);
end;
$$;

revoke all on function public.apply_portal_parts_quote_prepayments(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_portal_parts_quote_prepayments(uuid, uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Stripe refund / dispute events on a parts quote charge. Returns
-- handled = false when the charge does not belong to a parts quote, so the
-- caller falls through to the existing invoice handling.
-- ---------------------------------------------------------------------------
create or replace function public.record_portal_parts_quote_payment_event(
  p_payment_intent_id text,
  p_event_kind text,
  p_amount_cents integer,
  p_processor_event_id text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.portal_parts_quote_requests%rowtype;
  v_kind text := lower(trim(coalesce(p_event_kind, '')));
  v_amount integer := greatest(coalesce(p_amount_cents, 0), 0);
  v_new_refunded integer;
  v_delta integer;
  v_applied boolean;
  v_post_kind text;
  v_post_amount integer;
  v_ledger_error text;
begin
  if nullif(trim(coalesce(p_payment_intent_id, '')), '') is null then
    return jsonb_build_object('handled', false);
  end if;
  select * into v_quote
  from public.portal_parts_quote_requests
  where stripe_payment_intent_id = p_payment_intent_id
  for update;
  if not found then
    return jsonb_build_object('handled', false);
  end if;
  if v_kind not in ('refund_succeeded', 'dispute_opened', 'dispute_won', 'dispute_lost') then
    return jsonb_build_object('handled', true, 'ignored', true);
  end if;

  v_applied := v_quote.prepaid_applied_version_id is not null and exists (
    select 1 from public.invoice_versions iv
    where iv.id = v_quote.prepaid_applied_version_id
      and iv.lifecycle_status in ('issued', 'partially_paid', 'paid')
  );

  if v_kind = 'refund_succeeded' then
    -- Stripe reports the cumulative refunded amount, so this is idempotent.
    v_new_refunded := least(v_amount, v_quote.amount_paid_cents);
    if v_new_refunded <= v_quote.refunded_cents then
      return jsonb_build_object('handled', true, 'idempotent', true);
    end if;
    v_delta := v_new_refunded - v_quote.refunded_cents;
    v_post_kind := 'refund_succeeded';
    v_post_amount := v_delta;
    update public.portal_parts_quote_requests
    set refunded_cents = v_new_refunded,
        refunded_at = coalesce(refunded_at, coalesce(p_at, now())),
        payment_attention = case
          when v_new_refunded >= v_quote.amount_paid_cents then 'refunded'
          else 'partially_refunded'
        end,
        payment_attention_at = now()
    where id = v_quote.id;
    if v_new_refunded >= v_quote.amount_paid_cents and v_quote.payments_ledger_id is not null then
      update public.payments set status = 'refunded' where id = v_quote.payments_ledger_id;
    end if;
  elsif v_kind = 'dispute_opened' then
    v_post_kind := 'dispute_opened';
    v_post_amount := least(v_amount, v_quote.amount_paid_cents);
    update public.portal_parts_quote_requests
    set dispute_status = 'open',
        disputed_at = coalesce(disputed_at, coalesce(p_at, now())),
        payment_attention = 'dispute_open',
        payment_attention_at = now()
    where id = v_quote.id;
  elsif v_kind = 'dispute_won' then
    v_post_kind := 'dispute_won';
    v_post_amount := least(v_amount, v_quote.amount_paid_cents);
    update public.portal_parts_quote_requests
    set dispute_status = 'won',
        payment_attention = case
          when refunded_cents > 0 then payment_attention
          else null
        end,
        payment_attention_at = now()
    where id = v_quote.id;
  else
    v_post_kind := 'dispute_lost';
    v_post_amount := least(v_amount, v_quote.amount_paid_cents);
    update public.portal_parts_quote_requests
    set dispute_status = 'lost',
        payment_attention = 'dispute_lost',
        payment_attention_at = now()
    where id = v_quote.id;
  end if;

  -- When the payment was credited to an invoice, mirror the event on the
  -- canonical ledger so the invoice balance stays true. A mismatch there must
  -- not lose the staff alert, so it is recorded and surfaced instead.
  if v_applied and v_post_amount > 0 then
    begin
      perform public.post_payment_event(
        v_quote.shop_id, v_quote.work_order_id, v_quote.prepaid_applied_version_id,
        v_post_kind, round(v_post_amount / 100.0, 2), upper(v_quote.currency),
        'card', 'stripe', 'portal-parts-quote-event:' || p_processor_event_id,
        v_quote.stripe_payment_intent_id,
        'portal-parts-quote-event:' || v_quote.id::text || ':' || p_processor_event_id,
        null, coalesce(p_at, now()),
        jsonb_build_object(
          'purpose', 'portal_parts_quote_payment',
          'parts_quote_request_id', v_quote.id
        )
      );
    exception when others then
      v_ledger_error := sqlerrm;
      update public.portal_parts_quote_requests
      set payment_attention = 'ledger_mismatch', payment_attention_at = now()
      where id = v_quote.id;
    end;
  end if;

  insert into public.activity_logs (user_id, action, target_table, target_id, context)
  values (
    null, 'portal_parts_quote_' || v_kind, 'portal_parts_quote_requests', v_quote.id,
    jsonb_build_object(
      'amount_cents', v_amount,
      'processor_event_id', p_processor_event_id,
      'applied_to_invoice', v_applied,
      'ledger_error', v_ledger_error
    )
  );

  return jsonb_build_object(
    'handled', true,
    'requestId', v_quote.id,
    'appliedToInvoice', v_applied,
    'ledgerError', v_ledger_error
  );
end;
$$;

revoke all on function public.record_portal_parts_quote_payment_event(
  text, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_portal_parts_quote_payment_event(
  text, text, integer, text, timestamptz
) to service_role;

create or replace function public.finalize_invoice_version(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_invoice_id uuid,
  p_snapshot jsonb,
  p_currency text,
  p_subtotal numeric,
  p_discount_total numeric,
  p_tax_total numeric,
  p_total numeric,
  p_actor_user_id uuid,
  p_operation_key text
)
returns public.invoice_versions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_work_order public.work_orders%rowtype;
  v_invoice public.invoices%rowtype;
  v_version public.invoice_versions%rowtype;
  v_snapshot jsonb;
  v_next_version integer;
  v_hash text;
  v_issued_at timestamptz := pg_catalog.now();
  v_labor numeric;
  v_parts numeric;
  v_supplies numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
begin
  if p_snapshot is null or pg_catalog.jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Invoice snapshot is required';
  end if;
  if pg_catalog.upper(p_currency) not in ('CAD', 'USD') then
    raise exception 'Unsupported currency';
  end if;
  if coalesce(pg_catalog.btrim(p_operation_key), '') = '' then
    raise exception 'Operation key is required';
  end if;
  if p_snapshot #>> '{workOrder,id}' is distinct from p_work_order_id::text
     or p_snapshot #>> '{workOrder,shop_id}' is distinct from p_shop_id::text then
    raise exception 'Invoice snapshot does not match the work order';
  end if;

  select wo.*
  into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Work order not found for shop';
  end if;

  select iv.*
  into v_version
  from public.invoice_versions iv
  where iv.shop_id = p_shop_id
    and iv.work_order_id = p_work_order_id
    and iv.lifecycle_status in ('issued', 'partially_paid', 'paid')
  order by iv.version_number desc
  limit 1;

  if found then
    return v_version;
  end if;

  v_labor := pg_catalog.round(coalesce((p_snapshot ->> 'laborCost')::numeric, 0), 2);
  v_parts := pg_catalog.round(coalesce((p_snapshot ->> 'partsCost')::numeric, 0), 2);
  v_supplies := pg_catalog.round(coalesce((p_snapshot ->> 'shopSuppliesTotal')::numeric, 0), 2);
  v_subtotal := pg_catalog.round(coalesce(p_subtotal, 0), 2);
  v_discount := pg_catalog.round(coalesce(p_discount_total, 0), 2);
  v_tax := pg_catalog.round(coalesce(p_tax_total, 0), 2);
  v_total := pg_catalog.round(coalesce(p_total, 0), 2);

  if least(v_labor, v_parts, v_supplies, v_subtotal, v_discount, v_tax, v_total) < 0 then
    raise exception 'Invoice amounts cannot be negative';
  end if;
  if pg_catalog.abs(v_subtotal - (v_labor + v_parts + v_supplies)) > 0.01 then
    raise exception 'Invoice subtotal does not match labor, parts, and shop supplies';
  end if;
  if pg_catalog.abs(v_total - greatest(v_subtotal - v_discount + v_tax, 0)) > 0.01 then
    raise exception 'Invoice total does not match subtotal, discount, and tax';
  end if;
  if v_total <= 0 then
    raise exception 'Invoice total must be greater than zero';
  end if;

  if p_invoice_id is not null then
    select i.*
    into v_invoice
    from public.invoices i
    where i.id = p_invoice_id
      and i.shop_id = p_shop_id
      and i.work_order_id = p_work_order_id
    for update;

    if not found then
      raise exception 'Invoice not found for work order and shop';
    end if;
  else
    select i.*
    into v_invoice
    from public.invoices i
    where i.shop_id = p_shop_id
      and i.work_order_id = p_work_order_id
      and i.status = 'draft'
    order by i.created_at desc
    limit 1
    for update;

    if not found then
      insert into public.invoices (
        shop_id,
        work_order_id,
        customer_id,
        currency,
        labor_cost,
        parts_cost,
        shop_supplies_total,
        subtotal,
        discount_total,
        tax_total,
        total,
        status,
        issued_at,
        created_by
      )
      values (
        p_shop_id,
        p_work_order_id,
        v_work_order.customer_id,
        pg_catalog.upper(p_currency),
        v_labor,
        v_parts,
        v_supplies,
        v_subtotal,
        v_discount,
        v_tax,
        v_total,
        'draft',
        null,
        p_actor_user_id
      )
      returning * into v_invoice;
    end if;
  end if;

  update public.invoices
  set customer_id = v_work_order.customer_id,
      currency = pg_catalog.upper(p_currency),
      labor_cost = v_labor,
      parts_cost = v_parts,
      shop_supplies_total = v_supplies,
      subtotal = v_subtotal,
      discount_total = v_discount,
      tax_total = v_tax,
      total = v_total,
      status = 'issued',
      issued_at = coalesce(issued_at, v_issued_at)
  where id = v_invoice.id
    and shop_id = p_shop_id
  returning * into v_invoice;

  v_snapshot := pg_catalog.jsonb_set(
    p_snapshot,
    '{invoice}',
    pg_catalog.jsonb_build_object(
      'id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'status', v_invoice.status,
      'currency', v_invoice.currency,
      'subtotal', v_invoice.subtotal,
      'parts_cost', v_invoice.parts_cost,
      'labor_cost', v_invoice.labor_cost,
      'shop_supplies_total', v_invoice.shop_supplies_total,
      'discount_total', v_invoice.discount_total,
      'tax_total', v_invoice.tax_total,
      'total', v_invoice.total,
      'issued_at', v_invoice.issued_at,
      'created_at', v_invoice.created_at,
      'notes', v_invoice.notes
    ),
    true
  );

  v_hash := pg_catalog.encode(
    extensions.digest(p_operation_key || ':' || v_snapshot::text, 'sha256'::text),
    'hex'
  );

  select coalesce(pg_catalog.max(iv.version_number), 0) + 1
  into v_next_version
  from public.invoice_versions iv
  where iv.work_order_id = p_work_order_id;

  insert into public.invoice_versions (
    shop_id,
    work_order_id,
    invoice_id,
    version_number,
    lifecycle_status,
    currency,
    subtotal,
    discount_total,
    tax_total,
    total,
    snapshot,
    snapshot_hash,
    issued_at,
    issued_by
  )
  values (
    p_shop_id,
    p_work_order_id,
    v_invoice.id,
    v_next_version,
    'issued',
    pg_catalog.upper(p_currency),
    v_invoice.subtotal,
    v_invoice.discount_total,
    v_invoice.tax_total,
    v_invoice.total,
    v_snapshot,
    v_hash,
    v_invoice.issued_at,
    p_actor_user_id
  )
  returning * into v_version;

  update public.invoices
  set active_invoice_version_id = v_version.id
  where id = v_invoice.id
    and shop_id = p_shop_id;

  update public.work_orders
  set labor_total = v_invoice.labor_cost,
      parts_total = v_invoice.parts_cost,
      invoice_total = v_invoice.total,
      status = 'invoiced'
  where id = p_work_order_id
    and shop_id = p_shop_id;

  insert into public.financial_domain_outbox (
    shop_id,
    aggregate_type,
    aggregate_id,
    event_type,
    dedupe_key,
    payload
  )
  values (
    p_shop_id,
    'invoice_version',
    v_version.id,
    'invoice.issued',
    'invoice.issued:' || v_version.id::text,
    pg_catalog.jsonb_build_object(
      'invoice_version_id', v_version.id,
      'work_order_id', p_work_order_id,
      'invoice_id', v_invoice.id,
      'total', v_version.total,
      'currency', v_version.currency,
      'labor_total', v_invoice.labor_cost,
      'parts_total', v_invoice.parts_cost,
      'shop_supplies_total', v_invoice.shop_supplies_total
    )
  )
  on conflict do nothing;

  -- Customer prepayments (paid parts quotes for this work order) are applied
  -- to the new invoice through the canonical payment ledger. The helper is a
  -- no-op when there are none, and a failure here must never block invoicing,
  -- so it runs in its own subtransaction.
  begin
    perform public.apply_portal_parts_quote_prepayments(
      p_shop_id,
      p_work_order_id,
      v_version.id
    );
  exception when others then
    raise warning 'Portal parts quote prepayment was not applied: %', sqlerrm;
  end;

  select iv.*
  into v_version
  from public.invoice_versions iv
  where iv.id = v_version.id;

  return v_version;
end;
$function$;

commit;
