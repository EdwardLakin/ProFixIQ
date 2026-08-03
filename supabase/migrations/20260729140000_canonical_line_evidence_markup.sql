begin;

alter table public.work_order_media
  add column if not exists quote_line_id uuid references public.work_order_quote_lines(id) on delete set null,
  add column if not exists visibility text not null default 'internal',
  add column if not exists updated_at timestamptz not null default now();

alter table public.work_order_media
  drop constraint if exists work_order_media_visibility_check;
alter table public.work_order_media
  add constraint work_order_media_visibility_check
  check (visibility in ('internal', 'customer'));

create index if not exists idx_work_order_media_quote_line
  on public.work_order_media(quote_line_id)
  where quote_line_id is not null;
create index if not exists idx_work_order_media_line_visibility
  on public.work_order_media(shop_id, work_order_line_id, visibility, created_at desc);
create unique index if not exists uq_work_order_media_quote_url
  on public.work_order_media(shop_id, quote_line_id, url)
  where quote_line_id is not null;

create table if not exists public.work_order_media_annotations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  media_id uuid not null references public.work_order_media(id) on delete cascade,
  version integer not null check (version > 0),
  overlay jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(overlay) = 'array'
      and jsonb_array_length(overlay) <= 100
      and octet_length(overlay::text) <= 100000
    ),
  visibility text not null default 'internal'
    check (visibility in ('internal', 'customer')),
  created_by uuid not null references auth.users(id) on delete restrict,
  client_mutation_id text check (
    client_mutation_id is null
    or length(client_mutation_id) between 1 and 200
  ),
  created_at timestamptz not null default now(),
  unique (media_id, version)
);

create unique index if not exists uq_work_order_media_annotation_mutation
  on public.work_order_media_annotations(shop_id, client_mutation_id)
  where client_mutation_id is not null;
create index if not exists idx_work_order_media_annotations_latest
  on public.work_order_media_annotations(media_id, version desc);

create or replace function public.validate_work_order_media_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_work_order_shop_id uuid;
  v_line_shop_id uuid;
  v_line_work_order_id uuid;
  v_quote_shop_id uuid;
  v_quote_work_order_id uuid;
  v_quote_work_order_line_id uuid;
begin
  select shop_id
    into v_work_order_shop_id
  from public.work_orders
  where id = new.work_order_id;

  if v_work_order_shop_id is null or v_work_order_shop_id <> new.shop_id then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_MEDIA_SCOPE_MISMATCH';
  end if;

  if new.work_order_line_id is not null then
    select shop_id, work_order_id
      into v_line_shop_id, v_line_work_order_id
    from public.work_order_lines
    where id = new.work_order_line_id;

    if v_line_shop_id is null
       or v_line_shop_id <> new.shop_id
       or v_line_work_order_id is distinct from new.work_order_id then
      raise exception using errcode = 'P0001', message = 'WORK_ORDER_MEDIA_LINE_SCOPE_MISMATCH';
    end if;
  end if;

  if new.quote_line_id is not null then
    select shop_id, work_order_id, work_order_line_id
      into v_quote_shop_id, v_quote_work_order_id, v_quote_work_order_line_id
    from public.work_order_quote_lines
    where id = new.quote_line_id;

    if v_quote_shop_id is null
       or v_quote_shop_id <> new.shop_id
       or v_quote_work_order_id is distinct from new.work_order_id then
      raise exception using errcode = 'P0001', message = 'WORK_ORDER_MEDIA_QUOTE_SCOPE_MISMATCH';
    end if;

    if new.work_order_line_id is not null
       and v_quote_work_order_line_id is not null
       and v_quote_work_order_line_id is distinct from new.work_order_line_id then
      raise exception using errcode = 'P0001', message = 'WORK_ORDER_MEDIA_QUOTE_LINE_MISMATCH';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.validate_work_order_media_annotation_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_media_shop_id uuid;
begin
  select shop_id into v_media_shop_id
  from public.work_order_media
  where id = new.media_id;

  if v_media_shop_id is null or v_media_shop_id <> new.shop_id then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_MEDIA_ANNOTATION_SCOPE_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_work_order_media_annotation_scope
  on public.work_order_media_annotations;
create trigger trg_validate_work_order_media_annotation_scope
before insert or update on public.work_order_media_annotations
for each row execute function public.validate_work_order_media_annotation_scope();

