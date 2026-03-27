create extension if not exists vector;

alter table if exists public.work_order_intelligence
  add column if not exists normalized_text text,
  add column if not exists embedding vector(1536),
  add column if not exists cluster_key text,
  add column if not exists template_id uuid null references public.learned_job_templates(id) on delete set null;

alter table if exists public.learned_job_templates
  add column if not exists normalized_text text,
  add column if not exists embedding vector(1536),
  add column if not exists accept_count integer not null default 0,
  add column if not exists reject_count integer not null default 0,
  add column if not exists last_used_at timestamptz;

create index if not exists idx_work_order_intelligence_shop_id
  on public.work_order_intelligence(shop_id);

create index if not exists idx_learned_job_templates_shop_id
  on public.learned_job_templates(shop_id);

create index if not exists idx_learned_job_templates_usage_count
  on public.learned_job_templates(shop_id, usage_count desc);

create index if not exists idx_work_order_intelligence_embedding
  on public.work_order_intelligence
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists idx_learned_job_templates_embedding
  on public.learned_job_templates
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_work_order_intelligence(
  p_shop_id uuid,
  p_embedding vector(1536),
  p_match_count integer default 5
)
returns table (
  id uuid,
  complaint text,
  symptom text,
  cause text,
  correction text,
  labor_time numeric,
  parts jsonb,
  job_category text,
  tags jsonb,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  similarity float
)
language sql
stable
as $$
  select
    woi.id,
    woi.complaint,
    woi.symptom,
    woi.cause,
    woi.correction,
    woi.labor_time,
    coalesce(woi.parts, '[]'::jsonb),
    woi.job_category,
    to_jsonb(woi.tags),
    woi.vehicle_make,
    woi.vehicle_model,
    woi.vehicle_year,
    1 - (woi.embedding <=> p_embedding) as similarity
  from public.work_order_intelligence woi
  where woi.shop_id = p_shop_id
    and woi.embedding is not null
  order by woi.embedding <=> p_embedding
  limit greatest(p_match_count, 1);
$$;

create or replace function public.match_learned_job_templates(
  p_shop_id uuid,
  p_embedding vector(1536),
  p_match_count integer default 5
)
returns table (
  id uuid,
  label text,
  job_category text,
  default_labor_hours numeric,
  default_parts jsonb,
  usage_count integer,
  confidence_score numeric,
  tags jsonb,
  similarity float
)
language sql
stable
as $$
  select
    ljt.id,
    ljt.label,
    ljt.job_category,
    ljt.default_labor_hours,
    coalesce(ljt.default_parts, '[]'::jsonb),
    ljt.usage_count,
    ljt.confidence_score,
    to_jsonb(ljt.tags),
    1 - (ljt.embedding <=> p_embedding) as similarity
  from public.learned_job_templates ljt
  where ljt.shop_id = p_shop_id
    and ljt.embedding is not null
  order by ljt.embedding <=> p_embedding
  limit greatest(p_match_count, 1);
$$;
