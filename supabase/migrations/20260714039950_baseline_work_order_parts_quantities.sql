-- Supply the canonical work-order parts quantity lifecycle columns before
-- Phase 3 reconciliation constraints are installed on clean databases.

do $$
declare
  v_mode text;
  v_missing text[];
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode = 'existing' then
    select array_agg(column_name order by column_name)
      into v_missing
    from unnest(array[
      'quantity_requested',
      'quantity_ordered',
      'quantity_received',
      'quantity_allocated',
      'quantity_consumed',
      'quantity_returned',
      'quantity_cancelled'
    ]::text[]) as required(column_name)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'work_order_parts'
        and c.column_name = required.column_name
    );

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: work_order_parts is missing quantity lifecycle columns: '
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
  add column if not exists quantity_requested numeric(12,2) not null default 0,
  add column if not exists quantity_ordered numeric(12,2) not null default 0,
  add column if not exists quantity_received numeric(12,2) not null default 0,
  add column if not exists quantity_allocated numeric(12,2) not null default 0,
  add column if not exists quantity_consumed numeric(12,2) not null default 0,
  add column if not exists quantity_returned numeric(12,2) not null default 0,
  add column if not exists quantity_cancelled numeric(12,2) not null default 0;

create index if not exists idx_work_order_parts_quantity_lifecycle
  on public.work_order_parts (
    shop_id,
    work_order_id,
    lifecycle_status,
    updated_at desc
  );
