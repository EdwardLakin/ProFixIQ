-- Step 18A (manual draft only)
-- Property request timeline events, read receipts, and attachment metadata placeholders.
--
-- IMPORTANT:
-- - Draft only; do not auto-apply in runtime code.
-- - No Supabase Storage bucket creation in this script.
-- - Full tenant portal auth/routing wiring is intentionally deferred.
-- - Vendor-user linkage and vendor RLS are intentionally deferred.

begin;

create table if not exists public.property_request_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  request_id uuid not null references public.property_maintenance_requests(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_type text not null default 'internal',
  event_type text not null,
  visibility text not null default 'internal',
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint property_request_events_actor_type_chk
    check (actor_type in ('internal', 'tenant', 'vendor', 'system')),
  constraint property_request_events_event_type_chk
    check (event_type in (
      'request_created',
      'status_changed',
      'comment',
      'internal_note',
      'vendor_assigned',
      'work_order_linked',
      'inspection_linked',
      'attachment_added',
      'read_receipt',
      'system'
    )),
  constraint property_request_events_visibility_chk
    check (visibility in ('internal', 'tenant_visible', 'vendor_visible', 'all_parties'))
);

create table if not exists public.property_request_read_receipts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  request_id uuid not null references public.property_maintenance_requests(id) on delete cascade,
  event_id uuid references public.property_request_events(id) on delete cascade,
  reader_profile_id uuid references public.profiles(id) on delete cascade,
  reader_type text not null default 'internal',
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint property_request_read_receipts_reader_type_chk
    check (reader_type in ('internal', 'tenant', 'vendor', 'owner'))
);

create table if not exists public.property_request_attachments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  request_id uuid not null references public.property_maintenance_requests(id) on delete cascade,
  event_id uuid references public.property_request_events(id) on delete set null,
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  file_kind text not null default 'image',
  storage_bucket text,
  storage_path text,
  original_filename text,
  content_type text,
  size_bytes bigint,
  caption text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint property_request_attachments_file_kind_chk
    check (file_kind in ('image', 'video', 'document', 'other'))
);

create index if not exists property_request_events_shop_id_idx
  on public.property_request_events (shop_id);
create index if not exists property_request_events_request_id_idx
  on public.property_request_events (request_id);
create index if not exists property_request_events_actor_profile_id_idx
  on public.property_request_events (actor_profile_id);
create index if not exists property_request_events_created_at_idx
  on public.property_request_events (created_at desc);
create index if not exists property_request_events_request_id_created_at_idx
  on public.property_request_events (request_id, created_at desc);

create index if not exists property_request_read_receipts_shop_id_idx
  on public.property_request_read_receipts (shop_id);
create index if not exists property_request_read_receipts_request_id_idx
  on public.property_request_read_receipts (request_id);
create index if not exists property_request_read_receipts_event_id_idx
  on public.property_request_read_receipts (event_id);
create index if not exists property_request_read_receipts_reader_profile_id_idx
  on public.property_request_read_receipts (reader_profile_id);
create index if not exists property_request_read_receipts_created_at_idx
  on public.property_request_read_receipts (created_at desc);
create index if not exists property_request_read_receipts_request_id_created_at_idx
  on public.property_request_read_receipts (request_id, created_at desc);

create index if not exists property_request_attachments_shop_id_idx
  on public.property_request_attachments (shop_id);
create index if not exists property_request_attachments_request_id_idx
  on public.property_request_attachments (request_id);
create index if not exists property_request_attachments_event_id_idx
  on public.property_request_attachments (event_id);
create index if not exists property_request_attachments_created_at_idx
  on public.property_request_attachments (created_at desc);
create index if not exists property_request_attachments_request_id_created_at_idx
  on public.property_request_attachments (request_id, created_at desc);

create unique index if not exists property_request_read_receipts_event_reader_unq
  on public.property_request_read_receipts (request_id, event_id, reader_profile_id)
  where event_id is not null and reader_profile_id is not null;

create unique index if not exists property_request_read_receipts_request_reader_unq
  on public.property_request_read_receipts (request_id, reader_profile_id)
  where event_id is null and reader_profile_id is not null;

create or replace function public.validate_property_request_event_scope()
returns trigger
language plpgsql
as $$
declare
  request_shop_id uuid;
begin
  select pmr.shop_id into request_shop_id
  from public.property_maintenance_requests pmr
  where pmr.id = new.request_id;

  if request_shop_id is null then
    raise exception 'property_maintenance_request % not found', new.request_id;
  end if;

  if request_shop_id <> new.shop_id then
    raise exception 'property_request_events.shop_id must match property_maintenance_requests.shop_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_property_request_event_scope on public.property_request_events;
create trigger trg_validate_property_request_event_scope
before insert or update on public.property_request_events
for each row execute function public.validate_property_request_event_scope();

create or replace function public.validate_property_request_receipt_scope()
returns trigger
language plpgsql
as $$
declare
  request_shop_id uuid;
  event_request_id uuid;
  event_shop_id uuid;
begin
  select pmr.shop_id into request_shop_id
  from public.property_maintenance_requests pmr
  where pmr.id = new.request_id;

  if request_shop_id is null then
    raise exception 'property_maintenance_request % not found', new.request_id;
  end if;

  if request_shop_id <> new.shop_id then
    raise exception 'property_request_read_receipts.shop_id must match property_maintenance_requests.shop_id';
  end if;

  if new.event_id is not null then
    select e.request_id, e.shop_id
      into event_request_id, event_shop_id
    from public.property_request_events e
    where e.id = new.event_id;

    if event_request_id is null then
      raise exception 'property_request_event % not found', new.event_id;
    end if;

    if event_request_id <> new.request_id or event_shop_id <> new.shop_id then
      raise exception 'property_request_read_receipts.event_id must match request_id and shop_id';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_property_request_receipt_scope on public.property_request_read_receipts;
