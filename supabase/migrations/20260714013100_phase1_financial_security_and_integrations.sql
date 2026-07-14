begin;

revoke all on function public.finalize_invoice_version(uuid,uuid,uuid,jsonb,text,numeric,numeric,numeric,numeric,uuid,text) from authenticated;
revoke all on function public.post_payment_event(uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamptz,jsonb) from authenticated;
grant execute on function public.finalize_invoice_version(uuid,uuid,uuid,jsonb,text,numeric,numeric,numeric,numeric,uuid,text) to service_role;
grant execute on function public.post_payment_event(uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamptz,jsonb) to service_role;

alter table public.quickbooks_invoice_links
  add column if not exists invoice_version_id uuid references public.invoice_versions(id) on delete set null,
  add column if not exists operation_key text,
  add column if not exists external_request_id text;

create unique index if not exists quickbooks_invoice_links_invoice_version_uidx
  on public.quickbooks_invoice_links(invoice_version_id)
  where invoice_version_id is not null;
create unique index if not exists quickbooks_invoice_links_operation_key_uidx
  on public.quickbooks_invoice_links(shop_id, operation_key)
  where operation_key is not null;

alter table public.invoice_versions force row level security;
alter table public.payment_events force row level security;
alter table public.payment_receipts force row level security;
alter table public.financial_domain_outbox force row level security;

drop policy if exists invoice_versions_shop_select on public.invoice_versions;
create policy invoice_versions_staff_or_customer_select
on public.invoice_versions for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.shop_id = invoice_versions.shop_id
  )
  or exists (
    select 1
    from public.work_orders wo
    join public.customers c on c.id = wo.customer_id
    where wo.id = invoice_versions.work_order_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists payment_events_shop_select on public.payment_events;
create policy payment_events_staff_or_customer_select
on public.payment_events for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.shop_id = payment_events.shop_id
  )
  or exists (
    select 1
    from public.work_orders wo
    join public.customers c on c.id = wo.customer_id
    where wo.id = payment_events.work_order_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists payment_receipts_shop_select on public.payment_receipts;
create policy payment_receipts_staff_or_customer_select
on public.payment_receipts for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.shop_id = payment_receipts.shop_id
  )
  or exists (
    select 1
    from public.work_orders wo
    join public.customers c on c.id = wo.customer_id
    where wo.id = payment_receipts.work_order_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists financial_domain_outbox_shop_select on public.financial_domain_outbox;
create policy financial_domain_outbox_staff_select
on public.financial_domain_outbox for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = financial_domain_outbox.shop_id
      and lower(coalesce(p.role,'')) in ('owner','admin','manager')
  )
);

grant select on public.invoice_versions, public.payment_events, public.payment_receipts to authenticated;

commit;
