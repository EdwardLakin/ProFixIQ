do $$
begin
  if to_regclass('public.system_lifecycle_operation_keys') is null then
    raise exception 'Phase 8 postcheck failed: system lifecycle operation keys are missing.';
  end if;

  if to_regprocedure('public.reconcile_work_order_approval_state_atomic(uuid,uuid,uuid,timestamptz)') is null then
    raise exception 'Phase 8 postcheck failed: approval reconciliation command is missing.';
  end if;

  if to_regprocedure('public.apply_approval_compatibility_bundle_atomic(uuid,uuid,uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz)') is null then
    raise exception 'Phase 8 postcheck failed: approval compatibility command is missing.';
  end if;

  if to_regprocedure('public.mark_work_order_ready_atomic(uuid,uuid,uuid,text,timestamptz)') is null then
    raise exception 'Phase 8 postcheck failed: atomic mark-ready command is missing.';
  end if;

  if to_regprocedure('public.add_ai_suggested_quote_lines_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)') is null then
    raise exception 'Phase 8 postcheck failed: AI suggested quote command is missing.';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'system_lifecycle_operation_keys'
      and constraint_row.contype = 'u'
      and pg_get_constraintdef(constraint_row.oid) =
        'UNIQUE (shop_id, operation_name, operation_key)'
  ) then
    raise exception 'Phase 8 postcheck failed: system operation key uniqueness is missing.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'system_lifecycle_operation_keys'
      and policyname = 'system_lifecycle_operation_keys_shop_select'
  ) then
    raise exception 'Phase 8 postcheck failed: system operation key RLS policy is missing.';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'system_lifecycle_operation_keys'
      and c.relrowsecurity
  ) then
    raise exception 'Phase 8 postcheck failed: RLS is not enabled on system lifecycle operation keys.';
  end if;

  raise notice 'Phase 8 system consistency postcheck passed.';
end;
$$;
