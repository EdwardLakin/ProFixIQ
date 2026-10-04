\set ON_ERROR_STOP on

begin;

-- Fixtures: owner, shop, one portal customer with a vehicle and an accepted
-- portal invite.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('b1000000-0000-4000-8000-0000000000a1', 'pq-ledger-owner@example.com', '{"full_name":"PQ Ledger Owner"}'::jsonb),
  ('b1000000-0000-4000-8000-0000000000a2', 'pq-ledger-customer@example.com', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values ('b1000000-0000-4000-8000-0000000000a1', 'b1000000-0000-4000-8000-0000000000a1', 'owner', 'PQ Ledger Owner')
on conflict (id) do update set user_id = excluded.user_id, role = excluded.role;

delete from public.profiles where id = 'b1000000-0000-4000-8000-0000000000a2';

insert into public.shops (id, owner_id, business_name, name, plan, user_limit)
values ('b1000000-0000-4000-8000-0000000000b1', 'b1000000-0000-4000-8000-0000000000a1',
        'PQ Ledger Shop', 'PQ Ledger Shop', 'complete_10', 1)
on conflict (id) do nothing;

update public.profiles set shop_id = 'b1000000-0000-4000-8000-0000000000b1'
where id = 'b1000000-0000-4000-8000-0000000000a1';

insert into public.customers (id, shop_id, user_id, name, email)
values ('b1000000-0000-4000-8000-0000000000c1', 'b1000000-0000-4000-8000-0000000000b1',
        'b1000000-0000-4000-8000-0000000000a2', 'PQ Ledger Customer', 'pq-ledger-customer@example.com')
on conflict (id) do update set shop_id = excluded.shop_id, user_id = excluded.user_id;

insert into public.vehicles (id, shop_id, customer_id, vin, year, make, model)
values ('b1000000-0000-4000-8000-0000000000d1', 'b1000000-0000-4000-8000-0000000000b1',
        'b1000000-0000-4000-8000-0000000000c1', '1HGCM82633A0B1001', 2020, 'Honda', 'Accord')
on conflict (id) do nothing;

insert into public.customer_portal_invites (id, shop_id, customer_id, email, token, accepted_at, accepted_by_user_id, revoked_at)
values ('b1000000-0000-4000-8000-0000000000e1', 'b1000000-0000-4000-8000-0000000000b1',
        'b1000000-0000-4000-8000-0000000000c1', 'pq-ledger-customer@example.com',
        'b1000000-0000-4000-8000-0000000000f1', now(), 'b1000000-0000-4000-8000-0000000000a2', null)
on conflict (id) do nothing;

-- Creates a quote the way the portal does (as the customer), has Parts price
-- it, sends it, has the customer approve it, then records its Stripe payment.
-- Returns the quote id. Everything goes through the real RPCs.
create function pg_temp.make_paid_quote(
  p_key text, p_unit_price numeric, p_session text, p_intent text, p_fee integer
) returns uuid
language plpgsql
as $$
declare
  v_created jsonb;
  v_quote uuid;
  v_part_request uuid;
  v_cents integer := round(p_unit_price * 100)::integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"b1000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  v_created := public.create_portal_parts_quote_request_atomic(
    'b1000000-0000-4000-8000-0000000000b1', 'b1000000-0000-4000-8000-0000000000c1',
    'b1000000-0000-4000-8000-0000000000d1', 'b1000000-0000-4000-8000-0000000000a2',
    'Parts ' || p_key, null, 1, 'pq-ledger-op-' || p_key);
  v_quote := (v_created ->> 'requestId')::uuid;
  v_part_request := (v_created ->> 'partRequestId')::uuid;

  update public.part_request_items
  set quoted_price = p_unit_price, unit_price = p_unit_price
  where request_id = v_part_request;

  perform public.price_portal_parts_quote_request(v_quote, 0, 'cad');
  perform public.claim_portal_parts_quote_request_send(v_quote, 600);
  perform public.mark_portal_parts_quote_request_sent(v_quote, now());

  perform public.decide_portal_parts_quote_request_atomic(
    v_quote, 'b1000000-0000-4000-8000-0000000000c1',
    'b1000000-0000-4000-8000-0000000000a2', 'approve', 'order_parts', now());

  perform set_config('request.jwt.claims', '', true);
  perform public.record_portal_parts_quote_request_payment(
    v_quote, p_session, p_intent, v_cents, 'acct_ledger_test', now());
  perform public.record_portal_parts_quote_request_ledger_payment(v_quote, p_fee, now());
  return v_quote;
end;
$$;

-- Finalizes an invoice for a work order the way the app does.
create function pg_temp.finalize(p_wo uuid, p_labor numeric, p_parts numeric, p_key text)
returns public.invoice_versions
language plpgsql
as $$
declare
  v_total numeric := p_labor + p_parts;
