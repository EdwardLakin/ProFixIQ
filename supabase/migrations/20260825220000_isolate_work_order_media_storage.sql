begin;

-- The established dashboard-created bucket may still be public in an existing
-- project. Keep its configuration in place while making every object read go
-- through the policies below. Clean replay can legitimately start without the
-- bucket, so this forward repair is intentionally a no-op when it is absent.
update storage.buckets
set public = false
where id = 'job-photos'
  and public is distinct from false;

-- Parent/line scope validation must see the canonical rows even when the
-- authenticated writer is represented by an imported profile whose id differs
-- from auth.uid().  The trigger still derives every accepted relationship from
-- the stored parents; running its reads as the function owner prevents legacy
-- Work Order read RLS from turning a valid same-Shop insert into a false scope
-- mismatch.  Trigger functions do not need a browser-callable EXECUTE grant.
alter function public.validate_work_order_media_scope() security definer;
alter function public.validate_work_order_media_scope() set search_path = '';
revoke all on function public.validate_work_order_media_scope()
  from public, anon, authenticated, service_role;

-- Bind every browser media mutation to a canonical Shop actor and target. The
-- target repair line is locked before the decision so a mechanic cannot race a
-- reassignment and finish a write using the previous assignment generation.
-- Management roles retain their established Shop-wide write behavior; Parts
-- remains a read-only evidence consumer.
create or replace function private.work_order_media_write_access(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_work_order_line_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_linked_user_id uuid;
  v_actor_role text;
begin
  if v_actor_user_id is null
     or p_shop_id is null
     or p_work_order_id is null then
    return false;
  end if;

  select
    profile.id,
    profile.user_id,
    public.canonical_shop_membership_role(profile.role::text)
    into
      v_actor_profile_id,
      v_actor_linked_user_id,
      v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (
      profile.id = v_actor_user_id
      or profile.user_id = v_actor_user_id
    )
  order by
    (profile.user_id = v_actor_user_id) desc,
    (profile.id = v_actor_user_id) desc,
    profile.updated_at desc nulls last,
    profile.id
  limit 1;

  if v_actor_profile_id is null
     or not (coalesce(v_actor_role, '') = any(array[
       'owner', 'admin', 'manager', 'advisor', 'service',
       'mechanic', 'lead_hand', 'foreman'
     ]::text[])) then
    return false;
  end if;

  if p_work_order_line_id is null then
    if v_actor_role = 'mechanic' then
      return false;
    end if;

    perform 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.shop_id = p_shop_id
    for no key update;
    return found;
  end if;

  perform 1
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.work_order_id = p_work_order_id
    and line.shop_id = p_shop_id
  for update;
  if not found then
    return false;
  end if;

  if v_actor_role = 'mechanic'
     and not exists (
       select 1
       from public.work_order_lines line
       where line.id = p_work_order_line_id
         and line.work_order_id = p_work_order_id
         and line.shop_id = p_shop_id
         and (
           line.assigned_tech_id in (
             v_actor_profile_id,
             v_actor_user_id,
             v_actor_linked_user_id
           )
           or line.assigned_to in (
             v_actor_profile_id,
             v_actor_user_id,
             v_actor_linked_user_id
           )
           or exists (
             select 1
             from public.work_order_line_technicians assignment
             where assignment.work_order_line_id = line.id
               and assignment.technician_id in (
                 v_actor_profile_id,
                 v_actor_user_id,
                 v_actor_linked_user_id
               )
           )
         )
     ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.work_order_media_write_access(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.work_order_media_write_access(uuid,uuid,uuid)
  to authenticated;

-- Resolve a private job-photo object through its canonical Work Order and line
-- anchors before Storage evaluates an authenticated request.  The helper is
-- SECURITY DEFINER so financial read RLS cannot accidentally block assigned
-- technicians, while the returned decision remains bound to auth.uid().
create or replace function private.job_photo_object_access(
  p_name text,
  p_owner_id text,
  p_operation text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_match text[];
  v_work_order_id uuid;
  v_work_order_line_id uuid;
  v_shop_id uuid;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_owner_user_id uuid;
begin
  if v_actor_user_id is null
     or v_operation not in ('select', 'insert', 'update', 'delete') then
    return false;
  end if;

  v_match := regexp_match(
    coalesce(p_name, ''),
    '^wo/([0-9a-fA-F-]{36})/lines/([0-9a-fA-F-]{36})/([^/]+)$'
  );
  if v_match is null then
    return false;
  end if;

  begin
    v_work_order_id := v_match[1]::uuid;
    v_work_order_line_id := v_match[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  select wo.shop_id
    into v_shop_id
  from public.work_orders wo
  join public.work_order_lines line
    on line.id = v_work_order_line_id
   and line.work_order_id = wo.id
   and line.shop_id = wo.shop_id
  where wo.id = v_work_order_id;

  if v_shop_id is null then
    return false;
  end if;

  select
    profile.id,
    public.canonical_shop_membership_role(profile.role::text)
    into v_actor_profile_id, v_actor_role
  from public.profiles profile
  where profile.shop_id = v_shop_id
    and (
      profile.id = v_actor_user_id
      or profile.user_id = v_actor_user_id
    )
  order by (profile.id = v_actor_user_id) desc,
           profile.updated_at desc nulls last,
           profile.id
  limit 1;

  if v_operation = 'select' then
    if v_actor_profile_id is not null
       and v_actor_role = any(array[
         'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
         'mechanic', 'lead_hand', 'foreman'
       ]::text[]) then
      return true;
    end if;

    -- Customer and Fleet callers only receive objects already classified as
    -- customer-visible canonical media for their own Work Order relationship.
    return exists (
      select 1
      from public.work_order_media media
      join public.work_orders wo
        on wo.id = media.work_order_id
       and wo.shop_id = media.shop_id
      where media.shop_id = v_shop_id
        and media.work_order_id = v_work_order_id
        and media.work_order_line_id = v_work_order_line_id
        and media.storage_bucket = 'job-photos'
        and media.storage_path = p_name
        and media.visibility = 'customer'
        and (
          public.profixiq_is_portal_customer_for(
            wo.customer_id,
            media.shop_id
          )
          or exists (
            select 1
            from public.fleet_vehicles fleet_vehicle
            join public.fleet_members membership
              on membership.fleet_id = fleet_vehicle.fleet_id
            where fleet_vehicle.vehicle_id = wo.vehicle_id
              and (
                fleet_vehicle.shop_id is null
                or fleet_vehicle.shop_id = media.shop_id
              )
              and membership.shop_id = media.shop_id
              and membership.user_id = v_actor_user_id
          )
        )
    );
  end if;

  if not private.work_order_media_write_access(
    v_shop_id,
    v_work_order_id,
    v_work_order_line_id
  ) then
    return false;
  end if;

  begin
    v_owner_user_id := nullif(btrim(coalesce(p_owner_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_operation = 'insert' then
    return v_owner_user_id = v_actor_user_id;
  end if;

  -- Retried uploads may update/delete their own object.  Only the established
  -- Work Order management roles may manage another actor's same-Shop object.
  return v_owner_user_id = v_actor_user_id
    or v_actor_role = any(array['owner', 'admin', 'manager']::text[]);
end;
$$;

revoke all on function private.job_photo_object_access(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function private.job_photo_object_access(text,text,text)
  to authenticated, service_role;

drop policy if exists job_photos_select on storage.objects;
create policy job_photos_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-photos'
  and private.job_photo_object_access(
    name,
    coalesce(nullif(owner_id, ''), owner::text),
    'select'
  )
);

drop policy if exists job_photos_insert on storage.objects;
create policy job_photos_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'job-photos'
  and private.job_photo_object_access(
    name,
    coalesce(nullif(owner_id, ''), owner::text),
    'insert'
  )
);

drop policy if exists job_photos_update on storage.objects;
create policy job_photos_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'job-photos'
  and private.job_photo_object_access(
    name,
    coalesce(nullif(owner_id, ''), owner::text),
    'update'
  )
)
with check (
  bucket_id = 'job-photos'
  and private.job_photo_object_access(
    name,
    coalesce(nullif(owner_id, ''), owner::text),
    'update'
  )
);

drop policy if exists job_photos_delete on storage.objects;
create policy job_photos_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'job-photos'
  and private.job_photo_object_access(
    name,
    coalesce(nullif(owner_id, ''), owner::text),
    'delete'
  )
);

-- Remove a production-drift policy that treated every same-Shop profile,
-- including Customer Portal profiles, as an unrestricted internal-media reader.
drop policy if exists work_order_media_select on public.work_order_media;

revoke all on table public.work_order_media
  from public, anon, authenticated;
grant select, insert, update on table public.work_order_media
  to authenticated;
grant all on table public.work_order_media
  to service_role;

drop policy if exists work_order_media_shop_select on public.work_order_media;
create policy work_order_media_shop_select
on public.work_order_media
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.shop_id = work_order_media.shop_id
      and (
        profile.id = auth.uid()
        or profile.user_id = auth.uid()
      )
      and public.canonical_shop_membership_role(profile.role::text) = any(array[
        'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
        'mechanic', 'lead_hand', 'foreman'
      ]::text[])
  )
  or (
    work_order_media.visibility = 'customer'
    and exists (
      select 1
      from public.work_orders wo
      where wo.id = work_order_media.work_order_id
        and wo.shop_id = work_order_media.shop_id
        and public.profixiq_is_portal_customer_for(
          wo.customer_id,
          work_order_media.shop_id
        )
    )
  )
  or (
    work_order_media.visibility = 'customer'
    and exists (
      select 1
      from public.work_orders wo
      join public.fleet_vehicles fleet_vehicle
        on fleet_vehicle.vehicle_id = wo.vehicle_id
      join public.fleet_members membership
        on membership.fleet_id = fleet_vehicle.fleet_id
      where wo.id = work_order_media.work_order_id
        and wo.shop_id = work_order_media.shop_id
        and membership.shop_id = work_order_media.shop_id
        and (
          fleet_vehicle.shop_id is null
          or fleet_vehicle.shop_id = work_order_media.shop_id
        )
        and membership.user_id = auth.uid()
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
  and private.work_order_media_write_access(
    work_order_media.shop_id,
    work_order_media.work_order_id,
    work_order_media.work_order_line_id
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.shop_id = work_order_media.shop_id
      and (
        profile.id = auth.uid()
        or profile.user_id = auth.uid()
      )
      and public.canonical_shop_membership_role(profile.role::text) = any(array[
        'owner', 'admin', 'manager', 'advisor', 'service',
        'mechanic', 'lead_hand', 'foreman'
      ]::text[])
  )
);

drop policy if exists work_order_media_shop_update on public.work_order_media;
create policy work_order_media_shop_update
on public.work_order_media
for update
to authenticated
using (
  private.work_order_media_write_access(
    work_order_media.shop_id,
    work_order_media.work_order_id,
    work_order_media.work_order_line_id
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.shop_id = work_order_media.shop_id
      and (
        profile.id = auth.uid()
        or profile.user_id = auth.uid()
      )
      and public.canonical_shop_membership_role(profile.role::text) = any(array[
        'owner', 'admin', 'manager', 'advisor', 'service',
        'mechanic', 'lead_hand', 'foreman'
      ]::text[])
  )
)
with check (
  private.work_order_media_write_access(
    work_order_media.shop_id,
    work_order_media.work_order_id,
    work_order_media.work_order_line_id
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.shop_id = work_order_media.shop_id
      and (
        profile.id = auth.uid()
        or profile.user_id = auth.uid()
      )
      and public.canonical_shop_membership_role(profile.role::text) = any(array[
        'owner', 'admin', 'manager', 'advisor', 'service',
        'mechanic', 'lead_hand', 'foreman'
      ]::text[])
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
    from public.profiles profile
    where profile.shop_id = work_order_media_annotations.shop_id
      and (
        profile.id = auth.uid()
        or profile.user_id = auth.uid()
      )
      and public.canonical_shop_membership_role(profile.role::text) = any(array[
        'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
        'mechanic', 'lead_hand', 'foreman'
      ]::text[])
  )
  or (
    work_order_media_annotations.visibility = 'customer'
    and exists (
      select 1
      from public.work_order_media media
      join public.work_orders wo
        on wo.id = media.work_order_id
       and wo.shop_id = media.shop_id
      where media.id = work_order_media_annotations.media_id
        and media.visibility = 'customer'
        and public.profixiq_is_portal_customer_for(
          wo.customer_id,
          media.shop_id
        )
    )
  )
  or (
    work_order_media_annotations.visibility = 'customer'
    and exists (
      select 1
      from public.work_order_media media
      join public.work_orders wo
        on wo.id = media.work_order_id
       and wo.shop_id = media.shop_id
      join public.fleet_vehicles fleet_vehicle
        on fleet_vehicle.vehicle_id = wo.vehicle_id
      join public.fleet_members membership
        on membership.fleet_id = fleet_vehicle.fleet_id
      where media.id = work_order_media_annotations.media_id
        and media.visibility = 'customer'
        and membership.shop_id = media.shop_id
        and (
          fleet_vehicle.shop_id is null
          or fleet_vehicle.shop_id = media.shop_id
        )
        and membership.user_id = auth.uid()
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
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_candidate public.work_order_media%rowtype;
  v_media public.work_order_media%rowtype;
  v_existing public.work_order_media_annotations%rowtype;
  v_saved public.work_order_media_annotations%rowtype;
  v_version integer;
  v_visibility text := lower(btrim(coalesce(p_visibility, 'internal')));
begin
  if v_actor_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if nullif(btrim(coalesce(p_client_mutation_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'A stable client mutation id is required.';
  end if;
  if jsonb_typeof(coalesce(p_overlay, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Annotation overlay must be an array.';
  end if;
  if v_visibility not in ('internal', 'customer') then
    raise exception using errcode = '22023', message = 'Unsupported annotation visibility.';
  end if;

  select * into v_candidate
  from public.work_order_media
  where id = p_media_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Media not found.';
  end if;

  -- Lock the target line before the media row. Direct media updates use the
  -- same order through RLS, avoiding a media/assignment lock inversion while
  -- still authorizing before an idempotent annotation receipt is returned.
  if not private.work_order_media_write_access(
    v_candidate.shop_id,
    v_candidate.work_order_id,
    v_candidate.work_order_line_id
  ) then
    raise exception using errcode = '42501', message = 'Media access denied.';
  end if;

  select * into v_media
  from public.work_order_media media
  where media.id = p_media_id
    and media.shop_id = v_candidate.shop_id
    and media.work_order_id = v_candidate.work_order_id
    and media.work_order_line_id is not distinct from
      v_candidate.work_order_line_id
  for update;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'Media scope changed while authorizing; retry the annotation.';
  end if;

  select * into v_existing
  from public.work_order_media_annotations
  where shop_id = v_media.shop_id
    and client_mutation_id = btrim(p_client_mutation_id);
  if found then
    if v_existing.media_id <> p_media_id
       or v_existing.created_by <> v_actor_user_id then
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
    v_actor_user_id,
    btrim(p_client_mutation_id)
  )
  returning * into v_saved;

  return to_jsonb(v_saved) || jsonb_build_object('idempotent', false);
end;
$$;

revoke all on function public.save_work_order_media_annotation_atomic(uuid,jsonb,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_work_order_media_annotation_atomic(uuid,jsonb,text,text)
  to authenticated, service_role;

commit;
