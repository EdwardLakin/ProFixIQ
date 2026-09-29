begin;

-- Regression fix: a shop-recorded quote decision (advisor records a phone /
-- in-person / email approval the customer never saw in the portal) delegates
-- its materialization to the canonical customer-decision engine, which
-- rejects any quote line that has not been sent to the customer. That
-- precondition is correct for a customer-portal decision but wrong for a
-- shop-recorded one -- the entire point of "Classic Shop Approval" is to let
-- an advisor record a decision obtained out-of-band, before the line was
-- ever sent digitally. Flag the delegated call with a transaction-local
-- setting so the engine can tell the two origins apart without changing its
-- public signature or any other invariant it enforces.
do $migration$
declare
  v_sql text;
  v_anchor text := E'      if lower(coalesce(v_quote.status::text, \'\')) not in (\'sent\', \'ready_to_send\', \'quoted\', \'approved\', \'converted\')\n         and v_quote.sent_to_customer_at is null then\n        raise exception using errcode = \'P0001\', message = \'Quote line has not been sent to the customer.\';\n      end if;';
  v_guard text := E'      if coalesce(current_setting(\'profixiq.quote_decision_shop_recorded\', true), \'\') <> \'true\'\n         and lower(coalesce(v_quote.status::text, \'\')) not in (\'sent\', \'ready_to_send\', \'quoted\', \'approved\', \'converted\')\n         and v_quote.sent_to_customer_at is null then\n        raise exception using errcode = \'P0001\', message = \'Quote line has not been sent to the customer.\';\n      end if;';
begin
  select pg_get_functiondef(
    'public.apply_customer_quote_decision_engine_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_sql;

  if position('profixiq.quote_decision_shop_recorded' in v_sql) = 0 then
    if position(v_anchor in v_sql) = 0 then
      raise exception 'apply_customer_quote_decision_engine_atomic sent-check patch point not found';
    end if;
    v_sql := replace(v_sql, v_anchor, v_guard);
    if position(v_guard in v_sql) = 0 then
      raise exception 'apply_customer_quote_decision_engine_atomic sent-check patch failed';
    end if;
    execute v_sql;
  end if;
end;
$migration$;

-- Have the "Classic Shop Approval" wrapper mark its delegated call as
-- shop-recorded so the engine skips the sent precondition for it only. The
-- setting is transaction-local (set_config(..., true)) and is cleared right
-- after the delegated call returns.
do $migration$
declare
  v_sql text;
  v_anchor text := E'  v_result := public.apply_customer_quote_decision_atomic(\n    p_shop_id,\n    p_work_order_id,\n    p_quote_line_ids,\n    v_decision,\n    false,\n    null,\n    p_actor_user_id,\n    p_operation_key || \':canonical\',\n    v_now\n  );';
  v_guard text := E'  perform set_config(\'profixiq.quote_decision_shop_recorded\', \'true\', true);\n  v_result := public.apply_customer_quote_decision_atomic(\n    p_shop_id,\n    p_work_order_id,\n    p_quote_line_ids,\n    v_decision,\n    false,\n    null,\n    p_actor_user_id,\n    p_operation_key || \':canonical\',\n    v_now\n  );\n  perform set_config(\'profixiq.quote_decision_shop_recorded\', \'\', true);';
begin
  select pg_get_functiondef(
    'public.apply_shop_quote_decision_atomic(uuid,uuid,uuid[],text,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_sql;

  if position('profixiq.quote_decision_shop_recorded' in v_sql) = 0 then
    if position(v_anchor in v_sql) = 0 then
      raise exception 'apply_shop_quote_decision_atomic shop-recorded flag patch point not found';
    end if;
    v_sql := replace(v_sql, v_anchor, v_guard);
    if position(v_guard in v_sql) = 0 then
      raise exception 'apply_shop_quote_decision_atomic shop-recorded flag patch failed';
    end if;
    execute v_sql;
  end if;
end;
$migration$;

-- The Shop Assistant "record approval decision" tool also lets an advisor
-- record a phone/in-person/email decision and calls the engine directly with
-- the same shop-recorded semantics (decision_origin = 'shop_assistant'). It
-- carries the identical regression and needs the identical flag.
do $migration$
declare
  v_sql text;
  v_anchor text := E'    v_quote_result := public.apply_customer_quote_decision_engine_atomic(\n      p_shop_id,\n      p_work_order_id,\n      v_quote_ids,\n      v_decision,\n      false,\n      null,\n      p_actor_user_id,\n      p_shop_id::text || \':shop-assistant:approval:\' || p_action_id::text,\n      now()\n    );';
  v_guard text := E'    perform set_config(\'profixiq.quote_decision_shop_recorded\', \'true\', true);\n    v_quote_result := public.apply_customer_quote_decision_engine_atomic(\n      p_shop_id,\n      p_work_order_id,\n      v_quote_ids,\n      v_decision,\n      false,\n      null,\n      p_actor_user_id,\n      p_shop_id::text || \':shop-assistant:approval:\' || p_action_id::text,\n      now()\n    );\n    perform set_config(\'profixiq.quote_decision_shop_recorded\', \'\', true);';
begin
  select pg_get_functiondef(
    'public.shop_assistant_record_approval_decision_atomic(uuid,uuid,uuid,uuid,uuid[],boolean,text,text,text)'::regprocedure
  ) into v_sql;

  if position('profixiq.quote_decision_shop_recorded' in v_sql) = 0 then
    if position(v_anchor in v_sql) = 0 then
      raise exception 'shop_assistant_record_approval_decision_atomic shop-recorded flag patch point not found';
    end if;
    v_sql := replace(v_sql, v_anchor, v_guard);
    if position(v_guard in v_sql) = 0 then
      raise exception 'shop_assistant_record_approval_decision_atomic shop-recorded flag patch failed';
    end if;
    execute v_sql;
  end if;
end;
$migration$;

-- Fail the migration if any authoritative contract was not installed.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.apply_customer_quote_decision_engine_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_definition;
  if position('profixiq.quote_decision_shop_recorded' in v_definition) = 0
     or position('Quote line has not been sent to the customer.' in v_definition) = 0 then
    raise exception 'Shop-recorded sent-check bypass postcondition failed (engine)';
  end if;

  select pg_get_functiondef(
    'public.apply_shop_quote_decision_atomic(uuid,uuid,uuid[],text,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_definition;
  if position('set_config(''profixiq.quote_decision_shop_recorded'', ''true'', true)' in v_definition) = 0 then
    raise exception 'Shop-recorded sent-check bypass postcondition failed (shop wrapper)';
  end if;

  select pg_get_functiondef(
    'public.shop_assistant_record_approval_decision_atomic(uuid,uuid,uuid,uuid,uuid[],boolean,text,text,text)'::regprocedure
  ) into v_definition;
  if position('set_config(''profixiq.quote_decision_shop_recorded'', ''true'', true)' in v_definition) = 0 then
    raise exception 'Shop-recorded sent-check bypass postcondition failed (shop assistant)';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
