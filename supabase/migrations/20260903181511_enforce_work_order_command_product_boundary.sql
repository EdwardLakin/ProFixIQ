begin;

-- Keep the established punch implementation and signature intact, but place a
-- product/resource guard in front of every authenticated direct call. Exact
-- committed receipts remain replayable before current authorization is read.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter function public.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) set schema private;

alter function private.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) rename to apply_job_punch_transition_product_core;

revoke all on function private.apply_job_punch_transition_product_core(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) from public, anon, authenticated, service_role;

create function public.apply_job_punch_transition_atomic(
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
set search_path = ''
as $function$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_profile_id uuid;
  v_auth_user_id uuid;
  v_role text;
  v_line public.work_order_lines%rowtype;
  v_visit_id uuid;
  v_shop_entitled boolean := false;
  v_field_entitled boolean := false;
  v_can_manage_field_work boolean := false;
  v_lock_attempt integer;
begin
  if v_action not in ('start', 'resume', 'pause', 'finish') then
    raise exception using errcode = '22023', message = 'Unsupported job punch action.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'A stable operation key is required.';
  end if;

  -- A committed operation is immutable history. Delegate immediately so the
  -- established core can perform its actor/line conflict validation without
  -- consulting current product, visit, or assignment state.
  if exists (
    select 1
    from public.workforce_operation_keys operation
    where operation.shop_id = p_shop_id
      and operation.operation_name = 'job_punch:' || v_action
      and operation.operation_key = p_operation_key
  ) then
    return private.apply_job_punch_transition_product_core(
      p_shop_id, p_work_order_line_id, p_action, p_technician_id,
      p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
      p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
      p_release_to_awaiting, p_cause, p_correction, p_event, p_details
    );
  end if;

  -- Trusted server workflows already establish their own boundary and use the
  -- service role. Preserve break/lunch recovery and other internal callers.
  if coalesce(auth.role(), '') = 'service_role' then
    return private.apply_job_punch_transition_product_core(
      p_shop_id, p_work_order_line_id, p_action, p_technician_id,
      p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
      p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
      p_release_to_awaiting, p_cause, p_correction, p_event, p_details
    );
  end if;

  -- Bind the actor to a canonical Shop profile. Customer, Fleet-only, and
  -- unknown relationships cannot become Work Order mutation authority. The
  -- established inner function remains responsible for action-specific role
  -- checks, so ordinary Shop Hold/Remove-Hold behavior is not narrowed here.
  select profile.id,
         coalesce(profile.user_id, profile.id),
         public.canonical_shop_membership_role(profile.role::text)
    into v_profile_id, v_auth_user_id, v_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_technician_id or profile.user_id = p_technician_id)
  order by case when profile.id = p_technician_id then 0 else 1 end
  limit 1;

  if not found
     or v_role is null
     or v_role not in (
       'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
       'mechanic', 'lead_hand', 'foreman'
     )
     or p_actor_user_id not in (v_profile_id, v_auth_user_id)
     or not public.scheduler_actor_matches(v_auth_user_id)
  then
    raise exception using
      errcode = '42501',
      message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: actor cannot execute Work Order commands.';
  end if;

  v_can_manage_field_work :=
    v_role in ('owner', 'admin', 'manager', 'advisor', 'lead_hand', 'foreman');

  -- Match the canonical line -> profile -> parent order used by assignment and
  -- punch mutations, then lock the qualifying Field visit before delegating.
  -- Dispatch reassignment/cancellation must therefore finish before this fresh
  -- authorization decision, and cannot race the following punch mutation.
  for v_lock_attempt in 1..100 loop
    begin
      select line.* into v_line
      from public.work_order_lines line
      where line.id = p_work_order_line_id
        and line.shop_id = p_shop_id
      for update nowait;
      if not found then
        raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
      end if;

      -- A peer request may have committed while this attempt waited for the
      -- line lock. Replay it before reading mutable authorization state.
      if exists (
        select 1
        from public.workforce_operation_keys operation
        where operation.shop_id = p_shop_id
          and operation.operation_name = 'job_punch:' || v_action
          and operation.operation_key = p_operation_key
      ) then
        return private.apply_job_punch_transition_product_core(
          p_shop_id, p_work_order_line_id, p_action, p_technician_id,
          p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
          p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
          p_release_to_awaiting, p_cause, p_correction, p_event, p_details
        );
      end if;

      perform 1
      from public.profiles profile
      where profile.id = v_profile_id
        and profile.shop_id = p_shop_id
        and coalesce(profile.user_id, profile.id) = v_auth_user_id
        and public.canonical_shop_membership_role(profile.role::text) = v_role
      for update nowait;
      if not found or not public.scheduler_actor_matches(v_auth_user_id) then
        raise exception using
          errcode = '42501',
          message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: actor capability changed before the command.';
      end if;

      perform 1
      from public.work_orders work_order
      where work_order.id = v_line.work_order_id
        and work_order.shop_id = p_shop_id
      for update nowait;
      if not found then
        raise exception using errcode = 'P0001', message = 'Parent work order not found for shop.';
      end if;

      v_shop_entitled := public.profixiq_shop_has_product_access(
        p_shop_id,
        'shop'
      );

      if v_shop_entitled is not true then
        if v_role not in (
          'owner', 'admin', 'manager', 'advisor',
          'mechanic', 'lead_hand', 'foreman'
        ) then
          raise exception using
            errcode = '42501',
            message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: actor cannot execute Field Work Order commands.';
        end if;

        v_field_entitled := public.mobile_profile_has_field_service_access(
          p_shop_id,
          v_profile_id
        );
        if v_field_entitled is not true then
          raise exception using
            errcode = '42501',
            message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: Shop entitlement or Field access is required.';
        end if;

        perform 1
        from public.work_order_line_technicians assignment
        where assignment.work_order_line_id = p_work_order_line_id
        order by assignment.id
        for update nowait;

        perform 1
        from public.work_order_line_labor_segments segment
        where segment.shop_id = p_shop_id
          and segment.work_order_line_id = p_work_order_line_id
        order by segment.id
        for update nowait;

        select visit.id into v_visit_id
        from public.service_visits visit
        where visit.shop_id = p_shop_id
          and visit.work_order_id = v_line.work_order_id
          and visit.mode = 'mobile'
          and visit.status in (
            'scheduled', 'dispatched', 'en_route',
            'arrived', 'working', 'paused'
          )
          and (
            v_can_manage_field_work
            or visit.assigned_user_id = v_profile_id
          )
        order by visit.id
        limit 1
        for update nowait;
        if not found then
          raise exception using
            errcode = '42501',
            message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: an active linked Field visit is required.';
        end if;

        if not v_can_manage_field_work and (
          v_line.assigned_tech_id = v_profile_id
          or exists (
            select 1 from public.work_order_line_technicians assignment
            where assignment.work_order_line_id = p_work_order_line_id
              and assignment.technician_id = v_profile_id
          )
          or (
            v_line.assigned_tech_id is null
            and v_line.assigned_to = v_profile_id
            and not exists (
              select 1 from public.work_order_line_technicians assignment
              where assignment.work_order_line_id = p_work_order_line_id
            )
          )
          or exists (
            select 1 from public.work_order_line_labor_segments segment
            where segment.shop_id = p_shop_id
              and segment.work_order_line_id = p_work_order_line_id
              and segment.technician_id = v_profile_id
              and segment.ended_at is null
          )
        ) is not true then
          raise exception using
            errcode = '42501',
            message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: Field technician lacks authority for this line.';
        end if;
      end if;

      exit;
    exception
      when lock_not_available then
        -- The contending request may have committed its receipt before its
        -- locks became visible as available. Preserve unknown-outcome replay.
        if exists (
          select 1
          from public.workforce_operation_keys operation
          where operation.shop_id = p_shop_id
            and operation.operation_name = 'job_punch:' || v_action
            and operation.operation_key = p_operation_key
        ) then
          return private.apply_job_punch_transition_product_core(
            p_shop_id, p_work_order_line_id, p_action, p_technician_id,
            p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
            p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
            p_release_to_awaiting, p_cause, p_correction, p_event, p_details
          );
        end if;
        if v_lock_attempt = 100 then
          raise exception using
            errcode = '55P03',
            message = 'WORK_ORDER_PRODUCT_ACCESS_BUSY: command authority is changing; retry the command.';
        end if;
    end;

    perform pg_sleep(0.02);
  end loop;

  -- The original public function remains the canonical assignment, approval,
  -- active-segment, locking, mutation, and receipt implementation.
  return private.apply_job_punch_transition_product_core(
    p_shop_id, p_work_order_line_id, p_action, p_technician_id,
    p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
    p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
    p_release_to_awaiting, p_cause, p_correction, p_event, p_details
  );
