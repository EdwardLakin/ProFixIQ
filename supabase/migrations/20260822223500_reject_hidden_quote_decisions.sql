begin;

-- Customer and shop-recorded decisions both delegate to this locked function.
-- Reject every non-actionable lifecycle spelling before any quote line can be
-- materialized or have its decision state overwritten.
do $migration$
declare
  v_sql text;
  v_anchor text := E'  if (\n    select count(*) from public.work_order_quote_lines\n    where shop_id = p_shop_id\n      and work_order_id = p_work_order_id\n      and id = any(v_selected)\n  ) <> cardinality(v_selected) then\n    raise exception using errcode = ''P0001'', message = ''One or more quote lines were not found for this work order.'';\n  end if;';
  v_guard text := E'  if exists (\n    select 1\n    from public.work_order_quote_lines q\n    where q.shop_id = p_shop_id\n      and q.work_order_id = p_work_order_id\n      and q.id = any(v_selected)\n      and lower(coalesce(q.status::text, '''')) in (\n        ''cancelled'', ''canceled'', ''voided'', ''rejected'', ''superseded''\n      )\n  ) then\n    raise exception using errcode = ''P0001'', message = ''Quote line cannot be changed from its current status.'';\n  end if;';
begin
  select pg_get_functiondef(
    'public.apply_customer_quote_decision_engine_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_sql;

  if position('Quote line cannot be changed from its current status.' in v_sql) = 0 then
    if position(v_anchor in v_sql) = 0 then
      raise exception 'apply_customer_quote_decision_engine_atomic lifecycle guard patch point not found';
    end if;
    v_sql := replace(v_sql, v_anchor, v_anchor || E'\n' || v_guard);
    if position(v_guard in v_sql) = 0 then
      raise exception 'apply_customer_quote_decision_engine_atomic lifecycle guard patch failed';
    end if;
    execute v_sql;
  end if;
end;
$migration$;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.apply_customer_quote_decision_engine_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_definition;

  if position('''cancelled'', ''canceled'', ''voided'', ''rejected'', ''superseded''' in v_definition) = 0
     or position('Quote line cannot be changed from its current status.' in v_definition) = 0 then
    raise exception 'Quote decision lifecycle guard postcondition failed';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
