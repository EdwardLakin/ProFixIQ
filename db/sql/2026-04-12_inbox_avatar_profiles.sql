-- Additive profile avatar support for inbox identity rendering.
alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public profile avatar URL used for in-app messaging identity surfaces.';
