begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Mobile service must remain an orchestration layer over canonical work orders.
-- A service address represents where work is physically performed; a service
-- visit represents one scheduled/dispatch execution of a work order. Neither
-- table duplicates repair, pricing, approval, invoice, or technician-line state.

create table if not exists public.service_addresses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  label text,
  address_line1 text not null,
  address_line2 text,
  city text,
  province_state text,
  postal_code text,
  country_code text not null default 'CA',
  latitude numeric(9,6),
  longitude numeric(9,6),
  access_notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_addresses_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint service_addresses_longitude_check
    check (longitude is null or longitude between -180 and 180)
);

create index if not exists service_addresses_shop_customer_idx
  on public.service_addresses(shop_id, customer_id);

create table if not exists public.service_visits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  service_address_id uuid references public.service_addresses(id) on delete set null,
  mode text not null default 'shop',
  status text not null default 'scheduled',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  service_vehicle_id uuid,
  travel_started_at timestamptz,
  arrived_at timestamptz,
  work_started_at timestamptz,
  completed_at timestamptz,
  estimated_travel_minutes integer,
  actual_travel_minutes integer,
  estimated_distance_km numeric(10,2),
  actual_distance_km numeric(10,2),
  dispatch_notes text,
  lifecycle_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_visits_mode_check
    check (mode in ('shop', 'mobile')),
  constraint service_visits_status_check
    check (status in (
      'scheduled',
      'dispatched',
      'en_route',
      'arrived',
      'working',
      'paused',
      'completed',
      'cancelled'
    )),
  constraint service_visits_schedule_order_check
    check (
      scheduled_start is null
      or scheduled_end is null
      or scheduled_end > scheduled_start
    ),
  constraint service_visits_travel_minutes_check
    check (
      (estimated_travel_minutes is null or estimated_travel_minutes >= 0)
      and (actual_travel_minutes is null or actual_travel_minutes >= 0)
    ),
  constraint service_visits_distance_check
    check (
      (estimated_distance_km is null or estimated_distance_km >= 0)
      and (actual_distance_km is null or actual_distance_km >= 0)
    )
);

create index if not exists service_visits_shop_schedule_idx
  on public.service_visits(shop_id, scheduled_start);

create index if not exists service_visits_work_order_idx
  on public.service_visits(work_order_id, scheduled_start);

create index if not exists service_visits_assigned_user_idx
  on public.service_visits(shop_id, assigned_user_id, scheduled_start)
  where assigned_user_id is not null;

create index if not exists service_visits_dispatch_queue_idx
  on public.service_visits(shop_id, status, scheduled_start)
  where status in ('scheduled', 'dispatched', 'en_route', 'arrived', 'working', 'paused');

alter table public.service_addresses enable row level security;
alter table public.service_visits enable row level security;

-- Explicit grants are required for new public-schema tables under current
-- Supabase Data API defaults. RLS below remains the row-level authority.
revoke all on table public.service_addresses from public, anon;
revoke all on table public.service_visits from public, anon;
grant select, insert, update, delete on table public.service_addresses to authenticated;
grant select, insert, update, delete on table public.service_visits to authenticated;
grant all on table public.service_addresses to service_role;
grant all on table public.service_visits to service_role;

drop policy if exists service_addresses_shop_member_select on public.service_addresses;
create policy service_addresses_shop_member_select
on public.service_addresses
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_addresses.shop_id
  )
);

drop policy if exists service_addresses_shop_member_insert on public.service_addresses;
create policy service_addresses_shop_member_insert
on public.service_addresses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_addresses.shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor','mechanic')
  )
);

drop policy if exists service_addresses_shop_member_update on public.service_addresses;
create policy service_addresses_shop_member_update
on public.service_addresses
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_addresses.shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor','mechanic')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_addresses.shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor','mechanic')
  )
);

drop policy if exists service_addresses_shop_manager_delete on public.service_addresses;
create policy service_addresses_shop_manager_delete
on public.service_addresses
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_addresses.shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor')
  )
);

drop policy if exists service_visits_shop_member_select on public.service_visits;
create policy service_visits_shop_member_select
on public.service_visits
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_visits.shop_id
  )
);

drop policy if exists service_visits_shop_member_insert on public.service_visits;
create policy service_visits_shop_member_insert
on public.service_visits
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_visits.shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor','mechanic')
  )
  and exists (
    select 1
    from public.work_orders wo
    where wo.id = service_visits.work_order_id
      and wo.shop_id = service_visits.shop_id
  )
  and (
    service_visits.service_address_id is null
    or exists (
      select 1
      from public.service_addresses sa
      where sa.id = service_visits.service_address_id
        and sa.shop_id = service_visits.shop_id
    )
  )
);

drop policy if exists service_visits_shop_member_update on public.service_visits;
create policy service_visits_shop_member_update
on public.service_visits
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_visits.shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor','mechanic')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_visits.shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor','mechanic')
  )
  and exists (
    select 1
    from public.work_orders wo
    where wo.id = service_visits.work_order_id
      and wo.shop_id = service_visits.shop_id
  )
  and (
    service_visits.service_address_id is null
    or exists (
      select 1
      from public.service_addresses sa
      where sa.id = service_visits.service_address_id
        and sa.shop_id = service_visits.shop_id
    )
  )
);

drop policy if exists service_visits_shop_manager_delete on public.service_visits;
create policy service_visits_shop_manager_delete
on public.service_visits
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where (p.id = (select auth.uid()) or p.user_id = (select auth.uid()))
      and p.shop_id = service_visits.shop_id
      and lower(coalesce(p.role, '')) in ('owner','admin','manager','advisor')
  )
);

comment on table public.service_addresses is
  'Reusable customer/site locations where shop or mobile work can be performed.';
comment on table public.service_visits is
  'Physical execution/dispatch visits attached to canonical work orders; does not replace work-order lifecycle state.';
comment on column public.service_visits.assigned_user_id is
  'Dispatch ownership for this physical visit only; work-order-line technician assignment remains canonical for repair labor ownership.';
comment on column public.service_visits.service_vehicle_id is
  'Reserved FK target for the service_vehicles domain introduced in the next mobile-service slice.';

notify pgrst, 'reload schema';

commit;
