\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'a1438000-0000-4000-8000-000000000001',
    'copilot-runtime-owner@example.com',
    '{"full_name":"CoPilot Runtime Owner"}'::jsonb
  ),
  (
    'a1438000-0000-4000-8000-000000000002',
    'copilot-runtime-tech@example.com',
    '{"full_name":"CoPilot Runtime Technician"}'::jsonb
  ),
  (
    'a1438000-0000-4000-8000-000000000003',
    'copilot-runtime-split-tech@example.com',
    '{"full_name":"CoPilot Split Identity Technician"}'::jsonb
  ),
  (
    'a1438000-0000-4000-8000-000000000004',
    'copilot-runtime-split-profile@example.com',
    '{"full_name":"CoPilot Split Identity Profile Anchor"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    'a1438000-0000-4000-8000-000000000001',
    'a1438000-0000-4000-8000-000000000001',
    'owner',
    'CoPilot Runtime Owner'
  ),
  (
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000002',
    'mechanic',
    'CoPilot Runtime Technician'
  ),
  (
    'a1438000-0000-4000-8000-000000000004',
    'a1438000-0000-4000-8000-000000000003',
    'mechanic',
    'CoPilot Split Identity Technician'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

-- The legacy before-insert trigger initially mirrors profiles.id into user_id.
-- Re-link this imported-style profile after insert to exercise split identity.
update public.profiles
set user_id = 'a1438000-0000-4000-8000-000000000003'
where id = 'a1438000-0000-4000-8000-000000000004';

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  (
    'a1438000-0000-4000-8000-000000000010',
    'a1438000-0000-4000-8000-000000000001',
    'CoPilot Runtime Shop',
    'CoPilot Runtime Shop',
    10
  ),
  (
    'a1438000-0000-4000-8000-000000000011',
    'a1438000-0000-4000-8000-000000000001',
    'CoPilot Cross-Tenant Shop',
    'CoPilot Cross-Tenant Shop',
    10
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = 'a1438000-0000-4000-8000-000000000010'
where id in (
  'a1438000-0000-4000-8000-000000000001',
  'a1438000-0000-4000-8000-000000000002',
  'a1438000-0000-4000-8000-000000000004'
);

insert into public.work_orders (id, shop_id, status, custom_id)
values
  (
    'a1438000-0000-4000-8000-000000000101',
    'a1438000-0000-4000-8000-000000000010',
    'queued',
    'COPILOT-RT-1'
  ),
  (
    'a1438000-0000-4000-8000-000000000102',
    'a1438000-0000-4000-8000-000000000010',
    'in_progress',
    'COPILOT-RT-2'
  ),
  (
    'a1438000-0000-4000-8000-000000000103',
    'a1438000-0000-4000-8000-000000000010',
    'completed',
    'COPILOT-RT-TERMINAL'
  ),
  (
    'a1438000-0000-4000-8000-000000000104',
    'a1438000-0000-4000-8000-000000000010',
    'in_progress',
    'COPILOT-RT-SPLIT-ID'
  ),
  (
    'a1438000-0000-4000-8000-000000000105',
    'a1438000-0000-4000-8000-000000000011',
    'queued',
    'COPILOT-RT-CROSS-TENANT'
  )
on conflict (id) do nothing;

insert into public.work_order_lines (
  id,
  work_order_id,
  shop_id,
  line_type,
  status,
  assigned_tech_id,
  assigned_to,
  description
)
values
  (
    'a1438000-0000-4000-8000-000000000201',
    'a1438000-0000-4000-8000-000000000101',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'active',
    'a1438000-0000-4000-8000-000000000002',
    null,
    'Runtime lifecycle one'
  ),
  (
    'a1438000-0000-4000-8000-000000000202',
    'a1438000-0000-4000-8000-000000000102',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'waiting_parts',
    'a1438000-0000-4000-8000-000000000002',
    null,
    'Runtime lifecycle two'
  ),
  (
    'a1438000-0000-4000-8000-000000000203',
    'a1438000-0000-4000-8000-000000000103',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'active',
    'a1438000-0000-4000-8000-000000000002',
    null,
    'Runtime terminal guard'
  ),
  (
    'a1438000-0000-4000-8000-000000000204',
    'a1438000-0000-4000-8000-000000000102',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'awaiting',
    null,
    null,
    'Runtime unassigned guard'
  ),
  (
    'a1438000-0000-4000-8000-000000000205',
    'a1438000-0000-4000-8000-000000000105',
    'a1438000-0000-4000-8000-000000000011',
    'job',
    'awaiting',
    null,
    null,
    'Runtime cross-tenant guard'
  ),
  (
    'a1438000-0000-4000-8000-000000000209',
    'a1438000-0000-4000-8000-000000000104',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'awaiting',
    'a1438000-0000-4000-8000-000000000004',
    null,
    'Runtime split-identity completion'
  ),
  (
    'a1438000-0000-4000-8000-000000000210',
    'a1438000-0000-4000-8000-000000000104',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'awaiting',
    null,
    null,
    'Runtime split-identity sibling'
  ),
  (
    'a1438000-0000-4000-8000-000000000211',
    'a1438000-0000-4000-8000-000000000103',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'completed',
    null,
    null,
    'Runtime completion-learning backfill'
  ),
  (
    'a1438000-0000-4000-8000-000000000212',
    'a1438000-0000-4000-8000-000000000103',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'completed',
    null,
    null,
    'Runtime completion-learning bounded retry'
  )
on conflict (id) do nothing;

insert into public.work_order_line_technicians (
  work_order_line_id,
  technician_id,
  assigned_by
)
values
  (
    'a1438000-0000-4000-8000-000000000201',
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000001'
  ),
  (
    'a1438000-0000-4000-8000-000000000202',
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000001'
  ),
  (
    'a1438000-0000-4000-8000-000000000203',
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000001'
  ),
  (
    'a1438000-0000-4000-8000-000000000209',
    'a1438000-0000-4000-8000-000000000004',
    'a1438000-0000-4000-8000-000000000001'
  )
on conflict (work_order_line_id, technician_id) do nothing;

insert into public.tech_shifts (
  id,
  shop_id,
  user_id,
  status,
  type,
  start_time,
  end_time
)
values
  (
    'a1438000-0000-4000-8000-000000000206',
    'a1438000-0000-4000-8000-000000000010',
    'a1438000-0000-4000-8000-000000000002',
    'active',
    'shift',
    now() - interval '1 hour',
    null
  ),
  (
    'a1438000-0000-4000-8000-000000000207',
    'a1438000-0000-4000-8000-000000000010',
    'a1438000-0000-4000-8000-000000000004',
    'active',
    'shift',
    now() - interval '1 hour',
    null
  )
on conflict (id) do nothing;

-- The existing line-status refresh trigger recalculates a parent work order
-- after line insertion. Reassert the terminal parent state after the assigned
-- line exists so this fixture actually exercises CoPilot's terminal-work guard.
update public.work_orders
set status = 'completed'
where id = 'a1438000-0000-4000-8000-000000000103';

set constraints all immediate;
set constraints all deferred;

do $technician_copilot_runtime_lifecycle$
declare
  v_first jsonb;
  v_replayed_start jsonb;
  v_second jsonb;
  v_read jsonb;
  v_append jsonb;
  v_append_replay jsonb;
  v_first_session_id uuid;
  v_second_session_id uuid;
begin
  v_first := copilot.technician_session_start_internal(
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000101',
    'a1438000-0000-4000-8000-000000000201',
    'shop',
    'a1438000-0000-4000-8000-000000000301'
  );
  v_first_session_id := (v_first ->> 'sessionId')::uuid;

  if v_first_session_id is null
    or coalesce((v_first ->> 'replayed')::boolean, false)
  then
    raise exception 'CoPilot runtime assertion failed: first session did not start';
  end if;

  v_replayed_start := copilot.technician_session_start_internal(
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000101',
    'a1438000-0000-4000-8000-000000000201',
    'shop',
    'a1438000-0000-4000-8000-000000000301'
  );

  if (v_replayed_start ->> 'sessionId')::uuid <> v_first_session_id
    or not coalesce((v_replayed_start ->> 'replayed')::boolean, false)
  then
    raise exception 'CoPilot runtime assertion failed: session-start replay was not idempotent';
  end if;

  v_read := copilot.technician_session_read_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_first_session_id
  );

  if v_read #>> '{session,id}' <> v_first_session_id::text
    or jsonb_array_length(v_read -> 'events') <> 1
    or v_read #>> '{events,0,eventType}' <> 'session.started'
    or v_read #>> '{events,0,repairSessionId}' <> v_first_session_id::text
  then
    raise exception 'CoPilot runtime assertion failed: session read does not project the Phase-1 ledger';
  end if;

  v_append := copilot.technician_event_append_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_first_session_id,
    'conversation.user',
    'voice',
    'a1438000-0000-4000-8000-000000000302',
    '{"text":"Rear U-joint has play","turnId":"runtime-turn-1","inputMode":"voice"}'::jsonb,
    now()
  );

  v_append_replay := copilot.technician_event_append_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_first_session_id,
    'conversation.user',
    'voice',
    'a1438000-0000-4000-8000-000000000302',
    '{"text":"Rear U-joint has play","turnId":"runtime-turn-1","inputMode":"voice"}'::jsonb,
    now()
  );

  if coalesce((v_append ->> 'replayed')::boolean, true)
    or not coalesce((v_append_replay ->> 'replayed')::boolean, false)
    or v_append ->> 'eventId' <> v_append_replay ->> 'eventId'
  then
    raise exception 'CoPilot runtime assertion failed: event replay was not idempotent';
  end if;

  v_second := copilot.technician_session_start_internal(
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000102',
    'a1438000-0000-4000-8000-000000000202',
    'shop',
    'a1438000-0000-4000-8000-000000000303'
  );
  v_second_session_id := (v_second ->> 'sessionId')::uuid;

  if v_second_session_id is null
    or v_second_session_id = v_first_session_id
    or not exists (
      select 1
      from copilot.repair_sessions rs
      where rs.id = v_first_session_id
        and rs.status = 'paused'
    )
    or not exists (
      select 1
      from copilot.repair_sessions rs
      where rs.id = v_second_session_id
        and rs.status = 'active'
    )
  then
    raise exception 'CoPilot runtime assertion failed: canonical session switch is incoherent';
  end if;

  begin
    perform copilot.technician_event_append_internal(
      'a1438000-0000-4000-8000-000000000002',
      v_first_session_id,
      'observation.recorded',
      'voice',
      'a1438000-0000-4000-8000-000000000304',
      '{"text":"Must not reach paused work"}'::jsonb,
      now()
    );
    raise exception 'CoPilot runtime assertion failed: paused session accepted a repair fact';
  exception when sqlstate '55000' then
    if sqlerrm <> 'copilot_session_not_active' then
      raise;
    end if;
  end;

  begin
    perform copilot.technician_session_start_internal(
      'a1438000-0000-4000-8000-000000000002',
      'a1438000-0000-4000-8000-000000000103',
      'a1438000-0000-4000-8000-000000000203',
      'shop',
      'a1438000-0000-4000-8000-000000000305'
    );
    raise exception 'CoPilot runtime assertion failed: terminal work order started a session';
  exception when sqlstate '55000' then
    if sqlerrm <> 'copilot_work_order_not_actionable' then
      raise;
    end if;
  end;