begin
  return public.finalize_invoice_version(
    'b1000000-0000-4000-8000-0000000000b1', p_wo, null,
    jsonb_build_object(
      'workOrder', jsonb_build_object('id', p_wo, 'shop_id', 'b1000000-0000-4000-8000-0000000000b1'),
      'laborCost', p_labor, 'partsCost', p_parts, 'shopSuppliesTotal', 0,
      'currency', 'CAD', 'subtotal', v_total, 'discountTotal', 0, 'taxTotal', 0, 'total', v_total
    ),
    'CAD', v_total, 0, 0, v_total, 'b1000000-0000-4000-8000-0000000000a1', p_key);
end;
$$;

-- The replayed baseline still carries the legacy work_orders_status_check, which
-- production does not have (production's work_orders_status_chk allows
-- 'invoiced'). finalize_invoice_version sets 'invoiced', so drop the stale
-- legacy check for this proof only; the whole file is rolled back.
alter table public.work_orders drop constraint if exists work_orders_status_check;

do $ledger$
declare
  v_shop constant uuid := 'b1000000-0000-4000-8000-0000000000b1';
  v_q1 uuid; v_q2 uuid; v_q3 uuid; v_q4 uuid;
  v_quote public.portal_parts_quote_requests%rowtype;
  v_payment public.payments%rowtype;
  v_version public.invoice_versions%rowtype;
  v_result jsonb;
  v_count integer;
