begin;

alter table public.parts
  add column if not exists manufacturer text;

comment on column public.parts.manufacturer is
  'Optional manufacturer/brand compatibility field used by work-order parts readers.';

commit;
