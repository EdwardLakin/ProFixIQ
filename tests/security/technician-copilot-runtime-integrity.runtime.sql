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
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

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
  'a1438000-0000-4000-8000-000000000002'
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
    'a1438000-0000-4000-8000-000000000002',
    'Runtime lifecycle one'
  ),
  (
    'a1438000-0000-4000-8000-000000000202',
    'a1438000-0000-4000-8000-000000000102',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'waiting_parts',
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000002',
    'Runtime lifecycle two'
  ),
  (
    'a1438000-0000-4000-8000-000000000203',
    'a1438000-0000-4000-8000-000000000103',
    'a1438000-0000-4000-8000-000000000010',
    'job',
    'active',
    'a1438000-0000-4000-8000-000000000002',
    'a1438000-0000-4000-8000-000000000002',
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
  )
on conflict (id) do nothing;

insert into public.tech_shifts (
  id,
  shop_id,
  user_id,
  status,
  type,
  start_time,
  end_time
)
values (
  'a1438000-0000-4000-8000-000000000206',
  'a1438000-0000-4000-8000-000000000010',
  'a1438000-0000-4000-8000-000000000002',
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
end
$technician_copilot_job_actions$;

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
