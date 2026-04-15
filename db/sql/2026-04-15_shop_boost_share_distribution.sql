-- Phase 5 CRM/share upgrade for demo Shop Boost lead tracking.

alter table if exists public.demo_shop_boost_leads
  add column if not exists share_count integer not null default 0,
  add column if not exists emails_sent integer not null default 0,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists engagement_score numeric(6,2);

create index if not exists idx_demo_shop_boost_leads_engagement
  on public.demo_shop_boost_leads (demo_id, engagement_score desc, last_viewed_at desc);
