-- Add the tenant scope required by workforce reliability indexes and triggers.
-- Historical shift rows are backfilled from the canonical employee profile.

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
        and c.table_name = 'tech_shifts'
        and c.column_name = 'shop_id'
    ) then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: tech_shifts.shop_id is required before workforce reliability migrations.';
    end if;
    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

alter table public.tech_shifts
  add column if not exists shop_id uuid references public.shops(id) on delete cascade;

update public.tech_shifts ts
set shop_id = p.shop_id
from public.profiles p
where p.id = ts.user_id
  and ts.shop_id is null
  and p.shop_id is not null;

create index if not exists tech_shifts_shop_user_start_idx
  on public.tech_shifts(shop_id, user_id, start_time desc)
  where shop_id is not null;
