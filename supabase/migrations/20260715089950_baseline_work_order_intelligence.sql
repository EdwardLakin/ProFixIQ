-- Restore the AI learning tables that predate the repository migration chain.
-- Phase 8 automation readiness installs observation triggers on
-- work_order_intelligence, so a clean bootstrap must have the complete learning
-- domain first. Existing databases are validated and left unchanged.

do $$
declare
  v_mode text;
  v_missing text[];
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    select array_agg(required_table order by required_table)
      into v_missing
    from unnest(array[
      'learned_job_templates',
      'intelligence_story_signals',
      'work_order_intelligence'
    ]::text[]) as required(required_table)
    where to_regclass('public.' || required_table) is null;

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: AI learning tables are missing: '
          || array_to_string(v_missing, ', ');
    end if;

    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

create extension if not exists vector with schema extensions;

create table if not exists public.learned_job_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  template_key text not null,
  label text not null,
  job_category text,
  default_labor_hours numeric(12,2),
  default_parts jsonb not null default '[]'::jsonb,
  source_work_order_id uuid references public.work_orders(id) on delete set null,
  source_work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  usage_count integer not null default 0 check (usage_count >= 0),
  accept_count integer not null default 0 check (accept_count >= 0),
  reject_count integer not null default 0 check (reject_count >= 0),
  confidence_score numeric,
  tags text[] not null default '{}'::text[],
  last_seen_at timestamptz not null default now(),
  last_used_at timestamptz,
  normalized_text text,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, template_key)
);

create table if not exists public.intelligence_story_signals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_line_id uuid not null references public.work_order_lines(id) on delete cascade,
  signal_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (work_order_line_id, signal_type)
);

create table if not exists public.work_order_intelligence (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_line_id uuid not null references public.work_order_lines(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  complaint text,
  symptom text,
  cause text,
  correction text,
  line_status text,
  labor_time numeric(12,2),
  parts jsonb not null default '[]'::jsonb,
  job_category text,
  tags text[] not null default '{}'::text[],
  source text not null default 'invoice_review',
  confidence_score numeric,
  cluster_key text,
  normalized_text text,
  embedding extensions.vector(1536),
  template_id uuid references public.learned_job_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_line_id)
);

create index if not exists learned_job_templates_shop_last_seen_idx
  on public.learned_job_templates(shop_id, last_seen_at desc);
create index if not exists intelligence_story_signals_shop_pending_idx
  on public.intelligence_story_signals(shop_id, created_at)
  where processed_at is null;
create index if not exists work_order_intelligence_shop_work_order_idx
  on public.work_order_intelligence(shop_id, work_order_id, created_at desc);
create index if not exists work_order_intelligence_shop_category_idx
  on public.work_order_intelligence(shop_id, job_category)
  where job_category is not null;

alter table public.learned_job_templates enable row level security;
alter table public.intelligence_story_signals enable row level security;
alter table public.work_order_intelligence enable row level security;

drop policy if exists learned_job_templates_shop_crud on public.learned_job_templates;
create policy learned_job_templates_shop_crud
  on public.learned_job_templates for all to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

drop policy if exists intelligence_story_signals_shop_crud on public.intelligence_story_signals;
create policy intelligence_story_signals_shop_crud
  on public.intelligence_story_signals for all to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

drop policy if exists work_order_intelligence_shop_crud on public.work_order_intelligence;
create policy work_order_intelligence_shop_crud
  on public.work_order_intelligence for all to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());
