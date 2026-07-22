-- Restore the fleet tenant root required by fleet portal enrollment.
-- Existing databases are validated and left unchanged.

do $$
declare
  v_mode text;
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    if to_regclass('public.fleets') is null then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: fleets is required before fleet portal migrations.';
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
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, name)
);

create index if not exists fleets_shop_name_idx
  on public.fleets(shop_id, lower(name));

alter table public.fleets enable row level security;

drop policy if exists fleets_shop_crud on public.fleets;
create policy fleets_shop_crud
  on public.fleets for all to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());
