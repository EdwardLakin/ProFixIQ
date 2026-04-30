begin;

alter table public.history
  add column if not exists source_system text,
  add column if not exists source_external_id text,
  add column if not exists source_row_id text,
  add column if not exists imported_from_session_id uuid references public.onboarding_sessions(id) on delete set null,
  add column if not exists work_order_number text,
  add column if not exists invoice_number text,
  add column if not exists opened_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists historical_status text,
  add column if not exists advisor_name text,
  add column if not exists assigned_tech_name text,
  add column if not exists priority text,
  add column if not exists odometer numeric,
  add column if not exists symptom text,
  add column if not exists cause text,
  add column if not exists correction text,
  add column if not exists labor_hours numeric,
  add column if not exists labor_sale numeric,
  add column if not exists parts_sale numeric,
  add column if not exists shop_supplies numeric,
  add column if not exists sublet_sale numeric,
  add column if not exists discount numeric,
  add column if not exists tax numeric,
  add column if not exists total numeric,
  add column if not exists approval_state text,
  add column if not exists payment_state text,
  add column if not exists tags text[],
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

create index if not exists history_customer_service_date_idx
  on public.history(customer_id, service_date desc);
create index if not exists history_vehicle_service_date_idx
  on public.history(vehicle_id, service_date desc) where vehicle_id is not null;
create index if not exists history_imported_session_idx
  on public.history(imported_from_session_id) where imported_from_session_id is not null;
create index if not exists history_source_row_idx
  on public.history(source_row_id) where source_row_id is not null;
create index if not exists history_work_order_number_idx
  on public.history(work_order_number) where work_order_number is not null;
create index if not exists history_invoice_number_idx
  on public.history(invoice_number) where invoice_number is not null;

drop policy if exists history_wo_select on public.history;
drop policy if exists history_wo_insert on public.history;
drop policy if exists history_wo_update on public.history;
drop policy if exists history_wo_delete on public.history;

create policy history_wo_select on public.history for select to authenticated using (
  (
    work_order_id is not null
    and exists (
      select 1 from public.work_orders wo
      where wo.id = history.work_order_id and wo.shop_id = public.current_shop_id()
    )
  )
  or (
    work_order_id is null and (
      exists (
        select 1 from public.customers c
        where c.id = history.customer_id and c.shop_id = public.current_shop_id()
      )
      or (
        history.vehicle_id is not null and exists (
          select 1 from public.vehicles v
          where v.id = history.vehicle_id and v.shop_id = public.current_shop_id()
        )
      )
    )
  )
);

create policy history_wo_insert on public.history for insert to authenticated with check (
  (
    work_order_id is not null
    and exists (
      select 1 from public.work_orders wo
      where wo.id = history.work_order_id and wo.shop_id = public.current_shop_id()
    )
  )
  or (
    work_order_id is null and (
      exists (
        select 1 from public.customers c
        where c.id = history.customer_id and c.shop_id = public.current_shop_id()
      )
      or (
        history.vehicle_id is not null and exists (
          select 1 from public.vehicles v
          where v.id = history.vehicle_id and v.shop_id = public.current_shop_id()
        )
      )
    )
  )
);

create policy history_wo_update on public.history for update to authenticated using (
  (
    work_order_id is not null
    and exists (
      select 1 from public.work_orders wo
      where wo.id = history.work_order_id and wo.shop_id = public.current_shop_id()
    )
  )
  or (
    work_order_id is null and (
      exists (
        select 1 from public.customers c
        where c.id = history.customer_id and c.shop_id = public.current_shop_id()
      )
      or (
        history.vehicle_id is not null and exists (
          select 1 from public.vehicles v
          where v.id = history.vehicle_id and v.shop_id = public.current_shop_id()
        )
      )
    )
  )
) with check (
  (
    work_order_id is not null
    and exists (
      select 1 from public.work_orders wo
      where wo.id = history.work_order_id and wo.shop_id = public.current_shop_id()
    )
  )
  or (
    work_order_id is null and (
      exists (
        select 1 from public.customers c
        where c.id = history.customer_id and c.shop_id = public.current_shop_id()
      )
      or (
        history.vehicle_id is not null and exists (
          select 1 from public.vehicles v
          where v.id = history.vehicle_id and v.shop_id = public.current_shop_id()
        )
      )
    )
  )
);

create policy history_wo_delete on public.history for delete to authenticated using (
  (
    work_order_id is not null
    and exists (
      select 1 from public.work_orders wo
      where wo.id = history.work_order_id and wo.shop_id = public.current_shop_id()
    )
  )
  or (
    work_order_id is null and (
      exists (
        select 1 from public.customers c
        where c.id = history.customer_id and c.shop_id = public.current_shop_id()
      )
      or (
        history.vehicle_id is not null and exists (
          select 1 from public.vehicles v
          where v.id = history.vehicle_id and v.shop_id = public.current_shop_id()
        )
      )
    )
  )
);

commit;