end;
$function$;

-- Shared only by the compatibility wrappers below. Callers retain their
-- existing role/assignment checks; this helper adds the missing product gate
-- and holds a qualifying Field visit through the delegated mutation.
create function private.work_order_command_product_access_locked(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_profile_id uuid,
  p_actor_user_id uuid,
  p_lock_parent_first boolean default false,
  p_lock_segments boolean default false
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line_work_order_id uuid;
  v_visit_id uuid;
  v_auth_user_id uuid;
  v_role text;
  v_lock_attempt integer;
begin
  -- Take every authorization lock in the mutation's established order inside
  -- one retryable subtransaction. A failed NOWAIT attempt releases the entire
  -- attempt before backoff, avoiding a retained profile-vs-line inversion.
  for v_lock_attempt in 1..100 loop
    begin
      if p_lock_parent_first then
        select work_order.id into v_line_work_order_id
        from public.work_orders work_order
        where work_order.id = (
          select line.work_order_id
          from public.work_order_lines line
          where line.id = p_work_order_line_id
            and line.shop_id = p_shop_id
        )
          and work_order.shop_id = p_shop_id
        for update nowait;
        if not found then
          return false;
        end if;
      end if;

      select line.work_order_id into v_line_work_order_id
      from public.work_order_lines line
      where line.id = p_work_order_line_id
        and line.shop_id = p_shop_id
      for update nowait;
      if not found then
        return false;
      end if;

      if p_lock_segments then
        perform 1
        from public.work_order_line_labor_segments segment
        where segment.shop_id = p_shop_id
          and segment.work_order_line_id = p_work_order_line_id
        order by segment.id
        for update nowait;
      end if;

      select coalesce(profile.user_id, profile.id),
             public.canonical_shop_membership_role(profile.role::text)
        into v_auth_user_id, v_role
      from public.profiles profile
      where profile.id = p_profile_id
        and profile.shop_id = p_shop_id
      for update nowait;
      if not found
         or p_actor_user_id not in (p_profile_id, v_auth_user_id)
      then
        return false;
      end if;

      if public.profixiq_shop_has_product_access(p_shop_id, 'shop') is true then
        return true;
      end if;
      if v_role is null
         or v_role not in (
           'owner', 'admin', 'manager', 'advisor',
           'mechanic', 'lead_hand', 'foreman'
         )
         or public.mobile_profile_has_field_service_access(
           p_shop_id,
           p_profile_id
         ) is not true
      then
        return false;
      end if;

      select visit.id into v_visit_id
      from public.service_visits visit
      where visit.shop_id = p_shop_id
        and visit.work_order_id = v_line_work_order_id
        and visit.mode = 'mobile'
        and visit.status in (
          'scheduled', 'dispatched', 'en_route',
          'arrived', 'working', 'paused'
        )
        and (
          v_role in ('owner', 'admin', 'manager', 'advisor', 'lead_hand', 'foreman')
          or visit.assigned_user_id = p_profile_id
        )
      order by visit.id
      limit 1
      for update nowait;
      return found;
    exception
      when lock_not_available then
        if v_lock_attempt = 100 then
          raise exception using
            errcode = '55P03',
            message = 'WORK_ORDER_PRODUCT_ACCESS_BUSY: command authority is changing; retry the command.';
        end if;
    end;

    perform pg_sleep(0.02);
  end loop;

  return false;
end;
$function$;

revoke all on function private.work_order_command_product_access_locked(
  uuid, uuid, uuid, uuid, boolean, boolean
) from public, anon, authenticated, service_role;

-- The specialized pre-labor parts Hold is a parallel public mutation. Keep
-- its locked implementation and signature, adding only the product wrapper.
alter function public.apply_pre_labor_parts_quote_hold_atomic(
  uuid, uuid, uuid, text, timestamptz, text, text, text, jsonb, timestamptz
) set schema private;
alter function private.apply_pre_labor_parts_quote_hold_atomic(
  uuid, uuid, uuid, text, timestamptz, text, text, text, jsonb, timestamptz
) rename to apply_pre_labor_parts_quote_hold_product_core;
revoke all on function private.apply_pre_labor_parts_quote_hold_product_core(
  uuid, uuid, uuid, text, timestamptz, text, text, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;

create function public.apply_pre_labor_parts_quote_hold_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz default now(),
  p_hold_reason text default 'Awaiting parts quote',
  p_notes text default null,
  p_event text default null,
  p_details jsonb default '{}'::jsonb,
  p_expected_line_updated_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_auth_user_id uuid;
begin
  if exists (
    select 1 from public.workforce_operation_keys operation
    where operation.shop_id = p_shop_id
      and operation.operation_name = 'pre_labor_parts_quote_hold'
      and operation.operation_key = p_operation_key
  ) or coalesce(auth.role(), '') = 'service_role' then
    return private.apply_pre_labor_parts_quote_hold_product_core(
      p_shop_id, p_work_order_line_id, p_actor_user_id, p_operation_key,
      p_at, p_hold_reason, p_notes, p_event, p_details, p_expected_line_updated_at
    );
  end if;

  select profile.id, coalesce(profile.user_id, profile.id)
    into v_profile_id, v_auth_user_id
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
  order by case when profile.id = p_actor_user_id then 0 else 1 end
  limit 1;

  if not found
     or p_actor_user_id not in (v_profile_id, v_auth_user_id)
     or not public.scheduler_actor_matches(v_auth_user_id)
  then
    raise exception using
      errcode = '42501',
      message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: actor cannot place a parts-quote Hold.';
  end if;

  if not private.work_order_command_product_access_locked(
    p_shop_id, p_work_order_line_id, v_profile_id, p_actor_user_id,
    true, true
  ) then
    -- Preserve a receipt that committed while the lock helper retried.
    if exists (
      select 1 from public.workforce_operation_keys operation
      where operation.shop_id = p_shop_id
        and operation.operation_name = 'pre_labor_parts_quote_hold'
        and operation.operation_key = p_operation_key
    ) then
      return private.apply_pre_labor_parts_quote_hold_product_core(
        p_shop_id, p_work_order_line_id, p_actor_user_id, p_operation_key,
        p_at, p_hold_reason, p_notes, p_event, p_details, p_expected_line_updated_at
      );
    end if;
    raise exception using
      errcode = '42501',
      message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: actor cannot place a parts-quote Hold.';
  end if;

  return private.apply_pre_labor_parts_quote_hold_product_core(
    p_shop_id, p_work_order_line_id, p_actor_user_id, p_operation_key,
    p_at, p_hold_reason, p_notes, p_event, p_details, p_expected_line_updated_at
  );
end;
$function$;

-- CoPilot reaches a revoked adapter through a service-role bridge, so it must
-- enforce the user-derived product boundary without the public bypass.
alter function private.apply_technician_copilot_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) rename to apply_technician_copilot_job_punch_transition_product_core;
revoke all on function private.apply_technician_copilot_job_punch_transition_product_core(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) from public, anon, authenticated, service_role;

create function private.apply_technician_copilot_job_punch_transition_atomic(
  p_shop_id uuid, p_work_order_line_id uuid, p_action text,
  p_technician_id uuid, p_actor_user_id uuid, p_operation_key text,
  p_allow_concurrent boolean default false, p_at timestamptz default now(),
  p_start_source text default null, p_hold_reason text default null,
  p_notes text default null, p_preserve_line_status boolean default false,
  p_release_to_awaiting boolean default false, p_cause text default null,
  p_correction text default null, p_event text default null,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_profile_id uuid;
  v_auth_user_id uuid;
begin
  if not exists (
    select 1 from public.workforce_operation_keys operation
    where operation.shop_id = p_shop_id
      and operation.operation_name = 'job_punch:' || v_action
      and operation.operation_key = p_operation_key
  ) then
    select profile.id, coalesce(profile.user_id, profile.id)
      into v_profile_id, v_auth_user_id
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (profile.id = p_technician_id or profile.user_id = p_technician_id)
    order by case when profile.id = p_technician_id then 0 else 1 end
    limit 1;

    if not found
       or p_actor_user_id not in (v_profile_id, v_auth_user_id)
    then
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: CoPilot cannot execute this Work Order command.';
    end if;

    if not private.work_order_command_product_access_locked(
      p_shop_id, p_work_order_line_id, v_profile_id, p_actor_user_id
    ) then
      -- Preserve a receipt that committed while the lock helper retried.
      if exists (
        select 1 from public.workforce_operation_keys operation
        where operation.shop_id = p_shop_id
          and operation.operation_name = 'job_punch:' || v_action
          and operation.operation_key = p_operation_key
      ) then
        return private.apply_technician_copilot_job_punch_transition_product_core(
          p_shop_id, p_work_order_line_id, p_action, p_technician_id,
          p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
          p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
          p_release_to_awaiting, p_cause, p_correction, p_event, p_details
        );
      end if;
      raise exception using
        errcode = '42501',
        message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: CoPilot cannot execute this Work Order command.';
    end if;
  end if;

  return private.apply_technician_copilot_job_punch_transition_product_core(
    p_shop_id, p_work_order_line_id, p_action, p_technician_id,
    p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
    p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
    p_release_to_awaiting, p_cause, p_correction, p_event, p_details
  );
end;
$function$;

revoke all on function private.apply_technician_copilot_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) from public, anon, authenticated, service_role;

-- The normal mobile/offline story path is public and therefore needs the same
-- receipt-first product fence as CoPilot. Preserve technician-note behavior.
alter function public.apply_offline_line_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) set schema private;
alter function private.apply_offline_line_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) rename to apply_offline_line_mutation_product_core;
revoke all on function private.apply_offline_line_mutation_product_core(
  uuid, uuid, text, text, uuid, jsonb
) from public, anon, authenticated, service_role;

