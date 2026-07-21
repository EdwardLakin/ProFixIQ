begin;

create table if not exists public.assistant_shop_states (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_shop_states_refreshed_idx
  on public.assistant_shop_states(refreshed_at desc);

alter table public.assistant_shop_states enable row level security;

drop policy if exists assistant_shop_states_shop_select on public.assistant_shop_states;
create policy assistant_shop_states_shop_select
  on public.assistant_shop_states for select to authenticated
  using (shop_id = public.current_shop_id());

revoke all on table public.assistant_shop_states from anon;
grant select on table public.assistant_shop_states to authenticated;
grant all on table public.assistant_shop_states to service_role;

comment on table public.assistant_shop_states is
  'Cached, shop-scoped world state for the shop-wide assistant. Service-role code is the only writer.';

commit;