create or replace function public.sync_quote_line_media_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  if new.shop_id is null or new.work_order_id is null then
    return new;
  end if;

  for v_url in
    select distinct trim(value)
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb) -> 'photo_urls') = 'array'
          then coalesce(new.metadata, '{}'::jsonb) -> 'photo_urls'
        else '[]'::jsonb
      end
    ) value
    where trim(value) <> ''
  loop
    insert into public.work_order_media (
      shop_id,
      work_order_id,
      work_order_line_id,
      quote_line_id,
      user_id,
      kind,
      url,
      source,
      visibility
    ) values (
      new.shop_id,
      new.work_order_id,
      new.work_order_line_id,
      new.id,
      new.suggested_by,
      'photo',
      v_url,
      'inspection_finding',
      'customer'
    )
    on conflict (shop_id, quote_line_id, url)
      where quote_line_id is not null
    do update set
      work_order_line_id = coalesce(
        excluded.work_order_line_id,
        public.work_order_media.work_order_line_id
      ),
      source = 'inspection_finding',
      updated_at = now();
  end loop;

  if new.work_order_line_id is not null then
    update public.work_order_media
    set work_order_line_id = new.work_order_line_id,
        updated_at = now()
    where shop_id = new.shop_id
      and work_order_id = new.work_order_id
      and quote_line_id = new.id
      and work_order_line_id is distinct from new.work_order_line_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_quote_line_media_evidence
  on public.work_order_quote_lines;
create trigger trg_sync_quote_line_media_evidence
after insert or update of metadata, work_order_line_id
on public.work_order_quote_lines
for each row execute function public.sync_quote_line_media_evidence();

-- Register existing inspection evidence without changing quote or approval state.
insert into public.work_order_media (
  shop_id,
  work_order_id,
  work_order_line_id,
  quote_line_id,
  user_id,
  kind,
  url,
  source,
  visibility
)
select distinct
  q.shop_id,
  q.work_order_id,
  q.work_order_line_id,
  q.id,
  q.suggested_by,
  'photo',
  trim(photo.value),
  'inspection_finding',
  'customer'
from public.work_order_quote_lines q
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(coalesce(q.metadata, '{}'::jsonb) -> 'photo_urls') = 'array'
      then coalesce(q.metadata, '{}'::jsonb) -> 'photo_urls'
    else '[]'::jsonb
  end
) photo(value)
where q.shop_id is not null
  and q.work_order_id is not null
  and trim(photo.value) <> ''
on conflict (shop_id, quote_line_id, url)
  where quote_line_id is not null
do update set
  work_order_line_id = coalesce(
    excluded.work_order_line_id,
    public.work_order_media.work_order_line_id
  ),
  source = 'inspection_finding',
  updated_at = now();

alter table public.work_order_media_annotations enable row level security;

revoke all on table public.work_order_media_annotations
  from public, anon, authenticated;
grant select on table public.work_order_media_annotations to authenticated;
grant all on table public.work_order_media_annotations to service_role;

drop policy if exists "Users can view their shop's media"
  on public.work_order_media;
drop policy if exists "Users can insert their own WO media"
  on public.work_order_media;

drop policy if exists work_order_media_shop_select on public.work_order_media;
create policy work_order_media_shop_select
on public.work_order_media
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = work_order_media.shop_id
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
        'mechanic', 'tech', 'technician', 'lead_hand', 'leadhand',
        'lead hand', 'lead', 'foreman'
      )
  )
  or (
    work_order_media.visibility = 'customer'
    and exists (
      select 1
      from public.work_orders wo
      join public.customers c on c.id = wo.customer_id
      where wo.id = work_order_media.work_order_id
        and wo.shop_id = work_order_media.shop_id
        and c.shop_id = work_order_media.shop_id
        and c.user_id = auth.uid()
    )
  )
  or (
    work_order_media.visibility = 'customer'
    and exists (
      select 1
      from public.work_orders wo
      join public.fleet_vehicles fv on fv.vehicle_id = wo.vehicle_id
      join public.fleet_members fm on fm.fleet_id = fv.fleet_id
      where wo.id = work_order_media.work_order_id
        and wo.shop_id = work_order_media.shop_id
        and fm.shop_id = work_order_media.shop_id
        and (
          fv.shop_id is null
          or fv.shop_id = work_order_media.shop_id
        )
        and fm.user_id = auth.uid()
    )
  )
);

drop policy if exists work_order_media_shop_insert on public.work_order_media;
create policy work_order_media_shop_insert
on public.work_order_media
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = work_order_media.shop_id
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service',
        'mechanic', 'tech', 'technician', 'lead_hand', 'leadhand',
        'lead hand', 'lead', 'foreman'
      )
  )
);

