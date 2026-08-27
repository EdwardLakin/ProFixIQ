begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Keep the role/assignment decision independent from the row lookup so
-- mutation RPCs can apply it to the exact tuple acquired by SELECT FOR UPDATE.
-- PostgreSQL rechecks this predicate against the current tuple after waiting
-- for a concurrent reassignment, closing the check-then-lock race.
create or replace function private.dispatch_visit_actor_can_execute(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_visit_mode text,
  p_assigned_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (
      p_visit_mode = 'mobile'
      and public.mobile_actor_has_field_service_access(
        p_shop_id,
        p_actor_user_id
      )
      and (
        public.dispatch_can_manage(p_shop_id, p_actor_user_id)
        or exists (
          select 1
          from public.profiles assigned_profile
          where assigned_profile.id = p_assigned_user_id
            and assigned_profile.shop_id = p_shop_id
            and (
              assigned_profile.id = p_actor_user_id
              or assigned_profile.user_id = p_actor_user_id
            )
          )
        )
      )
    or (
      p_visit_mode <> 'mobile'
      and (
        public.dispatch_can_manage(p_shop_id, p_actor_user_id)
        or exists (
          select 1
          from public.profiles profile
          where profile.id = p_assigned_user_id
            and (
              profile.id = p_actor_user_id
              or profile.user_id = p_actor_user_id
            )
            and lower(coalesce(profile.role, '')) in (
              'mechanic','technician','tech','lead_hand','leadhand','foreman'
            )
        )
      )
    )
  );
$$;

