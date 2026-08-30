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
  -- Keep the provisional argument shape for compatibility, but approval and
  -- rollup timestamps are durable audit evidence and must be server-derived.
  v_now timestamptz := clock_timestamp();
  v_profile_id uuid;
  v_actor_auth_user_id uuid;
  v_locked_actor_auth_user_id uuid;
  v_role text;
  v_line public.work_order_lines%rowtype;
  v_work_order public.work_orders%rowtype;
  v_existing_result jsonb;
  v_existing_actor_user_id uuid;
  v_existing_work_order_id uuid;
  v_lock_attempt integer;
  v_rollup text;
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

  select p.id, coalesce(p.user_id, p.id), lower(trim(coalesce(p.role, '')))
    into v_profile_id, v_actor_auth_user_id, v_role
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;

  -- Mirrors ROLE_GROUPS.quoteAuthorizers at the durable boundary.
  if not found
     or v_role not in (
       'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'
     )
     or not exists (
       select 1 from auth.users actor where actor.id = v_actor_auth_user_id
     )
  then
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
    if v_existing_actor_user_id is distinct from v_actor_auth_user_id
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
      select wo.* into v_work_order
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

      -- Preserve the compatibility engine's work order -> line -> quote-line
      -- lock order before taking the labor-segment guard below.
      perform 1
      from public.work_order_quote_lines quote_line
      where quote_line.shop_id = p_shop_id
        and quote_line.work_order_id = p_work_order_id
      order by quote_line.id
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

      -- Include the actor profile in the same atomic boundary. A concurrent
      -- role/user-link change either completes before this lock and is
      -- revalidated below, or waits until this decision commits.
      select coalesce(profile.user_id, profile.id),
             lower(trim(coalesce(profile.role, '')))
        into v_locked_actor_auth_user_id, v_role
      from public.profiles profile
      where profile.id = v_profile_id
        and profile.shop_id = p_shop_id
      for share nowait;
      if not found
         or v_locked_actor_auth_user_id is distinct from v_actor_auth_user_id
         or v_role not in (
           'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'
         )
      then
        raise exception using
          errcode = '42501',
          message = 'STAFF_LINE_DECISION_FORBIDDEN: actor capability changed before the decision.';
      end if;

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
  -- missing receipt at this point remains missing until this adapter writes it.
  select operation.result, operation.actor_user_id, operation.work_order_id
    into v_existing_result, v_existing_actor_user_id, v_existing_work_order_id
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'approval_compatibility_bundle'
    and operation.operation_key = p_operation_key;

  if found then
    if v_existing_actor_user_id is distinct from v_actor_auth_user_id
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

  if v_work_order.archived_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_ARCHIVED: archived work orders cannot receive staff approval decisions.';
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

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: approval decisions cannot change this work order.';
  end if;

  if lower(coalesce(v_line.approval_state::text, '')) <> 'pending'
     and lower(coalesce(v_line.status::text, '')) not in (
       'awaiting_approval', 'waiting_for_approval'
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_LINE_DECISION_INELIGIBLE: line is no longer approval-pending.';
  end if;

  -- The route performs the same check for an early, friendly response, but
  -- this SECURITY DEFINER function is callable directly. Enforce protected
  -- pricing under the quote-line locks so no client can bypass quarantine.
  if exists (
    select 1
    from public.work_order_quote_lines quote_line
    where quote_line.shop_id = p_shop_id
      and quote_line.work_order_id = p_work_order_id
      and (
        quote_line.work_order_line_id = p_line_id
        or quote_line.source_work_order_line_id = p_line_id
        or quote_line.id = v_line.source_row_id
        or (
          coalesce(v_line.external_id, '') like 'quote_line:%'
          and quote_line.id::text = nullif(
            trim(substr(v_line.external_id, length('quote_line:') + 1)),
            ''
          )
        )
      )
      and quote_line.metadata #> '{parts_quote,pricing_sanitization,customer_pricing_quarantined}'
        = 'true'::jsonb
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_PRICING_QUARANTINED: protected customer pricing requires manual review.';
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

  -- The established compatibility core predates the canonical quote-authorizer
  -- capability and rejects service/foreman internally. Keep that shared core
  -- unchanged: this task-owned adapter applies only its line-decision subset
  -- while preserving the same durable receipt, rollup, attribution, and audit
  -- contract for every canonical quote-authorizer.
  if v_decision = 'approve' then
    update public.work_order_lines
    set approval_state = 'approved',
        status = 'awaiting',
        line_status = 'authorized',
        approval_at = coalesce(approval_at, v_now),
        approval_by = v_profile_id,
        hold_reason = null,
        updated_at = v_now
    where id = p_line_id
      and shop_id = p_shop_id
      and work_order_id = p_work_order_id;
  else
    update public.work_order_lines
    set approval_state = 'declined',
        status = 'on_hold',
        line_status = 'declined',
        approval_at = v_now,
        approval_by = v_profile_id,
        hold_reason = case
          when lower(trim(coalesce(hold_reason, ''))) = 'awaiting parts quote'
            then 'Customer declined'
          else coalesce(nullif(trim(hold_reason), ''), 'Customer declined')
        end,
        updated_at = v_now
    where id = p_line_id
      and shop_id = p_shop_id
      and work_order_id = p_work_order_id;
  end if;

  v_rollup := public.reconcile_work_order_approval_state_atomic(
    p_shop_id,
    p_work_order_id,
    v_actor_auth_user_id,
    v_now
  );

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'workOrderId', p_work_order_id,
    'approvalState', v_rollup,
    'approvedLineIds', case
      when v_decision = 'approve' then jsonb_build_array(p_line_id)
      else '[]'::jsonb
    end,
    'declinedLineIds', case
      when v_decision = 'decline' then jsonb_build_array(p_line_id)
      else '[]'::jsonb
    end,
    'approvedQuoteLineIds', '[]'::jsonb,
    'declinedQuoteLineIds', '[]'::jsonb,
    'quoteApproveResult', '{}'::jsonb,
    'quoteDeclineResult', '{}'::jsonb
  );

  insert into public.quote_lifecycle_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id,
    'approval_compatibility_bundle',
    p_operation_key,
    v_actor_auth_user_id,
    p_work_order_id,
    v_result
  );

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    v_actor_auth_user_id,
    'approval_compatibility_bundle',
    'work_orders',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'customer_id', null,
      'operation_key', p_operation_key,
      'approval_state', v_rollup
    )
  );

  -- Bind the output to the durable receipt as a final defense so this adapter
  -- never reports success for mismatched intent even if another compatibility
  -- caller path or a future implementation bypasses its locks.
  select operation.result, operation.actor_user_id, operation.work_order_id
    into v_existing_result, v_existing_actor_user_id, v_existing_work_order_id
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'approval_compatibility_bundle'
    and operation.operation_key = p_operation_key;

  if not found
     or v_existing_actor_user_id is distinct from v_actor_auth_user_id
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

