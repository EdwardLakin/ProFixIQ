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
values (
  'a1438000-0000-4000-8000-000000000010',
  'a1438000-0000-4000-8000-000000000001',
  'CoPilot Runtime Shop',
  'CoPilot Runtime Shop',
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
