create extension if not exists pgcrypto;

create table if not exists public.shopreel_integrations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  enabled boolean not null default false,
  shopreel_base_url text not null default 'https://shopreel.profixiq.com',
  remote_shop_id uuid null,
  enabled_event_types text[] not null default array[
    'inspection.completed',
    'inspection.finding.flagged',
    'workorder.approved',
    'workorder.completed',
    'media.before_after.added'
  ]::text[],
  last_tested_at timestamptz null,
  last_success_at timestamptz null,
  last_error_at timestamptz null,
  last_error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint shopreel_integrations_shop_unique unique (shop_id)
);

create table if not exists public.shopreel_event_deliveries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  integration_id uuid null references public.shopreel_integrations(id) on delete set null,
  event_key text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  request_url text not null,
  http_status integer null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  response_body text null,
  error_message text null,
  delivered_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_shopreel_integrations_shop_id
  on public.shopreel_integrations (shop_id);

create index if not exists idx_shopreel_event_deliveries_shop_id
  on public.shopreel_event_deliveries (shop_id);

create index if not exists idx_shopreel_event_deliveries_status
  on public.shopreel_event_deliveries (status);

create index if not exists idx_shopreel_event_deliveries_event_key
  on public.shopreel_event_deliveries (event_key);

create or replace function public.set_updated_at_shopreel_integrations()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_shopreel_integrations_updated_at on public.shopreel_integrations;
create trigger trg_shopreel_integrations_updated_at
before update on public.shopreel_integrations
for each row
execute function public.set_updated_at_shopreel_integrations();

create or replace function public.set_updated_at_shopreel_event_deliveries()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_shopreel_event_deliveries_updated_at on public.shopreel_event_deliveries;
create trigger trg_shopreel_event_deliveries_updated_at
before update on public.shopreel_event_deliveries
for each row
execute function public.set_updated_at_shopreel_event_deliveries();

alter table public.shopreel_integrations enable row level security;
alter table public.shopreel_event_deliveries enable row level security;

drop policy if exists "shopreel_integrations_select_member" on public.shopreel_integrations;
create policy "shopreel_integrations_select_member"
on public.shopreel_integrations
for select
using (public.is_shop_member(shop_id));

drop policy if exists "shopreel_integrations_insert_member" on public.shopreel_integrations;
create policy "shopreel_integrations_insert_member"
on public.shopreel_integrations
for insert
with check (public.is_shop_member(shop_id));

drop policy if exists "shopreel_integrations_update_member" on public.shopreel_integrations;
create policy "shopreel_integrations_update_member"
on public.shopreel_integrations
for update
using (public.is_shop_member(shop_id))
with check (public.is_shop_member(shop_id));

drop policy if exists "shopreel_event_deliveries_select_member" on public.shopreel_event_deliveries;
create policy "shopreel_event_deliveries_select_member"
on public.shopreel_event_deliveries
for select
using (public.is_shop_member(shop_id));

drop policy if exists "shopreel_event_deliveries_insert_member" on public.shopreel_event_deliveries;
create policy "shopreel_event_deliveries_insert_member"
on public.shopreel_event_deliveries
for insert
with check (public.is_shop_member(shop_id));

drop policy if exists "shopreel_event_deliveries_update_member" on public.shopreel_event_deliveries;
create policy "shopreel_event_deliveries_update_member"
on public.shopreel_event_deliveries
for update
using (public.is_shop_member(shop_id))
with check (public.is_shop_member(shop_id));