end
$technician_copilot_runtime_lifecycle$;

do $technician_copilot_command_transport$
declare
  v_active_session_id uuid;
  v_command_id uuid;
  v_metadata jsonb;
begin
  select rs.id
    into v_active_session_id
  from copilot.repair_sessions rs
  where rs.technician_id = 'a1438000-0000-4000-8000-000000000002'
    and rs.status = 'active';

  with command as (
    insert into public.ai_action_events (
      shop_id,
      event_type,
      actor_id,
      actor_role,
      source,
      payload,
      metadata
    )
    values (
      'a1438000-0000-4000-8000-000000000010',
      'technician_copilot_command',
      'a1438000-0000-4000-8000-000000000002',
      'mechanic',
      'technician_copilot_command',
      jsonb_build_object(
        'authUserId', 'a1438000-0000-4000-8000-000000000002',
        'action', 'session.read'
      ),
      '{}'::jsonb
    )
    returning id, metadata
  )
  select c.id, c.metadata
    into v_command_id, v_metadata
  from command c;

  if v_command_id is null
    or v_metadata #>> '{copilotCommandResult,session,id}' <> v_active_session_id::text
    or nullif(v_metadata #>> '{copilotCommandError,message}', '') is not null
  then
    raise exception 'CoPilot runtime assertion failed: command bridge did not return the active session';
  end if;

  if exists (
    select 1
    from public.ai_action_events e
    where e.id = v_command_id
  ) then
    raise exception 'CoPilot runtime assertion failed: command envelope persisted after RETURNING';
  end if;

  if has_table_privilege('service_role', 'public.ai_action_events', 'DELETE') then
    raise exception 'CoPilot runtime assertion failed: command cleanup widened service-role DELETE';
  end if;
end
$technician_copilot_command_transport$;

do $technician_copilot_job_actions$
declare
  v_active_session_id uuid;
  v_release_metadata jsonb;
  v_release_replay jsonb;
  v_start jsonb;
  v_start_replay jsonb;
  v_story jsonb;
  v_story_replay jsonb;
  v_complete jsonb;
  v_complete_replay jsonb;
  v_close jsonb;
  v_closed_read jsonb;
  v_line_updated_at timestamptz;
begin
  select rs.id
    into v_active_session_id
  from copilot.repair_sessions rs
  where rs.technician_id = 'a1438000-0000-4000-8000-000000000002'
    and rs.work_order_id = 'a1438000-0000-4000-8000-000000000102'
    and rs.status = 'active';

  with command as (
    insert into public.ai_action_events (
      shop_id,
      event_type,
      actor_id,
      actor_role,
      source,
      payload,
      metadata
    )
    values (
      'a1438000-0000-4000-8000-000000000010',
      'technician_copilot_command',
      'a1438000-0000-4000-8000-000000000002',
      'mechanic',
      'technician_copilot_command',
      jsonb_build_object(
        'authUserId', 'a1438000-0000-4000-8000-000000000002',
        'action', 'job.action',
        'sessionId', v_active_session_id,
        'workOrderLineId', 'a1438000-0000-4000-8000-000000000202',
        'jobAction', 'job.release_hold',
        'operationId', 'a1438000-0000-5000-a000-000000000401'
      ),
      '{}'::jsonb
    )
    returning metadata
  )
  select c.metadata
    into v_release_metadata
  from command c;

  if nullif(v_release_metadata #>> '{copilotCommandError,message}', '') is not null
    or v_release_metadata #>> '{copilotCommandResult,copilotAction}' <> 'job.release_hold'
    or not exists (
      select 1
      from public.work_order_lines wol
      where wol.id = 'a1438000-0000-4000-8000-000000000202'
        and lower(wol.status::text) = 'awaiting'
        and wol.hold_reason is null
    )
  then
    raise exception 'CoPilot job-action assertion failed: command bridge did not release the assigned hold';
  end if;

  v_release_replay := copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.release_hold',
    'a1438000-0000-5000-a000-000000000401'
  );
  if not coalesce((v_release_replay ->> 'idempotent')::boolean, false) then
    raise exception 'CoPilot job-action assertion failed: released-hold replay was not idempotent';
  end if;

  v_start := copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.start',
    'a1438000-0000-5000-a000-000000000402'
  );
  v_start_replay := copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.start',
    'a1438000-0000-5000-a000-000000000402'
  );

  if coalesce((v_start ->> 'idempotent')::boolean, true)
    or not coalesce((v_start_replay ->> 'idempotent')::boolean, false)
    or not exists (
      select 1
      from public.work_order_line_labor_segments seg
      where seg.work_order_line_id = 'a1438000-0000-4000-8000-000000000202'
        and seg.technician_id = 'a1438000-0000-4000-8000-000000000002'
        and seg.ended_at is null
    )
  then
    raise exception 'CoPilot job-action assertion failed: start replay was not idempotent';
  end if;

  begin
    perform copilot.technician_job_action_internal(
      'a1438000-0000-4000-8000-000000000002',
      v_active_session_id,
      'a1438000-0000-4000-8000-000000000202',
      'job.hold',
      'a1438000-0000-5000-a000-000000000402',
      'Must not reuse start operation'
    );
    raise exception 'CoPilot job-action assertion failed: operation ID was reused across actions';
  exception when sqlstate '23505' then
    if sqlerrm <> 'copilot_operation_id_conflict' then
      raise;
    end if;
  end;

  select wol.updated_at
    into v_line_updated_at
  from public.work_order_lines wol
  where wol.id = 'a1438000-0000-4000-8000-000000000202';

  insert into public.offline_mutation_receipts (
    shop_id,
    actor_user_id,
    operation_key,
    action_type,
    payload_hash,
    entity_type,
    entity_id,
    result
  )
  values (
    'a1438000-0000-4000-8000-000000000010',
    'a1438000-0000-4000-8000-000000000002',
    'technician-copilot:a1438000-0000-5000-a000-000000000408',
    'save_story_draft',
    'runtime-cross-line-operation-key',
    'work_order_line',
    'a1438000-0000-4000-8000-000000000204',
    '{}'::jsonb
  );

  begin
    perform copilot.technician_job_action_internal(
      'a1438000-0000-4000-8000-000000000002',
      v_active_session_id,
      'a1438000-0000-4000-8000-000000000202',
      'job.story.save',
      'a1438000-0000-5000-a000-000000000408',
      null,
      'Must not replay another line',
      null,
      v_line_updated_at
    );
    raise exception 'CoPilot job-action assertion failed: cross-line story receipt was replayed';
  exception when sqlstate '23505' then
    if sqlerrm <> 'copilot_operation_id_conflict' then
      raise;
    end if;
  end;

  begin
    perform copilot.technician_job_action_internal(
      'a1438000-0000-4000-8000-000000000002',
      v_active_session_id,
      'a1438000-0000-4000-8000-000000000202',
      'job.story.save',
      'a1438000-0000-5000-a000-000000000403',
      null,
      'Confirmed seized inner pad',
      'Clean and lubricate bracket',
      v_line_updated_at - interval '1 second'
    );
    raise exception 'CoPilot job-action assertion failed: stale story write succeeded';
  exception when sqlstate 'P0001' then
    if position('OFFLINE_VERSION_CONFLICT' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  v_story := copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.story.save',
    'a1438000-0000-5000-a000-000000000404',
    null,
    'Confirmed seized inner pad',
    'Clean and lubricate bracket',
    v_line_updated_at
  );
  v_story_replay := copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.story.save',
    'a1438000-0000-5000-a000-000000000404',
    null,
    'Confirmed seized inner pad',
    'Clean and lubricate bracket',
    v_line_updated_at
  );

  if coalesce((v_story ->> 'idempotent')::boolean, true)
    or not coalesce((v_story_replay ->> 'idempotent')::boolean, false)
    or not exists (
      select 1
      from public.work_order_lines wol
      where wol.id = 'a1438000-0000-4000-8000-000000000202'
        and wol.cause = 'Confirmed seized inner pad'
        and wol.correction = 'Clean and lubricate bracket'
    )
  then
    raise exception 'CoPilot job-action assertion failed: story save or replay was incoherent';
  end if;

  perform copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.hold',
    'a1438000-0000-5000-a000-000000000405',
    'Waiting for parts'
  );

  if not exists (
    select 1
    from public.work_order_lines wol
    where wol.id = 'a1438000-0000-4000-8000-000000000202'
      and lower(wol.status::text) = 'on_hold'
      and wol.hold_reason = 'Waiting for parts'
  ) then
    raise exception 'CoPilot job-action assertion failed: hold did not use canonical line state';
  end if;

  begin
    perform copilot.technician_job_action_internal(
      'a1438000-0000-4000-8000-000000000002',
      v_active_session_id,
      'a1438000-0000-4000-8000-000000000204',
      'job.start',
      'a1438000-0000-5000-a000-000000000406'
    );
    raise exception 'CoPilot job-action assertion failed: unassigned line was accepted';
  exception when sqlstate '42501' then
    if sqlerrm <> 'copilot_work_order_assignment_required' then
      raise;
    end if;
  end;

  begin
    perform copilot.technician_job_action_internal(
      'a1438000-0000-4000-8000-000000000002',
      v_active_session_id,
      'a1438000-0000-4000-8000-000000000205',
      'job.start',
      'a1438000-0000-5000-a000-000000000407'
    );
    raise exception 'CoPilot job-action assertion failed: cross-tenant line was accepted';
  exception when sqlstate '55000' then
    if sqlerrm <> 'copilot_job_action_session_or_line_not_actionable' then
      raise;
    end if;
  end;

  update public.work_order_lines
  set labor_time = 1.0,
      updated_at = now()
  where id = 'a1438000-0000-4000-8000-000000000202';

  perform copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.release_hold',
    'a1438000-0000-5000-a000-000000000409'
  );
  perform copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.start',
    'a1438000-0000-5000-a000-000000000410'
  );

  select wol.updated_at
    into v_line_updated_at
  from public.work_order_lines wol
  where wol.id = 'a1438000-0000-4000-8000-000000000202';

  begin
    perform copilot.technician_job_action_internal(
      'a1438000-0000-4000-8000-000000000002',
      v_active_session_id,
      'a1438000-0000-4000-8000-000000000202',
      'job.complete',
      'a1438000-0000-5000-a000-000000000411',
      null,
      'Confirmed seized inner pad',
      'Clean and lubricate bracket',
      v_line_updated_at - interval '1 second'
    );
    raise exception 'CoPilot job-completion assertion failed: stale completion succeeded';
  exception when sqlstate '55000' then
    if sqlerrm <> 'copilot_line_version_conflict' then
      raise;
    end if;
  end;

  insert into public.inspections (
    id,
    shop_id,
    work_order_id,
    work_order_line_id,
    status,
    completed,
    is_draft,
    locked,
    signing_cycle,
    is_canonical
  ) values (
    'a1438000-0000-4000-8000-000000000220',
    'a1438000-0000-4000-8000-000000000010',
    'a1438000-0000-4000-8000-000000000102',
    'a1438000-0000-4000-8000-000000000202',
    'draft',
    false,
    true,
    false,
    0,
    true
  );

  begin
    perform copilot.technician_job_action_internal(
      'a1438000-0000-4000-8000-000000000002',
      v_active_session_id,
      'a1438000-0000-4000-8000-000000000202',
      'job.complete',
      'a1438000-0000-5000-a000-000000000413',
      null,
      'Confirmed seized inner pad',
      'Clean and lubricate bracket',
      v_line_updated_at
    );
    raise exception 'CoPilot job-completion assertion failed: unsigned inspection was finalized';
  exception when sqlstate 'P0001' then
    if position('INSPECTION_COMPLETION_REQUIRED' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  if not exists (
    select 1
    from public.inspections i
    where i.id = 'a1438000-0000-4000-8000-000000000220'
      and not coalesce(i.completed, false)
      and coalesce(i.is_draft, true)
      and not coalesce(i.locked, false)
      and i.finalized_at is null
      and i.finalized_by is null
  ) or not exists (
    select 1
    from public.work_order_line_labor_segments segment
    where segment.work_order_line_id = 'a1438000-0000-4000-8000-000000000202'
      and segment.technician_id = 'a1438000-0000-4000-8000-000000000002'
      and segment.ended_at is null
  ) then
    raise exception 'CoPilot job-completion assertion failed: draft inspection rejection mutated completion state';
  end if;

  perform set_config('profixiq.inspection_sign', 'on', true);
  update public.inspections
  set status = 'completed',
      completed = true,
      is_draft = false,
      locked = true,
      finalized_at = now(),
      finalized_by = 'a1438000-0000-4000-8000-000000000002'
  where id = 'a1438000-0000-4000-8000-000000000220';
  perform set_config('profixiq.inspection_sign', 'off', true);

  insert into public.inspection_signatures (
    id,
    inspection_id,
    role,
    signed_by,
    signed_name,
    signing_cycle,
    signed_at
  ) values (
    'a1438000-0000-4000-8000-000000000221',
    'a1438000-0000-4000-8000-000000000220',
    'technician',
    'a1438000-0000-4000-8000-000000000002',
    'CoPilot Runtime Technician',
    0,
    now()
  );

  -- Retained non-canonical inspections are immutable evidence history. A
  -- stale draft must not block completion once the canonical inspection is
  -- explicitly complete and signed.
  insert into public.inspections (
    id,
    shop_id,
    work_order_id,
    work_order_line_id,
    status,
    completed,
    is_draft,
    locked,
    signing_cycle,
    is_canonical
  ) values (
    'a1438000-0000-4000-8000-000000000222',
    'a1438000-0000-4000-8000-000000000010',
    'a1438000-0000-4000-8000-000000000102',
    'a1438000-0000-4000-8000-000000000202',
    'draft',
    false,
    true,
    false,
    0,
    false
  );

  perform copilot.technician_event_append_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'action.pending',
    'system',
    'a1438000-0000-5000-a000-000000000414',
    jsonb_build_object(
      'action', 'job.complete',
      'key', 'a1438000-0000-5000-a000-000000000412',
      'turnId', 'runtime-complete-turn',
      'request', jsonb_build_object('type', 'job.complete'),
      'workOrderId', 'a1438000-0000-4000-8000-000000000102',
      'workOrderLineId', 'a1438000-0000-4000-8000-000000000202',
      'lineUpdatedAt', v_line_updated_at
    ),
    now()
  );

  v_complete := copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.complete',
    'a1438000-0000-5000-a000-000000000412',
    null,
    'Confirmed seized inner pad',
    'Clean and lubricate bracket',
    v_line_updated_at
  );
  v_complete_replay := copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-4000-8000-000000000202',
    'job.complete',
    'a1438000-0000-5000-a000-000000000412',
    null,
    'Confirmed seized inner pad',
    'Clean and lubricate bracket',
    v_line_updated_at
  );

  if coalesce((v_complete ->> 'idempotent')::boolean, true)
    or not coalesce((v_complete_replay ->> 'idempotent')::boolean, false)
    or v_complete ->> 'copilotAction' <> 'job.complete'
    or not exists (
      select 1
      from public.work_order_lines wol
      where wol.id = 'a1438000-0000-4000-8000-000000000202'
        and lower(wol.status::text) = 'completed'
        and wol.cause = 'Confirmed seized inner pad'
        and wol.correction = 'Clean and lubricate bracket'
    )
    or exists (
      select 1
      from public.work_order_line_labor_segments segment
      where segment.work_order_line_id = 'a1438000-0000-4000-8000-000000000202'
        and segment.technician_id = 'a1438000-0000-4000-8000-000000000002'
        and segment.ended_at is null
    )
  then
    raise exception 'CoPilot job-completion assertion failed: completion or replay was incoherent';
  end if;

  perform copilot.technician_event_append_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'action.completed',
    'system',
    'a1438000-0000-5000-a000-000000000415',
    jsonb_build_object(
      'action', 'Completed job',
      'key', 'a1438000-0000-5000-a000-000000000412',
      'turnId', 'runtime-complete-turn',
      'ok', true,
      'reply', 'Completed runtime job.',
      'tool', 'job.complete',
      'workOrderId', 'a1438000-0000-4000-8000-000000000102',
      'workOrderLineId', 'a1438000-0000-4000-8000-000000000202'
    ),
    now()
  );

  v_close := copilot.technician_session_close_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id,
    'a1438000-0000-5000-a000-000000000416',
    'completed_last_actionable_line'
  );
  v_closed_read := copilot.technician_session_read_internal(
    'a1438000-0000-4000-8000-000000000002',
    v_active_session_id
  );

  if v_close ->> 'status' <> 'closed'
    or v_closed_read #>> '{session,status}' <> 'closed'
    or not exists (
      select 1
      from copilot.repair_session_events event
      where event.repair_session_id = v_active_session_id
        and event.event_type = 'session.closed'
    )
  then
    raise exception 'CoPilot job-completion assertion failed: completed repair session did not close durably';
  end if;
