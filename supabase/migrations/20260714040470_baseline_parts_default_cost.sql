-- Complete the parts master-data dependency required by Phase 3 reconciliation.

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
        and c.table_name = 'parts'
        and c.column_name = 'default_cost'
    ) then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: parts.default_cost is required before Phase 3 reconciliation.';
    end if;

    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

alter table public.parts
  add column if not exists default_cost numeric(12,2);

alter table public.parts
  drop constraint if exists parts_default_cost_nonnegative;

alter table public.parts
  add constraint parts_default_cost_nonnegative
  check (default_cost is null or default_cost >= 0) not valid;

alter table public.parts
  validate constraint parts_default_cost_nonnegative;

comment on column public.parts.default_cost is
  'Fallback unit acquisition cost used when the current part cost is unavailable.';
