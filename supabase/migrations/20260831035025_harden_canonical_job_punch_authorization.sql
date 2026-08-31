begin;

-- Harden the established canonical labor-punch RPC without changing its
-- shared Hold and Remove Hold semantics.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Preserve the established mutation implementation by OID for trusted
-- dependencies, but remove its direct authenticated entry point. The public
-- signature is recreated below as the durable authorization boundary.
alter function public.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) set schema private;

alter function private.apply_job_punch_transition_atomic(
  uuid, uuid, text, uuid, uuid, text, boolean, timestamptz, text,
  text, text, boolean, boolean, text, text, text, jsonb
) rename to apply_job_punch_transition_atomic_core;

revoke all on function private.apply_job_punch_transition_atomic_core(
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
  v_protected_labor_action boolean;
  v_profile_id uuid;
  v_auth_user_id uuid;
  v_role text;
  v_line public.work_order_lines%rowtype;
  v_has_actor_segment boolean := false;
  v_has_any_segment boolean := false;
begin
  if v_action not in ('start', 'resume', 'pause', 'finish') then
    raise exception using errcode = '22023', message = 'Unsupported job punch action.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'A stable operation key is required.';
  end if;

  -- Receipt replay remains canonical and actor-bound. A command that already
  -- committed must not fail merely because assignment changed afterwards.
  if exists (
    select 1
    from public.workforce_operation_keys operation
    where operation.shop_id = p_shop_id
      and operation.operation_name = 'job_punch:' || v_action
      and operation.operation_key = p_operation_key
  ) then
    return private.apply_job_punch_transition_atomic_core(
      p_shop_id, p_work_order_line_id, p_action, p_technician_id,
      p_actor_user_id, p_operation_key, p_allow_concurrent, p_at,
      p_start_source, p_hold_reason, p_notes, p_preserve_line_status,
      p_release_to_awaiting, p_cause, p_correction, p_event, p_details
    );
  end if;

  -- Hold and Remove Hold are the established shared controls. Hold pauses the
  -- line punch; Remove Hold returns it to awaiting. Only actions that begin or
  -- complete labor receive the assigned-technician guard.
  v_protected_labor_action :=
    v_action = 'finish'
    or (
      v_action in ('start', 'resume')
      and p_release_to_awaiting is not true
    );

  if v_protected_labor_action then
    select profile.id,
           coalesce(profile.user_id, profile.id),
           public.canonical_shop_membership_role(profile.role::text)
      into v_profile_id, v_auth_user_id, v_role
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (profile.id = p_technician_id or profile.user_id = p_technician_id)
    order by case when profile.id = p_technician_id then 0 else 1 end
    limit 1
    for update;

    if not found
       or v_role is null
       or v_role not in (
         'owner', 'admin', 'manager', 'mechanic', 'lead_hand', 'foreman'
       )
       or p_actor_user_id not in (v_profile_id, v_auth_user_id)
       or not public.scheduler_actor_matches(v_auth_user_id)
    then
      raise exception using
        errcode = '42501',
        message = 'JOB_PUNCH_FORBIDDEN: actor cannot perform assigned work.';
    end if;

    select * into v_line
    from public.work_order_lines line
    where line.id = p_work_order_line_id
      and line.shop_id = p_shop_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
    end if;

    perform 1
    from public.work_orders work_order
    where work_order.id = v_line.work_order_id
      and work_order.shop_id = p_shop_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Parent work order not found for shop.';
    end if;

    perform 1
    from public.work_order_line_technicians assignment
    where assignment.work_order_line_id = p_work_order_line_id
    order by assignment.id
    for update;

    if not (
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
    ) then
      raise exception using
        errcode = '42501',
        message = 'Technician is not assigned to this work-order line.';
    end if;

    -- The canonical pre-labor parts hold cannot be bypassed by invoking this
    -- public RPC directly. Remove Hold remains available through the explicit
    -- release-to-awaiting branch above.
    if lower(coalesce(v_line.approval_state::text, '')) = 'pending'
       and lower(coalesce(v_line.status::text, '')) = 'on_hold'
       and lower(trim(coalesce(v_line.hold_reason, ''))) = 'awaiting parts quote'
    then
      raise exception using
        errcode = 'P0001',
        message = 'PARTS_QUOTE_HOLD_PENDING: approval-pending parts work cannot be punched.';
    end if;

    if lower(coalesce(v_line.approval_state::text, '')) = 'pending'
       and not coalesce(v_line.punchable, false)
    then
      raise exception using
        errcode = 'P0001',
        message = 'LINE_APPROVAL_PENDING: approval-pending work cannot be punched.';
    end if;

    -- Match the canonical mutation's segment lock set before authorizing. This
    -- makes assignment and active-segment evidence stable until the core
    -- mutation commits.
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
    for update;

    if v_action = 'finish' then
      select exists (
        select 1 from public.work_order_line_labor_segments segment
        where segment.shop_id = p_shop_id
          and segment.work_order_line_id = p_work_order_line_id
          and segment.technician_id = v_profile_id
          and segment.ended_at is null
      ) into v_has_actor_segment;

      select exists (
        select 1 from public.work_order_line_labor_segments segment
        where segment.shop_id = p_shop_id
          and segment.work_order_line_id = p_work_order_line_id
          and segment.ended_at is null
      ) into v_has_any_segment;

      if v_has_any_segment and not v_has_actor_segment then
        raise exception using
          errcode = '42501',
          message = 'Technician does not own the active labor segment on this line.';
      end if;
    end if;
  end if;

  return private.apply_job_punch_transition_atomic_core(
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
  'Canonical punch boundary: assigned capability is required for labor start, labor resume, and finish; shared Hold and Remove Hold behavior is preserved.';

notify pgrst, 'reload schema';

commit;
