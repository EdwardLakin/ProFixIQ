begin;

-- The durable AI cost ledger is private operational accounting. No browser role
-- may read or write it directly, and only service_role may invoke the writer.
do $test$
begin
  if has_table_privilege('anon', 'private.ai_usage_ledger', 'SELECT')
     or has_table_privilege('authenticated', 'private.ai_usage_ledger', 'SELECT')
     or has_table_privilege('service_role', 'private.ai_usage_ledger', 'SELECT') then
    raise exception 'ai_usage_ledger table privileges are too broad';
  end if;

  if has_function_privilege(
       'anon',
       'public.record_ai_usage_ledger(text,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,integer,integer,integer,numeric,numeric,integer,text,text,text,text,uuid,timestamptz)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.record_ai_usage_ledger(text,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,integer,integer,integer,numeric,numeric,integer,text,text,text,text,uuid,timestamptz)',
       'EXECUTE'
     ) then
    raise exception 'ai_usage_ledger writer is callable by browser roles';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.record_ai_usage_ledger(text,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,integer,integer,integer,numeric,numeric,integer,text,text,text,text,uuid,timestamptz)',
       'EXECUTE'
     ) then
    raise exception 'service_role cannot call ai_usage_ledger writer';
  end if;
end
$test$;

rollback;
