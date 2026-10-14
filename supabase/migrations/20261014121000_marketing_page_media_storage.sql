-- ProFixIQ owner-managed public landing-page media storage.
--
-- Page documents are private JSON and are read/written only through trusted
-- server code. The public site exposes only each slot's persisted published
-- asset. Marketing images and short reels are intentionally public CDN assets.
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
  'marketing-page-content',
  'marketing-page-content',
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
  'marketing-page-media',
  'marketing-page-media',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'video/mp4',
    'video/webm'
  ]::text[]
)
on conflict (id) do nothing;
