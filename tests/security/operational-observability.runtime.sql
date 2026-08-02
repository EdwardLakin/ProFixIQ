\set ON_ERROR_STOP on

begin;

do $operational_observability$
declare
  v_definition text;
  v_policy text;
  v_reloptions text;
  v_missing_triggers text[];
  v_missing_ai_tables text[];
begin
  if to_regclass('public.operational_events') is null
     or to_regclass('public.operational_event_failures') is null then
    raise exception 'Operational observability tables are missing';
  end if;

  select array_agg(expected.name order by expected.name)
    into v_missing_ai_tables
  from unnest(array[
    'ai_evidence_snapshots',
    'ai_recommendations',
    'ai_action_previews',
    'ai_action_approvals',
    'ai_action_events'
  ]::text[]) as expected(name)
  where to_regclass('public.' || expected.name) is null;

  if v_missing_ai_tables is not null then
    raise exception 'Tracked AI operating substrate is incomplete: %', v_missing_ai_tables;
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'operational_events'
      and c.relrowsecurity
  ) then
    raise exception 'operational_events must have RLS enabled';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'operational_event_failures'
      and c.relrowsecurity
  ) then
    raise exception 'operational_event_failures must have RLS enabled';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ai_action_events'
      and c.relrowsecurity
  ) then
    raise exception 'ai_action_events must have RLS enabled';
  end if;

  select coalesce(qual, '')
    into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'operational_events'
    and policyname = 'operational_events_owner_read';

  if v_policy is null
     or position('is_shop_member_v2' in v_policy) = 0
     or position('profixiq_current_role' in v_policy) = 0
     or position('owner' in v_policy) = 0
     or position('admin' in v_policy) = 0
     or position('manager' in v_policy) = 0 then
    raise exception 'operational_events select policy is not tenant and role scoped';
  end if;

  select coalesce(qual, '')
    into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'operational_event_failures'
    and policyname = 'operational_event_failures_owner_read';

  if v_policy is null
     or position('is_shop_member_v2' in v_policy) = 0
     or position('profixiq_current_role' in v_policy) = 0 then
    raise exception 'operational_event_failures select policy is not tenant scoped';
  end if;

  if not has_table_privilege('authenticated', 'public.operational_events', 'SELECT') then
    raise exception 'authenticated leaders require SELECT on operational_events';
  end if;
  if has_table_privilege('authenticated', 'public.operational_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.operational_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.operational_events', 'DELETE') then
    raise exception 'operational_events must remain append-only to authenticated users';
  end if;
  if has_table_privilege('anon', 'public.operational_events', 'SELECT') then
    raise exception 'anon must not read operational_events';
  end if;

  if not has_table_privilege('authenticated', 'public.operational_event_failures', 'SELECT') then
    raise exception 'authenticated leaders require SELECT on operational_event_failures';
  end if;
  if has_table_privilege('authenticated', 'public.operational_event_failures', 'INSERT')
     or has_table_privilege('authenticated', 'public.operational_event_failures', 'UPDATE')
     or has_table_privilege('authenticated', 'public.operational_event_failures', 'DELETE') then
    raise exception 'authenticated users must not mutate operational_event_failures';
  end if;

  select array_to_string(c.reloptions, ',')
    into v_reloptions
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'unified_events';

  if coalesce(v_reloptions, '') not like '%security_invoker=true%'
     and coalesce(v_reloptions, '') not like '%security_invoker=on%' then
    raise exception 'unified_events must use security_invoker';
  end if;

  if has_table_privilege('anon', 'public.unified_events', 'SELECT') then
    raise exception 'anon must not read unified_events';
  end if;
  if not has_table_privilege('authenticated', 'public.unified_events', 'SELECT') then
    raise exception 'authenticated leaders require SELECT on unified_events';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.append_operational_event(uuid,text,timestamptz,uuid,text,text,uuid,text,uuid,uuid,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated users must not invoke append_operational_event directly';
  end if;
  if has_function_privilege(
    'anon',
    'private.append_operational_event(uuid,text,timestamptz,uuid,text,text,uuid,text,uuid,uuid,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'anon must not invoke append_operational_event directly';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.get_operational_observability_health(timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.get_operational_observability_health(timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'aggregate observability health RPC must remain service-role only';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.get_operational_observability_health(timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'service role requires observability health RPC access';
  end if;

  select pg_get_functiondef('private.capture_operational_event()'::regprocedure)
    into v_definition;

  if position('when tg_op = ''UPDATE'' then nullif(v_row ->> ''updated_at''' in v_definition) = 0 then
    raise exception 'Operational status events must use transition updated_at';
  end if;
  if position('''operational'',' || E'\n    tg_table_name' in v_definition) = 0
     or position('coalesce(v_entity_id::text, ''na'')' in v_definition) = 0
     or position('v_event_type' in v_definition) = 0 then
    raise exception 'Operational idempotency must be semantic-event scoped';
  end if;
  if position('select coalesce(p.user_id, p.id), p.role' in v_definition) = 0 then
    raise exception 'Operational actors must use a canonical user identity';
  end if;

  select pg_get_functiondef('private.capture_operational_punch_event()'::regprocedure)
    into v_definition;

  if position('coalesce(p.user_id, new.user_id, auth.uid(), p.id)' in v_definition) = 0 then
    raise exception 'Punch events must normalize profile and auth identity';
  end if;
  if position('''operational''' in v_definition) = 0
     or position('''punch_events''' in v_definition) = 0
     or position('v_event_type' in v_definition) = 0 then
    raise exception 'Punch idempotency must be semantic-event scoped';
  end if;

  select array_agg(expected.name order by expected.name)
    into v_missing_triggers
  from unnest(array[
    'trg_operational_event_work_orders',
    'trg_operational_event_work_order_lines',
    'trg_operational_event_inspections',
    'trg_operational_event_quote_lines',
    'trg_operational_event_part_requests',
    'trg_operational_event_part_request_items',
    'trg_operational_event_labor_segments',
    'trg_operational_event_punches',
    'trg_operational_event_invoices',
    'trg_operational_event_payments'
  ]::text[]) as expected(name)
  where not exists (
    select 1
    from pg_trigger t
    where t.tgname = expected.name
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  );

  if v_missing_triggers is not null then
    raise exception 'Required operational triggers are missing: %', v_missing_triggers;
  end if;

  if exists (
    select 1
    from pg_trigger t
    where t.tgname = 'trg_work_order_lines_log_ai'
      and not t.tgisinternal
  ) then
    raise exception 'Broken legacy work-order-line AI trigger must be removed';
  end if;
end;
$operational_observability$;

rollback;
