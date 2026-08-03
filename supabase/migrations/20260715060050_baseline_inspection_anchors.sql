-- Complete the inspection anchors required by the Phase 5 atomic import contract.
-- Existing databases are validated and left unchanged; clean bootstraps receive
-- the canonical work-order and work-order-line relationships before Phase 5.

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
    if to_regclass('public.inspections') is null then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: inspections is required before Phase 5 migrations.';
    end if;

    select array_agg(required_column order by required_column)
      into v_missing
    from unnest(array[
      'work_order_id',
      'work_order_line_id'
    ]::text[]) as required(required_column)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'inspections'
        and c.column_name = required_column
    );

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: inspection anchor columns are missing: '
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
  add column if not exists work_order_id uuid
    references public.work_orders(id) on delete set null,
  add column if not exists work_order_line_id uuid
    references public.work_order_lines(id) on delete set null;

create index if not exists inspections_shop_work_order_idx
  on public.inspections(shop_id, work_order_id)
  where work_order_id is not null;

create index if not exists inspections_shop_work_order_line_idx
  on public.inspections(shop_id, work_order_line_id)
  where work_order_line_id is not null;
