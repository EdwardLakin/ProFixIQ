begin;

-- Production already has the integrations registry, but the historical clean
-- replay baseline does not. Reconcile the canonical shape only when absent so
-- fresh databases and existing production databases converge on one contract.
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid null references public.shops(id) on delete cascade,
  provider text not null,
  status text not null default 'disabled',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_provider_check check (
    provider = any (array[
      'stripe'::text,
      'quickbooks'::text,
      'sendgrid'::text,
      'mapbox'::text,
      'openai'::text,
      'google_oauth'::text,
      'shopreel'::text,
      'aftermarket_api'::text
    ])
  ),
  constraint integrations_status_check check (
    status = any (array[
      'disabled'::text,
      'enabled'::text,
      'error'::text
    ])
  ),
  constraint integrations_shop_id_provider_key unique (shop_id, provider)
);

create unique index if not exists integrations_shop_provider_uidx
  on public.integrations (shop_id, provider);
create index if not exists integrations_shop_idx
  on public.integrations (shop_id);

alter table public.integrations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integrations'
      and policyname = 'integrations_select'
  ) then
    create policy integrations_select
      on public.integrations
      for select
      to public
      using (public.is_shop_member_v2(shop_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integrations'
      and policyname = 'integrations_insert'
  ) then
    create policy integrations_insert
      on public.integrations
      for insert
      to public
      with check (public.is_shop_member_v2(shop_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integrations'
      and policyname = 'integrations_update'
  ) then
    create policy integrations_update
      on public.integrations
      for update
      to public
      using (public.is_shop_member_v2(shop_id))
      with check (public.is_shop_member_v2(shop_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integrations'
      and policyname = 'integrations_delete'
  ) then
    create policy integrations_delete
      on public.integrations
      for delete
      to public
      using (public.is_shop_member_v2(shop_id));
  end if;
end
$$;

insert into public.integrations (
  id,
  shop_id,
  provider,
  status,
  config,
  created_at,
  updated_at
)
select
  '7c2da329-5117-48c0-a1ee-d51b5d63827d'::uuid,
  null,
  'aftermarket_api',
  'enabled',
  jsonb_build_object(
    'kind', 'profixiq_agent_bridge',
    'secret', bridge.secret
  ),
  bridge.created_at,
  now()
from public.agent_bridge_credentials bridge
where bridge.id = 'profixiq'
  and bridge.active = true
on conflict (id) do update
set shop_id = null,
    provider = excluded.provider,
    status = excluded.status,
    config = excluded.config,
    updated_at = now();

drop table if exists public.agent_bridge_credentials;

commit;
