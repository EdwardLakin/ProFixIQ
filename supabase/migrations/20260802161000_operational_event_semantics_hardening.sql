begin;

-- Preserve transition chronology, prevent a shared operation key from collapsing
-- distinct entity events, and normalize actor identifiers before they enter the
-- canonical event stream. This is forward-only and leaves the merged P0-P4
-- migration unchanged.
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

-- Keep workforce events on the same actor convention as every other domain.
create or replace function private.capture_operational_punch_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_profile_id uuid;
  v_actor_user_id uuid;
  v_actor_role text;
  v_event_type text;
  v_idempotency_key text;
begin
  select
    p.shop_id,
    p.id,
    coalesce(p.user_id, new.user_id, auth.uid(), p.id),
    p.role
    into v_shop_id, v_profile_id, v_actor_user_id, v_actor_role
  from public.profiles p
  where (new.profile_id is not null and p.id = new.profile_id)
     or (new.user_id is not null and (p.user_id = new.user_id or p.id = new.user_id))
  order by (p.id = new.profile_id) desc
  limit 1;

  if v_shop_id is null then
    raise exception using
      errcode = '23502',
      message = 'Unable to resolve punch-event shop identity';
  end if;

  v_event_type := 'workforce.punch.' || coalesce(
    private.operational_event_slug(new.event_type),
    'recorded'
  );
  v_idempotency_key := concat_ws(
    ':',
    'operational',
    'punch_events',
    new.id::text,
    v_event_type,
    coalesce(new.timestamp::text, new.created_at::text, transaction_timestamp()::text)
  );

  perform private.append_operational_event(
    v_shop_id,
    v_event_type,
    coalesce(new.timestamp, new.created_at, now()),
    v_actor_user_id,
    v_actor_role,
    'punch_event',
    new.id,
    'profile',
    v_profile_id,
    v_profile_id,
    null,
    v_idempotency_key,
    'database_trigger:punch_events',
    'info',
    jsonb_strip_nulls(jsonb_build_object(
      'operation', 'insert',
      'table', 'punch_events',
      'profile_id', v_profile_id,
      'auth_user_id', v_actor_user_id,
      'shift_id', new.shift_id,
      'note_present', nullif(btrim(coalesce(new.note, '')), '') is not null,
      'schema_version', 1
    ))
  );

  perform private.resolve_operational_event_failure(
    v_shop_id,
    v_event_type,
    'punch_event',
    new.id,
    'punch_events'
  );

  return new;
exception
  when others then
    begin
      perform private.record_operational_event_failure(
        v_shop_id,
        v_event_type,
        'punch_event',
        new.id,
        'punch_events',
        sqlstate,
        sqlerrm,
        jsonb_strip_nulls(jsonb_build_object(
          'operation', 'insert',
          'profile_id', new.profile_id,
          'auth_user_id', new.user_id,
          'shift_id', new.shift_id
        ))
      );
    exception
      when others then
        null;
    end;
    return new;
end;
$$;

revoke all on function private.capture_operational_punch_event()
  from public, anon, authenticated;

comment on function private.capture_operational_punch_event() is
  'Captures canonical workforce punches with tenant scope and normalized profile/auth identity.';

commit;
