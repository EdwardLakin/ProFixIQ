create extension if not exists pgcrypto;

create table if not exists public.work_order_intelligence (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid null references public.work_orders(id) on delete set null,
  work_order_line_id uuid null references public.work_order_lines(id) on delete set null,
  vehicle_id uuid null references public.vehicles(id) on delete set null,
  customer_id uuid null references public.customers(id) on delete set null,

  complaint text null,
  symptom text null,
  cause text null,
  correction text null,
  labor_time numeric null,
  parts jsonb not null default '[]'::jsonb,
  job_category text null,
  tags text[] not null default '{}',
  vehicle_make text null,
  vehicle_model text null,
  vehicle_year integer null,

  embedding_text text null,
  embedding vector(1536) null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_work_order_intelligence_shop_created
  on public.work_order_intelligence(shop_id, created_at desc);

create index if not exists idx_work_order_intelligence_shop_category
  on public.work_order_intelligence(shop_id, job_category);

create index if not exists idx_work_order_intelligence_shop_vehicle
  on public.work_order_intelligence(shop_id, vehicle_make, vehicle_model, vehicle_year);

create table if not exists public.learned_job_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  template_key text not null,
  label text not null,
  job_category text null,
  default_labor_hours numeric null,
  default_parts jsonb not null default '[]'::jsonb,
  confidence_score numeric null default 0,
  usage_count integer not null default 0,
  tags text[] not null default '{}',
  source_work_order_id uuid null references public.work_orders(id) on delete set null,
  source_work_order_line_id uuid null references public.work_order_lines(id) on delete set null,
  embedding_text text null,
  embedding vector(1536) null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learned_job_templates_shop_usage
  on public.learned_job_templates(shop_id, usage_count desc);

create unique index if not exists idx_learned_job_templates_shop_template_key_unique
  on public.learned_job_templates(shop_id, template_key);
