begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- Staff line decisions share UI with portal decisions, but the established
-- compatibility bundle can rewrite an in-progress line. Add a staff-specific
-- adapter that preserves the existing bundle while enforcing a pre-labor
-- boundary under the same row locks used by technician punch transitions.
create or replace function public.apply_staff_line_decision_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_line_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_profile_id uuid;
  v_role text;
  v_line public.work_order_lines%rowtype;
  v_existing_result jsonb;
  v_existing_actor_user_id uuid;
  v_existing_work_order_id uuid;
  v_lock_attempt integer;
  v_result jsonb;
begin
  if v_decision not in ('approve', 'decline') then
    raise exception using
      errcode = '22023',
      message = 'STAFF_LINE_DECISION_INVALID: staff decisions support approve or decline only.';
  end if;

  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'STAFF_LINE_DECISION_OPERATION_KEY_REQUIRED';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'STAFF_LINE_DECISION_FORBIDDEN: authenticated actor mismatch.';
  end if;

  select p.id, lower(trim(coalesce(p.role, '')))
    into v_profile_id, v_role
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;

  if not found or v_role not in ('owner', 'admin', 'manager', 'advisor') then
    raise exception using
      errcode = '42501',
      message = 'STAFF_LINE_DECISION_FORBIDDEN: actor cannot record staff approval decisions.';
  end if;

  -- Exact retries must return the durable compatibility receipt before current
  -- line or labor state is considered. Validate the stored intent so a reused
  -- operation key cannot disclose or replay a different actor, work order,
  -- line, or decision.
  select operation.result, operation.actor_user_id, operation.work_order_id
    into v_existing_result, v_existing_actor_user_id, v_existing_work_order_id
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'approval_compatibility_bundle'
    and operation.operation_key = p_operation_key;

  if found then
    if v_existing_actor_user_id is distinct from v_profile_id
       or v_existing_work_order_id is distinct from p_work_order_id
       or (
         v_decision = 'approve'
         and (
           coalesce(v_existing_result -> 'approvedLineIds', '[]'::jsonb)
             <> jsonb_build_array(p_line_id)
           or coalesce(v_existing_result -> 'declinedLineIds', '[]'::jsonb)
             <> '[]'::jsonb
         )
       )
       or (
         v_decision = 'decline'
         and (
           coalesce(v_existing_result -> 'declinedLineIds', '[]'::jsonb)
             <> jsonb_build_array(p_line_id)
           or coalesce(v_existing_result -> 'approvedLineIds', '[]'::jsonb)
             <> '[]'::jsonb
         )
       )
    then
      raise exception using
        errcode = '23505',
        message = 'STAFF_LINE_DECISION_OPERATION_CONFLICT';
    end if;

    return v_existing_result || jsonb_build_object('idempotent', true);
  end if;

  -- Portal and compatibility decisions lock work order -> lines, while punch
  -- transitions lock line -> work order. Match the approval order, but never
  -- wait for either side while retaining the other: a NOWAIT miss rolls back
  -- this inner subtransaction (and its locks) before a bounded retry. That
  -- keeps approval paths consistent without creating the opposite inversion
  -- against a punch already holding a line.
  for v_lock_attempt in 1..100 loop
    begin
      perform 1
      from public.work_orders wo
      where wo.id = p_work_order_id
        and wo.shop_id = p_shop_id
      for update nowait;

      if not found then
        raise exception using
          errcode = 'P0001',
          message = 'STAFF_LINE_DECISION_NOT_FOUND: work order not found for shop.';
      end if;

      perform 1
      from public.work_order_lines sibling
      where sibling.shop_id = p_shop_id
        and sibling.work_order_id = p_work_order_id
      order by sibling.id
      for update nowait;

      -- pause_all_active_technician_labor_atomic acquires labor segments before
      -- delegating to the line-locking punch RPC. Acquire the same segment set
      -- inside this NOWAIT subtransaction so a miss releases the work-order and
      -- line locks before retrying instead of completing the inverse wait cycle.
      perform 1
      from public.work_order_line_labor_segments seg
      where seg.shop_id = p_shop_id
        and seg.work_order_id = p_work_order_id
      order by seg.id
      for update nowait;

      exit;
    exception
      when lock_not_available then
        if v_lock_attempt = 100 then
          raise exception using
            errcode = '55P03',
            message = 'STAFF_LINE_DECISION_BUSY: approval state is changing; retry the decision.';
        end if;
    end;

    perform pg_sleep(0.02);
  end loop;

  -- A competing decision may have committed while this call was backing off.
  -- Re-read under the canonical resource locks before applying current-state
  -- checks. Because every compatibility mutation needs these same locks, a
  -- missing receipt at this point remains missing until this adapter delegates.
  select operation.result, operation.actor_user_id, operation.work_order_id
    into v_existing_result, v_existing_actor_user_id, v_existing_work_order_id
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'approval_compatibility_bundle'
    and operation.operation_key = p_operation_key;

  if found then
    if v_existing_actor_user_id is distinct from v_profile_id
       or v_existing_work_order_id is distinct from p_work_order_id
       or (
         v_decision = 'approve'
         and (
           coalesce(v_existing_result -> 'approvedLineIds', '[]'::jsonb)
             <> jsonb_build_array(p_line_id)
           or coalesce(v_existing_result -> 'declinedLineIds', '[]'::jsonb)
             <> '[]'::jsonb
         )
       )
       or (
         v_decision = 'decline'
         and (
           coalesce(v_existing_result -> 'declinedLineIds', '[]'::jsonb)
             <> jsonb_build_array(p_line_id)
           or coalesce(v_existing_result -> 'approvedLineIds', '[]'::jsonb)
             <> '[]'::jsonb
         )
       )
    then
      raise exception using
        errcode = '23505',
        message = 'STAFF_LINE_DECISION_OPERATION_CONFLICT';
    end if;

    return v_existing_result || jsonb_build_object('idempotent', true);
  end if;

  select *
    into v_line
  from public.work_order_lines wol
  where wol.id = p_line_id
    and wol.shop_id = p_shop_id
    and wol.work_order_id = p_work_order_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_LINE_DECISION_NOT_FOUND: work-order line not found for shop.';
  end if;

  if v_line.voided_at is not null
     or lower(coalesce(v_line.status::text, '')) in (
       'in_progress', 'completed', 'ready_to_invoice', 'invoiced',
       'voided', 'cancelled', 'canceled'
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_LINE_DECISION_INELIGIBLE: line has already entered labor or a terminal state.';
  end if;

  -- Any recorded segment is durable evidence that technician labor began.
  -- An ended segment (including a manual pause) is just as ineligible as an
  -- active one; decisions must never rewrite state after work was recorded.
  -- The work order's segment set was already locked in the bounded NOWAIT
  -- section above, so this eligibility check cannot wait while retaining line
  -- locks even when pause-all is running concurrently.
  perform 1
  from public.work_order_line_labor_segments seg
  where seg.shop_id = p_shop_id
    and seg.work_order_line_id = p_line_id
  order by seg.id
  for update;

  if found then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_LINE_DECISION_INELIGIBLE: technician labor has already been recorded for this line.';
  end if;

  v_result := public.apply_approval_compatibility_bundle_atomic(
    p_shop_id,
    p_work_order_id,
    null,
    v_profile_id,
    case when v_decision = 'approve' then array[p_line_id]::uuid[] else array[]::uuid[] end,
    case when v_decision = 'decline' then array[p_line_id]::uuid[] else array[]::uuid[] end,
    array[]::uuid[],
    array[]::uuid[],
    null,
    p_operation_key,
    coalesce(p_at, now())
  );

  -- Bind the delegated output to the durable receipt as a final defense. The
  -- legacy bundle can return a pre-existing receipt without validating its
  -- arrays, so this adapter never reports success for mismatched intent even if
  -- another legacy caller path or a future implementation bypasses its locks.
  select operation.result, operation.actor_user_id, operation.work_order_id
    into v_existing_result, v_existing_actor_user_id, v_existing_work_order_id
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'approval_compatibility_bundle'
    and operation.operation_key = p_operation_key;

  if not found
     or v_existing_actor_user_id is distinct from v_profile_id
     or v_existing_work_order_id is distinct from p_work_order_id
     or (
       v_decision = 'approve'
       and (
         coalesce(v_existing_result -> 'approvedLineIds', '[]'::jsonb)
           <> jsonb_build_array(p_line_id)
         or coalesce(v_existing_result -> 'declinedLineIds', '[]'::jsonb)
           <> '[]'::jsonb
       )
     )
     or (
       v_decision = 'decline'
       and (
         coalesce(v_existing_result -> 'declinedLineIds', '[]'::jsonb)
           <> jsonb_build_array(p_line_id)
         or coalesce(v_existing_result -> 'approvedLineIds', '[]'::jsonb)
           <> '[]'::jsonb
       )
     )
  then
    raise exception using
      errcode = '23505',
      message = 'STAFF_LINE_DECISION_OPERATION_CONFLICT';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.apply_staff_line_decision_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) from public, anon;
grant execute on function public.apply_staff_line_decision_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) to authenticated, service_role;

comment on function public.apply_staff_line_decision_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) is
  'Applies an owner/admin/manager/advisor line approval or decline only before labor begins, then delegates to the established approval compatibility bundle.';

notify pgrst, 'reload schema';

commit;
