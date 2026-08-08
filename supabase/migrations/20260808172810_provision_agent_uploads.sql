-- Provision the private Agent evidence bucket used by request intake and retry.
-- Object paths are canonicalized as <auth-user-id>/<timestamp>-<filename>.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'agent_uploads',
  'agent_uploads',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove manually-created and superseded policies. Several of the historical
-- policies granted every authenticated user access to every Agent attachment.
drop policy if exists agent_uploads_delete on storage.objects;
drop policy if exists agent_uploads_delete_auth on storage.objects;
drop policy if exists agent_uploads_insert_auth on storage.objects;
drop policy if exists agent_uploads_objects_delete on storage.objects;
drop policy if exists agent_uploads_objects_insert on storage.objects;
drop policy if exists agent_uploads_objects_select on storage.objects;
drop policy if exists agent_uploads_objects_update on storage.objects;
drop policy if exists agent_uploads_read on storage.objects;
drop policy if exists agent_uploads_select_auth on storage.objects;
drop policy if exists agent_uploads_update on storage.objects;
drop policy if exists agent_uploads_update_auth on storage.objects;
drop policy if exists agent_uploads_write on storage.objects;
drop policy if exists agent_uploads_insert_own on storage.objects;
drop policy if exists agent_uploads_select_own_or_operator on storage.objects;
drop policy if exists agent_uploads_delete_own_or_operator on storage.objects;

create policy agent_uploads_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'agent_uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy agent_uploads_select_own_or_operator
on storage.objects
for select
to authenticated
using (
  bucket_id = 'agent_uploads'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'edwardlakin35@gmail.com'
  )
);

create policy agent_uploads_delete_own_or_operator
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'agent_uploads'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or lower(coalesce((select auth.jwt()) ->> 'email', '')) = 'edwardlakin35@gmail.com'
  )
);
