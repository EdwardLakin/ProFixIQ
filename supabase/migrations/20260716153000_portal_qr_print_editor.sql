begin;

alter table public.portal_enrollment_campaigns
  add column if not exists print_settings jsonb not null default '{}'::jsonb;

comment on column public.portal_enrollment_campaigns.print_settings is
  'Validated presentation settings for printable customer portal enrollment materials.';

commit;

