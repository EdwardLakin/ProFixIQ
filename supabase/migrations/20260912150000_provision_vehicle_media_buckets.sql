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

-- True when the caller is shop staff for the shop that owns the vehicle the
-- object is filed under.
--
-- Shop scope alone is not enough: the session shop setting carries
-- no role gate, so a shop-scoped driver or fleet_manager profile would pass it
-- and could read or delete raw vehicle media directly, going around the fleet
-- evidence route's enrolment and visibility checks. The caller's own profile row
-- supplies both the shop and the role here.
--
-- is_staff_for_shop is deliberately not reused: it omits service, lead_hand and
-- foreman, which ROLE_GROUPS.workOrderCreators includes, and those users upload
-- these very photos from the work-order create page.
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
    join public.profiles p on p.id = auth.uid()
    where v.id = p_vehicle_id
      and v.shop_id is not null
      and p.shop_id = v.shop_id
      and p.role in (
        'owner', 'admin', 'manager', 'advisor', 'service',
        'parts', 'mechanic', 'lead_hand', 'foreman'
      )
  );
$$;

revoke all on function public.vehicle_media_object_in_shop(uuid) from public, anon;
grant execute on function public.vehicle_media_object_in_shop(uuid)
  to authenticated, service_role;

-- Create the buckets only where they are absent. An existing bucket keeps its
-- current visibility, size limit and MIME rules untouched: rewriting them would
-- silently change contracts the create page already relies on, and a narrower
-- MIME list would start rejecting files its accept="image/*" input still offers.
-- Bringing an existing bucket onto these terms is a separate, staged change.
--
-- New buckets are private, so readers mint signed URLs, and carry no MIME
-- allowlist, matching how the hand-made buckets behave today rather than
-- rejecting formats the UI permits. Object paths are <vehicle uuid>/<file>.
insert into storage.buckets (id, name, public, file_size_limit)
values ('vehicle-photos', 'vehicle-photos', false, 15728640)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('vehicle-docs', 'vehicle-docs', false, 15728640)
on conflict (id) do nothing;

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
