begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- Job execution is an existing application capability. Register it in the
-- effective Workspace model so role policy and individual overrides are
-- enforced by the canonical database transition, not only by presentation.
insert into public.workspace_capabilities (
  capability_key,
  workspace_key,
  module_key,
  action_key,
  access_level,
  is_protected,
  description
) values (
  'work_order.job.execute',
  'work_order',
  'job',
  'execute',
  'manage',
  false,
  'Start, pause, resume, and finish an explicitly assigned Work Order repair line.'
)
on conflict (capability_key) do update
set workspace_key = excluded.workspace_key,
    module_key = excluded.module_key,
    action_key = excluded.action_key,
    access_level = excluded.access_level,
    is_protected = excluded.is_protected,
    description = excluded.description,
    updated_at = now();

insert into public.workspace_role_capability_presets (
  capability_key,
  role_key,
  effect
) values
  ('work_order.job.execute', 'owner', 'allow'),
  ('work_order.job.execute', 'admin', 'allow'),
  ('work_order.job.execute', 'manager', 'allow'),
  ('work_order.job.execute', 'mechanic', 'allow'),
  ('work_order.job.execute', 'lead_hand', 'allow'),
  ('work_order.job.execute', 'foreman', 'allow')
on conflict (capability_key, role_key) do update
set effect = excluded.effect,
    updated_at = now();

-- Preserve the established transition implementation as an unreachable core.
-- The stable public signature below performs caller, effective-capability, and
-- assignment checks before the core can read receipts or mutate labor state.
alter function public.apply_job_punch_transition_atomic(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) set schema private;

alter function private.apply_job_punch_transition_atomic(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) rename to apply_job_punch_transition_core;

revoke all on function private.apply_job_punch_transition_core(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) from public, anon, authenticated, service_role;

