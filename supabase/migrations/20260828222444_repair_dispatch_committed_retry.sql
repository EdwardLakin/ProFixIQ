begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- A completed transition receipt is immutable mutation history, not a new
-- authorization decision. Bind it to the authenticated actor and exact
-- request so the original caller can recover a lost response after assignment
-- or Field access changes without authorizing a fresh transition.
-- The mobile HTTP boundary uses this stable identity-only preflight to decide
-- whether an exact retry may reach committed-receipt recovery before the
-- revocable Field operator gate. Payload equivalence remains authoritative in
-- mobile_replay_service_visit_transition_atomic.
create or replace function public.mobile_service_visit_transition_receipt_exists(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $
declare
  v_actor_profile_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if p_shop_id is null
     or nullif(trim(coalesce(p_operation_key, '')), '') is null then
    return false;
  end if;

  v_actor_profile_id := public.dispatch_actor_profile_id(
    p_shop_id,
    p_actor_user_id
  );
  if v_actor_profile_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.scheduler_operation_keys operation
    where operation.shop_id = p_shop_id
      and operation.operation_name = 'dispatch_visit_transition'
      and operation.operation_key = p_operation_key
      and operation.actor_user_id = v_actor_profile_id
  );
end;
$;

comment on function public.mobile_service_visit_transition_receipt_exists(
  uuid, uuid, text
) is
  'Returns whether the authenticated shop actor owns a committed Service Visit transition receipt for this operation key; it does not authorize fresh work.';

create or replace function public.dispatch_transition_service_visit_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_to_status text,
  p_actual_travel_minutes integer,
  p_actual_distance_km numeric,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_operation public.scheduler_operation_keys%rowtype;
  v_result jsonb;
  v_stored_result jsonb;
  v_request jsonb;
  v_request_hash text;
  v_actor_profile_id uuid;
  v_from text;
  v_to text := lower(trim(coalesce(p_to_status, '')));
  v_allowed boolean := false;
  v_actor_is_manager boolean;
  v_now timestamptz := now();
