begin;

create extension if not exists pgcrypto;

create table if not exists public.invoice_versions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete set null,
  version_number integer not null,
  lifecycle_status text not null default 'issued' check (lifecycle_status in ('draft','issued','partially_paid','paid','voided','superseded','credited')),
  currency text not null check (currency in ('CAD','USD')),
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid_total numeric(14,2) not null default 0,
  refunded_total numeric(14,2) not null default 0,
  outstanding_total numeric(14,2) generated always as (greatest(total - paid_total + refunded_total, 0)) stored,
  snapshot jsonb not null,
  snapshot_hash text not null,
  issued_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  supersedes_invoice_version_id uuid references public.invoice_versions(id) on delete set null,
  superseded_by_invoice_version_id uuid references public.invoice_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, version_number),
  unique (shop_id, snapshot_hash)
);

create index if not exists invoice_versions_shop_work_order_idx on public.invoice_versions(shop_id, work_order_id, version_number desc);
create index if not exists invoice_versions_invoice_idx on public.invoice_versions(invoice_id);
create index if not exists invoice_versions_payable_idx on public.invoice_versions(shop_id, lifecycle_status, outstanding_total) where lifecycle_status in ('issued','partially_paid');

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete restrict,
  invoice_version_id uuid references public.invoice_versions(id) on delete restrict,
  event_kind text not null check (event_kind in ('payment_succeeded','payment_failed','refund_succeeded','refund_failed','dispute_opened','dispute_won','dispute_lost','manual_payment','manual_reversal')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency in ('CAD','USD')),
  payment_method text,
  processor text not null default 'manual',
  processor_event_id text,
  processor_payment_id text,
  operation_key text not null,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, operation_key),
  unique (processor, processor_event_id)
);

create index if not exists payment_events_invoice_version_idx on public.payment_events(invoice_version_id, occurred_at);
create index if not exists payment_events_work_order_idx on public.payment_events(work_order_id, occurred_at);

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  work_order_id uuid references public.work_orders(id) on delete restrict,
  invoice_version_id uuid not null references public.invoice_versions(id) on delete restrict,
  payment_event_id uuid not null unique references public.payment_events(id) on delete restrict,
  receipt_number text not null,
  amount numeric(14,2) not null,
  currency text not null check (currency in ('CAD','USD')),
  payment_method text,
  processor_reference text,
  received_at timestamptz not null,
  remaining_balance numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (shop_id, receipt_number)
);

create table if not exists public.financial_domain_outbox (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  unique (shop_id, dedupe_key)
);

alter table public.invoices add column if not exists active_invoice_version_id uuid references public.invoice_versions(id) on delete set null;
alter table public.payments add column if not exists invoice_version_id uuid references public.invoice_versions(id) on delete set null;
alter table public.payments add column if not exists payment_event_id uuid references public.payment_events(id) on delete set null;

create or replace function public.phase1_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists invoice_versions_touch_updated_at on public.invoice_versions;
create trigger invoice_versions_touch_updated_at before update on public.invoice_versions for each row execute function public.phase1_touch_updated_at();

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
) returns public.invoice_versions
language plpgsql security definer set search_path = public as $$
declare
  v_version public.invoice_versions;
  v_next_version integer;
  v_hash text;
  v_existing public.invoice_versions;
begin
  if p_total < 0 then raise exception 'Invoice total cannot be negative'; end if;
  if upper(p_currency) not in ('CAD','USD') then raise exception 'Unsupported currency'; end if;
  if coalesce(trim(p_operation_key),'') = '' then raise exception 'Operation key is required'; end if;

  select iv.* into v_existing
  from public.invoice_versions iv
  where iv.shop_id = p_shop_id and iv.snapshot_hash = encode(digest(p_operation_key || ':' || p_snapshot::text, 'sha256'),'hex')
  limit 1;
  if found then return v_existing; end if;

  perform 1 from public.work_orders wo where wo.id = p_work_order_id and wo.shop_id = p_shop_id for update;
  if not found then raise exception 'Work order not found for shop'; end if;

  select coalesce(max(version_number),0) + 1 into v_next_version from public.invoice_versions where work_order_id = p_work_order_id;
  v_hash := encode(digest(p_operation_key || ':' || p_snapshot::text, 'sha256'),'hex');

  insert into public.invoice_versions (
    shop_id, work_order_id, invoice_id, version_number, lifecycle_status, currency,
    subtotal, discount_total, tax_total, total, snapshot, snapshot_hash, issued_at, issued_by
  ) values (
    p_shop_id, p_work_order_id, p_invoice_id, v_next_version, 'issued', upper(p_currency),
    coalesce(p_subtotal,0), coalesce(p_discount_total,0), coalesce(p_tax_total,0), coalesce(p_total,0),
    p_snapshot, v_hash, now(), p_actor_user_id
  ) returning * into v_version;

  update public.invoices set active_invoice_version_id = v_version.id, status = 'issued', issued_at = coalesce(issued_at, now()) where id = p_invoice_id and shop_id = p_shop_id;
  update public.work_orders set invoice_total = v_version.total, status = 'invoiced' where id = p_work_order_id and shop_id = p_shop_id;

  insert into public.financial_domain_outbox(shop_id, aggregate_type, aggregate_id, event_type, dedupe_key, payload)
  values (p_shop_id, 'invoice_version', v_version.id, 'invoice.issued', 'invoice.issued:' || v_version.id::text,
    jsonb_build_object('invoice_version_id',v_version.id,'work_order_id',p_work_order_id,'invoice_id',p_invoice_id,'total',v_version.total,'currency',v_version.currency))
  on conflict do nothing;

  return v_version;
