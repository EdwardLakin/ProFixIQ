-- Complete the clean-replay baseline with the work-order line anchor required
-- by the work_order_parts relationship/index migration.

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
    if to_regclass('public.work_order_parts') is null then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: public.work_order_parts is missing.';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'work_order_parts'
        and column_name = 'work_order_line_id'
    ) then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: public.work_order_parts.work_order_line_id is missing.';
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
  add column if not exists work_order_line_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.work_order_parts'::regclass
      and conname = 'work_order_parts_work_order_line_id_fkey'
  ) then
    alter table public.work_order_parts
      add constraint work_order_parts_work_order_line_id_fkey
      foreign key (work_order_line_id)
      references public.work_order_lines(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_work_order_parts_work_order_line
  on public.work_order_parts(shop_id, work_order_id, work_order_line_id)
  where work_order_line_id is not null;