begin
  -- Identity binding is stable across assignment/capability changes and must
  -- still precede receipt recovery. It prevents one signed-in actor from
  -- presenting another actor's identifier.
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Service visit transition denied.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  v_actor_profile_id := public.dispatch_actor_profile_id(
    p_shop_id,
    p_actor_user_id
  );
  v_request := jsonb_build_object(
    'shop_id', p_shop_id,
    'visit_id', p_visit_id,
    'to_status', v_to,
    'actual_travel_minutes', p_actual_travel_minutes,
    'actual_distance_km', p_actual_distance_km,
    'expected_version', p_expected_version,
    'actor_profile_id', v_actor_profile_id
  );
  v_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_request::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- Serialize the operation key independently from the visit row. This also
  -- prevents the same key from mutating two different visits concurrently.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_shop_id::text || ':dispatch_visit_transition:' || p_operation_key,
      0
    )
  );

  select operation.*
  into v_operation
  from public.scheduler_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'dispatch_visit_transition'
    and operation.operation_key = p_operation_key
  for update;

  if found then
    if v_actor_profile_id is null
       or v_operation.actor_user_id is distinct from v_actor_profile_id then
      raise exception using
        errcode = '42501',
        message = 'Service visit transition receipt denied.';
    end if;
    if coalesce(v_operation.result ->> '_request_hash_version', '') = '' then
      -- Receipts committed before this migration did not retain their request
      -- hash. Recover only when the immutable transition event and stored
      -- snapshot bind the same actor, tenant, visit, operation key, target
      -- state and optimistic version. Then upgrade the receipt in place so
      -- every subsequent retry uses the exact versioned request hash.
      if not exists (
        select 1
        from public.service_visit_events event
        where event.shop_id = p_shop_id
          and event.service_visit_id = p_visit_id
          and event.event_type = 'transitioned'
          and event.actor_user_id = v_actor_profile_id
          and event.metadata ->> 'operation_key' = p_operation_key
          and lower(coalesce(event.to_status, '')) = v_to
      )
      or coalesce(v_operation.result #>> '{visit,id}', '') <> p_visit_id::text
      or coalesce(v_operation.result #>> '{visit,shopId}', '') <> p_shop_id::text
      or lower(coalesce(v_operation.result #>> '{visit,status}', '')) <> v_to
      -- A pre-hash direct receipt can be upgraded only when every optional
      -- request field is present and independently provable from the stored
      -- result. Null means "unknown", not "equivalent".
      or p_expected_version is null
      or p_actual_travel_minutes is null
      or p_actual_distance_km is null
      or coalesce(v_operation.result #>> '{visit,version}', '')
        <> (p_expected_version + 1)::text
      or nullif(v_operation.result #>> '{visit,actualTravelMinutes}', '')::integer
        is distinct from p_actual_travel_minutes
      or nullif(v_operation.result #>> '{visit,actualDistanceKm}', '')::numeric
        is distinct from p_actual_distance_km then
        raise exception using
          errcode = '22023',
          message = 'SERVICE_VISIT_OPERATION_KEY_CONFLICT';
      end if;

      update public.scheduler_operation_keys operation
      set result = operation.result || jsonb_build_object(
        '_request_hash_version', 1,
        '_request_hash', v_request_hash
      )
      where operation.id = v_operation.id
      returning operation.* into v_operation;
    elsif coalesce(v_operation.result ->> '_request_hash_version', '') <> '1'
       or coalesce(v_operation.result ->> '_request_hash', '') <> v_request_hash then
      raise exception using
        errcode = '22023',
        message = 'SERVICE_VISIT_OPERATION_KEY_CONFLICT';
    end if;
    return (
      v_operation.result
        - '_request_hash'
        - '_request_hash_version'
        - '_mobile_request_hash'
    ) || jsonb_build_object('idempotent', true);
  end if;

  -- No committed receipt exists. Fresh work must still pass the current,
  -- row-locked Field access and assignment decision.
  select *
  into v_visit
  from private.dispatch_lock_service_visit_for_execution(
    p_shop_id,
    p_actor_user_id,
    p_visit_id
  );

  if p_expected_version is not null and v_visit.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Service visit changed since it was loaded.';
  end if;
  if v_to in ('working', 'completed') and v_visit.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'A linked work order is required before starting or completing repair.';
  end if;

  v_from := v_visit.status;
  v_actor_is_manager := public.dispatch_can_manage(p_shop_id, p_actor_user_id);
  v_allowed := case v_from
    when 'scheduled' then v_to in ('dispatched','cancelled')
    when 'dispatched' then v_to in ('en_route','cancelled')
    when 'en_route' then v_to in ('arrived','cancelled')
    when 'arrived' then v_to in ('working','cancelled')
    when 'working' then v_to in ('paused','completed')
    when 'paused' then v_to in ('working','completed','cancelled')
    else false
  end;
  if not v_allowed then
    raise exception using errcode = 'P0001', message = 'Invalid service visit status transition.';
  end if;
  if v_to = 'cancelled' and not v_actor_is_manager then
    raise exception using errcode = '42501', message = 'Only dispatch staff can cancel a service visit.';
  end if;

  update public.service_visits
  set status = v_to,
      dispatched_at = case when v_to = 'dispatched' then coalesce(dispatched_at, v_now) else dispatched_at end,
      travel_started_at = case when v_to = 'en_route' then coalesce(travel_started_at, v_now) else travel_started_at end,
      arrived_at = case when v_to = 'arrived' then coalesce(arrived_at, v_now) else arrived_at end,
      work_started_at = case when v_to = 'working' then coalesce(work_started_at, v_now) else work_started_at end,
      paused_at = case when v_to = 'paused' then v_now else paused_at end,
      completed_at = case when v_to = 'completed' then coalesce(completed_at, v_now) else completed_at end,
      cancelled_at = case when v_to = 'cancelled' then coalesce(cancelled_at, v_now) else cancelled_at end,
      actual_travel_minutes = coalesce(
        p_actual_travel_minutes,
        case when v_to = 'arrived' and travel_started_at is not null
          then greatest(0, round(extract(epoch from (v_now - travel_started_at)) / 60.0)::integer)
          else actual_travel_minutes end
      ),
      actual_distance_km = coalesce(p_actual_distance_km, actual_distance_km),
      last_status_at = v_now,
      last_status_by = v_actor_profile_id,
      version = version + 1,
      updated_at = v_now
  where id = v_visit.id
  returning * into v_visit;

  perform public.dispatch_sync_event_status(v_visit.id);
  perform public.dispatch_sync_technician_reservation(v_visit.id);
  perform public.dispatch_record_visit_event(
    v_visit.id, 'transitioned', p_actor_user_id, v_from, v_to,
    jsonb_build_object('operation_key', p_operation_key)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'visit', public.dispatch_visit_snapshot(v_visit.id),
    'idempotent', false
  );
  v_stored_result := v_result || jsonb_build_object(
    '_request_hash_version', 1,
    '_request_hash', v_request_hash
  );

  insert into public.scheduler_operation_keys(
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    result
  ) values (
    p_shop_id,
    'dispatch_visit_transition',
    p_operation_key,
    v_actor_profile_id,
    v_stored_result
  );

  return v_result;
end;
$$;

comment on function public.dispatch_transition_service_visit_atomic(
  uuid, uuid, text, integer, numeric, integer, uuid, text
) is
  'Transitions one tenant-scoped Service Visit. Exact actor-bound committed receipts are recovered before mutable execution authorization; fresh requests still require current row-locked assignment/access.';

-- Offline replay uses the same durable transition receipt. Its additional
-- from-state precondition is hashed separately so a changed replay payload
-- cannot claim the committed result under the same operation key.
create or replace function public.mobile_replay_service_visit_transition_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_from_status text,
  p_to_status text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit public.service_visits%rowtype;
  v_operation public.scheduler_operation_keys%rowtype;
  v_result jsonb;
  v_transition_request jsonb;
  v_replay_request jsonb;
  v_transition_request_hash text;
  v_replay_request_hash text;
  v_actor_profile_id uuid;
  v_from text := lower(coalesce(p_from_status, ''));
  v_to text := lower(trim(coalesce(p_to_status, '')));
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;
  if p_expected_version is null then
    raise exception using errcode = '22023', message = 'Expected visit version is required for offline replay.';
  end if;

  v_actor_profile_id := public.dispatch_actor_profile_id(
    p_shop_id,
    p_actor_user_id
  );
  v_transition_request := jsonb_build_object(
    'shop_id', p_shop_id,
    'visit_id', p_visit_id,
    'to_status', v_to,
    'actual_travel_minutes', null,
    'actual_distance_km', null,
    'expected_version', p_expected_version,
    'actor_profile_id', v_actor_profile_id
  );
  v_transition_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_transition_request::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_replay_request := v_transition_request || jsonb_build_object(
    'from_status', v_from
  );
  v_replay_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_replay_request::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_shop_id::text || ':dispatch_visit_transition:' || p_operation_key,
      0
    )
  );

  select operation.*
  into v_operation
  from public.scheduler_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'dispatch_visit_transition'
    and operation.operation_key = p_operation_key
  for update;

  if found then
    if v_actor_profile_id is null
       or v_operation.actor_user_id is distinct from v_actor_profile_id then
      raise exception using
        errcode = '42501',
        message = 'Service visit transition receipt denied.';
    end if;
    if coalesce(v_operation.result ->> '_request_hash_version', '') = '' then
      if not exists (
        select 1
        from public.service_visit_events event
        where event.shop_id = p_shop_id
          and event.service_visit_id = p_visit_id
          and event.event_type = 'transitioned'
          and event.actor_user_id = v_actor_profile_id
          and event.metadata ->> 'operation_key' = p_operation_key
          and lower(coalesce(event.from_status, '')) = v_from
          and lower(coalesce(event.to_status, '')) = v_to
      )
      or coalesce(v_operation.result #>> '{visit,id}', '') <> p_visit_id::text
      or coalesce(v_operation.result #>> '{visit,shopId}', '') <> p_shop_id::text
      or lower(coalesce(v_operation.result #>> '{visit,status}', '')) <> v_to
      or coalesce(v_operation.result #>> '{visit,version}', '')
        <> (p_expected_version + 1)::text then
        raise exception using
          errcode = '22023',
          message = 'SERVICE_VISIT_OPERATION_KEY_CONFLICT';
      end if;

      update public.scheduler_operation_keys operation
      set result = operation.result || jsonb_build_object(
        '_request_hash_version', 1,
        '_request_hash', v_transition_request_hash,
        '_mobile_request_hash', v_replay_request_hash
      )
      where operation.id = v_operation.id
      returning operation.* into v_operation;
    elsif coalesce(v_operation.result ->> '_request_hash_version', '') <> '1'
       or coalesce(v_operation.result ->> '_request_hash', '') <> v_transition_request_hash then
      raise exception using
        errcode = '22023',
        message = 'SERVICE_VISIT_OPERATION_KEY_CONFLICT';
    end if;
    if coalesce(v_operation.result ->> '_mobile_request_hash', '') = '' then
      -- A legacy receipt may have first been recovered through the canonical
      -- direct RPC. Bind the mobile from-state only after checking the same
      -- immutable transition event.
      if not exists (
        select 1
        from public.service_visit_events event
        where event.shop_id = p_shop_id
          and event.service_visit_id = p_visit_id
          and event.event_type = 'transitioned'
          and event.actor_user_id = v_actor_profile_id
          and event.metadata ->> 'operation_key' = p_operation_key
          and lower(coalesce(event.from_status, '')) = v_from
          and lower(coalesce(event.to_status, '')) = v_to
      ) then
        raise exception using
          errcode = '22023',
          message = 'SERVICE_VISIT_OPERATION_KEY_CONFLICT';
      end if;

      update public.scheduler_operation_keys operation
      set result = operation.result || jsonb_build_object(
        '_mobile_request_hash', v_replay_request_hash
      )
      where operation.id = v_operation.id
      returning operation.* into v_operation;
    elsif coalesce(v_operation.result ->> '_mobile_request_hash', '')
      <> v_replay_request_hash then
      raise exception using
        errcode = '22023',
        message = 'SERVICE_VISIT_OPERATION_KEY_CONFLICT';
    end if;
    return (
      v_operation.result
        - '_request_hash'
        - '_request_hash_version'
        - '_mobile_request_hash'
    ) || jsonb_build_object('idempotent', true);
  end if;

  select *
  into v_visit
  from private.dispatch_lock_service_visit_for_execution(
    p_shop_id,
    p_actor_user_id,
    p_visit_id
  );

  if v_to in ('working', 'completed') and v_visit.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'A linked work order is required before starting or completing repair.';
  end if;
  if v_visit.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'SERVICE_VISIT_VERSION_CHANGED';
  end if;
  if v_visit.status <> v_from then
    raise exception using errcode = '40001', message = 'SERVICE_VISIT_STATE_CHANGED';
  end if;

  v_result := public.dispatch_transition_service_visit_atomic(
    p_shop_id,
    p_visit_id,
    v_to,
    null,
    null,
    p_expected_version,
    p_actor_user_id,
    p_operation_key
  );

  update public.scheduler_operation_keys operation
  set result = operation.result || jsonb_build_object(
    '_mobile_request_hash', v_replay_request_hash
  )
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'dispatch_visit_transition'
    and operation.operation_key = p_operation_key;

  return v_result;
end;
$$;

comment on function public.mobile_replay_service_visit_transition_atomic(
  uuid, uuid, text, text, integer, uuid, text
) is
  'Replays an offline Service Visit transition. Exact actor- and payload-bound committed receipts survive later assignment/access changes; fresh replay requires current execution authorization and state/version.';

revoke all on function public.mobile_service_visit_transition_receipt_exists(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.mobile_service_visit_transition_receipt_exists(
  uuid, uuid, text
) to authenticated, service_role;

revoke all on function public.dispatch_transition_service_visit_atomic(
  uuid, uuid, text, integer, numeric, integer, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.dispatch_transition_service_visit_atomic(
  uuid, uuid, text, integer, numeric, integer, uuid, text
) to authenticated, service_role;

revoke all on function public.mobile_replay_service_visit_transition_atomic(
  uuid, uuid, text, text, integer, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.mobile_replay_service_visit_transition_atomic(
  uuid, uuid, text, text, integer, uuid, text
) to authenticated, service_role;

do $dispatch_committed_retry_postcheck$
declare
  v_transition_definition text;
  v_replay_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.dispatch_transition_service_visit_atomic(uuid,uuid,text,integer,numeric,integer,uuid,text)'::pg_catalog.regprocedure
  ) into v_transition_definition;
  select pg_catalog.pg_get_functiondef(
    'public.mobile_replay_service_visit_transition_atomic(uuid,uuid,text,text,integer,uuid,text)'::pg_catalog.regprocedure
  ) into v_replay_definition;

  if pg_catalog.strpos(v_transition_definition, 'from public.scheduler_operation_keys') = 0
     or pg_catalog.strpos(v_transition_definition, 'private.dispatch_lock_service_visit_for_execution') = 0
     or pg_catalog.strpos(v_transition_definition, 'from public.scheduler_operation_keys')
        >= pg_catalog.strpos(v_transition_definition, 'private.dispatch_lock_service_visit_for_execution')
     or pg_catalog.strpos(v_transition_definition, '_request_hash') = 0
     or pg_catalog.strpos(v_transition_definition, 'pg_advisory_xact_lock') = 0 then
    raise exception 'Dispatch committed-retry ordering or payload binding is incomplete';
  end if;

  if pg_catalog.strpos(v_replay_definition, 'from public.scheduler_operation_keys') = 0
     or pg_catalog.strpos(v_replay_definition, 'private.dispatch_lock_service_visit_for_execution') = 0
     or pg_catalog.strpos(v_replay_definition, 'from public.scheduler_operation_keys')
        >= pg_catalog.strpos(v_replay_definition, 'private.dispatch_lock_service_visit_for_execution')
     or pg_catalog.strpos(v_replay_definition, '_mobile_request_hash') = 0 then
    raise exception 'Mobile committed-retry ordering or payload binding is incomplete';
  end if;

  if has_function_privilege(
    'anon',
    'public.mobile_service_visit_transition_receipt_exists(uuid,uuid,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'authenticated',
    'public.mobile_service_visit_transition_receipt_exists(uuid,uuid,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.mobile_service_visit_transition_receipt_exists(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Mobile committed-receipt preflight ACL is unsafe';
  end if;

  if has_function_privilege(
    'anon',
    'public.dispatch_transition_service_visit_atomic(uuid,uuid,text,integer,numeric,integer,uuid,text)',
    'EXECUTE'
  )
  or has_function_privilege(
    'anon',
    'public.mobile_replay_service_visit_transition_atomic(uuid,uuid,text,text,integer,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous dispatch transition execution is unsafe';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.dispatch_transition_service_visit_atomic(uuid,uuid,text,integer,numeric,integer,uuid,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.dispatch_transition_service_visit_atomic(uuid,uuid,text,integer,numeric,integer,uuid,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'authenticated',
    'public.mobile_replay_service_visit_transition_atomic(uuid,uuid,text,text,integer,uuid,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.mobile_replay_service_visit_transition_atomic(uuid,uuid,text,text,integer,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Established dispatch transition callers lost execute access';
  end if;
end;
$dispatch_committed_retry_postcheck$;

notify pgrst, 'reload schema';

commit;