create function public.apply_offline_line_mutation_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_action_type text,
  p_work_order_line_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receipt_actor_user_id uuid;
  v_receipt_action_type text;
  v_receipt_entity_id uuid;
begin
  if p_action_type is distinct from 'save_story_draft' then
    return private.apply_offline_line_mutation_product_core(
      p_shop_id, p_actor_user_id, p_operation_key, p_action_type,
      p_work_order_line_id, p_payload
    );
  end if;

  select receipt.actor_user_id, receipt.action_type, receipt.entity_id
    into v_receipt_actor_user_id, v_receipt_action_type, v_receipt_entity_id
  from public.offline_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.operation_key = p_operation_key;
  if found then
    if v_receipt_actor_user_id is distinct from p_actor_user_id
       or v_receipt_action_type is distinct from p_action_type
       or v_receipt_entity_id is distinct from p_work_order_line_id
    then
      raise exception using
        errcode = '23505',
        message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
    end if;
    return private.apply_offline_line_mutation_product_core(
      p_shop_id, p_actor_user_id, p_operation_key, p_action_type,
      p_work_order_line_id, p_payload
    );
  end if;

  if not private.work_order_command_product_access_locked(
    p_shop_id, p_work_order_line_id, p_actor_user_id, p_actor_user_id
  ) then
    -- Preserve a bound receipt that committed while the lock helper retried.
    select receipt.actor_user_id, receipt.action_type, receipt.entity_id
      into v_receipt_actor_user_id, v_receipt_action_type, v_receipt_entity_id
    from public.offline_mutation_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.operation_key = p_operation_key;
    if found then
      if v_receipt_actor_user_id is distinct from p_actor_user_id
         or v_receipt_action_type is distinct from p_action_type
         or v_receipt_entity_id is distinct from p_work_order_line_id
      then
        raise exception using
          errcode = '23505',
          message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
      end if;
      return private.apply_offline_line_mutation_product_core(
        p_shop_id, p_actor_user_id, p_operation_key, p_action_type,
        p_work_order_line_id, p_payload
      );
    end if;
    raise exception using
      errcode = '42501',
      message = 'WORK_ORDER_PRODUCT_ACCESS_FORBIDDEN: actor cannot update this Work Order line.';
  end if;

  return private.apply_offline_line_mutation_product_core(
    p_shop_id, p_actor_user_id, p_operation_key, p_action_type,
    p_work_order_line_id, p_payload
  );
