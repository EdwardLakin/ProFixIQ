-- Provision the vehicle media storage buckets.
--
-- The work-order create page has written vehicle photos to vehicle-photos and
-- documents to vehicle-docs since it was written (create/page.tsx), but no
-- migration ever created either bucket. They exist only where someone made them
-- by hand, so those uploads fail outright in any freshly provisioned
-- environment, and the regression inventory already tracks the gap as known
-- debt expiring 2026-10-07.
--
-- This is the shared storage contract change on its own, landing ahead of the
-- feature that reads these objects back. It creates the buckets if they are
-- absent and brings an existing one onto the same terms: private, with access
-- scoped to the shop that owns the vehicle the object is filed under.
--
-- Object paths are <vehicle uuid>/<file>, which is what the create page already
-- writes, so existing objects keep working unchanged.

-- Narrow uuid cast for storage path segments; a non-uuid folder yields null
-- rather than raising, so a malformed object name simply matches no policy.
create or replace function public.vehicle_storage_path_uuid(p_segment text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_segment ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then p_segment::uuid
    else null
  end;
$$;

revoke all on function public.vehicle_storage_path_uuid(text) from public, anon;
grant execute on function public.vehicle_storage_path_uuid(text)
  to authenticated, service_role;

-- True when the caller's shop owns the vehicle the object path is filed under.
create or replace function public.vehicle_media_object_in_shop(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.shop_id is not null
      and v.shop_id = public.current_shop_id()
  );
$$;

revoke all on function public.vehicle_media_object_in_shop(uuid) from public, anon;
grant execute on function public.vehicle_media_object_in_shop(uuid)
  to authenticated, service_role;

-- Private buckets. Object paths are always <vehicle uuid>/<file>, matching what
-- the create page already writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-docs',
  'vehicle-docs',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vehicle_media_objects_select on storage.objects;
create policy vehicle_media_objects_select
on storage.objects for select to authenticated
using (
  bucket_id in ('vehicle-photos', 'vehicle-docs')
  and public.vehicle_media_object_in_shop(
    public.vehicle_storage_path_uuid((storage.foldername(name))[1])
  )
);

drop policy if exists vehicle_media_objects_insert on storage.objects;
create policy vehicle_media_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id in ('vehicle-photos', 'vehicle-docs')
  and public.vehicle_media_object_in_shop(
    public.vehicle_storage_path_uuid((storage.foldername(name))[1])
  )
);

drop policy if exists vehicle_media_objects_delete on storage.objects;
create policy vehicle_media_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id in ('vehicle-photos', 'vehicle-docs')
  and public.vehicle_media_object_in_shop(
    public.vehicle_storage_path_uuid((storage.foldername(name))[1])
  )
);


comment on function public.vehicle_media_object_in_shop(uuid) is
  'Authorizes a vehicle-photos/vehicle-docs storage object against the caller''s shop. Object paths are <vehicle uuid>/<file>.';

notify pgrst, 'reload schema';
