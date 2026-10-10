-- ProFixIQ platform blog CMS storage.
--
-- Article documents are private JSON and are read/written only by trusted
-- server code. Public pages explicitly expose only documents whose persisted
-- status is "published". Blog images are intentionally public marketing assets.
-- No existing application table, RLS policy, trigger, role, or function is
-- changed by this migration.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'marketing-blog-content',
  'marketing-blog-content',
  false,
  1048576,
  array['application/json']::text[]
)
on conflict (id) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'marketing-blog-media',
  'marketing-blog-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do nothing;