create or replace function public.apply_job_punch_transition_atomic(
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
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_is_database_owner boolean :=
    auth.uid() is null
    and session_user in ('postgres', 'supabase_admin')
    and coalesce(nullif(current_setting('role', true), ''), 'none') = 'none';
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_actor_profile_id uuid;
  v_actor_linked_user_id uuid;
  v_technician_profile_id uuid;
  v_technician_linked_user_id uuid;
  v_core_actor_user_id uuid;
  v_existing jsonb;
  v_existing_actor_user_id uuid;
  v_existing_line_id uuid;
  v_can_execute boolean := false;
  v_can_coordinate_cleanup boolean := false;
  v_cleanup_pause_requested boolean := false;
  v_line public.work_order_lines%rowtype;
begin
  if v_action not in ('start', 'resume', 'pause', 'finish') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported job punch action.';
  end if;
  if nullif(btrim(coalesce(p_operation_key, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'A stable operation key is required.';
  end if;
  if v_auth_user_id is null
     and not v_is_service_role
     and not v_is_database_owner then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required for job execution.';
  end if;

  -- Break, shift-end, and scheduled shift-end coordination must remain able to
  -- close labor that was authorized before an administrator revoked execution.
  -- This exception is deliberately narrower than a direct pause: coordinated
  -- callers preserve line state and opt into closing concurrent active labor.
  v_cleanup_pause_requested :=
    v_action = 'pause'
    and p_preserve_line_status
    and p_allow_concurrent
    and not p_release_to_awaiting;

  select profile.id, profile.user_id
    into v_actor_profile_id, v_actor_linked_user_id
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (
      profile.id = p_actor_user_id
      or profile.user_id = p_actor_user_id
    )
    and (
      v_is_service_role
      or v_is_database_owner
      or profile.id = v_auth_user_id
      or profile.user_id = v_auth_user_id
    )
  order by (profile.user_id = p_actor_user_id) desc,
           (profile.id = p_actor_user_id) desc,
           profile.updated_at desc nulls last,
           profile.id
  limit 1;

  if v_actor_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authenticated actor cannot execute work in this shop.';
  end if;

  if v_cleanup_pause_requested then
    select decision.granted
      into v_can_coordinate_cleanup
    from private.resolve_workspace_profile_capability(
      v_actor_profile_id,
      p_shop_id,
      'work_order.assignment.manage'
    ) decision;
  end if;

  select profile.id, profile.user_id
    into v_technician_profile_id, v_technician_linked_user_id
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (
      profile.id = p_technician_id
      or profile.user_id = p_technician_id
    )
  order by (profile.user_id = p_technician_id) desc,
           (profile.id = p_technician_id) desc,
           profile.updated_at desc nulls last,
           profile.id
  limit 1;

  if v_technician_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'Technician is not available for this shop.';
  end if;

  v_core_actor_user_id := case
    when not v_is_service_role and not v_is_database_owner
      then v_auth_user_id
    else coalesce(v_actor_linked_user_id, v_actor_profile_id)
  end;

  -- A committed transition remains safely replayable after dispatch changes.
  -- Bind the receipt to the authenticated actor, action, line, and stable key
  -- before evaluating current capability or assignment. A different actor or
  -- line may never claim an existing receipt.
  select operation.result, operation.actor_user_id, operation.work_order_line_id
    into v_existing, v_existing_actor_user_id, v_existing_line_id
  from public.workforce_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'job_punch:' || v_action
    and operation.operation_key = p_operation_key;

  if found then
    if v_existing_actor_user_id is distinct from v_core_actor_user_id
       or v_existing_line_id is distinct from p_work_order_line_id then
      raise exception using
        errcode = '23505',
        message = 'JOB_PUNCH_OPERATION_CONFLICT';
    end if;

    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  if not v_is_service_role
     and not v_is_database_owner
     and v_actor_profile_id <> v_technician_profile_id
     and not (
       v_cleanup_pause_requested
       and coalesce(v_can_coordinate_cleanup, false)
     ) then
    raise exception using
      errcode = '42501',
      message = 'Authenticated actor cannot execute another technician''s job.';
  end if;

  select decision.granted
    into v_can_execute
  from private.resolve_workspace_profile_capability(
    v_technician_profile_id,
    p_shop_id,
    'work_order.job.execute'
  ) decision;

  if not coalesce(v_can_execute, false)
     and not v_cleanup_pause_requested then
    raise exception using
      errcode = '42501',
      message = 'Job execution capability is required.';
  end if;

  -- Assignment mutations lock the line before the technician profile. Keep the
  -- same order here and hold the line through the private core transition so a
  -- concurrent reassignment cannot invalidate the authorization decision.
  select *
    into v_line
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = p_shop_id
  for update;

  if not found or v_line.work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Work-order line not found for shop.';
  end if;
  if coalesce(v_line.line_type::text, 'job') = 'info' then
    raise exception using
      errcode = '22023',
      message = 'Info lines do not support technician execution.';
  end if;

  if not coalesce((
    v_line.assigned_tech_id in (
      v_technician_profile_id,
      coalesce(v_technician_linked_user_id, v_technician_profile_id)
    )
    or v_line.assigned_to in (
      v_technician_profile_id,
      coalesce(v_technician_linked_user_id, v_technician_profile_id)
    )
    or exists (
      select 1
      from public.work_order_line_technicians assignment
      where assignment.work_order_line_id = v_line.id
        and assignment.technician_id in (
          v_technician_profile_id,
          coalesce(v_technician_linked_user_id, v_technician_profile_id)
        )
    )
  ), false) then
    raise exception using
      errcode = '42501',
      message = 'An assigned technician is required for this job action.';
  end if;

  if not coalesce(v_can_execute, false)
     or (
       not v_is_service_role
       and not v_is_database_owner
       and v_actor_profile_id <> v_technician_profile_id
     ) then
    -- A revoked technician may only close an already-open segment on this exact
    -- locked, assigned line. The private core receives pause + preserve=true,
    -- so this path cannot open labor or change the repair-line lifecycle state.
    perform 1
    from public.work_order_line_labor_segments segment
    where segment.shop_id = p_shop_id
      and segment.work_order_line_id = v_line.id
      and segment.technician_id = v_technician_profile_id
      and segment.ended_at is null
    order by segment.id
    for update;

    if not found then
      raise exception using
        errcode = '42501',
        message = 'Job execution capability is required.';
    end if;
  end if;

  return private.apply_job_punch_transition_core(
    p_shop_id,
    p_work_order_line_id,
    v_action,
    v_technician_profile_id,
    v_core_actor_user_id,
    p_operation_key,
    p_allow_concurrent,
    p_at,
    p_start_source,
    p_hold_reason,
    p_notes,
    p_preserve_line_status,
    p_release_to_awaiting,
    p_cause,
    p_correction,
    p_event,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.apply_job_punch_transition_atomic(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_job_punch_transition_atomic(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) to authenticated, service_role;

comment on function public.apply_job_punch_transition_atomic(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) is
  'Canonical Work Order job transition gated by authenticated actor identity, effective execution capability, and locked repair-line assignment; only self, trusted-service, or assignment-manager coordination may perform state-preserving closure of an existing active segment.';

do $job_punch_authorization_postcheck$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.apply_job_punch_transition_atomic(uuid,uuid,text,uuid,uuid,text,boolean,timestamp with time zone,text,text,text,boolean,boolean,text,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position('work_order.job.execute' in v_definition) = 0
     or position('work_order_line_technicians' in v_definition) = 0
     or position('v_actor_profile_id <> v_technician_profile_id' in v_definition) = 0
     or position('v_cleanup_pause_requested' in v_definition) = 0
     or position('work_order.assignment.manage' in v_definition) = 0
     or position('segment.ended_at is null' in v_definition) = 0
     or position('private.apply_job_punch_transition_core' in v_definition) = 0 then
    raise exception 'Job punch authorization postcheck failed: public gate is incomplete.';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.apply_job_punch_transition_core(uuid,uuid,text,uuid,uuid,text,boolean,timestamp with time zone,text,text,text,boolean,boolean,text,text,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.apply_job_punch_transition_core(uuid,uuid,text,uuid,uuid,text,boolean,timestamp with time zone,text,text,text,boolean,boolean,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Job punch authorization postcheck failed: private core remains directly executable.';
  end if;
end
$job_punch_authorization_postcheck$;

notify pgrst, 'reload schema';

commit;
