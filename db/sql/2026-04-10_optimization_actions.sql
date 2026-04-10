-- Phase 4.5 optimization action audit + review log (non-breaking)
-- Suggestions remain read-only until explicitly applied/dismissed by a user.

create table if not exists public.optimization_actions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  opportunity_id text not null,
  type text not null check (type in ('pricing', 'inspection', 'revenue')),
  action text not null check (action in ('applied', 'dismissed')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists optimization_actions_shop_created_idx
  on public.optimization_actions (shop_id, created_at desc);

create index if not exists optimization_actions_shop_opportunity_idx
  on public.optimization_actions (shop_id, opportunity_id);

alter table public.optimization_actions enable row level security;

create policy "optimization_actions_select"
on public.optimization_actions
for select
to authenticated
using (shop_id = public.current_shop_id());

create policy "optimization_actions_insert"
on public.optimization_actions
for insert
to authenticated
with check (
  shop_id = public.current_shop_id()
  and (created_by is null or created_by = auth.uid())
);

create policy "optimization_actions_update"
on public.optimization_actions
for update
to authenticated
using (shop_id = public.current_shop_id())
with check (shop_id = public.current_shop_id());

grant select, insert, update, delete on public.optimization_actions to authenticated;
grant all on public.optimization_actions to service_role;
