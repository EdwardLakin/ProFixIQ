begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Canonical customer financial visibility is anchored through the work order and
-- durable portal membership. Never trust denormalized invoice.customer_id alone:
-- imported or manually repaired records can disagree with work_orders.customer_id.
-- A customer may only see an invoice after at least one customer-visible invoice
-- version has been issued/finalized for the same shop + work order + invoice.
drop policy if exists invoices_customer_select on public.invoices;

create policy invoices_customer_select
on public.invoices
for select
to authenticated
using (
  exists (
    select 1
    from public.work_orders wo
    where wo.id = invoices.work_order_id
      and wo.shop_id = invoices.shop_id
      and wo.customer_id is not null
      and (
        invoices.customer_id is null
        or invoices.customer_id = wo.customer_id
      )
      and public.profixiq_is_portal_customer_for(wo.customer_id, wo.shop_id)
      and exists (
        select 1
        from public.invoice_versions iv
        where iv.invoice_id = invoices.id
          and iv.work_order_id = wo.id
          and iv.shop_id = wo.shop_id
          and iv.lifecycle_status in (
            'issued', 'partially_paid', 'paid', 'voided', 'superseded', 'credited'
          )
      )
  )
);

-- The original Phase 1 policies combined broad same-shop staff reads with a
-- customer.user_id shortcut. Split those concerns: staff reads follow the
-- canonical billing-role contract, while customer reads require the same
-- accepted/non-revoked portal predicate used by the work-order portal.
drop policy if exists invoice_versions_shop_select on public.invoice_versions;
drop policy if exists invoice_versions_staff_or_customer_select on public.invoice_versions;
drop policy if exists invoice_versions_staff_select on public.invoice_versions;
drop policy if exists invoice_versions_customer_select on public.invoice_versions;

create policy invoice_versions_staff_select
on public.invoice_versions
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service'
  )
);

create policy invoice_versions_customer_select
on public.invoice_versions
for select
to authenticated
using (
  lifecycle_status in (
    'issued', 'partially_paid', 'paid', 'voided', 'superseded', 'credited'
  )
  and exists (
    select 1
    from public.work_orders wo
    where wo.id = invoice_versions.work_order_id
      and wo.shop_id = invoice_versions.shop_id
      and wo.customer_id is not null
      and public.profixiq_is_portal_customer_for(wo.customer_id, wo.shop_id)
  )
);

drop policy if exists payment_events_shop_select on public.payment_events;
drop policy if exists payment_events_staff_or_customer_select on public.payment_events;
drop policy if exists payment_events_staff_select on public.payment_events;
drop policy if exists payment_events_customer_select on public.payment_events;

create policy payment_events_staff_select
on public.payment_events
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service'
  )
);

create policy payment_events_customer_select
on public.payment_events
for select
to authenticated
using (
  invoice_version_id is not null
  and exists (
    select 1
    from public.invoice_versions iv
    join public.work_orders wo
      on wo.id = iv.work_order_id
     and wo.shop_id = iv.shop_id
    where iv.id = payment_events.invoice_version_id
      and iv.shop_id = payment_events.shop_id
      and payment_events.work_order_id = wo.id
      and iv.lifecycle_status in (
        'issued', 'partially_paid', 'paid', 'voided', 'superseded', 'credited'
      )
      and wo.customer_id is not null
      and public.profixiq_is_portal_customer_for(wo.customer_id, wo.shop_id)
  )
);

drop policy if exists payment_receipts_shop_select on public.payment_receipts;
drop policy if exists payment_receipts_staff_or_customer_select on public.payment_receipts;
drop policy if exists payment_receipts_staff_select on public.payment_receipts;
drop policy if exists payment_receipts_customer_select on public.payment_receipts;

create policy payment_receipts_staff_select
on public.payment_receipts
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (select public.profixiq_current_role()) in (
    'owner', 'admin', 'manager', 'advisor', 'service'
  )
);

create policy payment_receipts_customer_select
on public.payment_receipts
for select
to authenticated
using (
  exists (
    select 1
    from public.invoice_versions iv
    join public.work_orders wo
      on wo.id = iv.work_order_id
     and wo.shop_id = iv.shop_id
    where iv.id = payment_receipts.invoice_version_id
      and iv.shop_id = payment_receipts.shop_id
      and payment_receipts.work_order_id = wo.id
      and iv.lifecycle_status in (
        'issued', 'partially_paid', 'paid', 'voided', 'superseded', 'credited'
      )
      and wo.customer_id is not null
      and public.profixiq_is_portal_customer_for(wo.customer_id, wo.shop_id)
  )
);

notify pgrst, 'reload schema';

commit;