-- Public technician punches must make assignment authorization and the
-- canonical mutation one transaction. The established punch function remains
-- unchanged for compatibility callers; this adapter is an explicit opt-in.
create or replace function public.apply_assigned_job_punch_transition_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_action text,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_allow_concurrent boolean default false,
  p_at timestamptz default now(),
  p_start_source text default null,
  p_hold_reason text default null,
  p_notes text default null,
  p_preserve_line_status boolean default false,
  p_release_to_awaiting boolean default false,
  p_cause text default null,
  p_correction text default null,
  p_event text default null,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_profile_id uuid;
  v_auth_user_id uuid;
  v_role text;
  v_locked_auth_user_id uuid;
  v_locked_role text;
  v_line public.work_order_lines%rowtype;
  v_replay boolean := false;
  v_has_active_segment boolean := false;
  v_has_any_active_segment boolean := false;
  v_lock_attempt integer;
begin
  if v_action not in ('start', 'resume', 'pause', 'finish') then
    raise exception using errcode = '22023', message = 'Unsupported job punch action.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'A stable operation key is required.';
  end if;

  select profile.id,
         coalesce(profile.user_id, profile.id),
         lower(trim(coalesce(profile.role, '')))
    into v_profile_id, v_auth_user_id, v_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_technician_id or profile.user_id = p_technician_id)
  order by case when profile.id = p_technician_id then 0 else 1 end
  limit 1;
  if not found
     or v_role not in (
       'owner', 'admin', 'manager', 'mechanic', 'tech', 'technician',
       'lead_hand', 'lead hand', 'leadhand', 'foreman'
     )
     or p_actor_user_id not in (v_profile_id, v_auth_user_id)
     or (
       coalesce(auth.role(), '') <> 'service_role'
       and not public.scheduler_actor_matches(v_auth_user_id)
     )
  then
    raise exception using
      errcode = '42501',
      message = 'ASSIGNED_JOB_PUNCH_FORBIDDEN: actor cannot perform assigned work.';
  end if;

  -- Preserve canonical replay semantics even if assignment changed after the
  -- original command committed. A replay locks only the profile before
  -- delegating; the canonical receipt path returns without requesting the line,
  -- so it cannot invert the assignment function's line -> profile order.
  select exists (
    select 1
    from public.workforce_operation_keys operation
    where operation.shop_id = p_shop_id
      and operation.operation_name = 'job_punch:' || v_action
      and operation.operation_key = p_operation_key
  ) into v_replay;

  if v_replay then
    select coalesce(profile.user_id, profile.id),
           lower(trim(coalesce(profile.role, '')))
      into v_locked_auth_user_id, v_locked_role
    from public.profiles profile
    where profile.id = v_profile_id
      and profile.shop_id = p_shop_id
    for update;
    if not found
       or v_locked_auth_user_id is distinct from v_auth_user_id
       or v_locked_role not in (
         'owner', 'admin', 'manager', 'mechanic', 'tech', 'technician',
         'lead_hand', 'lead hand', 'leadhand', 'foreman'
       )
       or p_actor_user_id not in (v_profile_id, v_locked_auth_user_id)
       or (
         coalesce(auth.role(), '') <> 'service_role'
         and not public.scheduler_actor_matches(v_locked_auth_user_id)
       )
    then
      raise exception using
        errcode = '42501',
        message = 'ASSIGNED_JOB_PUNCH_FORBIDDEN: actor capability changed before replay.';
    end if;

    return public.apply_job_punch_transition_atomic(
      p_shop_id => p_shop_id,
      p_work_order_line_id => p_work_order_line_id,
      p_action => p_action,
      p_technician_id => p_technician_id,
      p_actor_user_id => p_actor_user_id,
      p_operation_key => p_operation_key,
      p_allow_concurrent => p_allow_concurrent,
      p_at => p_at,
      p_start_source => p_start_source,
      p_hold_reason => p_hold_reason,
      p_notes => p_notes,
      p_preserve_line_status => p_preserve_line_status,
      p_release_to_awaiting => p_release_to_awaiting,
      p_cause => p_cause,
      p_correction => p_correction,
      p_event => p_event,
      p_details => p_details
    );
  end if;

  -- Assignment commands lock line -> technician profile. Use that same order,
  -- then acquire the parent and active-segment evidence inside the same bounded
  -- NOWAIT subtransaction. A miss rolls back every lock before retrying, which
  -- avoids inversions with profile-first compatibility punches, parent-first
  -- portal decisions, and segment-first coordinated labor workflows.
  for v_lock_attempt in 1..100 loop
    begin
      select * into v_line
      from public.work_order_lines line
      where line.id = p_work_order_line_id
        and line.shop_id = p_shop_id
      for update nowait;
      if not found then
        raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
      end if;

      select coalesce(profile.user_id, profile.id),
             lower(trim(coalesce(profile.role, '')))
        into v_locked_auth_user_id, v_locked_role
      from public.profiles profile
      where profile.id = v_profile_id
        and profile.shop_id = p_shop_id
      for update nowait;
      if not found
         or v_locked_auth_user_id is distinct from v_auth_user_id
         or v_locked_role not in (
           'owner', 'admin', 'manager', 'mechanic', 'tech', 'technician',
           'lead_hand', 'lead hand', 'leadhand', 'foreman'
         )
         or p_actor_user_id not in (v_profile_id, v_locked_auth_user_id)
         or (
           coalesce(auth.role(), '') <> 'service_role'
           and not public.scheduler_actor_matches(v_locked_auth_user_id)
         )
      then
        raise exception using
          errcode = '42501',
          message = 'ASSIGNED_JOB_PUNCH_FORBIDDEN: actor capability changed before the punch.';
      end if;

      perform 1
      from public.work_orders work_order
      where work_order.id = v_line.work_order_id
        and work_order.shop_id = p_shop_id
      for update nowait;
      if not found then
        raise exception using errcode = 'P0001', message = 'Parent work order not found for shop.';
      end if;

      -- Pre-lock the canonical RPC's complete segment set: every segment on
      -- this line plus any other active segment owned by the actor. This keeps
      -- supporting-technician and coordinated shift workflows inside the same
      -- bounded deadlock-avoidance boundary for every action.
      perform 1
      from public.work_order_line_labor_segments segment
      where segment.shop_id = p_shop_id
        and (
          segment.work_order_line_id = p_work_order_line_id
          or (
            segment.technician_id = v_profile_id
            and segment.ended_at is null
          )
        )
      order by segment.id
      for update nowait;

      select exists (
        select 1
        from public.work_order_line_labor_segments segment
        where segment.shop_id = p_shop_id
          and segment.work_order_line_id = p_work_order_line_id
          and segment.technician_id = v_profile_id
          and segment.ended_at is null
      ) into v_has_active_segment;

      select exists (
        select 1
        from public.work_order_line_labor_segments segment
        where segment.shop_id = p_shop_id
          and segment.work_order_line_id = p_work_order_line_id
          and segment.ended_at is null
      ) into v_has_any_active_segment;

      -- Inspection finding submission can enter inspection -> parent -> line,
      -- while canonical finish enters line -> parent -> inspection. Include the
      -- canonical inspection row in this NOWAIT attempt so either order backs
      -- off without retaining the inverse side.
      if v_action = 'finish' then
        perform 1
        from public.inspections inspection
        where inspection.work_order_line_id = p_work_order_line_id
          and inspection.is_canonical
        order by inspection.id
        for update nowait;
      end if;

      exit;
    exception
      when lock_not_available then
        if v_lock_attempt = 100 then
          raise exception using
            errcode = '55P03',
            message = 'ASSIGNED_JOB_PUNCH_BUSY: assignment state is changing; retry the punch.';
        end if;
    end;

    perform pg_sleep(0.02);
  end loop;

  -- A matching command may have committed while this transaction backed off.
  -- Replay it under the line/profile locks before rechecking assignment state.
  if exists (
    select 1
    from public.workforce_operation_keys operation
    where operation.shop_id = p_shop_id
      and operation.operation_name = 'job_punch:' || v_action
      and operation.operation_key = p_operation_key
  ) then
    return public.apply_job_punch_transition_atomic(
      p_shop_id => p_shop_id,
      p_work_order_line_id => p_work_order_line_id,
      p_action => p_action,
      p_technician_id => p_technician_id,
      p_actor_user_id => p_actor_user_id,
      p_operation_key => p_operation_key,
      p_allow_concurrent => p_allow_concurrent,
      p_at => p_at,
      p_start_source => p_start_source,
      p_hold_reason => p_hold_reason,
      p_notes => p_notes,
      p_preserve_line_status => p_preserve_line_status,
      p_release_to_awaiting => p_release_to_awaiting,
      p_cause => p_cause,
      p_correction => p_correction,
      p_event => p_event,
      p_details => p_details
    );
  end if;

  if not (
    v_line.assigned_tech_id = v_profile_id
    or exists (
      select 1
      from public.work_order_line_technicians assignment
      where assignment.work_order_line_id = p_work_order_line_id
        and assignment.technician_id = v_profile_id
    )
    or (
      v_line.assigned_tech_id is null
      and v_line.assigned_to = v_profile_id
      and not exists (
        select 1
        from public.work_order_line_technicians assignment
        where assignment.work_order_line_id = p_work_order_line_id
      )
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Technician is not assigned to this work-order line.';
  end if;

  if v_action = 'pause' and not v_has_active_segment then
    raise exception using
      errcode = 'P0001',
      message = 'Technician has no active labor segment on this line to pause or finish.';
  end if;

  -- Standalone completion historically supports an assigned, inactive line.
  -- If any active labor does exist, however, the actor must own an active
  -- segment so action-specific authorization cannot race outside this lock set.
  if v_action = 'finish'
     and v_has_any_active_segment
     and not v_has_active_segment
  then
    raise exception using
      errcode = 'P0001',
      message = 'Technician has no active labor segment on this line to pause or finish.';
  end if;

  return public.apply_job_punch_transition_atomic(
    p_shop_id => p_shop_id,
    p_work_order_line_id => p_work_order_line_id,
    p_action => p_action,
    p_technician_id => p_technician_id,
    p_actor_user_id => p_actor_user_id,
    p_operation_key => p_operation_key,
    p_allow_concurrent => p_allow_concurrent,
    p_at => p_at,
    p_start_source => p_start_source,
    p_hold_reason => p_hold_reason,
    p_notes => p_notes,
    p_preserve_line_status => p_preserve_line_status,
    p_release_to_awaiting => p_release_to_awaiting,
    p_cause => p_cause,
    p_correction => p_correction,
    p_event => p_event,
    p_details => p_details
  );
end;
$function$;

-- Sending an approval-pending line to parts is a manager workflow, not a
-- technician labor pause. Keep it out of the canonical punch function while
-- making the pre-labor assertion and hold mutation one locked transaction.
create or replace function public.apply_pre_labor_parts_quote_hold_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz default now(),
  p_hold_reason text default 'Awaiting parts quote',
  p_notes text default null,
  p_event text default null,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  -- This timestamp is durable audit evidence. Keep the legacy-shaped argument
  -- for client compatibility, but never trust a caller-supplied occurrence time.
  v_now timestamptz := clock_timestamp();
  v_profile_id uuid;
  v_actor_auth_user_id uuid;
  v_locked_actor_auth_user_id uuid;
  v_role text;
  v_line public.work_order_lines%rowtype;
  v_work_order public.work_orders%rowtype;
  v_existing_result jsonb;
  v_existing_actor_user_id uuid;
  v_existing_line_id uuid;
  v_lock_attempt integer;
  v_result jsonb;
begin
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'A stable operation key is required.';
  end if;
  if lower(trim(coalesce(p_hold_reason, ''))) <> 'awaiting parts quote' then
    raise exception using errcode = '22023', message = 'A parts-quote hold requires the canonical hold reason.';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'PARTS_QUOTE_HOLD_FORBIDDEN: authenticated actor mismatch.';
  end if;

  select profile.id, coalesce(profile.user_id, profile.id), lower(trim(coalesce(profile.role, '')))
    into v_profile_id, v_actor_auth_user_id, v_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
  order by case when profile.id = p_actor_user_id then 0 else 1 end
  limit 1;

  if not found
     or v_role not in ('owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman')
     or not exists (select 1 from auth.users actor where actor.id = v_actor_auth_user_id)
  then
    raise exception using errcode = '42501', message = 'PARTS_QUOTE_HOLD_FORBIDDEN: actor cannot manage work orders.';
  end if;

  select operation.result, operation.actor_user_id, operation.work_order_line_id
    into v_existing_result, v_existing_actor_user_id, v_existing_line_id
  from public.workforce_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'pre_labor_parts_quote_hold'
    and operation.operation_key = p_operation_key;
  if found then
    if v_existing_actor_user_id is distinct from v_actor_auth_user_id
       or v_existing_line_id is distinct from p_work_order_line_id then
      raise exception using errcode = '23505', message = 'JOB_PUNCH_OPERATION_CONFLICT';
    end if;
    return v_existing_result || jsonb_build_object('idempotent', true);
  end if;

  -- Portal decisions lock work order -> line, while canonical punches lock
  -- line -> work order. Use the approval order with bounded NOWAIT retries so
  -- a punch already holding the line can acquire its parent instead of forming
  -- the opposite wait cycle. A failed inner attempt releases every lock it
  -- acquired before the next retry.
  for v_lock_attempt in 1..100 loop
    begin
      select work_order.* into v_work_order
      from public.work_orders work_order
      where work_order.id = (
        select candidate.work_order_id
        from public.work_order_lines candidate
        where candidate.id = p_work_order_line_id
          and candidate.shop_id = p_shop_id
      )
        and work_order.shop_id = p_shop_id
      for update nowait;
      if not found then
        raise exception using errcode = 'P0001', message = 'Parent work order not found for shop.';
      end if;
      if v_work_order.archived_at is not null then
        raise exception using errcode = 'P0001', message = 'WORK_ORDER_ARCHIVED: archived work orders cannot be sent to parts.';
      end if;

      select * into v_line
      from public.work_order_lines line
      where line.id = p_work_order_line_id
        and line.shop_id = p_shop_id
      for update nowait;
      if not found then
        raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
      end if;

      perform 1
      from public.work_order_line_labor_segments segment
      where segment.shop_id = p_shop_id
        and segment.work_order_line_id = p_work_order_line_id
      order by segment.id
      for update nowait;

      select coalesce(profile.user_id, profile.id),
             lower(trim(coalesce(profile.role, '')))
        into v_locked_actor_auth_user_id, v_role
      from public.profiles profile
      where profile.id = v_profile_id
        and profile.shop_id = p_shop_id
      for share nowait;
      if not found
         or v_locked_actor_auth_user_id is distinct from v_actor_auth_user_id
         or v_role not in (
           'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
         )
      then
        raise exception using
          errcode = '42501',
          message = 'PARTS_QUOTE_HOLD_FORBIDDEN: actor capability changed before the hold.';
      end if;

      exit;
    exception
      when lock_not_available then
        if v_lock_attempt = 100 then
          raise exception using
            errcode = '55P03',
            message = 'PARTS_QUOTE_HOLD_BUSY: line state is changing; retry the hold.';
        end if;
    end;

    perform pg_sleep(0.02);
  end loop;

  -- A matching call may have committed while this transaction waited for the
  -- resource locks. Re-read its receipt before evaluating the new line state.
  select operation.result, operation.actor_user_id, operation.work_order_line_id
    into v_existing_result, v_existing_actor_user_id, v_existing_line_id
  from public.workforce_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'pre_labor_parts_quote_hold'
    and operation.operation_key = p_operation_key;
  if found then
    if v_existing_actor_user_id is distinct from v_actor_auth_user_id
       or v_existing_line_id is distinct from p_work_order_line_id then
      raise exception using errcode = '23505', message = 'JOB_PUNCH_OPERATION_CONFLICT';
    end if;
    return v_existing_result || jsonb_build_object('idempotent', true);
  end if;

  -- The line lock serializes against start/resume, and the segment lock set
  -- makes durable labor evidence part of this same eligibility decision.
  if exists (
    select 1 from public.work_order_line_labor_segments segment
    where segment.shop_id = p_shop_id
      and segment.work_order_line_id = p_work_order_line_id
  ) then
    raise exception using errcode = 'P0001', message = 'A line with recorded labor cannot be sent to parts as pre-labor work.';
  end if;
  if v_line.voided_at is not null
     or lower(coalesce(v_line.status::text, '')) in (
       'completed', 'ready_to_invoice', 'invoiced',
       'voided', 'cancelled', 'canceled'
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'A voided or terminal line cannot be sent to parts.';
  end if;
  if lower(coalesce(v_line.approval_state::text, '')) <> 'pending'
     and lower(coalesce(v_line.status::text, '')) not in ('awaiting_approval', 'waiting_for_approval') then
    raise exception using errcode = 'P0001', message = 'Only a pre-labor approval-pending line can be sent to parts.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, v_line.work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: job labor cannot change after invoice finalization.';
  end if;

  update public.work_order_lines
  set status = 'on_hold',
      hold_reason = 'Awaiting parts quote',
      notes = coalesce(p_notes, notes),
      updated_at = v_now
  where id = p_work_order_line_id
    and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'action', 'pause',
    'shop_id', p_shop_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'technician_id', v_profile_id,
    'shift_id', null,
    'labor_segment_id', null,
    'closed_segment_count', 0,
    'line', (select to_jsonb(line) from public.work_order_lines line where line.id = p_work_order_line_id)
  );

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    'parts_quote_hold',
    v_actor_auth_user_id,
    v_now,
    'work_order_line',
    p_work_order_line_id,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
      'shop_id', p_shop_id,
      'work_order_id', v_line.work_order_id,
      'technician_id', v_profile_id,
      'shift_id', null,
      'operation_key', p_operation_key,
      'transition_intent', 'parts_quote_hold'
    )
  );

  insert into public.workforce_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id,
    work_order_id, work_order_line_id, result
  ) values (
    p_shop_id, 'pre_labor_parts_quote_hold', p_operation_key, v_actor_auth_user_id,
    v_line.work_order_id, p_work_order_line_id, v_result
  );

  return v_result;
