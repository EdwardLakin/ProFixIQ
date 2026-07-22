begin;

alter table public.parts
  add column if not exists manufacturer text;

comment on column public.parts.manufacturer is
  'Canonical part manufacturer/brand used for matching, repair history, menu learning, imports, and future AI-assisted parts recommendations. Do not conflate with supplier/vendor.';

create index if not exists idx_parts_shop_manufacturer
  on public.parts (shop_id, lower(manufacturer))
  where manufacturer is not null and btrim(manufacturer) <> '';

update public.parts
set manufacturer = nullif(btrim(manufacturer), '')
where manufacturer is not null
  and manufacturer is distinct from nullif(btrim(manufacturer), '');

notify pgrst, 'reload schema';

commit;
