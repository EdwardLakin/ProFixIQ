-- Complete the physical stock ledger fields required by canonical inventory
-- availability and later parts lifecycle commands.

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
      'idempotency_key',
      'lifecycle_quantity',
      'metadata',
      'part_request_item_id',
      'purchase_order_line_id',
      'work_order_part_id'
    ]::text[]) as required(required_column)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'stock_moves'
        and c.column_name = required_column
    );

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: stock_moves lifecycle columns are missing: '
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

alter table public.stock_moves
  add column if not exists idempotency_key text,
  add column if not exists work_order_part_id uuid,
  add column if not exists part_request_item_id uuid,
  add column if not exists purchase_order_line_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists lifecycle_quantity numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_moves_work_order_part_id_fkey'
      and conrelid = 'public.stock_moves'::regclass
  ) then
    alter table public.stock_moves
      add constraint stock_moves_work_order_part_id_fkey
      foreign key (work_order_part_id)
      references public.work_order_parts(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_moves_part_request_item_id_fkey'
      and conrelid = 'public.stock_moves'::regclass
  ) then
    alter table public.stock_moves
      add constraint stock_moves_part_request_item_id_fkey
      foreign key (part_request_item_id)
      references public.part_request_items(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_moves_purchase_order_line_id_fkey'
      and conrelid = 'public.stock_moves'::regclass
  ) then
    alter table public.stock_moves
      add constraint stock_moves_purchase_order_line_id_fkey
      foreign key (purchase_order_line_id)
      references public.purchase_order_lines(id) on delete set null;
  end if;
end
$$;

create unique index if not exists uq_stock_moves_shop_idempotency_key
  on public.stock_moves(shop_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_stock_moves_work_order_part_id
  on public.stock_moves(work_order_part_id)
  where work_order_part_id is not null;

create index if not exists idx_stock_moves_part_request_item_id
  on public.stock_moves(part_request_item_id)
  where part_request_item_id is not null;
