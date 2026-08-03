-- Complete the historical fleet portal dependencies before invite hardening.
-- Existing databases are validated and left unchanged; clean bootstraps receive
-- the canonical fleet and membership tables used by portal enrollment.

do $$
declare
  v_mode text;
  v_missing_tables text[];
  v_missing_columns text[];
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
      into v_missing_tables
    from unnest(array['fleets', 'fleet_members']::text[]) as required(required_table)
    where to_regclass('public.' || required_table) is null;

    if coalesce(array_length(v_missing_tables, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: fleet portal tables are missing: '
          || array_to_string(v_missing_tables, ', ');
    end if;

    select array_agg(required_column order by required_column)
      into v_missing_columns
    from (
      values
        ('fleets', 'id'),
        ('fleets', 'shop_id'),
        ('fleets', 'name'),
        ('fleets', 'contact_email'),
        ('fleets', 'contact_name'),
        ('fleet_members', 'fleet_id'),
        ('fleet_members', 'shop_id'),
        ('fleet_members', 'user_id'),
        ('fleet_members', 'role'),
        ('fleet_members', 'created_by'),
        ('fleet_members', 'created_at'),
        ('fleet_members', 'updated_at')
    ) as required(table_name, required_column)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = required.table_name
        and c.column_name = required.required_column
    );

    if coalesce(array_length(v_missing_columns, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: fleet portal columns are missing: '
          || array_to_string(v_missing_columns, ', ');
    end if;

    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

create table if not exists public.fleets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fleets_shop_name_uidx
  on public.fleets(shop_id, lower(name));
create index if not exists fleets_shop_active_idx
  on public.fleets(shop_id, active, created_at desc);

create table if not exists public.fleet_members (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('viewer', 'approver', 'manager')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fleet_id)
);

create index if not exists fleet_members_user_idx
  on public.fleet_members(user_id, created_at);
create index if not exists fleet_members_fleet_idx
  on public.fleet_members(fleet_id, role, created_at);
create index if not exists fleet_members_shop_idx
  on public.fleet_members(shop_id, fleet_id, user_id);

alter table public.fleets enable row level security;
alter table public.fleet_members enable row level security;

drop policy if exists fleets_actor_select on public.fleets;
create policy fleets_actor_select
  on public.fleets
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.shop_id = fleets.shop_id
    )
    or exists (
      select 1 from public.fleet_members fm
      where fm.fleet_id = fleets.id
        and fm.shop_id = fleets.shop_id
        and fm.user_id = auth.uid()
    )
  );

drop policy if exists fleets_manager_write on public.fleets;
create policy fleets_manager_write
  on public.fleets
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = fleets.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = fleets.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
    )
  );

drop policy if exists fleet_members_actor_select on public.fleet_members;
create policy fleet_members_actor_select
  on public.fleet_members
  for select to authenticated
  using (
    exists (
      select 1
      from public.fleets f
      where f.id = fleet_members.fleet_id
        and f.shop_id = fleet_members.shop_id
    )
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.shop_id = fleet_members.shop_id
      )
    )
  );

drop policy if exists fleet_members_manager_write on public.fleet_members;
create policy fleet_members_manager_write
  on public.fleet_members
  for all to authenticated
  using (
    exists (
      select 1
      from public.fleets f
      where f.id = fleet_members.fleet_id
        and f.shop_id = fleet_members.shop_id
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = fleet_members.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
    )
  )
  with check (
    exists (
      select 1
      from public.fleets f
      where f.id = fleet_members.fleet_id
        and f.shop_id = fleet_members.shop_id
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = fleet_members.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
    )
  );