end;
$function$;

revoke all on function public.apply_offline_line_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) from public, anon;
grant execute on function public.apply_offline_line_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) to authenticated, service_role;

-- Story saves use the canonical offline mutation rather than the punch
-- adapter. Keep CoPilot bound to the same public, receipt-first product fence.
create function private.apply_technician_copilot_story_mutation_atomic(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_operation_key text,
  p_action_type text,
  p_work_order_line_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_action_type is distinct from 'save_story_draft' then
    raise exception using errcode = '22023', message = 'Unsupported CoPilot story mutation.';
  end if;

  return public.apply_offline_line_mutation_atomic(
    p_shop_id, p_actor_profile_id, p_operation_key, p_action_type,
    p_work_order_line_id, p_payload
  );
end;
$function$;

revoke all on function private.apply_technician_copilot_story_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) from public, anon, authenticated, service_role;

do $bind_private_technician_copilot_story$
declare
  v_definition text;
  v_public_call constant text := 'public.apply_offline_line_mutation_atomic(';
  v_private_call constant text := 'private.apply_technician_copilot_story_mutation_atomic(';
  v_call_count integer;
begin
  select pg_get_functiondef(
    'copilot.technician_job_action_internal(uuid,uuid,uuid,text,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_definition;
  v_call_count := (
    length(v_definition) - length(replace(v_definition, v_public_call, ''))
  ) / length(v_public_call);
  if v_definition is null or v_call_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Unexpected Technician CoPilot story bridge definition.';
  end if;

  execute replace(v_definition, v_public_call, v_private_call);

  select pg_get_functiondef(
    'copilot.technician_job_action_internal(uuid,uuid,uuid,text,uuid,text,text,text,timestamptz)'::regprocedure
  ) into v_definition;
  if position(v_public_call in v_definition) <> 0
     or position(v_private_call in v_definition) = 0
  then
    raise exception using
      errcode = '55000',
      message = 'Technician CoPilot story bridge did not bind to its product wrapper.';
  end if;
end;
$bind_private_technician_copilot_story$;

revoke all on function public.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) from public, anon;
grant execute on function public.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) to authenticated, service_role;

comment on function public.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) is
  'Canonical punch boundary: committed receipts replay first; fresh authenticated commands require Shop entitlement or a locked active linked Field visit before the established assignment and labor mutation.';

revoke all on function public.apply_pre_labor_parts_quote_hold_atomic(
  uuid, uuid, uuid, text, timestamptz, text, text, text, jsonb, timestamptz
) from public, anon;
grant execute on function public.apply_pre_labor_parts_quote_hold_atomic(
  uuid, uuid, uuid, text, timestamptz, text, text, text, jsonb, timestamptz
) to authenticated, service_role;

comment on function public.apply_pre_labor_parts_quote_hold_atomic(
  uuid, uuid, uuid, text, timestamptz, text, text, text, jsonb, timestamptz
) is
  'Canonical parts-quote Hold boundary: committed receipts replay first; fresh authenticated commands require Shop entitlement or a locked active linked Field visit.';

comment on function public.apply_offline_line_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) is
  'Canonical offline line mutation boundary: story receipts replay first; fresh story saves require Shop entitlement or a locked active linked Field visit; technician notes retain established behavior.';

notify pgrst, 'reload schema';

commit;
