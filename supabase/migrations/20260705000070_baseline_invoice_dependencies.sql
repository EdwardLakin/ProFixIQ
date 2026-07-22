-- Bootstrap canonical invoice and payment tables omitted from the historical dump.
-- Complete existing databases are left unchanged.

do $$
declare
  v_mode text;
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    if to_regclass('public.invoices') is null
       or to_regclass('public.payments') is null then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: invoices and payments must exist for an existing baseline.';
    end if;
    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_number text,
  status text not null default 'draft',
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  currency text not null default 'CAD',
  issued_at timestamptz,
  due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, invoice_number)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'CAD',
  status text not null default 'pending',
  payment_method text,
  processor text,
  processor_payment_id text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_shop_work_order_idx
  on public.invoices(shop_id, work_order_id, created_at desc);
create index if not exists payments_shop_invoice_idx
  on public.payments(shop_id, invoice_id, created_at desc);

alter table public.invoices enable row level security;
alter table public.payments enable row level security;

drop policy if exists invoices_shop_crud on public.invoices;
create policy invoices_shop_crud on public.invoices
  for all to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

drop policy if exists payments_shop_crud on public.payments;
create policy payments_shop_crud on public.payments
  for all to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());
