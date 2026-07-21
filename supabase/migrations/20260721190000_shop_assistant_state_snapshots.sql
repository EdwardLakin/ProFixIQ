-- Cached, actor-scoped shop-state snapshots for the shop-wide assistant.
-- Snapshots are short-lived and never replace source-of-truth operational tables.
-- Authenticated staff may read only their own snapshot; server code owns writes.

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

create or replace function public.invalidate_shop_assistant_state_snapshots(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer := 0;
begin
  if p_shop_id is null or p_actor_user_id is null then
    raise exception using errcode = '22023', message = 'Shop and actor are required.';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_actor_user_id then
    raise exception using errcode = '42501', message = 'Actor identity does not match the authenticated user.';
  end if;

  perform 1
  from public.profiles p
  where p.id = p_actor_user_id
    and p.shop_id = p_shop_id
    and lower(replace(coalesce(p.role, ''), ' ', '_')) not in (
      'customer',
      'driver',
      'mechanic',
      'tech',
      'technician'
    );
  if not found then
    raise exception using errcode = '42501', message = 'Actor cannot invalidate shop assistant state for this shop.';
  end if;

  update public.shop_assistant_state_snapshots
  set expires_at = v_now,
      invalidated_at = v_now,
      updated_at = v_now
  where shop_id = p_shop_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.invalidate_shop_assistant_state_snapshots(uuid, uuid)
  from public;
grant execute on function public.invalidate_shop_assistant_state_snapshots(uuid, uuid)
  to authenticated, service_role;

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
      and lower(coalesce(p.role, '')) not in (
        'customer',
        'driver',
        'mechanic',
        'tech',
        'technician'
      )
  )
);

-- Remove legacy client-write policies if an earlier preview applied this migration.
drop policy if exists shop_assistant_state_snapshots_owner_insert
  on public.shop_assistant_state_snapshots;
drop policy if exists shop_assistant_state_snapshots_owner_update
  on public.shop_assistant_state_snapshots;
drop policy if exists shop_assistant_state_snapshots_owner_delete
  on public.shop_assistant_state_snapshots;

revoke insert, update, delete
  on public.shop_assistant_state_snapshots
  from authenticated;
grant select
  on public.shop_assistant_state_snapshots
  to authenticated;
grant select, insert, update, delete
  on public.shop_assistant_state_snapshots
  to service_role;