end
$technician_copilot_job_actions$;

do $technician_copilot_split_identity_completion$
declare
  v_session_id uuid;
  v_parts_session_id uuid;
  v_line_updated_at timestamptz;
begin
  v_session_id := (
    copilot.technician_session_start_internal(
      'a1438000-0000-4000-8000-000000000003',
      'a1438000-0000-4000-8000-000000000104',
      'a1438000-0000-4000-8000-000000000209',
      'shop',
      'a1438000-0000-5000-a000-000000000420'
    ) ->> 'sessionId'
  )::uuid;

  perform copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000003',
    v_session_id,
    'a1438000-0000-4000-8000-000000000209',
    'job.start',
    'a1438000-0000-5000-a000-000000000421'
  );

  update public.work_order_lines
  set labor_time = 1.0,
      cause = 'Split identity cause',
      correction = 'Split identity correction',
      updated_at = now()
  where id = 'a1438000-0000-4000-8000-000000000209'
  returning updated_at into v_line_updated_at;

  perform copilot.technician_event_append_internal(
    'a1438000-0000-4000-8000-000000000003',
    v_session_id,
    'action.pending',
    'system',
    'a1438000-0000-5000-a000-000000000423',
    jsonb_build_object(
      'action', 'job.complete',
      'key', 'a1438000-0000-5000-a000-000000000422',
      'turnId', 'runtime-split-complete-turn',
      'request', jsonb_build_object('type', 'job.complete'),
      'workOrderId', 'a1438000-0000-4000-8000-000000000104',
      'workOrderLineId', 'a1438000-0000-4000-8000-000000000209',
      'lineUpdatedAt', v_line_updated_at
    ),
    now()
  );

  perform copilot.technician_job_action_internal(
    'a1438000-0000-4000-8000-000000000003',
    v_session_id,
    'a1438000-0000-4000-8000-000000000209',
    'job.complete',
    'a1438000-0000-5000-a000-000000000422',
    null,
    'Split identity cause',
    'Split identity correction',
    v_line_updated_at
  );

  if not exists (
    select 1
    from public.work_order_lines wol
    where wol.id = 'a1438000-0000-4000-8000-000000000209'
      and lower(wol.status::text) = 'completed'
  ) or not exists (
    select 1
    from public.work_order_line_labor_segments segment
    where segment.work_order_line_id = 'a1438000-0000-4000-8000-000000000209'
      and segment.technician_id = 'a1438000-0000-4000-8000-000000000004'
      and segment.created_by = 'a1438000-0000-4000-8000-000000000004'
      and segment.ended_at is not null
  ) or not exists (
    select 1
    from public.workforce_operation_keys receipt
    where receipt.operation_key =
      'technician-copilot:a1438000-0000-5000-a000-000000000422'
      and receipt.actor_user_id = 'a1438000-0000-4000-8000-000000000003'
      and receipt.work_order_line_id = 'a1438000-0000-4000-8000-000000000209'
  ) or not exists (
    select 1
    from public.activity_logs log
    where log.target_id = 'a1438000-0000-4000-8000-000000000209'
      and log.user_id = 'a1438000-0000-4000-8000-000000000003'
  ) then
    raise exception 'CoPilot split-identity assertion failed: auth/profile ownership was conflated';
  end if;

  insert into public.work_order_line_technicians (
    work_order_line_id,
    technician_id,
    assigned_by
  ) values (
    'a1438000-0000-4000-8000-000000000210',
    'a1438000-0000-4000-8000-000000000004',
    'a1438000-0000-4000-8000-000000000001'
  )
  on conflict (work_order_line_id, technician_id) do nothing;

  update public.work_order_lines
  set assigned_tech_id = 'a1438000-0000-4000-8000-000000000004',
      assigned_to = null,
      approval_state = 'pending',
      status = 'on_hold',
      hold_reason = 'Awaiting parts quote'
  where id = 'a1438000-0000-4000-8000-000000000210';

  v_parts_session_id := (
    copilot.technician_session_start_internal(
      'a1438000-0000-4000-8000-000000000003',
      'a1438000-0000-4000-8000-000000000104',
      'a1438000-0000-4000-8000-000000000210',
      'shop',
      'a1438000-0000-5000-a000-000000000424'
    ) ->> 'sessionId'
  )::uuid;

  begin
    perform copilot.technician_job_action_internal(
      'a1438000-0000-4000-8000-000000000003',
      v_parts_session_id,
      'a1438000-0000-4000-8000-000000000210',
      'job.start',
      'a1438000-0000-5000-a000-000000000426'
    );
    raise exception 'CoPilot parts-hold assertion failed: protected work started';
  exception when sqlstate 'P0001' then
    if position('PARTS_QUOTE_HOLD_PENDING' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  if exists (
    select 1
    from public.work_order_line_labor_segments segment
    where segment.work_order_line_id = 'a1438000-0000-4000-8000-000000000210'
      and segment.ended_at is null
  ) or not exists (
    select 1
    from public.work_order_lines line
    where line.id = 'a1438000-0000-4000-8000-000000000210'
      and lower(line.status::text) = 'on_hold'
      and line.hold_reason = 'Awaiting parts quote'
  ) then
    raise exception 'CoPilot parts-hold assertion failed: rejected start changed labor state';
  end if;

  update public.work_order_lines
  set assigned_tech_id = null,
      assigned_to = null
  where id = 'a1438000-0000-4000-8000-000000000210';
  delete from public.work_order_line_technicians
  where work_order_line_id = 'a1438000-0000-4000-8000-000000000210'
    and technician_id = 'a1438000-0000-4000-8000-000000000004';

  begin
    perform copilot.technician_session_read_internal(
      'a1438000-0000-4000-8000-000000000003',
      v_session_id
    );
    raise exception 'CoPilot receipt assertion failed: historical completion receipt survived re-anchor';
  exception when sqlstate '42501' then
    if sqlerrm <> 'copilot_work_order_assignment_required' then
      raise;
    end if;
  end;

  insert into public.workforce_operation_keys (
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    work_order_line_id,
    result
  ) values (
    'a1438000-0000-4000-8000-000000000010',
    'job_punch:finish',
    'technician-copilot:a1438000-0000-5000-a000-000000000425',
    'a1438000-0000-4000-8000-000000000004',
    'a1438000-0000-4000-8000-000000000104',
    'a1438000-0000-4000-8000-000000000210',
    '{}'::jsonb
  );

  if not exists (
    select 1
    from public.workforce_operation_keys receipt
    where receipt.operation_key =
      'technician-copilot:a1438000-0000-5000-a000-000000000425'
      and receipt.actor_user_id =
        'a1438000-0000-4000-8000-000000000003'
  ) then
    raise exception 'CoPilot split-identity assertion failed: legacy receipt actor was not normalized';
  end if;
end
$technician_copilot_split_identity_completion$;

do $technician_completion_learning_serialization$
declare
  v_claim record;
  v_finished jsonb;
  v_overlapping integer;
  v_replay integer;
begin
  select batch.*
    into v_claim
  from public.claim_completed_repair_learning_batch(
    'a1438000-0000-5000-a000-000000000430',
    50,
    600
  ) batch
  where batch.work_order_line_id =
    'a1438000-0000-4000-8000-000000000202';

  select count(*)
    into v_overlapping
  from public.claim_completed_repair_learning_batch(
    'a1438000-0000-5000-a000-000000000431',
    50,
    600
  );

  v_finished := public.finish_completed_repair_learning_worker(
    'a1438000-0000-4000-8000-000000000010',
    'a1438000-0000-4000-8000-000000000202',
    v_claim.actor_user_id,
    v_claim.lease_token,
    true,
    '{"ok":true}'::jsonb
  );

  select count(*)
    into v_replay
  from public.claim_completed_repair_learning_batch(
    'a1438000-0000-5000-a000-000000000432',
    50,
    600
  );

  if v_claim.work_order_line_id is distinct from
      'a1438000-0000-4000-8000-000000000202'
    or v_claim.lease_token is null
    or v_overlapping <> 0
    or not coalesce((v_finished ->> 'completed')::boolean, false)
    or v_replay <> 0
    or exists (
      select 1
      from copilot.completed_repair_learning_receipts receipt
      where receipt.shop_id = 'a1438000-0000-4000-8000-000000000010'
        and receipt.work_order_line_id =
          'a1438000-0000-4000-8000-000000000202'
        and (
          receipt.state <> 'completed'
          or receipt.attempt_count <> 2
          or receipt.completed_at > clock_timestamp() + interval '1 minute'
        )
    )
  then
    raise exception 'Completed repair learning assertion failed: replay serialization is incoherent';
  end if;
end
$technician_completion_learning_serialization$;

do $technician_completion_learning_security$
begin
  if has_function_privilege(
      'authenticated',
      'public.claim_completed_repair_learning_atomic(uuid,uuid,uuid,text,uuid,timestamp with time zone)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.finish_completed_repair_learning_atomic(uuid,uuid,uuid,uuid,boolean,jsonb,timestamp with time zone)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.claim_completed_repair_learning_atomic(uuid,uuid,uuid,text,uuid,timestamp with time zone)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.finish_completed_repair_learning_atomic(uuid,uuid,uuid,uuid,boolean,jsonb,timestamp with time zone)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.claim_completed_repair_learning_batch(uuid,integer,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.finish_completed_repair_learning_worker(uuid,uuid,uuid,uuid,boolean,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'copilot.backfill_completed_repair_learning_queue()',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'copilot.backfill_completed_repair_learning_queue()',
      'EXECUTE'
    )
  then
    raise exception 'Completed repair learning assertion failed: browser role can finalize receipts';
  end if;

  insert into auth.users (id, email, raw_user_meta_data)
  values (
    'a1438000-0000-4000-8000-000000000006',
    'copilot-runtime-deleted-tech@example.com',
    '{}'::jsonb
  );

  insert into public.workforce_operation_keys (
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    work_order_line_id,
    result
  ) values (
    'a1438000-0000-4000-8000-000000000010',
    'job_punch:finish',
    'runtime-deleted-technician-finish',
    'a1438000-0000-4000-8000-000000000006',
    'a1438000-0000-4000-8000-000000000102',
    'a1438000-0000-4000-8000-000000000204',
    '{"ok":true,"action":"finish"}'::jsonb
  );

  delete from auth.users
  where id = 'a1438000-0000-4000-8000-000000000006';

  if not exists (
    select 1
    from copilot.completed_repair_learning_receipts receipt
    where receipt.shop_id = 'a1438000-0000-4000-8000-000000000010'
      and receipt.work_order_line_id =
        'a1438000-0000-4000-8000-000000000204'
      and receipt.actor_user_id is null
  ) then
    raise exception 'Completed repair learning assertion failed: user deletion removed or blocked the audit receipt';
  end if;
end
$technician_completion_learning_security$;

do $technician_completion_learning_upgrade_backfill$
declare
  v_backfilled integer;
begin
  insert into public.workforce_operation_keys (
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    work_order_line_id,
    result
  ) values (
    'a1438000-0000-4000-8000-000000000010',
    'job_punch:finish',
    'runtime-historical-finish-with-lost-learning-response',
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000103',
    'a1438000-0000-4000-8000-000000000211',
    '{"ok":true,"action":"finish"}'::jsonb
  );

  -- Recreate the production upgrade state: durable finish committed, old
  -- post-commit learning failed before its receipt was created.
  delete from copilot.completed_repair_learning_receipts
  where shop_id = 'a1438000-0000-4000-8000-000000000010'
    and work_order_line_id = 'a1438000-0000-4000-8000-000000000211';

  v_backfilled := copilot.backfill_completed_repair_learning_queue();

  if v_backfilled < 1
    or not exists (
      select 1
      from copilot.completed_repair_learning_receipts receipt
      where receipt.shop_id = 'a1438000-0000-4000-8000-000000000010'
        and receipt.work_order_line_id =
          'a1438000-0000-4000-8000-000000000211'
        and receipt.operation_key =
          'runtime-historical-finish-with-lost-learning-response'
        and receipt.state = 'retryable'
        and coalesce((receipt.result ->> 'backfilled')::boolean, false)
    )
  then
    raise exception 'Completed repair learning assertion failed: historical finish was not backfilled';
  end if;
end
$technician_completion_learning_upgrade_backfill$;

do $technician_completion_learning_bounded_retry$
declare
  v_claim record;
  v_finish jsonb;
  v_immediate_reclaim integer;
  v_failure integer;
begin
  insert into public.workforce_operation_keys (
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    work_order_line_id,
    result
  ) values (
    'a1438000-0000-4000-8000-000000000010',
    'job_punch:finish',
    repeat('k', 700),
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000103',
    'a1438000-0000-4000-8000-000000000212',
    '{"ok":true,"action":"finish"}'::jsonb
  );

  if not exists (
    select 1
    from copilot.completed_repair_learning_receipts receipt
    where receipt.shop_id = 'a1438000-0000-4000-8000-000000000010'
      and receipt.work_order_line_id =
        'a1438000-0000-4000-8000-000000000212'
      and char_length(receipt.operation_key) = 700
  ) then
    raise exception 'Completed repair learning assertion failed: canonical operation key was truncated or rejected';
  end if;

  update copilot.completed_repair_learning_receipts
  set state = 'completed',
      lease_token = null,
      lease_expires_at = null
  where work_order_line_id <>
    'a1438000-0000-4000-8000-000000000212';

  for v_failure in 1..5 loop
    select batch.*
      into v_claim
    from public.claim_completed_repair_learning_batch(
      'a1438000-0000-5000-a000-000000000440',
      10,
      600
    ) batch
    where batch.work_order_line_id =
      'a1438000-0000-4000-8000-000000000212';

    if not found then
      raise exception 'Completed repair learning assertion failed: retry % was not claimable', v_failure;
    end if;

    v_finish := public.finish_completed_repair_learning_worker(
      'a1438000-0000-4000-8000-000000000010',
      'a1438000-0000-4000-8000-000000000212',
      v_claim.actor_user_id,
      v_claim.lease_token,
      false,
      jsonb_build_object('ok', false, 'failure', v_failure)
    );

    if v_failure < 5 then
      select count(*)
        into v_immediate_reclaim
      from public.claim_completed_repair_learning_batch(
        'a1438000-0000-5000-a000-000000000441',
        10,
        600
      );

      if not coalesce((v_finish ->> 'retryable')::boolean, false)
        or coalesce((v_finish ->> 'failed')::boolean, false)
        or v_immediate_reclaim <> 0
        or not exists (
          select 1
          from copilot.completed_repair_learning_receipts receipt
          where receipt.work_order_line_id =
            'a1438000-0000-4000-8000-000000000212'
            and receipt.state = 'retryable'
            and receipt.lease_expires_at > clock_timestamp()
        )
      then
        raise exception 'Completed repair learning assertion failed: retry backoff % is incoherent', v_failure;
      end if;

      update copilot.completed_repair_learning_receipts
      set lease_expires_at = clock_timestamp() - interval '1 second'
      where work_order_line_id =
        'a1438000-0000-4000-8000-000000000212';
    elsif not coalesce((v_finish ->> 'failed')::boolean, false)
      or coalesce((v_finish ->> 'retryable')::boolean, false)
    then
      raise exception 'Completed repair learning assertion failed: poison receipt did not become terminal';
    end if;
  end loop;

  select count(*)
    into v_immediate_reclaim
  from public.claim_completed_repair_learning_batch(
    'a1438000-0000-5000-a000-000000000442',
    10,
    600
  );

  if v_immediate_reclaim <> 0
    or not exists (
      select 1
      from copilot.completed_repair_learning_receipts receipt
      where receipt.work_order_line_id =
        'a1438000-0000-4000-8000-000000000212'
        and receipt.state = 'failed'
        and receipt.attempt_count = 6
        and coalesce((receipt.result ->> 'terminal')::boolean, false)
    )
  then
    raise exception 'Completed repair learning assertion failed: terminal receipt remained claimable';
  end if;
end
$technician_completion_learning_bounded_retry$;

do $technician_copilot_runtime_schema$
begin
  if exists (
    select 1
    from copilot.repair_session_events e
    left join copilot.repair_sessions rs
      on rs.id = e.repair_session_id
    where rs.id is null
  ) then
    raise exception 'CoPilot runtime assertion failed: orphan repair event exists';
  end if;

  if exists (
    select 1
    from copilot.repair_session_event_context c
    left join copilot.repair_session_events e
      on e.id = c.event_id
    where e.id is null
  ) then
    raise exception 'CoPilot runtime assertion failed: orphan event context exists';
  end if;
end
$technician_copilot_runtime_schema$;

rollback;
