-- Shop Boost review resolution materialization support

alter table if exists public.shop_boost_review_items
  add column if not exists materialized_at timestamptz,
  add column if not exists materialization_error text,
  add column if not exists materialized_record jsonb not null default '{}'::jsonb;

create index if not exists idx_shop_boost_review_items_materialization
  on public.shop_boost_review_items (shop_id, intake_id, status, materialized_at);
