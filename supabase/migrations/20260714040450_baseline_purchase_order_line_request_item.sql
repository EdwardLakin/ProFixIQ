-- Complete the purchase-order ledger link required by Phase 3 quantity reconciliation.

do $$
declare
  v_mode text;
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'purchase_order_lines'
        and c.column_name = 'part_request_item_id'
    ) then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: purchase_order_lines.part_request_item_id is required before Phase 3 reconciliation.';
    end if;
    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

alter table public.purchase_order_lines
  add column if not exists part_request_item_id uuid references public.part_request_items(id) on delete set null;

create index if not exists purchase_order_lines_part_request_item_idx
  on public.purchase_order_lines(part_request_item_id)
  where part_request_item_id is not null;
