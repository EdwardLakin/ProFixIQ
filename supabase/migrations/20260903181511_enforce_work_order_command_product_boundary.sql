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
      end if;

      exit;
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

notify pgrst, 'reload schema';

commit;
