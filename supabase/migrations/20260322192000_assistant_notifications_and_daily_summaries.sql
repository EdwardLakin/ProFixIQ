begin;

create table if not exists public.assistant_notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid null references public.profiles(id) on delete set null,
  role text null,
  source text not null default 'ops',
  fingerprint text not null,
  code text not null,
  level text not null check (level in ('info', 'warning', 'urgent')),
  title text not null,
  message text not null,
  href text null,
  entity_type text null,
  entity_id uuid null,
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved')),
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  acknowledged_by uuid null references public.profiles(id) on delete set null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, fingerprint)
);

create index if not exists assistant_notifications_shop_status_idx
  on public.assistant_notifications (shop_id, status, level, last_seen_at desc);

create index if not exists assistant_notifications_user_status_idx
  on public.assistant_notifications (user_id, status, last_seen_at desc);

create index if not exists assistant_notifications_role_status_idx
  on public.assistant_notifications (shop_id, role, status, last_seen_at desc);

create table if not exists public.assistant_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  summary_date date not null default current_date,
  summary_text text not null,
  action_items jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  notifications jsonb not null default '[]'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id, role, summary_date)
);

create index if not exists assistant_daily_summaries_shop_date_idx
  on public.assistant_daily_summaries (shop_id, summary_date desc);

create index if not exists assistant_daily_summaries_user_date_idx
  on public.assistant_daily_summaries (user_id, summary_date desc);

alter table public.assistant_notifications enable row level security;
alter table public.assistant_daily_summaries enable row level security;

drop policy if exists "assistant_notifications_select_same_shop" on public.assistant_notifications;
create policy "assistant_notifications_select_same_shop"
on public.assistant_notifications
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = assistant_notifications.shop_id
  )
);

drop policy if exists "assistant_notifications_insert_same_shop" on public.assistant_notifications;
create policy "assistant_notifications_insert_same_shop"
on public.assistant_notifications
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = assistant_notifications.shop_id
  )
);

drop policy if exists "assistant_notifications_update_same_shop" on public.assistant_notifications;
create policy "assistant_notifications_update_same_shop"
on public.assistant_notifications
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = assistant_notifications.shop_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = assistant_notifications.shop_id
  )
);

drop policy if exists "assistant_daily_summaries_select_same_shop" on public.assistant_daily_summaries;
create policy "assistant_daily_summaries_select_same_shop"
on public.assistant_daily_summaries
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = assistant_daily_summaries.shop_id
  )
);

drop policy if exists "assistant_daily_summaries_insert_same_shop" on public.assistant_daily_summaries;
create policy "assistant_daily_summaries_insert_same_shop"
on public.assistant_daily_summaries
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = assistant_daily_summaries.shop_id
  )
);

drop policy if exists "assistant_daily_summaries_update_same_shop" on public.assistant_daily_summaries;
create policy "assistant_daily_summaries_update_same_shop"
on public.assistant_daily_summaries
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = assistant_daily_summaries.shop_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = assistant_daily_summaries.shop_id
  )
);

commit;
