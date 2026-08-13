begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Field Service integrations share one connection/mapping/event contract. The
-- application stores only non-secret configuration here; provider credentials
-- remain server-side and are addressed through secret_reference.
create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  provider text not null,
  display_name text,
  status text not null default 'disconnected'
    check (status in ('disconnected','pending','connected','degraded','error')),
  capabilities text[] not null default '{}'::text[],
  config jsonb not null default '{}'::jsonb,
  secret_reference text,
  sync_cursor jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_provider_format
    check (provider = lower(provider) and provider ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint integration_connections_shop_provider_key unique (shop_id, provider)
);

create table if not exists public.integration_external_objects (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  object_type text not null,
  external_id text not null,
  canonical_table text not null,
  canonical_id uuid not null,
  external_version text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_external_objects_provider_format
    check (provider = lower(provider) and provider ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint integration_external_objects_type_format
    check (object_type ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint integration_external_objects_table_format
    check (canonical_table ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint integration_external_objects_external_id_nonempty
    check (length(trim(external_id)) between 1 and 512)
);

create unique index if not exists integration_external_objects_provider_key
  on public.integration_external_objects (
    shop_id,
    provider,
    object_type,
    lower(external_id)
  );
create index if not exists integration_external_objects_canonical_idx
  on public.integration_external_objects (
    shop_id,
    canonical_table,
    canonical_id,
    provider
  );
create index if not exists integration_external_objects_connection_idx
  on public.integration_external_objects (connection_id, object_type, last_seen_at desc)
  where connection_id is not null;

create table if not exists public.integration_sync_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  direction text not null check (direction in ('inbound','outbound')),
  operation text not null,
  operation_key text not null,
  object_type text,
  external_id text,
  canonical_table text,
  canonical_id uuid,
  status text not null default 'started'
    check (status in ('started','succeeded','failed','dead_lettered')),
  payload_hash text,
  request_metadata jsonb not null default '{}'::jsonb,
  response_metadata jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1 check (attempt_count > 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint integration_sync_events_operation_key_nonempty
    check (length(trim(operation_key)) between 1 and 300),
  constraint integration_sync_events_shop_operation_key unique (shop_id, operation_key)
);

create index if not exists integration_sync_events_connection_status_idx
  on public.integration_sync_events (connection_id, status, created_at desc)
  where connection_id is not null;
create index if not exists integration_sync_events_object_idx
  on public.integration_sync_events (
    shop_id,
    canonical_table,
    canonical_id,
    created_at desc
  )
  where canonical_id is not null;

-- A provider result, supplier SKU, barcode, or external catalog id maps to the
-- same canonical parts.id. Provider identities never replace the ProFixIQ part.
create table if not exists public.part_external_identities (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null default 'manual',
  external_id text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  manufacturer text,
  part_number text,
  supplier_sku text,
  barcode text,
  unit_of_measure text,
  package_quantity numeric(12,4) not null default 1
    check (package_quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint part_external_identities_provider_format
    check (provider = lower(provider) and provider ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint part_external_identities_has_identity
    check (
      nullif(trim(external_id), '') is not null
      or nullif(trim(supplier_sku), '') is not null
      or nullif(trim(barcode), '') is not null
      or nullif(trim(part_number), '') is not null
    )
);

create unique index if not exists part_external_identities_provider_external_key
  on public.part_external_identities (
    shop_id,
    provider,
    lower(external_id)
  )
  where active and external_id is not null and trim(external_id) <> '';
create unique index if not exists part_external_identities_barcode_key
  on public.part_external_identities (shop_id, lower(barcode))
  where active and barcode is not null and trim(barcode) <> '';
create index if not exists part_external_identities_part_idx
  on public.part_external_identities (shop_id, part_id, active, updated_at desc);
create index if not exists part_external_identities_supplier_sku_idx
  on public.part_external_identities (shop_id, supplier_id, lower(supplier_sku))
  where active and supplier_sku is not null and trim(supplier_sku) <> '';
create index if not exists part_external_identities_part_number_idx
  on public.part_external_identities (
    shop_id,
    lower(coalesce(manufacturer, '')),
    lower(part_number)
  )
  where active and part_number is not null and trim(part_number) <> '';

alter table public.integration_connections enable row level security;
alter table public.integration_external_objects enable row level security;
alter table public.integration_sync_events enable row level security;
alter table public.part_external_identities enable row level security;

create or replace function private.profixiq_field_inventory_actor_context(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns table (
  profile_id uuid,
  canonical_role text,
  can_manage_parts boolean,
  can_view_field boolean,
  has_field_access boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    public.canonical_shop_membership_role(p.role::text),
    public.profixiq_shop_has_product_access(p_shop_id, 'field_service')
      and public.canonical_shop_membership_role(p.role::text) in (
        'owner','admin','manager','parts','lead_hand','foreman'
      ),
    public.profixiq_shop_has_product_access(p_shop_id, 'field_service')
      and (
        public.canonical_shop_membership_role(p.role::text) in (
          'owner','admin','manager','parts','advisor','service','lead_hand','foreman'
        )
        or public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id)
      ),
    public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id)
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by (p.id = p_actor_user_id) desc, p.id
  limit 1;
$$;

create or replace function private.profixiq_field_inventory_actor_can_use_truck(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_service_vehicle_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select *
    from private.profixiq_field_inventory_actor_context(
      p_shop_id,
      p_actor_user_id
    )
  )
  select exists (
    select 1
    from actor a
    join public.service_vehicles vehicle
      on vehicle.id = p_service_vehicle_id
     and vehicle.shop_id = p_shop_id
     and vehicle.active
    where a.can_manage_parts
       or (
         a.has_field_access
         and (
           vehicle.primary_user_id = a.profile_id
           or exists (
             select 1
             from public.service_visits visit
             where visit.shop_id = p_shop_id
               and visit.service_vehicle_id = vehicle.id
               and visit.assigned_user_id = a.profile_id
               and visit.status not in ('completed','cancelled')
           )
         )
       )
  );
$$;

create or replace function private.profixiq_validate_integration_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.provider := lower(trim(new.provider));

  if tg_table_name <> 'integration_connections' then
    if new.connection_id is not null
       and not exists (
         select 1
         from public.integration_connections connection
         where connection.id = new.connection_id
           and connection.shop_id = new.shop_id
           and connection.provider = new.provider
       ) then
      raise exception using
        errcode = '23503',
        message = 'INTEGRATION_CONNECTION_SCOPE_MISMATCH';
    end if;
  end if;

  if tg_table_name in ('integration_connections', 'integration_external_objects') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists integration_connections_validate on public.integration_connections;
create trigger integration_connections_validate
before insert or update on public.integration_connections
for each row execute function private.profixiq_validate_integration_scope();

drop trigger if exists integration_external_objects_validate on public.integration_external_objects;
create trigger integration_external_objects_validate
before insert or update on public.integration_external_objects
for each row execute function private.profixiq_validate_integration_scope();

drop trigger if exists integration_sync_events_validate on public.integration_sync_events;
create trigger integration_sync_events_validate
before insert or update on public.integration_sync_events
for each row execute function private.profixiq_validate_integration_scope();

create or replace function private.profixiq_validate_part_external_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.parts part
    where part.id = new.part_id
      and part.shop_id = new.shop_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'PART_EXTERNAL_IDENTITY_PART_SHOP_MISMATCH';
  end if;

  if new.connection_id is not null and not exists (
    select 1
    from public.integration_connections connection
    where connection.id = new.connection_id
      and connection.shop_id = new.shop_id
      and connection.provider = new.provider
  ) then
    raise exception using
      errcode = '23503',
      message = 'PART_EXTERNAL_IDENTITY_CONNECTION_MISMATCH';
  end if;

  if new.supplier_id is not null and not exists (
    select 1
    from public.suppliers supplier
    where supplier.id = new.supplier_id
      and supplier.shop_id = new.shop_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'PART_EXTERNAL_IDENTITY_SUPPLIER_MISMATCH';
  end if;

  new.provider := lower(trim(new.provider));
  new.external_id := nullif(trim(new.external_id), '');
  new.manufacturer := nullif(trim(new.manufacturer), '');
  new.part_number := nullif(trim(new.part_number), '');
  new.supplier_sku := nullif(trim(new.supplier_sku), '');
  new.barcode := nullif(trim(new.barcode), '');
  new.unit_of_measure := nullif(trim(new.unit_of_measure), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists part_external_identities_validate on public.part_external_identities;
create trigger part_external_identities_validate
before insert or update on public.part_external_identities
for each row execute function private.profixiq_validate_part_external_identity();

-- Existing barcode mappings become canonical external identities without
-- changing the current parts_barcodes contract.
insert into public.part_external_identities (
  shop_id,
  part_id,
  provider,
  external_id,
  supplier_id,
  barcode,
  metadata
)
select
  barcode.shop_id,
  barcode.part_id,
  'barcode',
  coalesce(nullif(trim(barcode.code), ''), barcode.barcode),
  barcode.supplier_id,
  barcode.barcode,
  jsonb_build_object('source', 'parts_barcodes_backfill')
from public.parts_barcodes barcode
where nullif(trim(barcode.barcode), '') is not null
on conflict do nothing;

-- Same-shop members may read connection health and mappings. All writes go
-- through server-side integration commands or service-role workers.
drop policy if exists integration_connections_shop_read on public.integration_connections;
create policy integration_connections_shop_read
on public.integration_connections
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.shop_id = integration_connections.shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
      and public.canonical_shop_membership_role(profile.role::text) in (
        'owner','admin','manager','parts','lead_hand','foreman'
      )
  )
);

drop policy if exists integration_external_objects_shop_read on public.integration_external_objects;
create policy integration_external_objects_shop_read
on public.integration_external_objects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.shop_id = integration_external_objects.shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
      and public.canonical_shop_membership_role(profile.role::text) in (
        'owner','admin','manager','parts','lead_hand','foreman'
      )
  )
);

drop policy if exists integration_sync_events_shop_read on public.integration_sync_events;
create policy integration_sync_events_shop_read
on public.integration_sync_events
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.shop_id = integration_sync_events.shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
      and public.canonical_shop_membership_role(profile.role::text) in (
        'owner','admin','manager','lead_hand','foreman'
      )
  )
);

drop policy if exists part_external_identities_shop_read on public.part_external_identities;
create policy part_external_identities_shop_read
on public.part_external_identities
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.shop_id = part_external_identities.shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
  )
);

revoke all on table public.integration_connections from public, anon, authenticated;
revoke all on table public.integration_external_objects from public, anon, authenticated;
revoke all on table public.integration_sync_events from public, anon, authenticated;
revoke all on table public.part_external_identities from public, anon, authenticated;
grant select on table public.integration_connections to authenticated;
grant select on table public.integration_external_objects to authenticated;
grant select on table public.integration_sync_events to authenticated;
grant select on table public.part_external_identities to authenticated;
grant all on table public.integration_connections to service_role;
grant all on table public.integration_external_objects to service_role;
grant all on table public.integration_sync_events to service_role;
grant all on table public.part_external_identities to service_role;


commit;
