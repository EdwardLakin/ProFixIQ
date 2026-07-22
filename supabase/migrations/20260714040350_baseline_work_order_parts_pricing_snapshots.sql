-- Complete pricing snapshot dependencies required by Phase 3 invoice materialization.

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
      'unit_cost_snapshot',
      'unit_sell_price_snapshot',
      'description_snapshot',
      'manufacturer_snapshot',
      'part_number_snapshot'
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
        message = 'PARTIAL_PROFIXIQ_SCHEMA: work_order_parts pricing snapshot columns are missing: '
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
  add column if not exists unit_cost_snapshot numeric(12,2),
  add column if not exists unit_sell_price_snapshot numeric(12,2),
  add column if not exists description_snapshot text,
  add column if not exists manufacturer_snapshot text,
  add column if not exists part_number_snapshot text;

create index if not exists idx_work_order_parts_invoice_materialization
  on public.work_order_parts(shop_id, work_order_id, work_order_line_id)
  where coalesce(quantity_consumed, 0) > coalesce(quantity_returned, 0)
    and coalesce(is_active, true);
