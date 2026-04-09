-- Persist dashboard widget layouts with explicit shop scoping.
-- Non-breaking: additive table + indexes + RLS only.

create table if not exists public.dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete cascade,
  layout jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dashboard_layouts_shop_user_unique
  on public.dashboard_layouts (shop_id, user_id)
  where user_id is not null;

create unique index if not exists dashboard_layouts_shop_default_unique
  on public.dashboard_layouts (shop_id)
  where user_id is null;

create index if not exists dashboard_layouts_shop_idx
  on public.dashboard_layouts (shop_id);

create index if not exists dashboard_layouts_user_idx
  on public.dashboard_layouts (user_id);

drop trigger if exists trg_dashboard_layouts_updated_at on public.dashboard_layouts;

create trigger trg_dashboard_layouts_updated_at
before update on public.dashboard_layouts
for each row
execute function public.set_updated_at();

alter table public.dashboard_layouts enable row level security;

create policy "dashboard_layouts_select"
on public.dashboard_layouts
for select
to authenticated
using (
  shop_id = public.current_shop_id()
  and (user_id is null or user_id = auth.uid())
);

create policy "dashboard_layouts_insert"
on public.dashboard_layouts
for insert
to authenticated
with check (
  shop_id = public.current_shop_id()
  and (user_id is null or user_id = auth.uid())
);

create policy "dashboard_layouts_update"
on public.dashboard_layouts
for update
to authenticated
using (
  shop_id = public.current_shop_id()
  and (user_id is null or user_id = auth.uid())
)
with check (
  shop_id = public.current_shop_id()
  and (user_id is null or user_id = auth.uid())
);

grant select, insert, update, delete on public.dashboard_layouts to authenticated;
grant all on public.dashboard_layouts to service_role;
