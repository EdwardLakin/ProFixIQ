-- Shop Boost trust/guidance layer: review recommendations + lightweight traceability.

alter table if exists public.shop_boost_review_items
  add column if not exists recommended_action text,
  add column if not exists recommendation_reason text,
  add column if not exists recommendation_confidence numeric(5,4),
  add column if not exists candidate_targets jsonb not null default '[]'::jsonb,
  add column if not exists recommendation_generated_at timestamptz,
  add column if not exists recommendation_seen_at timestamptz,
  add column if not exists recommendation_followed boolean;

alter table if exists public.shop_boost_review_items
  drop constraint if exists shop_boost_review_items_recommended_action_check;

alter table if exists public.shop_boost_review_items
  add constraint shop_boost_review_items_recommended_action_check
  check (
    recommended_action is null
    or recommended_action in ('link_existing', 'create_new', 'merge_candidate', 'ignore')
  );

create index if not exists idx_shop_boost_review_items_recommendation
  on public.shop_boost_review_items(shop_id, intake_id, recommended_action, recommendation_confidence);

create table if not exists public.shop_boost_review_audit_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  intake_id uuid not null references public.shop_boost_intakes(id) on delete cascade,
  review_item_id uuid not null references public.shop_boost_review_items(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  recommendation jsonb not null default '{}'::jsonb,
  action_taken text,
  followed_recommendation boolean,
  materialization_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_shop_boost_review_audit_lookup
  on public.shop_boost_review_audit_events(shop_id, intake_id, review_item_id, created_at desc);

alter table public.shop_boost_review_audit_events enable row level security;

drop policy if exists "service-role-manage-shop-boost-review-audit-events" on public.shop_boost_review_audit_events;
create policy "service-role-manage-shop-boost-review-audit-events"
  on public.shop_boost_review_audit_events
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "shop-users-read-shop-boost-review-audit-events" on public.shop_boost_review_audit_events;
create policy "shop-users-read-shop-boost-review-audit-events"
  on public.shop_boost_review_audit_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = shop_boost_review_audit_events.shop_id
    )
  );
