begin;

-- A VIN may legitimately exist in more than one tenant (for example after an
-- ownership transfer). Canonical recall identity is the tenant vehicle plus
-- the NHTSA campaign, never a globally shared VIN.
do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vehicles'::regclass
      and conname = 'vehicles_id_shop_id_key'
  ) then
    alter table public.vehicles
      add constraint vehicles_id_shop_id_key unique (id, shop_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vehicle_recalls'::regclass
      and conname = 'vehicle_recalls_shop_vehicle_campaign_key'
  ) then
    alter table public.vehicle_recalls
      add constraint vehicle_recalls_shop_vehicle_campaign_key
      unique (shop_id, vehicle_id, campaign_number);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vehicle_recalls'::regclass
      and conname = 'vehicle_recalls_vehicle_shop_fkey'
  ) then
    alter table public.vehicle_recalls
      add constraint vehicle_recalls_vehicle_shop_fkey
      foreign key (vehicle_id, shop_id)
      references public.vehicles (id, shop_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vehicle_recalls'::regclass
      and conname = 'vehicle_recalls_vin_format_check'
  ) then
    alter table public.vehicle_recalls
      add constraint vehicle_recalls_vin_format_check
      check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$')
      not valid;
  end if;
end
$migration$;

drop index if exists public.vehicle_recalls_vin_campaign_idx;

create table if not exists public.vehicle_recall_fetch_limits (
  shop_id uuid not null references public.shops(id) on delete cascade,
  scope text not null check (scope in ('actor', 'vehicle')),
  subject_id uuid not null,
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (shop_id, scope, subject_id)
);

alter table public.vehicle_recall_fetch_limits enable row level security;
alter table public.vehicle_recall_fetch_limits force row level security;

revoke all on table public.vehicle_recall_fetch_limits from public, anon, authenticated;
grant all on table public.vehicle_recall_fetch_limits to service_role;

create or replace function public.consume_vehicle_recall_fetch_quota(
  p_shop_id uuid,
  p_actor_id uuid,
  p_vehicle_id uuid
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_started timestamptz;
  v_actor_count integer;
  v_vehicle_started timestamptz;
  v_vehicle_count integer;
  v_retry integer;
begin
  if p_shop_id is null or p_actor_id is null or p_vehicle_id is null then
    raise exception 'recall quota scope is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.shop_id = p_shop_id
  ) then
    raise exception 'recall quota actor is outside shop scope' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.shop_id = p_shop_id
  ) then
    raise exception 'recall quota vehicle is outside shop scope' using errcode = '42501';
  end if;

  insert into public.vehicle_recall_fetch_limits (shop_id, scope, subject_id)
  values
    (p_shop_id, 'actor', p_actor_id),
    (p_shop_id, 'vehicle', p_vehicle_id)
  on conflict (shop_id, scope, subject_id) do nothing;

  select window_started_at, request_count
  into v_actor_started, v_actor_count
  from public.vehicle_recall_fetch_limits
  where shop_id = p_shop_id
    and scope = 'actor'
    and subject_id = p_actor_id
  for update;

  select window_started_at, request_count
  into v_vehicle_started, v_vehicle_count
  from public.vehicle_recall_fetch_limits
  where shop_id = p_shop_id
    and scope = 'vehicle'
    and subject_id = p_vehicle_id
  for update;

  if v_actor_started + interval '1 hour' <= v_now then
    v_actor_started := v_now;
    v_actor_count := 0;
    update public.vehicle_recall_fetch_limits
    set window_started_at = v_now,
        request_count = 0,
        updated_at = v_now
    where shop_id = p_shop_id
      and scope = 'actor'
      and subject_id = p_actor_id;
  end if;

  if v_vehicle_started + interval '1 hour' <= v_now then
    v_vehicle_started := v_now;
    v_vehicle_count := 0;
    update public.vehicle_recall_fetch_limits
    set window_started_at = v_now,
        request_count = 0,
        updated_at = v_now
    where shop_id = p_shop_id
      and scope = 'vehicle'
      and subject_id = p_vehicle_id;
  end if;

  if v_actor_count >= 120 or v_vehicle_count >= 12 then
    v_retry := greatest(
      case
        when v_actor_count >= 120 then
          ceil(extract(epoch from (v_actor_started + interval '1 hour' - v_now)))::integer
        else 0
      end,
      case
        when v_vehicle_count >= 12 then
          ceil(extract(epoch from (v_vehicle_started + interval '1 hour' - v_now)))::integer
        else 0
      end,
      1
    );
    return query select false, v_retry;
    return;
  end if;

  update public.vehicle_recall_fetch_limits
  set request_count = request_count + 1,
      updated_at = v_now
  where shop_id = p_shop_id
    and (
      (scope = 'actor' and subject_id = p_actor_id)
      or (scope = 'vehicle' and subject_id = p_vehicle_id)
    );

  return query select true, 0;
end
$function$;

alter function public.consume_vehicle_recall_fetch_quota(uuid, uuid, uuid)
  owner to postgres;
revoke all on function public.consume_vehicle_recall_fetch_quota(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_vehicle_recall_fetch_quota(uuid, uuid, uuid)
  to service_role;

commit;
