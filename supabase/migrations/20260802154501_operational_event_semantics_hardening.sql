begin;

-- The initial observability migration intentionally centralizes capture in one
-- trigger function. Harden that function forward-only so later status changes
-- use their transition time, operation retries deduplicate per semantic entity
-- event instead of collapsing an entire multi-record operation, and actor IDs
-- consistently resolve to the authenticated user identity when available.
do $migration$
declare
  v_sql text;
  v_patch_count integer := 0;
  v_old_actor text := E'  if v_actor_user_id is not null then\n    select p.role\n      into v_actor_role\n    from public.profiles p\n    where p.id = v_actor_user_id\n       or p.user_id = v_actor_user_id\n    order by (p.id = v_actor_user_id) desc\n    limit 1;\n  end if;';
  v_new_actor text := E'  if v_actor_user_id is not null then\n    select coalesce(p.user_id, p.id), p.role\n      into v_actor_user_id, v_actor_role\n    from public.profiles p\n    where p.id = v_actor_user_id\n       or p.user_id = v_actor_user_id\n    order by (p.id = v_actor_user_id) desc\n    limit 1;\n  end if;';
  v_old_occurred text := E'  v_occurred_at := coalesce(\n    nullif(v_row ->> ''occurred_at'', '''')::timestamptz,\n    nullif(v_row ->> ''timestamp'', '''')::timestamptz,\n    nullif(v_row ->> ''sent_at'', '''')::timestamptz,\n    nullif(v_row ->> ''created_at'', '''')::timestamptz,\n    now()\n  );';
  v_new_occurred text := E'  v_occurred_at := coalesce(\n    nullif(v_row ->> ''occurred_at'', '''')::timestamptz,\n    nullif(v_row ->> ''timestamp'', '''')::timestamptz,\n    nullif(v_row ->> ''sent_at'', '''')::timestamptz,\n    case\n      when tg_op = ''UPDATE'' then nullif(v_row ->> ''updated_at'', '''')::timestamptz\n      else null\n    end,\n    nullif(v_row ->> ''created_at'', '''')::timestamptz,\n    nullif(v_row ->> ''updated_at'', '''')::timestamptz,\n    now()\n  );';
  v_old_idempotency text := E'  v_idempotency_key := coalesce(\n    nullif(v_row ->> ''operation_key'', ''''),\n    nullif(v_row ->> ''idempotency_key'', ''''),\n    concat_ws(\n      '':'',\n      tg_table_name,\n      coalesce(v_entity_id::text, ''na''),\n      v_event_type,\n      coalesce(\n        nullif(v_row ->> ''updated_at'', ''''),\n        nullif(v_row ->> ''created_at'', ''''),\n        transaction_timestamp()::text\n      )\n    )\n  );';
  v_new_idempotency text := E'  v_idempotency_key := concat_ws(\n    '':'',\n    ''operational'',\n    tg_table_name,\n    coalesce(v_entity_id::text, ''na''),\n    v_event_type,\n    coalesce(\n      nullif(v_row ->> ''operation_key'', ''''),\n      nullif(v_row ->> ''idempotency_key'', ''''),\n      nullif(v_row ->> ''updated_at'', ''''),\n      nullif(v_row ->> ''created_at'', ''''),\n      transaction_timestamp()::text\n    )\n  );';
begin
  select pg_get_functiondef('private.capture_operational_event()'::regprocedure)
    into v_sql;

  if position('select coalesce(p.user_id, p.id), p.role' in v_sql) = 0 then
    if position(v_old_actor in v_sql) = 0 then
      raise exception 'Operational event actor normalization patch point not found';
    end if;
    v_sql := replace(v_sql, v_old_actor, v_new_actor);
    v_patch_count := v_patch_count + 1;
  end if;

  if position('when tg_op = ''UPDATE'' then nullif(v_row ->> ''updated_at''' in v_sql) = 0 then
    if position(v_old_occurred in v_sql) = 0 then
      raise exception 'Operational event occurred_at patch point not found';
    end if;
    v_sql := replace(v_sql, v_old_occurred, v_new_occurred);
    v_patch_count := v_patch_count + 1;
  end if;

  if position('''operational'',' || E'\n    tg_table_name' in v_sql) = 0 then
    if position(v_old_idempotency in v_sql) = 0 then
      raise exception 'Operational event idempotency patch point not found';
    end if;
    v_sql := replace(v_sql, v_old_idempotency, v_new_idempotency);
    v_patch_count := v_patch_count + 1;
  end if;

  if v_patch_count > 0 then
    execute v_sql;
  end if;

  select pg_get_functiondef('private.capture_operational_event()'::regprocedure)
    into v_sql;

  if position('select coalesce(p.user_id, p.id), p.role' in v_sql) = 0 then
    raise exception 'Operational event actor normalization postcondition failed';
  end if;
  if position('when tg_op = ''UPDATE'' then nullif(v_row ->> ''updated_at''' in v_sql) = 0 then
    raise exception 'Operational event occurred_at postcondition failed';
  end if;
  if position('''operational'',' || E'\n    tg_table_name' in v_sql) = 0 then
    raise exception 'Operational event idempotency postcondition failed';
  end if;
end;
$migration$;

commit;