create trigger trg_validate_property_request_receipt_scope
before insert or update on public.property_request_read_receipts
for each row execute function public.validate_property_request_receipt_scope();

create or replace function public.validate_property_request_attachment_scope()
returns trigger
language plpgsql
as $$
declare
  request_shop_id uuid;
  event_request_id uuid;
  event_shop_id uuid;
begin
  select pmr.shop_id into request_shop_id
  from public.property_maintenance_requests pmr
  where pmr.id = new.request_id;

  if request_shop_id is null then
    raise exception 'property_maintenance_request % not found', new.request_id;
  end if;

  if request_shop_id <> new.shop_id then
    raise exception 'property_request_attachments.shop_id must match property_maintenance_requests.shop_id';
  end if;

  if new.event_id is not null then
    select e.request_id, e.shop_id
      into event_request_id, event_shop_id
    from public.property_request_events e
    where e.id = new.event_id;

    if event_request_id is null then
      raise exception 'property_request_event % not found', new.event_id;
    end if;

    if event_request_id <> new.request_id or event_shop_id <> new.shop_id then
      raise exception 'property_request_attachments.event_id must match request_id and shop_id';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_property_request_attachment_scope on public.property_request_attachments;
create trigger trg_validate_property_request_attachment_scope
before insert or update on public.property_request_attachments
for each row execute function public.validate_property_request_attachment_scope();

alter table public.property_request_events enable row level security;
alter table public.property_request_read_receipts enable row level security;
alter table public.property_request_attachments enable row level security;

-- Internal staff: full CRUD within own shop.
drop policy if exists property_request_events_internal_staff_all on public.property_request_events;
create policy property_request_events_internal_staff_all
on public.property_request_events
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_request_events.shop_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_request_events.shop_id
  )
);

-- Property members: tenant-visible/all-parties read scope for related requests.
drop policy if exists property_request_events_property_member_select on public.property_request_events;
create policy property_request_events_property_member_select
on public.property_request_events
for select
using (
  visibility in ('tenant_visible', 'all_parties')
  and exists (
    select 1
    from public.property_maintenance_requests pmr
    join public.property_members pm
      on pm.shop_id = pmr.shop_id
     and (
       (pm.property_id is not null and pm.property_id = pmr.property_id)
       or (pm.unit_id is not null and pm.unit_id = pmr.unit_id)
     )
    where pmr.id = property_request_events.request_id
      and pm.user_id = auth.uid()
  )
);

-- Tenant requester insert: tenant-visible comment events in membership scope only.
drop policy if exists property_request_events_tenant_requester_insert on public.property_request_events;
create policy property_request_events_tenant_requester_insert
on public.property_request_events
for insert
with check (
  actor_profile_id = auth.uid()
  and actor_type = 'tenant'
  and event_type = 'comment'
  and visibility = 'tenant_visible'
  and exists (
    select 1
    from public.property_maintenance_requests pmr
    join public.property_members pm
      on pm.shop_id = pmr.shop_id
     and (
       (pm.property_id is not null and pm.property_id = pmr.property_id)
       or (pm.unit_id is not null and pm.unit_id = pmr.unit_id)
     )
    where pmr.id = property_request_events.request_id
      and pm.user_id = auth.uid()
      and pmr.shop_id = property_request_events.shop_id
  )
);

-- Internal staff: full CRUD within own shop.
drop policy if exists property_request_read_receipts_internal_staff_all on public.property_request_read_receipts;
create policy property_request_read_receipts_internal_staff_all
on public.property_request_read_receipts
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_request_read_receipts.shop_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_request_read_receipts.shop_id
  )
);

-- Read receipts: authenticated users can only insert rows for themselves.
drop policy if exists property_request_read_receipts_self_insert on public.property_request_read_receipts;
create policy property_request_read_receipts_self_insert
on public.property_request_read_receipts
for insert
with check (
  reader_profile_id = auth.uid()
  and exists (
    select 1
    from public.property_maintenance_requests pmr
    join public.property_members pm
      on pm.shop_id = pmr.shop_id
     and (
       (pm.property_id is not null and pm.property_id = pmr.property_id)
       or (pm.unit_id is not null and pm.unit_id = pmr.unit_id)
     )
    where pmr.id = property_request_read_receipts.request_id
      and pm.user_id = auth.uid()
      and pmr.shop_id = property_request_read_receipts.shop_id
  )
);

-- Internal staff: full CRUD within own shop.
drop policy if exists property_request_attachments_internal_staff_all on public.property_request_attachments;
create policy property_request_attachments_internal_staff_all
on public.property_request_attachments
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_request_attachments.shop_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = property_request_attachments.shop_id
  )
);

-- Property members: read attachment metadata when request timeline visibility allows shared context.
drop policy if exists property_request_attachments_property_member_select on public.property_request_attachments;
create policy property_request_attachments_property_member_select
on public.property_request_attachments
for select
using (
  exists (
    select 1
    from public.property_maintenance_requests pmr
    join public.property_members pm
      on pm.shop_id = pmr.shop_id
     and (
       (pm.property_id is not null and pm.property_id = pmr.property_id)
       or (pm.unit_id is not null and pm.unit_id = pmr.unit_id)
     )
    where pmr.id = property_request_attachments.request_id
      and pm.user_id = auth.uid()
  )
);

-- TODO(step-18x): add explicit vendor RLS once a safe vendor-user linkage exists.

commit;