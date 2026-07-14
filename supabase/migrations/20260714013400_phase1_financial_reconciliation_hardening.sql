begin;

drop index if exists public.portal_notifications_user_event_uidx;
create unique index portal_notifications_user_event_uidx
  on public.portal_notifications(user_id, event_key);

drop index if exists public.quickbooks_invoice_links_invoice_version_uidx;
create unique index quickbooks_invoice_links_invoice_version_uidx
  on public.quickbooks_invoice_links(invoice_version_id);

drop index if exists public.quickbooks_invoice_links_operation_key_uidx;
create unique index quickbooks_invoice_links_operation_key_uidx
  on public.quickbooks_invoice_links(shop_id, operation_key);

create or replace function public.post_payment_event(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_invoice_version_id uuid,
  p_event_kind text,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_processor text,
  p_processor_event_id text,
  p_processor_payment_id text,
  p_operation_key text,
  p_actor_user_id uuid,
  p_occurred_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event public.payment_events;
  v_version public.invoice_versions;
  v_paid_delta numeric := 0;
  v_refund_delta numeric := 0;
  v_new_paid numeric;
  v_new_refunded numeric;
  v_new_outstanding numeric;
  v_new_status text;
  v_receipt public.payment_receipts;
  v_receipt_number text;
begin
  if p_amount < 0 then raise exception 'Payment amount cannot be negative'; end if;
  if upper(p_currency) not in ('CAD','USD') then raise exception 'Unsupported currency'; end if;
  if coalesce(trim(p_operation_key),'') = '' then raise exception 'Operation key is required'; end if;

  select * into v_event
  from public.payment_events
  where shop_id = p_shop_id and operation_key = p_operation_key;
  if found then
    select * into v_version from public.invoice_versions where id = v_event.invoice_version_id;
    select * into v_receipt from public.payment_receipts where payment_event_id = v_event.id;
    return jsonb_build_object('payment_event',to_jsonb(v_event),'invoice_version',to_jsonb(v_version),'receipt',to_jsonb(v_receipt));
  end if;

  select * into v_version
  from public.invoice_versions
  where id = p_invoice_version_id
    and shop_id = p_shop_id
    and work_order_id = p_work_order_id
  for update;
  if not found then raise exception 'Invoice version not found'; end if;

  if p_event_kind in ('payment_succeeded','manual_payment') then
    if v_version.lifecycle_status not in ('issued','partially_paid') then
      raise exception 'Invoice version is not payable';
    end if;
    if p_amount > v_version.outstanding_total + 0.01 then
      raise exception 'Payment exceeds outstanding balance';
    end if;
    v_paid_delta := p_amount;
  elsif p_event_kind in ('refund_succeeded','manual_reversal','dispute_opened') then
    if p_amount > (v_version.paid_total - v_version.refunded_total) + 0.01 then
      raise exception 'Reversal exceeds net paid amount';
    end if;
    v_refund_delta := p_amount;
  elsif p_event_kind = 'dispute_won' then
    if p_amount > v_version.refunded_total + 0.01 then
      raise exception 'Dispute recovery exceeds reversed amount';
    end if;
    v_refund_delta := -p_amount;
  end if;

  insert into public.payment_events(
    shop_id,work_order_id,invoice_version_id,event_kind,amount,currency,payment_method,
    processor,processor_event_id,processor_payment_id,operation_key,occurred_at,actor_user_id,metadata
  ) values (
    p_shop_id,p_work_order_id,p_invoice_version_id,p_event_kind,p_amount,upper(p_currency),p_payment_method,
    coalesce(nullif(p_processor,''),'manual'),p_processor_event_id,p_processor_payment_id,p_operation_key,
    coalesce(p_occurred_at,now()),p_actor_user_id,coalesce(p_metadata,'{}'::jsonb)
  ) returning * into v_event;

  v_new_paid := greatest(v_version.paid_total + v_paid_delta, 0);
  v_new_refunded := greatest(v_version.refunded_total + v_refund_delta, 0);
  v_new_outstanding := greatest(v_version.total - v_new_paid + v_new_refunded, 0);
  v_new_status := case
    when v_new_outstanding <= 0.01 then 'paid'
    when v_new_paid - v_new_refunded > 0.01 then 'partially_paid'
    else 'issued'
  end;

  if v_paid_delta <> 0 or v_refund_delta <> 0 then
    update public.invoice_versions
    set paid_total = v_new_paid,
        refunded_total = v_new_refunded,
        lifecycle_status = v_new_status
    where id = p_invoice_version_id
    returning * into v_version;
  end if;

  if p_event_kind = 'dispute_opened' then
    update public.work_orders
    set payment_status = 'disputed', outstanding_balance = v_new_outstanding
    where id = p_work_order_id and shop_id = p_shop_id;
  elsif p_event_kind in ('dispute_won','dispute_lost') then
    update public.work_orders
    set payment_status = case
      when v_new_outstanding <= 0.01 then 'paid'
      when v_new_paid - v_new_refunded > 0.01 then 'partially_paid'
      else 'unpaid'
    end,
    outstanding_balance = v_new_outstanding
    where id = p_work_order_id and shop_id = p_shop_id;
  end if;

  if p_event_kind in ('payment_succeeded','manual_payment') then
    v_receipt_number := 'R-' || to_char(coalesce(p_occurred_at,now()),'YYYYMMDD') || '-' || upper(substr(replace(v_event.id::text,'-',''),1,8));
    insert into public.payment_receipts(
      shop_id,work_order_id,invoice_version_id,payment_event_id,receipt_number,amount,currency,
      payment_method,processor_reference,received_at,remaining_balance
    ) values (
      p_shop_id,p_work_order_id,p_invoice_version_id,v_event.id,v_receipt_number,p_amount,upper(p_currency),
      p_payment_method,p_processor_payment_id,coalesce(p_occurred_at,now()),v_new_outstanding
    ) returning * into v_receipt;
  end if;

  insert into public.financial_domain_outbox(
    shop_id,aggregate_type,aggregate_id,event_type,dedupe_key,payload
  ) values (
    p_shop_id,'payment_event',v_event.id,replace(p_event_kind,'_','.'),'payment:' || v_event.id::text,
    jsonb_build_object(
      'payment_event_id',v_event.id,
      'invoice_version_id',p_invoice_version_id,
      'work_order_id',p_work_order_id,
      'amount',p_amount,
      'currency',upper(p_currency),
      'remaining_balance',v_new_outstanding,
      'event_kind',p_event_kind
    )
  ) on conflict do nothing;

  return jsonb_build_object('payment_event',to_jsonb(v_event),'invoice_version',to_jsonb(v_version),'receipt',to_jsonb(v_receipt));
end;
$$;

revoke all on function public.post_payment_event(uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamptz,jsonb) from public, authenticated;
grant execute on function public.post_payment_event(uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamptz,jsonb) to service_role;

commit;
