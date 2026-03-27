create extension if not exists pgcrypto;

create table if not exists public.work_order_intelligence (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_line_id uuid not null references public.work_order_lines(id) on delete cascade,
  vehicle_id uuid null references public.vehicles(id) on delete set null,
  customer_id uuid null references public.customers(id) on delete set null,

  vehicle_year integer null,
  vehicle_make text null,
  vehicle_model text null,

  complaint text null,
  symptom text null,
  cause text null,
  correction text null,

  line_status text null,
  labor_time numeric null,
  parts jsonb not null default '[]'::jsonb,

  job_category text null,
  tags text[] not null default '{}',

  source text not null default 'invoice_review',
  confidence_score numeric null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (work_order_line_id)
);

create index if not exists idx_work_order_intelligence_shop_created
  on public.work_order_intelligence (shop_id, created_at desc);

create index if not exists idx_work_order_intelligence_shop_category
  on public.work_order_intelligence (shop_id, job_category);

create index if not exists idx_work_order_intelligence_shop_vehicle
  on public.work_order_intelligence (shop_id, vehicle_make, vehicle_model, vehicle_year);

create table if not exists public.learned_job_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,

  template_key text not null,
  label text not null,
  job_category text null,

  default_labor_hours numeric null,
  default_parts jsonb not null default '[]'::jsonb,

  source_work_order_line_id uuid null references public.work_order_lines(id) on delete set null,
  source_work_order_id uuid null references public.work_orders(id) on delete set null,

  usage_count integer not null default 1,
  confidence_score numeric null default 1,
  tags text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  unique (shop_id, template_key)
);

create index if not exists idx_learned_job_templates_shop_usage
  on public.learned_job_templates (shop_id, usage_count desc, last_seen_at desc);

create table if not exists public.intelligence_story_signals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_line_id uuid not null references public.work_order_lines(id) on delete cascade,

  signal_type text not null,
  payload jsonb not null default '{}'::jsonb,

  processed_at timestamptz null,
  created_at timestamptz not null default now(),

  unique (work_order_line_id, signal_type)
);

alter table public.work_order_intelligence enable row level security;
alter table public.learned_job_templates enable row level security;
alter table public.intelligence_story_signals enable row level security;

drop policy if exists "work_order_intelligence_shop_access" on public.work_order_intelligence;
create policy "work_order_intelligence_shop_access"
on public.work_order_intelligence
for all
using (is_shop_member(shop_id))
with check (is_shop_member(shop_id));

drop policy if exists "learned_job_templates_shop_access" on public.learned_job_templates;
create policy "learned_job_templates_shop_access"
on public.learned_job_templates
for all
using (is_shop_member(shop_id))
with check (is_shop_member(shop_id));

drop policy if exists "intelligence_story_signals_shop_access" on public.intelligence_story_signals;
create policy "intelligence_story_signals_shop_access"
on public.intelligence_story_signals
for all
using (is_shop_member(shop_id))
with check (is_shop_member(shop_id));

create or replace function public.set_work_order_intelligence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_work_order_intelligence_updated_at on public.work_order_intelligence;
create trigger trg_work_order_intelligence_updated_at
before update on public.work_order_intelligence
for each row
execute function public.set_work_order_intelligence_updated_at();

drop trigger if exists trg_learned_job_templates_updated_at on public.learned_job_templates;
create trigger trg_learned_job_templates_updated_at
before update on public.learned_job_templates
for each row
execute function public.set_work_order_intelligence_updated_at();