drop policy if exists work_order_media_shop_update on public.work_order_media;
create policy work_order_media_shop_update
on public.work_order_media
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = work_order_media.shop_id
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service',
        'mechanic', 'tech', 'technician', 'lead_hand', 'leadhand',
        'lead hand', 'lead', 'foreman'
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = work_order_media.shop_id
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service',
        'mechanic', 'tech', 'technician', 'lead_hand', 'leadhand',
        'lead hand', 'lead', 'foreman'
      )
  )
);

drop policy if exists work_order_media_annotations_select
  on public.work_order_media_annotations;
create policy work_order_media_annotations_select
on public.work_order_media_annotations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = work_order_media_annotations.shop_id
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
        'mechanic', 'tech', 'technician', 'lead_hand', 'leadhand',
        'lead hand', 'lead', 'foreman'
      )
  )
  or (
    work_order_media_annotations.visibility = 'customer'
    and exists (
      select 1
      from public.work_order_media wom
      join public.work_orders wo
        on wo.id = wom.work_order_id
       and wo.shop_id = wom.shop_id
      join public.customers c
        on c.id = wo.customer_id
      where wom.id = work_order_media_annotations.media_id
        and wom.visibility = 'customer'
        and c.shop_id = wom.shop_id
        and c.user_id = auth.uid()
    )
  )
  or (
    work_order_media_annotations.visibility = 'customer'
    and exists (
      select 1
      from public.work_order_media wom
      join public.work_orders wo
        on wo.id = wom.work_order_id
       and wo.shop_id = wom.shop_id
      join public.fleet_vehicles fv on fv.vehicle_id = wo.vehicle_id
      join public.fleet_members fm on fm.fleet_id = fv.fleet_id
      where wom.id = work_order_media_annotations.media_id
        and wom.visibility = 'customer'
        and fm.shop_id = wom.shop_id
        and (
          fv.shop_id is null
          or fv.shop_id = wom.shop_id
        )
        and fm.user_id = auth.uid()
    )
  )
);

create or replace function public.save_work_order_media_annotation_atomic(
  p_media_id uuid,
  p_overlay jsonb,
  p_visibility text,
  p_client_mutation_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_media public.work_order_media%rowtype;
  v_existing public.work_order_media_annotations%rowtype;
  v_saved public.work_order_media_annotations%rowtype;
  v_version integer;
  v_visibility text := lower(trim(coalesce(p_visibility, 'internal')));
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'Authentication required.';
  end if;
  if nullif(trim(coalesce(p_client_mutation_id, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable client mutation id is required.';
  end if;
  if jsonb_typeof(coalesce(p_overlay, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0001', message = 'Annotation overlay must be an array.';
  end if;
  if v_visibility not in ('internal', 'customer') then
    raise exception using errcode = 'P0001', message = 'Unsupported annotation visibility.';
  end if;

  select * into v_media
  from public.work_order_media
  where id = p_media_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Media not found.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor
      and p.shop_id = v_media.shop_id
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service',
        'mechanic', 'tech', 'technician', 'lead_hand', 'leadhand',
        'lead hand', 'lead', 'foreman'
      )
  ) then
    raise exception using errcode = '42501', message = 'Media access denied.';
  end if;

  select * into v_existing
  from public.work_order_media_annotations
  where shop_id = v_media.shop_id
    and client_mutation_id = trim(p_client_mutation_id);
  if found then
    if v_existing.media_id <> p_media_id
       or v_existing.created_by <> v_actor then
      raise exception using
        errcode = 'P0001',
        message = 'Annotation mutation id was already used.';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('idempotent', true);
  end if;

  if v_visibility = 'customer' and v_media.visibility <> 'customer' then
    update public.work_order_media
    set visibility = 'customer',
        updated_at = now()
    where id = v_media.id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_media_id::text, 0));
  select coalesce(max(version), 0) + 1
    into v_version
  from public.work_order_media_annotations
  where media_id = p_media_id;

  insert into public.work_order_media_annotations (
    shop_id,
    media_id,
    version,
    overlay,
    visibility,
    created_by,
    client_mutation_id
  ) values (
    v_media.shop_id,
    p_media_id,
    v_version,
    p_overlay,
    v_visibility,
    v_actor,
    trim(p_client_mutation_id)
  )
  returning * into v_saved;

  return to_jsonb(v_saved) || jsonb_build_object('idempotent', false);
end;
$$;

revoke all on function public.save_work_order_media_annotation_atomic(uuid,jsonb,text,text)
  from public, anon;
grant execute on function public.save_work_order_media_annotation_atomic(uuid,jsonb,text,text)
  to authenticated, service_role;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'work_order_media_annotations'
  ) then
    alter publication supabase_realtime
      add table public.work_order_media_annotations;
  end if;

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'work_order_media'
  ) then
    alter publication supabase_realtime
      add table public.work_order_media;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