begin
  ---------------------------------------------------------------------------
  -- 1. A paid quote is written to the payments ledger exactly once.
  ---------------------------------------------------------------------------
  v_q1 := pg_temp.make_paid_quote('one', 100, 'cs_ledger_1', 'pi_ledger_1', 300);
  select * into v_quote from public.portal_parts_quote_requests where id = v_q1;
  if v_quote.work_order_id is null then
    raise exception 'Approval did not record the work order on the quote';
  end if;
  select * into v_payment from public.payments where id = v_quote.payments_ledger_id;
  if v_payment.id is null
     or v_payment.status <> 'paid' or v_payment.amount_cents <> 10000 or v_payment.amount <> 100
     or v_payment.currency <> 'cad' or v_payment.platform_fee_cents <> 300
     or v_payment.work_order_id is distinct from v_quote.work_order_id
     or v_payment.customer_id is distinct from v_quote.customer_id
     or v_payment.stripe_payment_intent_id <> 'pi_ledger_1'
     or v_payment.metadata ->> 'purpose' <> 'portal_parts_quote_payment' then
    raise exception 'Ledger row is wrong: %', to_jsonb(v_payment);
  end if;
  v_result := public.record_portal_parts_quote_request_ledger_payment(v_q1, 300, now());
  if (v_result ->> 'ok')::boolean is not true or (v_result ->> 'paymentId')::uuid <> v_payment.id then
    raise exception 'Replayed ledger write was not idempotent: %', v_result;
  end if;
  select count(*) into v_count from public.payments where stripe_session_id = 'cs_ledger_1';
  if v_count <> 1 then raise exception 'Ledger write created % rows', v_count; end if;

  ---------------------------------------------------------------------------
  -- 2. Invoicing credits the prepayment through the canonical payment ledger.
  ---------------------------------------------------------------------------
  v_version := pg_temp.finalize(v_quote.work_order_id, 50, 100, 'ledger-final-1');
  if v_version.paid_total <> 100 or v_version.outstanding_total <> 50
     or v_version.lifecycle_status <> 'partially_paid' then
    raise exception 'Prepayment was not credited to the invoice: %', to_jsonb(v_version);
  end if;
  select count(*) into v_count from public.payment_events
  where invoice_version_id = v_version.id and event_kind = 'payment_succeeded' and amount = 100
    and operation_key = 'portal-parts-quote-prepay:' || v_q1::text || ':' || v_version.id::text;
  if v_count <> 1 then raise exception 'Expected one prepayment event, found %', v_count; end if;
  if not exists (select 1 from public.payment_receipts where invoice_version_id = v_version.id and amount = 100) then
    raise exception 'No receipt was issued for the prepayment';
  end if;
  select * into v_quote from public.portal_parts_quote_requests where id = v_q1;
  if v_quote.prepaid_applied_cents <> 10000 or v_quote.prepaid_applied_version_id <> v_version.id
     or v_quote.payment_attention is not null then
    raise exception 'Quote did not record the applied credit: %', to_jsonb(v_quote);
  end if;

  -- Replays do not credit twice.
  v_result := public.apply_portal_parts_quote_prepayments(v_shop, v_quote.work_order_id, v_version.id);
  if (v_result ->> 'appliedCents')::integer <> 0 then
    raise exception 'A second apply credited again: %', v_result;
  end if;
  perform pg_temp.finalize(v_quote.work_order_id, 50, 100, 'ledger-final-1-retry');
  select count(*) into v_count from public.payment_events where invoice_version_id = v_version.id;
  if v_count <> 1 then raise exception 'Replays created % payment events', v_count; end if;

  ---------------------------------------------------------------------------
  -- 3. Refunds are mirrored on the invoice and alert staff.
  ---------------------------------------------------------------------------
  v_result := public.record_portal_parts_quote_payment_event('pi_ledger_1', 'refund_succeeded', 4000, 'evt_ledger_refund_1', now());
  if (v_result ->> 'handled')::boolean is not true then raise exception 'Refund was not handled: %', v_result; end if;
  select * into v_quote from public.portal_parts_quote_requests where id = v_q1;
  select * into v_version from public.invoice_versions where id = v_quote.prepaid_applied_version_id;
  if v_quote.refunded_cents <> 4000 or v_quote.payment_attention <> 'partially_refunded'
     or v_version.refunded_total <> 40 then
    raise exception 'Partial refund was not recorded: quote %, version %', to_jsonb(v_quote), to_jsonb(v_version);
  end if;
  v_result := public.record_portal_parts_quote_payment_event('pi_ledger_1', 'refund_succeeded', 4000, 'evt_ledger_refund_1', now());
  select * into v_version from public.invoice_versions where id = v_quote.prepaid_applied_version_id;
  select count(*) into v_count from public.payment_events
  where invoice_version_id = v_version.id and event_kind = 'refund_succeeded';
  if v_version.refunded_total <> 40 or v_count <> 1 then
    raise exception 'A replayed refund was not idempotent: refunded %, events %', v_version.refunded_total, v_count;
  end if;
  -- A refund event that arrives out of order (smaller than the recorded total)
  -- never lowers it.
  perform public.record_portal_parts_quote_payment_event('pi_ledger_1', 'refund_succeeded', 1000, 'evt_ledger_refund_old', now());
  select * into v_quote from public.portal_parts_quote_requests where id = v_q1;
  if v_quote.refunded_cents <> 4000 then
    raise exception 'An out-of-order refund lowered the recorded total: %', v_quote.refunded_cents;
  end if;
  v_result := public.record_portal_parts_quote_payment_event('pi_ledger_1', 'refund_succeeded', 10000, 'evt_ledger_refund_2', now());
  select * into v_quote from public.portal_parts_quote_requests where id = v_q1;
  select * into v_version from public.invoice_versions where id = v_quote.prepaid_applied_version_id;
  select * into v_payment from public.payments where id = v_quote.payments_ledger_id;
  if v_quote.refunded_cents <> 10000 or v_quote.payment_attention <> 'refunded'
     or v_version.refunded_total <> 100 or v_payment.status <> 'refunded' then
    raise exception 'Full refund was not recorded: quote %, version %, payment %',
      to_jsonb(v_quote), to_jsonb(v_version), to_jsonb(v_payment);
  end if;

  ---------------------------------------------------------------------------
  -- 4. Disputes: opened, then won.
  ---------------------------------------------------------------------------
  v_q2 := pg_temp.make_paid_quote('two', 100, 'cs_ledger_2', 'pi_ledger_2', 0);
  select * into v_quote from public.portal_parts_quote_requests where id = v_q2;
  v_version := pg_temp.finalize(v_quote.work_order_id, 50, 100, 'ledger-final-2');
  v_result := public.record_portal_parts_quote_payment_event('pi_ledger_2', 'dispute_opened', 10000, 'evt_ledger_dispute_open', now());
  select * into v_quote from public.portal_parts_quote_requests where id = v_q2;
  select * into v_version from public.invoice_versions where id = v_quote.prepaid_applied_version_id;
  if v_quote.dispute_status <> 'open' or v_quote.payment_attention <> 'dispute_open'
     or v_version.refunded_total <> 100 then
    raise exception 'Dispute was not recorded: quote %, version %', to_jsonb(v_quote), to_jsonb(v_version);
  end if;
  v_result := public.record_portal_parts_quote_payment_event('pi_ledger_2', 'dispute_won', 10000, 'evt_ledger_dispute_won', now());
  select * into v_quote from public.portal_parts_quote_requests where id = v_q2;
  select * into v_version from public.invoice_versions where id = v_quote.prepaid_applied_version_id;
  if v_quote.dispute_status <> 'won' or v_quote.payment_attention is not null
     or v_version.refunded_total <> 0 then
    raise exception 'Won dispute was not recorded: quote %, version %', to_jsonb(v_quote), to_jsonb(v_version);
  end if;

  -- A dispute event replayed or reordered after the outcome changes nothing.
  perform public.record_portal_parts_quote_payment_event('pi_ledger_2', 'dispute_opened', 10000, 'evt_ledger_dispute_open', now());
  select * into v_quote from public.portal_parts_quote_requests where id = v_q2;
  select * into v_version from public.invoice_versions where id = v_quote.prepaid_applied_version_id;
  if v_quote.dispute_status <> 'won' or v_version.refunded_total <> 0 then
    raise exception 'A late dispute_opened reopened a won dispute: quote %, version %', to_jsonb(v_quote), to_jsonb(v_version);
  end if;

  -- A lost dispute keeps the money out of the invoice and alerts staff.
  v_q4 := pg_temp.make_paid_quote('four', 100, 'cs_ledger_4', 'pi_ledger_4', 0);
  select * into v_quote from public.portal_parts_quote_requests where id = v_q4;
  perform pg_temp.finalize(v_quote.work_order_id, 50, 100, 'ledger-final-4');
  perform public.record_portal_parts_quote_payment_event('pi_ledger_4', 'dispute_opened', 10000, 'evt_ledger_dispute_open_4', now());
  perform public.record_portal_parts_quote_payment_event('pi_ledger_4', 'dispute_lost', 10000, 'evt_ledger_dispute_lost_4', now());
  select * into v_quote from public.portal_parts_quote_requests where id = v_q4;
  select * into v_version from public.invoice_versions where id = v_quote.prepaid_applied_version_id;
  select * into v_payment from public.payments where id = v_quote.payments_ledger_id;
  if v_quote.dispute_status <> 'lost' or v_quote.payment_attention <> 'dispute_lost'
     or v_version.refunded_total <> 100 or v_payment.status <> 'refunded' then
    raise exception 'Lost dispute was not recorded: quote %, version %, payment %',
      to_jsonb(v_quote), to_jsonb(v_version), to_jsonb(v_payment);
  end if;

  -- A refund event that arrives before the payment was recorded is matched by
  -- the request id and connected account, and applies once the payment lands.
  v_result := public.record_portal_parts_quote_payment_event(
    'pi_not_a_parts_quote', 'refund_succeeded', 100, 'evt_other_with_request', now(),
    v_q4, 'acct_wrong');
  if (v_result ->> 'handled')::boolean is not false then
    raise exception 'An event for another connected account was handled: %', v_result;
  end if;

  ---------------------------------------------------------------------------
  -- 5. A prepayment larger than the invoice is capped and flagged for staff.
  ---------------------------------------------------------------------------
  v_q3 := pg_temp.make_paid_quote('three', 100, 'cs_ledger_3', 'pi_ledger_3', 0);
  select * into v_quote from public.portal_parts_quote_requests where id = v_q3;
  v_version := pg_temp.finalize(v_quote.work_order_id, 0, 60, 'ledger-final-3');
  select * into v_quote from public.portal_parts_quote_requests where id = v_q3;
  if v_version.paid_total <> 60 or v_version.lifecycle_status <> 'paid'
     or v_quote.prepaid_applied_cents <> 6000 or v_quote.payment_attention <> 'credit_unapplied' then
    raise exception 'Over-payment was not capped and flagged: quote %, version %', to_jsonb(v_quote), to_jsonb(v_version);
  end if;

  ---------------------------------------------------------------------------
  -- 6. Control: a work order with no prepayment finalizes exactly as before,
  --    and events for a charge that is not a parts quote are not handled here.
  ---------------------------------------------------------------------------
  insert into public.work_orders (id, shop_id, customer_id, vehicle_id, status)
  values ('b1000000-0000-4000-8000-0000000000aa', v_shop,
          'b1000000-0000-4000-8000-0000000000c1', 'b1000000-0000-4000-8000-0000000000d1', 'new');
  v_version := pg_temp.finalize('b1000000-0000-4000-8000-0000000000aa', 40, 10, 'ledger-final-control');
  if v_version.paid_total <> 0 or v_version.outstanding_total <> 50 or v_version.lifecycle_status <> 'issued' then
    raise exception 'A work order without prepayment changed: %', to_jsonb(v_version);
  end if;
  if exists (select 1 from public.payment_events where invoice_version_id = v_version.id) then
    raise exception 'A payment event was created for a work order without prepayment';
  end if;
  v_result := public.record_portal_parts_quote_payment_event('pi_not_a_parts_quote', 'refund_succeeded', 100, 'evt_other', now());
  if (v_result ->> 'handled')::boolean is not false then
    raise exception 'A non parts-quote charge was handled: %', v_result;
  end if;
end;
$ledger$;

rollback;
