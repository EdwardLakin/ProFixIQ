-- Step 19B (manual draft only)
-- Internal-only storage setup for property request attachments.
--
-- IMPORTANT:
-- - This is a manual setup draft. Do not auto-apply in runtime code.
-- - Do not use service role in runtime upload flows.
-- - Keep bucket private (no public URLs/policies).
-- - This draft assumes object names are prefixed with `<shop_id>/property-requests/<request_id>/...`.

begin;

-- 1) Create a private bucket for property request attachments.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property_request_attachments',
  'property_request_attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 2) Internal staff can upload/select/update/delete files only inside their shop prefix.
-- Path contract: <shop_id>/property-requests/<request_id>/<filename>

drop policy if exists property_request_attachments_internal_select on storage.objects;
create policy property_request_attachments_internal_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property_request_attachments'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists property_request_attachments_internal_insert on storage.objects;
create policy property_request_attachments_internal_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'property_request_attachments'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists property_request_attachments_internal_update on storage.objects;
create policy property_request_attachments_internal_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'property_request_attachments'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id::text = split_part(name, '/', 1)
  )
)
with check (
  bucket_id = 'property_request_attachments'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists property_request_attachments_internal_delete on storage.objects;
create policy property_request_attachments_internal_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'property_request_attachments'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id::text = split_part(name, '/', 1)
  )
);

commit;
