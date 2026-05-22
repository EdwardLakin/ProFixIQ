-- Foundation schema for durable inspection-import idempotency and audit traceability.
-- Adds nullable source linkage fields only; importer behavior changes are intentionally deferred.

alter table public.work_order_lines
  add column if not exists source_inspection_id uuid,
  add column if not exists source_inspection_item_key text;

comment on column public.work_order_lines.source_inspection_id is
  'Identifies the inspection result that produced the imported work_order_lines row for idempotent import and audit traceability; does not replace source_intake_id/source_row_id.';

comment on column public.work_order_lines.source_inspection_item_key is
  'Deterministic key derived from the saved inspection result item for idempotent import and audit traceability; does not replace source_intake_id/source_row_id.';

alter table public.parts_requests
  add column if not exists source_inspection_id uuid,
  add column if not exists source_inspection_item_key text;

comment on column public.parts_requests.source_inspection_id is
  'Identifies the inspection result that produced the imported parts_requests row for idempotent import and audit traceability; does not replace source_intake_id/source_row_id.';

comment on column public.parts_requests.source_inspection_item_key is
  'Deterministic key derived from the saved inspection result item for idempotent import and audit traceability; does not replace source_intake_id/source_row_id.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_order_lines_source_inspection_id_fkey'
      and conrelid = 'public.work_order_lines'::regclass
  ) then
    alter table public.work_order_lines
      add constraint work_order_lines_source_inspection_id_fkey
      foreign key (source_inspection_id)
      references public.inspections(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'parts_requests_source_inspection_id_fkey'
      and conrelid = 'public.parts_requests'::regclass
  ) then
    alter table public.parts_requests
      add constraint parts_requests_source_inspection_id_fkey
      foreign key (source_inspection_id)
      references public.inspections(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_wol_wo_source_inspection_lookup
  on public.work_order_lines (work_order_id, source_inspection_id, source_inspection_item_key);

create index if not exists idx_parts_requests_wo_source_inspection_lookup
  on public.parts_requests (work_order_id, source_inspection_id, source_inspection_item_key);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_order_lines'
      and column_name = 'voided_at'
  ) then
    execute $stmt$
      create unique index if not exists uq_wol_active_import_source_key
        on public.work_order_lines (work_order_id, source_inspection_id, source_inspection_item_key)
      where source_inspection_id is not null
        and source_inspection_item_key is not null
        and voided_at is null
    $stmt$;
  else
    raise notice 'Skipping uq_wol_active_import_source_key: public.work_order_lines.voided_at is not present.';
  end if;
end $$;
