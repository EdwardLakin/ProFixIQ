-- Complete allocation lineage required by parts-request approval guards.
-- Historical allocations retain their original line/part/location evidence; new
-- canonical allocations can point directly to the materialized work-order part.

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
    from unnest(array['shop_id','work_order_part_id']::text[])
      as required(required_column)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'work_order_part_allocations'
        and c.column_name = required.required_column
    );

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: work_order_part_allocations columns are missing: '
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

alter table public.work_order_part_allocations
  add column if not exists shop_id uuid references public.shops(id) on delete cascade,
  add column if not exists work_order_part_id uuid references public.work_order_parts(id) on delete cascade;

update public.work_order_part_allocations a
set shop_id = wol.shop_id
from public.work_order_lines wol
where wol.id = a.work_order_line_id
  and a.shop_id is null
  and wol.shop_id is not null;

-- Do not guess work_order_part_id for legacy rows. The line, part, location, and
-- stock-move evidence remains intact, while canonical future allocations store
-- the direct materialized-part relationship.
create index if not exists work_order_part_allocations_wop_idx
  on public.work_order_part_allocations(work_order_part_id, location_id)
  where work_order_part_id is not null;
create index if not exists work_order_part_allocations_shop_line_idx
  on public.work_order_part_allocations(shop_id, work_order_line_id, part_id);
