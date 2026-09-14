-- Bootstrap the legacy QuickBooks invoice link table required by the
-- phase-one financial integration migrations.
--
-- Unlike the invoice/payment baseline (20260705000070), this table is a
-- self-contained integration table introduced after some production shops
-- were already on the "existing" baseline: it is not one of the core tables
-- that decide bootstrap vs. existing, and its own shape has never diverged
-- from the one below (later migrations only ever add columns to it, see
-- 20260714013100 and 20260714013400). So it does not need, and must not
-- enforce, an "existing databases must already have this" gate the way
-- 20260705000070 does for payments/invoices: a database that predates this
-- table simply gets it created here, on any baseline mode.

create table if not exists public.quickbooks_invoice_links (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  qb_invoice_id text not null,
  qb_doc_number text,
  qb_sync_token text,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'error')),
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, invoice_id)
);

create index if not exists quickbooks_invoice_links_shop_idx
  on public.quickbooks_invoice_links(shop_id, created_at desc);

create index if not exists quickbooks_invoice_links_work_order_idx
  on public.quickbooks_invoice_links(work_order_id)
  where work_order_id is not null;

alter table public.quickbooks_invoice_links enable row level security;

drop policy if exists quickbooks_invoice_links_shop_select
  on public.quickbooks_invoice_links;
create policy quickbooks_invoice_links_shop_select
  on public.quickbooks_invoice_links
  for select
  to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists quickbooks_invoice_links_shop_insert
  on public.quickbooks_invoice_links;
create policy quickbooks_invoice_links_shop_insert
  on public.quickbooks_invoice_links
  for insert
  to authenticated
  with check (shop_id = public.current_shop_id());

drop policy if exists quickbooks_invoice_links_shop_update
  on public.quickbooks_invoice_links;
create policy quickbooks_invoice_links_shop_update
  on public.quickbooks_invoice_links
  for update
  to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

drop policy if exists quickbooks_invoice_links_shop_delete
  on public.quickbooks_invoice_links;
create policy quickbooks_invoice_links_shop_delete
  on public.quickbooks_invoice_links
  for delete
  to authenticated
  using (shop_id = public.current_shop_id());
