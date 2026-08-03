-- Keep one canonical inspection while allowing a technician to continue the
-- same draft from any device. Server revisions still serialize writes, while
-- lastUpdated decides whether a stale-base edit is newer than the canonical
-- edit it raced with. Older recovered payloads are acknowledged as superseded
-- so offline replay can finish without replacing newer shop work.

create or replace function public.save_inspection_progress_v3_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_session jsonb,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_existing_result jsonb;
  v_canonical_session jsonb;
  v_inspection_id uuid;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
  v_server_revision bigint := 0;
  v_client_revision bigint := 0;
  v_next_revision bigint;
  v_client_last_updated timestamptz;
  v_server_last_updated timestamptz;
  v_server_updated_at timestamptz;
  v_client_has_progress boolean := false;
  v_server_has_progress boolean := false;
  v_inspection_locked boolean := false;
  v_inspection_completed boolean := false;
  v_inspection_is_draft boolean := true;
  v_inspection_status text := 'draft';
  v_inspection_finalized_at timestamptz;
  v_inspection_finalized_by uuid;
  v_session_fingerprint text := md5(p_session::text);
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'Authenticated actor does not match the inspection actor.';
  end if;

  if nullif(trim(p_operation_key), '') is null then
    raise exception using
      errcode = 'P0001',
      message = 'A stable operation key is required.';
  end if;

  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection session payload must be a JSON object.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and p.shop_id = p_shop_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Actor is not a member of this shop.';
  end if;

  select wol.id, wol.work_order_id
    into v_line
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id
    and wol.shop_id = p_shop_id
  for update;

  if not found or v_line.work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Work-order line not found for shop.';
  end if;

  select mok.result
    into v_existing_result
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'save_inspection_progress'
    and mok.operation_key = p_operation_key;

  if found then
    if coalesce(v_existing_result->>'session_fingerprint', '') is distinct from
       v_session_fingerprint then
      raise exception using
        errcode = 'P0001',
        message = 'Inspection operation key was reused for a different snapshot.';
    end if;
    return v_existing_result || jsonb_build_object('idempotent', true);
  end if;

  select
    i.id,
    i.sync_revision,
    i.summary,
    i.updated_at,
    coalesce(i.locked, false),
    coalesce(i.completed, false),
    coalesce(i.is_draft, true),
    coalesce(i.status, 'draft'),
    i.finalized_at,
    i.finalized_by
  into
    v_inspection_id,
    v_server_revision,
    v_canonical_session,
    v_server_updated_at,
    v_inspection_locked,
    v_inspection_completed,
    v_inspection_is_draft,
    v_inspection_status,
    v_inspection_finalized_at,
    v_inspection_finalized_by
  from public.inspections i
  where i.work_order_line_id = p_work_order_line_id
    and i.shop_id = p_shop_id
    and i.is_canonical
  for update;

  if found then
    if (
      v_inspection_locked
      or v_inspection_completed
      or not v_inspection_is_draft
      or v_inspection_finalized_at is not null
      or v_inspection_finalized_by is not null
      or lower(v_inspection_status) in ('completed', 'finalized', 'signed')
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Inspection is finalized and locked. Reopen is required before editing.';
    end if;
  else
    insert into public.inspections (
      work_order_id,
      work_order_line_id,
      shop_id,
      user_id,
      summary,
      is_canonical,
      sync_revision,
      is_draft,
      completed,
      locked,
      status,
      updated_at
    ) values (
      v_line.work_order_id,
      p_work_order_line_id,
      p_shop_id,
      p_actor_user_id,
      p_session,
      true,
      0,
      true,
      false,
      false,
      'draft',
      v_now
    )
    returning id, summary, updated_at
      into v_inspection_id, v_canonical_session, v_server_updated_at;
  end if;

  if coalesce(p_session->>'syncRevision', '') ~ '^[0-9]+$' then
    v_client_revision := (p_session->>'syncRevision')::bigint;
  end if;

  if v_client_revision > v_server_revision then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection client revision is newer than the server version.';
  end if;

  begin
    v_client_last_updated := nullif(trim(p_session->>'lastUpdated'), '')::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      v_client_last_updated := null;
  end;

  begin
    v_server_last_updated :=
      nullif(trim(v_canonical_session->>'lastUpdated'), '')::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      v_server_last_updated := null;
  end;

  select
    nullif(trim(p_session->>'transcript'), '') is not null
    or case
      when jsonb_typeof(p_session->'quote') = 'array'
        then jsonb_array_length(p_session->'quote') > 0
      else false
    end
    or exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_session->'sections') = 'array'
            then p_session->'sections'
          else '[]'::jsonb
        end
      ) as section_entry(value)
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(section_entry.value->'items') = 'array'
            then section_entry.value->'items'
          else '[]'::jsonb
        end
      ) as item_entry(value)
      where (
        nullif(trim(item_entry.value->>'status'), '') is not null
        and lower(trim(item_entry.value->>'status')) not in (
          'pending',
          'not_started',
          'not started'
        )
      )
      or nullif(trim(item_entry.value->>'notes'), '') is not null
      or (
        item_entry.value ? 'value'
        and item_entry.value->'value' <> 'null'::jsonb
        and nullif(trim(item_entry.value->>'value'), '') is not null
      )
      or case
        when jsonb_typeof(item_entry.value->'photoUrls') = 'array'
          then jsonb_array_length(item_entry.value->'photoUrls') > 0
        else false
      end
    )
  into v_client_has_progress;

  select
    nullif(trim(v_canonical_session->>'transcript'), '') is not null
    or case
      when jsonb_typeof(v_canonical_session->'quote') = 'array'
        then jsonb_array_length(v_canonical_session->'quote') > 0
      else false
    end
    or exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_canonical_session->'sections') = 'array'
            then v_canonical_session->'sections'
          else '[]'::jsonb
        end
      ) as section_entry(value)
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(section_entry.value->'items') = 'array'
            then section_entry.value->'items'
          else '[]'::jsonb
        end
      ) as item_entry(value)
      where (
        nullif(trim(item_entry.value->>'status'), '') is not null
        and lower(trim(item_entry.value->>'status')) not in (
          'pending',
          'not_started',
          'not started'
        )
      )
      or nullif(trim(item_entry.value->>'notes'), '') is not null
      or (
        item_entry.value ? 'value'
        and item_entry.value->'value' <> 'null'::jsonb
        and nullif(trim(item_entry.value->>'value'), '') is not null
      )
      or case
        when jsonb_typeof(item_entry.value->'photoUrls') = 'array'
          then jsonb_array_length(item_entry.value->'photoUrls') > 0
        else false
      end
    )
  into v_server_has_progress;

  if v_client_revision < v_server_revision
    and v_canonical_session is not null
    and jsonb_typeof(v_canonical_session) = 'object'
    and (
      (not v_client_has_progress and v_server_has_progress)
      or (
        v_client_has_progress = v_server_has_progress
        and (
          v_client_last_updated is null
          or v_server_last_updated is null
          or v_client_last_updated <= v_server_last_updated
        )
      )
    ) then
    v_result := jsonb_build_object(
      'ok', true,
      'inspection_id', v_inspection_id,
      'work_order_id', v_line.work_order_id,
      'work_order_line_id', p_work_order_line_id,
      'sync_revision', v_server_revision,
      'saved_at', v_server_updated_at,
      'session', v_canonical_session,
      'superseded', true,
      'session_fingerprint', v_session_fingerprint,
      'idempotent', false
    );

    insert into public.mobile_operation_keys (
      shop_id,
      operation_name,
      operation_key,
      actor_user_id,
      work_order_id,
      work_order_line_id,
      result
    ) values (
      p_shop_id,
      'save_inspection_progress',
      p_operation_key,
      p_actor_user_id,
      v_line.work_order_id,
      p_work_order_line_id,
      v_result
    );

    return v_result;
  end if;

  v_next_revision := v_server_revision + 1;
  v_canonical_session :=
    p_session || jsonb_build_object(
      'id', v_inspection_id,
      'workOrderId', v_line.work_order_id,
      'workOrderLineId', p_work_order_line_id,
      'syncRevision', v_next_revision,
      'serverUpdatedAt', v_now
    );

  update public.inspections
  set summary = v_canonical_session,
      user_id = p_actor_user_id,
      sync_revision = v_next_revision,
      updated_at = v_now
  where id = v_inspection_id
    and shop_id = p_shop_id
    and is_canonical
    and sync_revision = v_server_revision
    and not coalesce(locked, false)
    and not coalesce(completed, false)
    and coalesce(is_draft, true);

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection changed or was finalized while autosave was in progress.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'inspection_id', v_inspection_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'sync_revision', v_next_revision,
    'saved_at', v_now,
    'superseded', false,
    'session_fingerprint', v_session_fingerprint,
    'idempotent', false
  );

  insert into public.mobile_operation_keys (
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    work_order_line_id,
    result
  ) values (
    p_shop_id,
    'save_inspection_progress',
    p_operation_key,
    p_actor_user_id,
    v_line.work_order_id,
    p_work_order_line_id,
    v_result
  );

  return v_result;
exception
  when unique_violation then
    select mok.result
      into v_existing_result
    from public.mobile_operation_keys mok
    where mok.shop_id = p_shop_id
      and mok.operation_name = 'save_inspection_progress'
      and mok.operation_key = p_operation_key;

    if found then
      if coalesce(v_existing_result->>'session_fingerprint', '') is distinct from
         v_session_fingerprint then
        raise exception using
          errcode = 'P0001',
          message = 'Inspection operation key was reused for a different snapshot.';
      end if;
      return v_existing_result || jsonb_build_object('idempotent', true);
    end if;
    raise;
end;
$$;

revoke all on function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public;
grant execute on function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;