end;
$function$;

create or replace function private.normalize_declined_parts_quote_hold_reason()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if lower(coalesce(new.approval_state::text, '')) = 'declined'
     and lower(trim(coalesce(new.hold_reason, ''))) = 'awaiting parts quote'
  then
    new.hold_reason := 'Customer declined';
  end if;
  return new;
end;
$function$;

revoke all on function private.normalize_declined_parts_quote_hold_reason()
from public, anon, authenticated, service_role;

create trigger normalize_declined_parts_quote_hold_reason
before update of approval_state, hold_reason on public.work_order_lines
for each row
when (new.hold_reason is not null)
execute function private.normalize_declined_parts_quote_hold_reason();

revoke all on function public.apply_staff_line_decision_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) from public, anon;
grant execute on function public.apply_staff_line_decision_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) to authenticated, service_role;

comment on function public.apply_staff_line_decision_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) is
  'Applies a canonical quote-authorizer line approval or decline only before labor begins while preserving the established compatibility receipt, rollup, attribution, and audit contract.';

revoke all on function public.apply_pre_labor_parts_quote_hold_atomic(
  uuid, uuid, uuid, text, timestamptz, text, text, text, jsonb
) from public, anon;
grant execute on function public.apply_pre_labor_parts_quote_hold_atomic(
  uuid, uuid, uuid, text, timestamptz, text, text, text, jsonb
) to authenticated, service_role;

comment on function public.apply_pre_labor_parts_quote_hold_atomic(
  uuid, uuid, uuid, text, timestamptz, text, text, text, jsonb
) is
  'Atomically places an approval-pending, never-worked line on the canonical parts-quote hold for an authorized work-order manager.';

revoke all on function public.apply_assigned_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) from public, anon;
grant execute on function public.apply_assigned_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) to authenticated, service_role;

comment on function public.apply_assigned_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) is
  'Serializes assigned-work authorization on the line before delegating to the unchanged canonical job-punch transition.';

notify pgrst, 'reload schema';

commit;