revoke all on function private.dispatch_visit_actor_can_execute(
  uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;

-- Restore the execution boundary that existed before the Field product gate
-- was added. Field entitlement is necessary, but it is not visit ownership:
-- an ordinary operator may execute only the visit assigned to their canonical
-- profile, while established dispatch managers may execute any same-shop
-- mobile visit. Shop-mode visits retain their existing authorization rules.
create or replace function public.dispatch_can_execute(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_visit_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_visits visit
    where visit.id = p_visit_id
      and visit.shop_id = p_shop_id
      and private.dispatch_visit_actor_can_execute(
        visit.shop_id,
        p_actor_user_id,
        visit.mode,
        visit.assigned_user_id
      )
  );
$$;

comment on function public.dispatch_can_execute(uuid, uuid, uuid) is
  'Returns whether the actor may execute a tenant-scoped Service Visit. Mobile visits require current Field access plus dispatch-management authority or exact canonical assignment; Shop-mode behavior retains the established manager-or-assigned-technician rule.';

revoke all on function public.dispatch_can_execute(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.dispatch_can_execute(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function private.dispatch_lock_service_visit_for_execution(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_visit_id uuid
) returns public.service_visits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_visit public.service_visits%rowtype;
begin
  select visit.*
  into v_visit
  from public.service_visits visit
  where visit.id = p_visit_id
    and visit.shop_id = p_shop_id
    and private.dispatch_visit_actor_can_execute(
      visit.shop_id,
      p_actor_user_id,
      visit.mode,
      visit.assigned_user_id
    )
  for update of visit;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Service visit transition denied.';
  end if;

  return v_visit;
end;
$$;

revoke all on function private.dispatch_lock_service_visit_for_execution(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;

-- A response-loss retry is authorized by the exact durable receipt that the
-- same actor committed for the same visit. This lookup deliberately runs
-- before current-assignment enforcement: reassignment may revoke fresh work,
-- but it must not make an already-committed result unrecoverable.
create or replace function private.dispatch_committed_visit_transition_receipt(
  p_shop_id uuid,
  p_visit_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select operation.result || pg_catalog.jsonb_build_object('idempotent', true)
  from public.scheduler_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'dispatch_visit_transition'
    and operation.operation_key = p_operation_key
    and operation.actor_user_id = public.dispatch_actor_profile_id(
      p_shop_id,
      p_actor_user_id
    )
    and operation.result #>> '{visit,id}' = p_visit_id::text
  limit 1;
$$;

revoke all on function private.dispatch_committed_visit_transition_receipt(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

-- Preserve the established transition contract while making the row lock and
-- assignment decision one atomic operation. Exact committed receipts are
-- recovered first; every fresh operation still reaches the locked current-
-- assignment decision.
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
  v_existing jsonb;
  v_result jsonb;
  v_from text;
  v_to text := lower(trim(coalesce(p_to_status, '')));
  v_allowed boolean := false;
  v_actor_is_manager boolean;
  v_now timestamptz := now();
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Service visit transition denied.';
  end if;

  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  v_existing := private.dispatch_committed_visit_transition_receipt(
    p_shop_id,
    p_visit_id,
    p_actor_user_id,
    p_operation_key
  );
  if v_existing is not null then
    return v_existing;
  end if;

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
      last_status_by = public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id),
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

  v_result := jsonb_build_object('ok', true, 'visit', public.dispatch_visit_snapshot(v_visit.id), 'idempotent', false);
  insert into public.scheduler_operation_keys(shop_id, operation_name, operation_key, actor_user_id, result)
  values (p_shop_id, 'dispatch_visit_transition', p_operation_key,
    public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id), v_result)
  on conflict (shop_id, operation_name, operation_key) do nothing;
  return v_result;
end;
$$;

-- Offline replay uses the same exact-receipt recovery and then the same atomic
-- lock/assignment primitive. Its required version and state checks remain
-- unchanged for fresh operations.
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
  v_existing jsonb;
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

  v_existing := private.dispatch_committed_visit_transition_receipt(
    p_shop_id,
    p_visit_id,
    p_actor_user_id,
    p_operation_key
  );
  if v_existing is not null then
    return v_existing;
  end if;

  select *
  into v_visit
  from private.dispatch_lock_service_visit_for_execution(
    p_shop_id,
    p_actor_user_id,
    p_visit_id
  );

  if lower(trim(coalesce(p_to_status, ''))) in ('working', 'completed')
     and v_visit.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'A linked work order is required before starting or completing repair.';
  end if;

  if v_visit.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'SERVICE_VISIT_VERSION_CHANGED';
  end if;
  if v_visit.status <> lower(p_from_status) then
    raise exception using errcode = '40001', message = 'SERVICE_VISIT_STATE_CHANGED';
  end if;

  return public.dispatch_transition_service_visit_atomic(
    p_shop_id,
    p_visit_id,
    lower(p_to_status),
    null,
    null,
    p_expected_version,
    p_actor_user_id,
    p_operation_key
  );
end;
$$;

do $field_visit_execution_postcheck$
declare
  v_definition text;
  v_actor_definition text;
  v_transition_definition text;
  v_replay_definition text;
begin
  if to_regprocedure('public.dispatch_can_execute(uuid,uuid,uuid)') is null then
    raise exception 'Field visit execution predicate is missing';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.dispatch_can_execute(uuid,uuid,uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  select pg_catalog.pg_get_functiondef(
    'private.dispatch_visit_actor_can_execute(uuid,uuid,text,uuid)'::pg_catalog.regprocedure
  ) into v_actor_definition;

  select pg_catalog.pg_get_functiondef(
    'public.dispatch_transition_service_visit_atomic(uuid,uuid,text,integer,numeric,integer,uuid,text)'::pg_catalog.regprocedure
  ) into v_transition_definition;

  select pg_catalog.pg_get_functiondef(
    'public.mobile_replay_service_visit_transition_atomic(uuid,uuid,text,text,integer,uuid,text)'::pg_catalog.regprocedure
  ) into v_replay_definition;

  if pg_catalog.strpos(
    v_actor_definition,
    'public.mobile_actor_has_field_service_access'
  ) = 0
  or pg_catalog.strpos(v_actor_definition, 'public.dispatch_can_manage') = 0
  or pg_catalog.strpos(v_actor_definition, 'assigned_profile.id = p_assigned_user_id') = 0
  or pg_catalog.strpos(v_actor_definition, $$p_visit_mode <> 'mobile'$$) = 0
  or pg_catalog.strpos(v_definition, 'private.dispatch_visit_actor_can_execute') = 0 then
    raise exception 'Field visit execution invariant is incomplete';
  end if;

  if pg_catalog.strpos(
    v_transition_definition,
    'private.dispatch_lock_service_visit_for_execution'
  ) = 0
  or pg_catalog.strpos(
    v_replay_definition,
    'private.dispatch_lock_service_visit_for_execution'
  ) = 0 then
    raise exception 'Field visit mutations do not lock authorization atomically';
  end if;

  if has_function_privilege(
    'anon',
    'public.dispatch_can_execute(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous Field visit execution probing is unsafe';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.dispatch_can_execute(uuid,uuid,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.dispatch_can_execute(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Established Field execution callers lost predicate access';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.dispatch_visit_actor_can_execute(uuid,uuid,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'service_role',
    'private.dispatch_visit_actor_can_execute(uuid,uuid,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'private.dispatch_lock_service_visit_for_execution(uuid,uuid,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'service_role',
    'private.dispatch_lock_service_visit_for_execution(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Private Field execution helpers remain directly executable';
  end if;
end;
$field_visit_execution_postcheck$;

notify pgrst, 'reload schema';

commit;
