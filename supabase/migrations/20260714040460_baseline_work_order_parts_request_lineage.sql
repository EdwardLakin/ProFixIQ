-- Complete work-order part lineage required by Phase 3 reconciliation and attachment flows.

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
      'source_parts_request_id',
      'source_parts_request_item_id'
    ]::text[]) as required(required_column)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'work_order_parts'
        and c.column_name = required_column
    );

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: work_order_parts request lineage columns are missing: '
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

alter table public.work_order_parts
  add column if not exists source_parts_request_id uuid references public.part_requests(id) on delete set null,
  add column if not exists source_parts_request_item_id uuid references public.part_request_items(id) on delete set null;

create index if not exists idx_work_order_parts_source_request
  on public.work_order_parts(source_parts_request_id)
  where source_parts_request_id is not null;

create index if not exists idx_work_order_parts_source_request_item
  on public.work_order_parts(source_parts_request_item_id)
  where source_parts_request_item_id is not null;
