begin;

do $$
declare
  v_definition text;
begin
  if to_regclass('public.quote_lifecycle_operation_keys') is null then
    raise exception 'Phase 5 postcheck failed: quote_lifecycle_operation_keys is missing';
  end if;

  if to_regprocedure('public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)') is null then
    raise exception 'Phase 5 postcheck failed: apply_customer_quote_decision_atomic is missing';
  end if;

  if to_regprocedure('public.import_inspection_quote_package_atomic(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz)') is null then
    raise exception 'Phase 5 postcheck failed: import_inspection_quote_package_atomic is missing';
  end if;

  if to_regprocedure('public.work_order_is_financially_locked(uuid,uuid)') is null then
    raise exception 'Phase 5 postcheck failed: Phase 2 financial lock function is missing';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'quote_lifecycle_operation_keys'
      and c.relrowsecurity
  ) then
    raise exception 'Phase 5 postcheck failed: operation-key RLS is not enabled';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inspections'
      and column_name = 'work_order_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inspections'
      and column_name = 'work_order_line_id'
  ) then
    raise exception 'Phase 5 postcheck failed: inspection anchor columns are missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'part_requests'
      and column_name = 'quote_line_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'part_request_items'
      and column_name = 'quote_line_id'
  ) then
    raise exception 'Phase 5 postcheck failed: quote-to-parts linkage columns are missing';
  end if;

  select pg_get_functiondef(
    'public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_definition;
  if position('FINANCIALLY_LOCKED' in v_definition) = 0
     or position('for update' in lower(v_definition)) = 0
     or position('PART_RELINK_CONFLICT' in v_definition) = 0
     or position('''awaiting''' in v_definition) = 0 then
    raise exception 'Phase 5 postcheck failed: quote decision transaction contract is incomplete';
  end if;

  select pg_get_functiondef(
    'public.import_inspection_quote_package_atomic(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz)'::regprocedure
  ) into v_definition;
  if position('INSPECTION_UNANCHORED' in v_definition) = 0
     or position('INSPECTION_WORK_ORDER_MISMATCH' in v_definition) = 0
     or position('INSPECTION_VEHICLE_MISMATCH' in v_definition) = 0
     or position('for update' in lower(v_definition)) = 0 then
    raise exception 'Phase 5 postcheck failed: inspection import anchor contract is incomplete';
  end if;

  raise notice 'Phase 5 quote and inspection lifecycle postcheck passed.';
end $$;

notify pgrst, 'reload schema';
commit;
