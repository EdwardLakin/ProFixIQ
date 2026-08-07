\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'e7000000-0000-4000-8000-000000000001',
  'payroll-period-runtime-owner@example.com',
  '{"full_name":"Payroll Period Runtime Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values (
  'e7000000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000001',
  'owner',
  'Payroll Period Runtime Owner'
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values (
  'e7000000-0000-4000-8000-000000000002',
  'e7000000-0000-4000-8000-000000000001',
  'Payroll Period Runtime Shop',
  'Payroll Period Runtime Shop'
)
on conflict (id) do nothing;

update public.profiles
set shop_id = 'e7000000-0000-4000-8000-000000000002'
where id = 'e7000000-0000-4000-8000-000000000001';

do $payroll_period_pipeline$
declare
  v_shop_id uuid := 'e7000000-0000-4000-8000-000000000002';
  v_period_id uuid;
  v_period public.payroll_pay_periods%rowtype;
begin
  if not exists (
    select 1
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'payroll_pay_periods'
      and trigger.tgname = 'payroll_pay_periods_sync_date_aliases'
      and not trigger.tgisinternal
  ) then
    raise exception 'Payroll period date synchronization trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'payroll_pay_periods'
      and constraint_row.conname = 'payroll_pay_periods_date_aliases_chk'
      and constraint_row.convalidated
  ) then
    raise exception 'Payroll period alias equality constraint is missing or unvalidated';
  end if;

  if not exists (
    select 1
    from pg_indexes index_row
    where index_row.schemaname = 'public'
      and index_row.tablename = 'payroll_pay_periods'
      and index_row.indexname in (
        'ux_payroll_pay_periods_shop_period',
        'payroll_pay_periods_shop_period_key'
      )
      and index_row.indexdef ilike 'create unique index%'
  ) then
    raise exception 'Canonical payroll period uniqueness index is missing';
  end if;

  if exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename in ('payroll_pay_periods', 'shop_payroll_settings')
      and policy.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and 'authenticated' = any(policy.roles)
  ) then
    raise exception 'Direct authenticated payroll period/settings mutation policy remains';
  end if;

  if has_table_privilege('authenticated', 'public.payroll_pay_periods', 'INSERT')
     or has_table_privilege('authenticated', 'public.payroll_pay_periods', 'UPDATE')
     or has_table_privilege('authenticated', 'public.payroll_pay_periods', 'DELETE')
     or has_table_privilege('authenticated', 'public.shop_payroll_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.shop_payroll_settings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.shop_payroll_settings', 'DELETE') then
    raise exception 'Authenticated payroll period/settings table grants remain';
  end if;

  if has_function_privilege(
       'anon',
       'public.replace_payroll_period_snapshot(uuid,uuid,uuid,jsonb,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.replace_payroll_period_snapshot(uuid,uuid,uuid,jsonb,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.replace_payroll_period_snapshot(uuid,uuid,uuid,jsonb,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Payroll snapshot RPC grants are unsafe';
  end if;

  insert into public.payroll_pay_periods (
    shop_id,
    period_start,
    period_end,
    status
  ) values (
    v_shop_id,
    date '2099-01-01',
    date '2099-01-14',
    'open'
  )
  returning id into v_period_id;

  select *
  into v_period
  from public.payroll_pay_periods period
  where period.id = v_period_id;
  if v_period.start_date <> v_period.period_start
     or v_period.end_date <> v_period.period_end then
    raise exception 'Canonical-only payroll insert did not synchronize legacy aliases';
  end if;

  update public.payroll_pay_periods period
  set
    start_date = date '2099-02-01',
    end_date = date '2099-02-14'
  where period.id = v_period_id;

  select *
  into v_period
  from public.payroll_pay_periods period
  where period.id = v_period_id;
  if v_period.period_start <> date '2099-02-01'
     or v_period.period_end <> date '2099-02-14' then
    raise exception 'Legacy payroll date update did not synchronize canonical dates';
  end if;

  begin
    insert into public.payroll_pay_periods (
      shop_id,
      period_start,
      period_end,
      start_date,
      end_date,
      status
    ) values (
      v_shop_id,
      date '2099-03-01',
      date '2099-03-14',
      date '2099-04-01',
      date '2099-04-14',
      'open'
    );
    raise exception 'Mismatched payroll date aliases were accepted';
  exception
    when others then
      if sqlerrm = 'Mismatched payroll date aliases were accepted' then
        raise;
      end if;
  end;
end
$payroll_period_pipeline$;

rollback;
