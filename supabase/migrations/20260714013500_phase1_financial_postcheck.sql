do $$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.invoice_versions') is null then v_missing := array_append(v_missing, 'invoice_versions'); end if;
  if to_regclass('public.payment_events') is null then v_missing := array_append(v_missing, 'payment_events'); end if;
  if to_regclass('public.payment_receipts') is null then v_missing := array_append(v_missing, 'payment_receipts'); end if;
  if to_regclass('public.financial_domain_outbox') is null then v_missing := array_append(v_missing, 'financial_domain_outbox'); end if;

  if array_length(v_missing, 1) is not null then
    raise exception 'Phase 1 financial tables missing: %', array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'finalize_invoice_version'
  ) then raise exception 'finalize_invoice_version RPC missing'; end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'post_payment_event'
  ) then raise exception 'post_payment_event RPC missing'; end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'void_invoice_version'
  ) then raise exception 'void_invoice_version RPC missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'active_invoice_version_id'
  ) then raise exception 'invoices.active_invoice_version_id missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'work_orders' and column_name = 'outstanding_balance'
  ) then raise exception 'work_orders.outstanding_balance missing'; end if;

  if has_function_privilege('authenticated', 'public.post_payment_event(uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamptz,jsonb)', 'EXECUTE') then
    raise exception 'authenticated must not execute post_payment_event directly';
  end if;

  raise notice 'Phase 1 financial foundation postcheck passed.';
end $$;