end;
$$;

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
  v_receipt public.payment_receipts;
  v_receipt_number text;
begin
  if p_amount < 0 then raise exception 'Payment amount cannot be negative'; end if;
  if upper(p_currency) not in ('CAD','USD') then raise exception 'Unsupported currency'; end if;
  if coalesce(trim(p_operation_key),'') = '' then raise exception 'Operation key is required'; end if;

  select * into v_event from public.payment_events where shop_id = p_shop_id and operation_key = p_operation_key;
  if found then
    select * into v_version from public.invoice_versions where id = v_event.invoice_version_id;
    select * into v_receipt from public.payment_receipts where payment_event_id = v_event.id;
    return jsonb_build_object('payment_event',to_jsonb(v_event),'invoice_version',to_jsonb(v_version),'receipt',to_jsonb(v_receipt));
  end if;

  select * into v_version from public.invoice_versions where id = p_invoice_version_id and shop_id = p_shop_id and work_order_id = p_work_order_id for update;
  if not found then raise exception 'Invoice version not found'; end if;

  if p_event_kind in ('payment_succeeded','manual_payment') then
    if v_version.lifecycle_status not in ('issued','partially_paid') then raise exception 'Invoice version is not payable'; end if;
    if p_amount > v_version.outstanding_total + 0.01 then raise exception 'Payment exceeds outstanding balance'; end if;
    v_paid_delta := p_amount;
  elsif p_event_kind in ('refund_succeeded','manual_reversal') then
    if p_amount > v_version.paid_total - v_version.refunded_total + 0.01 then raise exception 'Refund exceeds net paid amount'; end if;
    v_refund_delta := p_amount;
  end if;

  insert into public.payment_events(shop_id,work_order_id,invoice_version_id,event_kind,amount,currency,payment_method,processor,processor_event_id,processor_payment_id,operation_key,occurred_at,actor_user_id,metadata)
  values(p_shop_id,p_work_order_id,p_invoice_version_id,p_event_kind,p_amount,upper(p_currency),p_payment_method,coalesce(nullif(p_processor,''),'manual'),p_processor_event_id,p_processor_payment_id,p_operation_key,coalesce(p_occurred_at,now()),p_actor_user_id,coalesce(p_metadata,'{}'::jsonb))
  returning * into v_event;

  update public.invoice_versions
  set paid_total = paid_total + v_paid_delta,
      refunded_total = refunded_total + v_refund_delta,
      lifecycle_status = case
        when p_event_kind in ('payment_succeeded','manual_payment') and greatest(total - (paid_total + v_paid_delta) + refunded_total,0) <= 0.01 then 'paid'
        when p_event_kind in ('payment_succeeded','manual_payment') then 'partially_paid'
        when p_event_kind in ('refund_succeeded','manual_reversal') and greatest(total - paid_total + (refunded_total + v_refund_delta),0) >= total - 0.01 then 'issued'
        else lifecycle_status end
  where id = p_invoice_version_id
  returning * into v_version;

  update public.invoices set status = case when v_version.lifecycle_status = 'paid' then 'paid' else v_version.lifecycle_status end where id = v_version.invoice_id;
  update public.work_orders set status = case when v_version.lifecycle_status = 'paid' then 'invoiced' else status end where id = p_work_order_id and shop_id = p_shop_id;

  if p_event_kind in ('payment_succeeded','manual_payment') then
    v_receipt_number := 'R-' || to_char(coalesce(p_occurred_at,now()),'YYYYMMDD') || '-' || upper(substr(replace(v_event.id::text,'-',''),1,8));
    insert into public.payment_receipts(shop_id,work_order_id,invoice_version_id,payment_event_id,receipt_number,amount,currency,payment_method,processor_reference,received_at,remaining_balance)
    values(p_shop_id,p_work_order_id,p_invoice_version_id,v_event.id,v_receipt_number,p_amount,upper(p_currency),p_payment_method,p_processor_payment_id,coalesce(p_occurred_at,now()),v_version.outstanding_total)
    returning * into v_receipt;
  end if;

  insert into public.financial_domain_outbox(shop_id,aggregate_type,aggregate_id,event_type,dedupe_key,payload)
  values(p_shop_id,'payment_event',v_event.id,replace(p_event_kind,'_','.'),'payment:' || v_event.id::text,
    jsonb_build_object('payment_event_id',v_event.id,'invoice_version_id',p_invoice_version_id,'work_order_id',p_work_order_id,'amount',p_amount,'currency',upper(p_currency),'remaining_balance',v_version.outstanding_total))
  on conflict do nothing;

  return jsonb_build_object('payment_event',to_jsonb(v_event),'invoice_version',to_jsonb(v_version),'receipt',to_jsonb(v_receipt));
end;
$$;

alter table public.invoice_versions enable row level security;
alter table public.payment_events enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.financial_domain_outbox enable row level security;

create policy invoice_versions_shop_select on public.invoice_versions for select using (shop_id = public.current_shop_id());
create policy payment_events_shop_select on public.payment_events for select using (shop_id = public.current_shop_id());
create policy payment_receipts_shop_select on public.payment_receipts for select using (shop_id = public.current_shop_id());
create policy financial_domain_outbox_shop_select on public.financial_domain_outbox for select using (shop_id = public.current_shop_id());

grant execute on function public.finalize_invoice_version(uuid,uuid,uuid,jsonb,text,numeric,numeric,numeric,numeric,uuid,text) to authenticated, service_role;
grant execute on function public.post_payment_event(uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamptz,jsonb) to authenticated, service_role;

commit;
