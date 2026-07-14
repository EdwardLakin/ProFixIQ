begin;

-- PostgREST embedded selects require a real FK between work_order_parts.part_id
-- and parts.id. Add it only when both columns exist and no equivalent FK is present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_order_parts'
      and column_name = 'part_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'parts'
      and column_name = 'id'
  ) and not exists (
    select 1
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_namespace n on n.oid = child.relnamespace
    join pg_class parent on parent.oid = c.confrelid
    where c.contype = 'f'
      and n.nspname = 'public'
      and child.relname = 'work_order_parts'
      and parent.relname = 'parts'
      and c.conkey = array[
        (select attnum from pg_attribute where attrelid = child.oid and attname = 'part_id')
      ]::smallint[]
  ) then
    alter table public.work_order_parts
      add constraint work_order_parts_part_id_fkey
      foreign key (part_id)
      references public.parts(id)
      on delete restrict
      not valid;

    alter table public.work_order_parts
      validate constraint work_order_parts_part_id_fkey;
  end if;
end
$$;

-- Ensure the relationship is efficient for work-order line reads.
create index if not exists idx_work_order_parts_active_line
  on public.work_order_parts (shop_id, work_order_id, work_order_line_id)
  where is_active = true;

commit;
