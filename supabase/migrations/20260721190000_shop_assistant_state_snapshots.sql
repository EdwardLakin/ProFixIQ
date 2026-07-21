-- Cached, actor-scoped shop-state snapshots for the shop-wide assistant.
-- Snapshots are short-lived and never replace source-of-truth operational tables.

create table if not exists public.shop_assistant_state_snapshots (
  shop_id uuid not null,
  user_id uuid not null,
  role text,
  snapshot jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null default now(),
  invalidated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (shop_id, user_id),
  constraint shop_assistant_state_snapshot_object_chk
    check (jsonb_typeof(snapshot) = 'object'),
  constraint shop_assistant_state_version_positive_chk
    check (version > 0)
);

create index if not exists shop_assistant_state_snapshots_expiry_idx
  on public.shop_assistant_state_snapshots (expires_at);

create or replace function public.shop_assistant_state_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shop_assistant_state_snapshots_set_updated_at
  on public.shop_assistant_state_snapshots;
create trigger shop_assistant_state_snapshots_set_updated_at
before update on public.shop_assistant_state_snapshots
for each row execute function public.shop_assistant_state_set_updated_at();

alter table public.shop_assistant_state_snapshots enable row level security;

drop policy if exists shop_assistant_state_snapshots_owner_select
  on public.shop_assistant_state_snapshots;
create policy shop_assistant_state_snapshots_owner_select
on public.shop_assistant_state_snapshots
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_state_snapshots.shop_id
      and lower(coalesce(p.role, '')) not in ('customer', 'driver', 'mechanic')
  )
);

drop policy if exists shop_assistant_state_snapshots_owner_insert
  on public.shop_assistant_state_snapshots;
create policy shop_assistant_state_snapshots_owner_insert
on public.shop_assistant_state_snapshots
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_state_snapshots.shop_id
      and lower(coalesce(p.role, '')) not in ('customer', 'driver', 'mechanic')
  )
);

drop policy if exists shop_assistant_state_snapshots_owner_update
  on public.shop_assistant_state_snapshots;
create policy shop_assistant_state_snapshots_owner_update
on public.shop_assistant_state_snapshots
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_state_snapshots.shop_id
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_state_snapshots.shop_id
  )
);

drop policy if exists shop_assistant_state_snapshots_owner_delete
  on public.shop_assistant_state_snapshots;
create policy shop_assistant_state_snapshots_owner_delete
on public.shop_assistant_state_snapshots
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_state_snapshots.shop_id
  )
);

grant select, insert, update, delete
  on public.shop_assistant_state_snapshots
  to authenticated;
