-- Complete the clean bootstrap with the canonical work-order quote line table.
-- Existing production databases must already contain this table and are left unchanged.

do $$
declare
  v_mode text;
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode = 'existing' and to_regclass('public.work_order_quote_lines') is null then
    raise exception using errcode = 'P0001',
      message = 'PARTIAL_PROFIXIQ_SCHEMA: required table public.work_order_quote_lines is missing.';
  end if;
end
$$;

create table if not exists public.work_order_quote_lines (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  inspection_item_id uuid references public.inspection_items(id) on delete set null,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  source_row_id uuid,
  external_id text,
  title text,
  description text,
  line_type text not null default 'job',
  status text not null default 'draft',
  stage text,
  decision text,
  decline_reason text,
  defer_reason text,
  labor_hours numeric(12,2) not null default 0,
  est_labor_hours numeric(12,2) not null default 0,
  labor_rate numeric(12,2),
  labor_total numeric(14,2) not null default 0,
  parts_total numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  declined_by uuid references auth.users(id) on delete set null,
  deferred_by uuid references auth.users(id) on delete set null,
  sent_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  declined_at timestamptz,
  deferred_at timestamptz,
  sent_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_work_order_quote_lines_shop_work_order
  on public.work_order_quote_lines(shop_id, work_order_id, created_at desc);

create index if not exists idx_work_order_quote_lines_stage
  on public.work_order_quote_lines(shop_id, stage, status, updated_at desc);

create unique index if not exists uq_work_order_quote_lines_external
  on public.work_order_quote_lines(shop_id, external_id)
  where external_id is not null;

alter table public.work_order_quote_lines enable row level security;

drop policy if exists work_order_quote_lines_shop_select on public.work_order_quote_lines;
create policy work_order_quote_lines_shop_select
  on public.work_order_quote_lines
  for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists work_order_quote_lines_shop_insert on public.work_order_quote_lines;
create policy work_order_quote_lines_shop_insert
  on public.work_order_quote_lines
  for insert to authenticated
  with check (shop_id = public.current_shop_id());

drop policy if exists work_order_quote_lines_shop_update on public.work_order_quote_lines;
create policy work_order_quote_lines_shop_update
  on public.work_order_quote_lines
  for update to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

drop policy if exists work_order_quote_lines_shop_delete on public.work_order_quote_lines;
create policy work_order_quote_lines_shop_delete
  on public.work_order_quote_lines
  for delete to authenticated
  using (shop_id = public.current_shop_id());
