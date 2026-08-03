-- Complete the canonical inspection lifecycle shape required by autosave,
-- finalization, reopen, and immutable signing migrations.

do $$
declare
  v_mode text;
  v_missing text[];
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    select array_agg(required_column order by required_column)
      into v_missing
    from unnest(array[
      'work_order_line_id',
      'locked',
      'finalized_at',
      'finalized_by',
      'pdf_storage_path'
    ]::text[]) as required(required_column)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'inspections'
        and c.column_name = required.required_column
    );

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: inspection lifecycle columns are missing: '
          || array_to_string(v_missing, ', ');
    end if;
    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

alter table public.inspections
  add column if not exists work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  add column if not exists locked boolean not null default false,
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references auth.users(id) on delete set null,
  add column if not exists pdf_storage_path text;

create index if not exists inspections_shop_work_order_line_updated_idx
  on public.inspections(shop_id, work_order_line_id, updated_at desc, id desc)
  where work_order_line_id is not null;
