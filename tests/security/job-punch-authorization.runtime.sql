\set ON_ERROR_STOP on

-- @regression-flow work-orders.job-punch-authorization
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('58100000-0000-4000-8000-000000000001', 'job-punch-owner-a@example.test', '{"full_name":"Job Punch Owner A"}'::jsonb),
  ('58100000-0000-4000-8000-000000000002', 'job-punch-imported-tech@example.test', '{"full_name":"Job Punch Imported Tech"}'::jsonb),
  ('58200000-0000-4000-8000-000000000002', 'job-punch-imported-profile@example.test', '{"full_name":"Job Punch Imported Profile"}'::jsonb),
  ('58100000-0000-4000-8000-000000000003', 'job-punch-lead@example.test', '{"full_name":"Job Punch Lead"}'::jsonb),
  ('58100000-0000-4000-8000-000000000004', 'job-punch-parts@example.test', '{"full_name":"Job Punch Parts"}'::jsonb),
  ('58100000-0000-4000-8000-000000000005', 'job-punch-advisor@example.test', '{"full_name":"Job Punch Advisor"}'::jsonb),
  ('58100000-0000-4000-8000-000000000006', 'job-punch-other-tech@example.test', '{"full_name":"Job Punch Other Tech"}'::jsonb),
  ('58100000-0000-4000-8000-000000000007', 'job-punch-owner-b@example.test', '{"full_name":"Job Punch Owner B"}'::jsonb)
on conflict (id) do nothing;

-- Model an imported technician whose canonical Workforce profile differs from
-- the authenticated subject created by Supabase Auth.
delete from public.profiles
where id = '58100000-0000-4000-8000-000000000002';

insert into public.profiles (id, user_id, role, full_name)
values
  ('58100000-0000-4000-8000-000000000001', '58100000-0000-4000-8000-000000000001', 'owner', 'Job Punch Owner A'),
  ('58200000-0000-4000-8000-000000000002', '58100000-0000-4000-8000-000000000002', 'mechanic', 'Job Punch Imported Tech'),
  ('58100000-0000-4000-8000-000000000003', '58100000-0000-4000-8000-000000000003', 'lead_hand', 'Job Punch Lead'),
  ('58100000-0000-4000-8000-000000000004', '58100000-0000-4000-8000-000000000004', 'parts', 'Job Punch Parts'),
  ('58100000-0000-4000-8000-000000000005', '58100000-0000-4000-8000-000000000005', 'advisor', 'Job Punch Advisor'),
  ('58100000-0000-4000-8000-000000000006', '58100000-0000-4000-8000-000000000006', 'mechanic', 'Job Punch Other Tech'),
  ('58100000-0000-4000-8000-000000000007', '58100000-0000-4000-8000-000000000007', 'owner', 'Job Punch Owner B')
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

-- The profile insert trigger initializes user_id from id. Restore the linked
-- Supabase Auth identity after inserting the canonical imported staff row.
update public.profiles
set user_id = '58100000-0000-4000-8000-000000000002'
where id = '58200000-0000-4000-8000-000000000002';

insert into public.shops (id, owner_id, business_name, name)
values
  ('58300000-0000-4000-8000-000000000001', '58100000-0000-4000-8000-000000000001', 'Job Punch Shop A', 'Job Punch Shop A'),
  ('58300000-0000-4000-8000-000000000002', '58100000-0000-4000-8000-000000000007', 'Job Punch Shop B', 'Job Punch Shop B')
on conflict (id) do nothing;

update public.profiles
set shop_id = case
  when id = '58100000-0000-4000-8000-000000000007'::uuid
    then '58300000-0000-4000-8000-000000000002'::uuid
  else '58300000-0000-4000-8000-000000000001'::uuid
end
where id in (
  '58100000-0000-4000-8000-000000000001',
  '58200000-0000-4000-8000-000000000002',
  '58100000-0000-4000-8000-000000000003',
  '58100000-0000-4000-8000-000000000004',
  '58100000-0000-4000-8000-000000000005',
  '58100000-0000-4000-8000-000000000006',
  '58100000-0000-4000-8000-000000000007'
);

insert into public.work_orders (id, shop_id, custom_id, status)
values
  ('58500000-0000-4000-8000-000000000001', '58300000-0000-4000-8000-000000000001', 'PUNCH-A-1001', 'in_progress'),
  ('58500000-0000-4000-8000-000000000002', '58300000-0000-4000-8000-000000000002', 'PUNCH-B-1001', 'in_progress');

insert into public.work_order_lines (
  id,
  shop_id,
  work_order_id,
  line_type,
  status,
  description,
  labor_time,
  assigned_tech_id
)
values
  ('58600000-0000-4000-8000-000000000001', '58300000-0000-4000-8000-000000000001', '58500000-0000-4000-8000-000000000001', 'job', 'awaiting', 'Imported mechanic lifecycle', 1, '58200000-0000-4000-8000-000000000002'),
  ('58600000-0000-4000-8000-000000000002', '58300000-0000-4000-8000-000000000001', '58500000-0000-4000-8000-000000000001', 'job', 'awaiting', 'Unassigned mechanic denial', 1, null),
  ('58600000-0000-4000-8000-000000000003', '58300000-0000-4000-8000-000000000001', '58500000-0000-4000-8000-000000000001', 'job', 'awaiting', 'Delegated Parts execution', 1, '58100000-0000-4000-8000-000000000004'),
  ('58600000-0000-4000-8000-000000000004', '58300000-0000-4000-8000-000000000001', '58500000-0000-4000-8000-000000000001', 'job', 'awaiting', 'Lead Hand execution', 1, '58100000-0000-4000-8000-000000000003'),
  ('58600000-0000-4000-8000-000000000005', '58300000-0000-4000-8000-000000000001', '58500000-0000-4000-8000-000000000001', 'job', 'awaiting', 'Other technician spoof denial', 1, '58100000-0000-4000-8000-000000000006'),
  ('58600000-0000-4000-8000-000000000006', '58300000-0000-4000-8000-000000000002', '58500000-0000-4000-8000-000000000002', 'job', 'awaiting', 'Cross-Shop denial', 1, '58100000-0000-4000-8000-000000000007'),
  ('58600000-0000-4000-8000-000000000007', '58300000-0000-4000-8000-000000000001', '58500000-0000-4000-8000-000000000001', 'job', 'awaiting', 'Individual deny override', 1, '58200000-0000-4000-8000-000000000002'),
  ('58600000-0000-4000-8000-000000000008', '58300000-0000-4000-8000-000000000001', '58500000-0000-4000-8000-000000000001', 'job', 'awaiting', 'Advisor capability denial', 1, '58100000-0000-4000-8000-000000000005');

insert into public.work_order_line_technicians (
  work_order_line_id, technician_id, assigned_by
)
values
  ('58600000-0000-4000-8000-000000000001', '58200000-0000-4000-8000-000000000002', '58100000-0000-4000-8000-000000000001'),
  ('58600000-0000-4000-8000-000000000003', '58100000-0000-4000-8000-000000000004', '58100000-0000-4000-8000-000000000001'),
  ('58600000-0000-4000-8000-000000000004', '58100000-0000-4000-8000-000000000003', '58100000-0000-4000-8000-000000000001'),
  ('58600000-0000-4000-8000-000000000005', '58100000-0000-4000-8000-000000000006', '58100000-0000-4000-8000-000000000001'),
  ('58600000-0000-4000-8000-000000000006', '58100000-0000-4000-8000-000000000007', '58100000-0000-4000-8000-000000000007'),
  ('58600000-0000-4000-8000-000000000007', '58200000-0000-4000-8000-000000000002', '58100000-0000-4000-8000-000000000001'),
  ('58600000-0000-4000-8000-000000000008', '58100000-0000-4000-8000-000000000005', '58100000-0000-4000-8000-000000000001')
on conflict (work_order_line_id, technician_id) do nothing;

insert into public.tech_shifts (
  id, shop_id, user_id, status, type, start_time, end_time
)
values
  ('58700000-0000-4000-8000-000000000001', '58300000-0000-4000-8000-000000000001', '58200000-0000-4000-8000-000000000002', 'active', 'shift', now() - interval '2 hours', null),
  ('58700000-0000-4000-8000-000000000002', '58300000-0000-4000-8000-000000000001', '58100000-0000-4000-8000-000000000003', 'active', 'shift', now() - interval '2 hours', null),
  ('58700000-0000-4000-8000-000000000003', '58300000-0000-4000-8000-000000000001', '58100000-0000-4000-8000-000000000004', 'active', 'shift', now() - interval '2 hours', null),
  ('58700000-0000-4000-8000-000000000004', '58300000-0000-4000-8000-000000000001', '58100000-0000-4000-8000-000000000006', 'active', 'shift', now() - interval '2 hours', null),
  ('58700000-0000-4000-8000-000000000005', '58300000-0000-4000-8000-000000000001', '58100000-0000-4000-8000-000000000005', 'active', 'shift', now() - interval '2 hours', null)
on conflict (id) do nothing;

do $job_punch_contract$
begin
  if not exists (
    select 1
    from public.workspace_capabilities
    where capability_key = 'work_order.job.execute'
      and access_level = 'manage'
      and not is_protected
  ) then
    raise exception 'Job execution capability is not registered as grantable.';
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
    raise exception 'Private job punch core is directly executable.';
  end if;
end
$job_punch_contract$;

-- The imported assigned mechanic cannot read the financially restricted base
-- row, but the canonical transition succeeds because its wrapper resolves and
-- authorizes the locked line under SECURITY DEFINER.
select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

do $job_punch_imported_mechanic$
declare
  v_result jsonb;
  v_denied boolean := false;
begin
  if exists (
    select 1
    from public.work_order_lines
    where id = '58600000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Mechanic unexpectedly bypassed the financial base-row read boundary.';
  end if;

  v_result := public.apply_job_punch_transition_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58600000-0000-4000-8000-000000000001',
    'start',
    '58200000-0000-4000-8000-000000000002',
    '58100000-0000-4000-8000-000000000002',
    'job-punch-runtime:mechanic:start',
    false,
    now() - interval '50 minutes'
  );
  if v_result ->> 'action' <> 'start' then
    raise exception 'Assigned imported mechanic could not start labor: %', v_result;
  end if;

  perform public.apply_job_punch_transition_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58600000-0000-4000-8000-000000000001',
    'pause',
    '58200000-0000-4000-8000-000000000002',
    '58100000-0000-4000-8000-000000000002',
    'job-punch-runtime:mechanic:pause',
    false,
    now() - interval '40 minutes',
    null,
    'runtime pause'
  );

  perform public.apply_job_punch_transition_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58600000-0000-4000-8000-000000000001',
    'resume',
    '58200000-0000-4000-8000-000000000002',
    '58100000-0000-4000-8000-000000000002',
    'job-punch-runtime:mechanic:resume',
    false,
    now() - interval '30 minutes'
  );

  v_result := public.apply_job_punch_transition_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58600000-0000-4000-8000-000000000001',
    'finish',
    '58200000-0000-4000-8000-000000000002',
    '58100000-0000-4000-8000-000000000002',
    'job-punch-runtime:mechanic:finish',
    false,
    now() - interval '20 minutes',
    null,
    null,
    null,
    false,
    false,
    'Failed wheel bearing',
    'Replaced wheel bearing'
  );
  if v_result ->> 'action' <> 'finish' then
    raise exception 'Assigned imported mechanic could not finish labor: %', v_result;
  end if;

  v_result := public.apply_job_punch_transition_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58600000-0000-4000-8000-000000000001',
    'finish',
    '58200000-0000-4000-8000-000000000002',
    '58100000-0000-4000-8000-000000000002',
    'job-punch-runtime:mechanic:finish',
    false,
    now() - interval '20 minutes',
    null,
    null,
    null,
    false,
    false,
    'Failed wheel bearing',
    'Replaced wheel bearing'
  );
  if not coalesce((v_result ->> 'idempotent')::boolean, false) then
    raise exception 'Authorized job completion replay lost idempotency.';
  end if;

  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000002',
      'start',
      '58200000-0000-4000-8000-000000000002',
      '58100000-0000-4000-8000-000000000002',
      'job-punch-runtime:mechanic:unassigned'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Mechanic executed an unassigned repair line.';
  end if;

  v_denied := false;
  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000005',
      'start',
      '58100000-0000-4000-8000-000000000006',
      '58100000-0000-4000-8000-000000000002',
      'job-punch-runtime:mechanic:spoof'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Mechanic executed another technician''s assigned job.';
  end if;

  v_denied := false;
  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000002',
      '58600000-0000-4000-8000-000000000006',
      'start',
      '58100000-0000-4000-8000-000000000007',
      '58100000-0000-4000-8000-000000000002',
      'job-punch-runtime:mechanic:cross-shop'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Mechanic executed a cross-Shop repair line.';
  end if;
end
$job_punch_imported_mechanic$;

reset role;
select set_config('request.jwt.claims', '', true);

-- A lost response must remain replayable by the original authenticated actor
-- after dispatch reassigns the completed line. Fresh commands from that actor
-- stay subject to the current assignment, and another actor cannot claim the
-- original receipt.
delete from public.work_order_line_technicians
where work_order_line_id = '58600000-0000-4000-8000-000000000001';

insert into public.work_order_line_technicians (
  work_order_line_id, technician_id, assigned_by
) values (
  '58600000-0000-4000-8000-000000000001',
  '58100000-0000-4000-8000-000000000006',
  '58100000-0000-4000-8000-000000000001'
);

update public.work_order_lines
set assigned_tech_id = '58100000-0000-4000-8000-000000000006'
where id = '58600000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

do $job_punch_reassigned_receipt$
declare
  v_result jsonb;
  v_fresh_denied boolean := false;
begin
  v_result := public.apply_job_punch_transition_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58600000-0000-4000-8000-000000000001',
    'finish',
    '58200000-0000-4000-8000-000000000002',
    '58100000-0000-4000-8000-000000000002',
    'job-punch-runtime:mechanic:finish',
    false,
    now() - interval '20 minutes',
    null,
    null,
    null,
    false,
    false,
    'Failed wheel bearing',
    'Replaced wheel bearing'
  );

  if not coalesce((v_result ->> 'idempotent')::boolean, false) then
    raise exception 'Original actor lost a committed receipt after technician reassignment.';
  end if;

  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000001',
      'finish',
      '58200000-0000-4000-8000-000000000002',
      '58100000-0000-4000-8000-000000000002',
      'job-punch-runtime:mechanic:fresh-after-reassignment'
    );
  exception when insufficient_privilege then
    v_fresh_denied := true;
  end;

  if not v_fresh_denied then
    raise exception 'Reassigned technician executed a fresh command on the former job.';
  end if;
end
$job_punch_reassigned_receipt$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;

do $job_punch_foreign_receipt$
declare
  v_conflicted boolean := false;
begin
  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000001',
      'finish',
      '58100000-0000-4000-8000-000000000006',
      '58100000-0000-4000-8000-000000000006',
      'job-punch-runtime:mechanic:finish'
    );
  exception when unique_violation then
    v_conflicted := true;
  end;

  if not v_conflicted then
    raise exception 'A different actor claimed an existing job-punch receipt.';
  end if;
end
$job_punch_foreign_receipt$;

reset role;
select set_config('request.jwt.claims', '', true);

-- The canonical shift-punch contract permits assignment managers to end
-- another technician's shift. Preserve that coordinated cleanup without
-- opening direct cross-technician execution to other same-Shop staff.
select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;

select public.apply_job_punch_transition_atomic(
  '58300000-0000-4000-8000-000000000001',
  '58600000-0000-4000-8000-000000000005',
  'start',
  '58100000-0000-4000-8000-000000000006',
  '58100000-0000-4000-8000-000000000006',
  'job-punch-runtime:other-tech:before-manager-end',
  false,
  now() - interval '18 minutes'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

do $job_punch_non_manager_cleanup_denial$
declare
  v_denied boolean := false;
begin
  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000005',
      'pause',
      '58100000-0000-4000-8000-000000000006',
      '58100000-0000-4000-8000-000000000004',
      'job-punch-runtime:parts:manager-cleanup-denied',
      true,
      now() - interval '12 minutes',
      null,
      'must remain denied',
      null,
      true,
      false
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;

  if not v_denied or not exists (
    select 1
    from public.work_order_line_labor_segments segment
    where segment.shop_id = '58300000-0000-4000-8000-000000000001'
      and segment.work_order_line_id = '58600000-0000-4000-8000-000000000005'
      and segment.technician_id = '58100000-0000-4000-8000-000000000006'
      and segment.ended_at is null
  ) then
    raise exception 'Non-manager used coordinated cleanup for another technician';
  end if;
end
$job_punch_non_manager_cleanup_denial$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

do $job_punch_assignment_manager_shift_end$
declare
  v_result jsonb;
  v_line_status_before text;
begin
  select line.status::text
    into v_line_status_before
  from public.work_order_lines line
  where line.id = '58600000-0000-4000-8000-000000000005'
    and line.shop_id = '58300000-0000-4000-8000-000000000001';

  v_result := public.apply_canonical_offline_shift_punch_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58100000-0000-4000-8000-000000000001',
    '58100000-0000-4000-8000-000000000001',
    'job-punch-runtime:owner:other-tech-shift-end',
    '58700000-0000-4000-8000-000000000004',
    'end_shift',
    now() - interval '8 minutes',
    'runtime assignment-manager cleanup'
  );

  if v_result ->> 'action_type' is distinct from 'shift:punch-event'
     or exists (
       select 1
       from public.work_order_line_labor_segments segment
       where segment.shop_id = '58300000-0000-4000-8000-000000000001'
         and segment.work_order_line_id = '58600000-0000-4000-8000-000000000005'
         and segment.technician_id = '58100000-0000-4000-8000-000000000006'
         and segment.ended_at is null
     )
     or not exists (
       select 1
       from public.work_order_lines line
       where line.id = '58600000-0000-4000-8000-000000000005'
         and line.shop_id = '58300000-0000-4000-8000-000000000001'
         and line.status::text = v_line_status_before
     ) then
    raise exception 'Assignment manager did not close another technician''s active labor: %', v_result;
  end if;
end
$job_punch_assignment_manager_shift_end$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Advisor can inspect and manage Work Orders but is not a technician executor.
-- Assignment alone must not grant a job-punch capability.
select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
set local role authenticated;

do $job_punch_advisor_default_deny$
declare
  v_denied boolean := false;
begin
  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000008',
      'start',
      '58100000-0000-4000-8000-000000000005',
      '58100000-0000-4000-8000-000000000005',
      'job-punch-runtime:advisor:denied'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Advisor inherited technician job execution from assignment alone.';
  end if;
end
$job_punch_advisor_default_deny$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Parts is denied by the preset even when directly assigned. An explicit
-- tenant-scoped individual override can delegate the existing capability.
select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

do $job_punch_parts_default_deny$
declare
  v_denied boolean := false;
begin
  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000003',
      'start',
      '58100000-0000-4000-8000-000000000004',
      '58100000-0000-4000-8000-000000000004',
      'job-punch-runtime:parts:denied'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Parts inherited job execution without a capability override.';
  end if;
end
$job_punch_parts_default_deny$;

reset role;

insert into public.staff_capability_overrides (
  shop_id, profile_id, capability_key, effect,
  changed_by_profile_id
) values (
  '58300000-0000-4000-8000-000000000001',
  '58100000-0000-4000-8000-000000000004',
  'work_order.job.execute',
  'allow',
  '58100000-0000-4000-8000-000000000001'
);

set local role authenticated;
do $job_punch_parts_delegated$
begin
  perform public.apply_job_punch_transition_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58600000-0000-4000-8000-000000000003',
    'start',
    '58100000-0000-4000-8000-000000000004',
    '58100000-0000-4000-8000-000000000004',
    'job-punch-runtime:parts:delegated:start',
    false,
    now() - interval '15 minutes'
  );
  perform public.apply_job_punch_transition_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58600000-0000-4000-8000-000000000003',
    'pause',
    '58100000-0000-4000-8000-000000000004',
    '58100000-0000-4000-8000-000000000004',
    'job-punch-runtime:parts:delegated:pause',
    false,
    now() - interval '10 minutes'
  );
end
$job_punch_parts_delegated$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Start while execution is allowed, then revoke it. Authenticated self
-- break/end-shift coordination must still close the already-authorized segment
-- without gaining any start, resume, finish, or status-changing pause access.
select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

do $job_punch_before_individual_deny$
declare
  v_result jsonb;
begin
  v_result := public.apply_job_punch_transition_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58600000-0000-4000-8000-000000000007',
    'start',
    '58200000-0000-4000-8000-000000000002',
    '58100000-0000-4000-8000-000000000002',
    'job-punch-runtime:mechanic:before-individual-deny',
    false,
    now() - interval '12 minutes'
  );

  if v_result ->> 'action' is distinct from 'start' or not exists (
    select 1
    from public.work_order_line_labor_segments segment
    where segment.shop_id = '58300000-0000-4000-8000-000000000001'
      and segment.work_order_line_id = '58600000-0000-4000-8000-000000000007'
      and segment.technician_id = '58200000-0000-4000-8000-000000000002'
      and segment.ended_at is null
  ) then
    raise exception 'Allowed labor was not active before capability revocation: %', v_result;
  end if;
end
$job_punch_before_individual_deny$;

reset role;
select set_config('request.jwt.claims', '', true);

insert into public.staff_capability_overrides (
  shop_id, profile_id, capability_key, effect,
  changed_by_profile_id
) values (
  '58300000-0000-4000-8000-000000000001',
  '58200000-0000-4000-8000-000000000002',
  'work_order.job.execute',
  'deny',
  '58100000-0000-4000-8000-000000000001'
);

-- Capture the canonical lifecycle state while the fixture still has privileged
-- visibility. Once the individual deny is active, the Mechanic intentionally
-- cannot read the financial-gated base row through RLS; the cleanup RPC must
-- still prove that it preserved this exact state in its canonical response.
select set_config(
  'profixiq_test.job_punch_individual_deny_status',
  (
    select line.status::text
    from public.work_order_lines line
    where line.id = '58600000-0000-4000-8000-000000000007'
      and line.shop_id = '58300000-0000-4000-8000-000000000001'
  ),
  true
);

select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

do $job_punch_individual_deny$
declare
  v_result jsonb;
  v_line_status_before text := current_setting(
    'profixiq_test.job_punch_individual_deny_status'
  );
  v_start_denied boolean := false;
  v_resume_denied boolean := false;
  v_finish_denied boolean := false;
  v_status_pause_denied boolean := false;
  v_empty_cleanup_denied boolean := false;
begin
  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000007',
      'start',
      '58200000-0000-4000-8000-000000000002',
      '58100000-0000-4000-8000-000000000002',
      'job-punch-runtime:mechanic:individual-deny:start'
    );
  exception when insufficient_privilege then
    v_start_denied := true;
  end;
  if not v_start_denied then
    raise exception 'Individual deny did not override mechanic execution preset.';
  end if;

  v_result := public.pause_all_active_technician_labor_atomic(
    '58300000-0000-4000-8000-000000000001',
    '58200000-0000-4000-8000-000000000002',
    '58200000-0000-4000-8000-000000000002',
    'job-punch-runtime:mechanic:revoked-self-cleanup',
    now() - interval '8 minutes',
    'runtime shift cleanup',
    'job_stopped_at_end_day',
    null,
    '{"source":"runtime_authenticated_self_cleanup"}'::jsonb
  );

  if (v_result ->> 'closed_line_count')::integer <> 1
     or exists (
       select 1
       from public.work_order_line_labor_segments segment
       where segment.shop_id = '58300000-0000-4000-8000-000000000001'
         and segment.work_order_line_id = '58600000-0000-4000-8000-000000000007'
         and segment.technician_id = '58200000-0000-4000-8000-000000000002'
         and segment.ended_at is null
     )
     or v_result #>> '{transitions,0,line,status}'
          is distinct from v_line_status_before then
    raise exception 'Revoked authenticated self cleanup did not close only active labor: %', v_result;
  end if;

  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000007',
      'resume',
      '58200000-0000-4000-8000-000000000002',
      '58100000-0000-4000-8000-000000000002',
      'job-punch-runtime:mechanic:individual-deny:resume'
    );
  exception when insufficient_privilege then
    v_resume_denied := true;
  end;

  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000007',
      'finish',
      '58200000-0000-4000-8000-000000000002',
      '58100000-0000-4000-8000-000000000002',
      'job-punch-runtime:mechanic:individual-deny:finish'
    );
  exception when insufficient_privilege then
    v_finish_denied := true;
  end;

  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000007',
      'pause',
      '58200000-0000-4000-8000-000000000002',
      '58100000-0000-4000-8000-000000000002',
      'job-punch-runtime:mechanic:individual-deny:status-pause',
      false,
      now(),
      null,
      'must remain denied',
      null,
      false
    );
  exception when insufficient_privilege then
    v_status_pause_denied := true;
  end;

  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000007',
      'pause',
      '58200000-0000-4000-8000-000000000002',
      '58100000-0000-4000-8000-000000000002',
      'job-punch-runtime:mechanic:individual-deny:empty-cleanup',
      true,
      now(),
      null,
      'must have active labor',
      null,
      true,
      false
    );
  exception when insufficient_privilege then
    v_empty_cleanup_denied := true;
  end;

  if not v_resume_denied
     or not v_finish_denied
     or not v_status_pause_denied
     or not v_empty_cleanup_denied then
    raise exception 'Capability revocation opened a broader direct action.';
  end if;
end
$job_punch_individual_deny$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Lead Hand is an established execution role. Leave labor open, revoke the
-- capability, then prove the service-role scheduled shift cleanup can close it
-- while a direct service-role start remains denied.
select set_config(
  'request.jwt.claims',
  '{"sub":"58100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select public.apply_job_punch_transition_atomic(
  '58300000-0000-4000-8000-000000000001',
  '58600000-0000-4000-8000-000000000004',
  'start',
  '58100000-0000-4000-8000-000000000003',
  '58100000-0000-4000-8000-000000000003',
  'job-punch-runtime:lead:start',
  false,
  now() - interval '8 minutes'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into public.staff_capability_overrides (
  shop_id, profile_id, capability_key, effect,
  changed_by_profile_id
) values (
  '58300000-0000-4000-8000-000000000001',
  '58100000-0000-4000-8000-000000000003',
  'work_order.job.execute',
  'deny',
  '58100000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;

do $job_punch_service_coordination$
declare
  v_result jsonb;
  v_line_status_before text;
  v_start_denied boolean := false;
begin
  select line.status::text
    into v_line_status_before
  from public.work_order_lines line
  where line.id = '58600000-0000-4000-8000-000000000004'
    and line.shop_id = '58300000-0000-4000-8000-000000000001';

  v_result := public.complete_scheduled_shift_end_atomic(
    '58700000-0000-4000-8000-000000000002',
    '58300000-0000-4000-8000-000000000001',
    '58100000-0000-4000-8000-000000000003',
    now() - interval '5 minutes',
    now(),
    'runtime',
    current_date
  );
  if not coalesce((v_result ->> 'closed')::boolean, false)
     or (v_result ->> 'closed_line_count')::integer <> 1
     or exists (
       select 1
       from public.work_order_line_labor_segments segment
       where segment.shop_id = '58300000-0000-4000-8000-000000000001'
         and segment.work_order_line_id = '58600000-0000-4000-8000-000000000004'
         and segment.technician_id = '58100000-0000-4000-8000-000000000003'
         and segment.ended_at is null
     )
     or not exists (
       select 1
       from public.work_order_lines line
       where line.id = '58600000-0000-4000-8000-000000000004'
         and line.shop_id = '58300000-0000-4000-8000-000000000001'
         and line.status::text = v_line_status_before
     ) then
    raise exception 'Revoked service scheduled-shift cleanup did not close Lead Hand labor: %', v_result;
  end if;

  begin
    perform public.apply_job_punch_transition_atomic(
      '58300000-0000-4000-8000-000000000001',
      '58600000-0000-4000-8000-000000000004',
      'start',
      '58100000-0000-4000-8000-000000000003',
      '58100000-0000-4000-8000-000000000003',
      'job-punch-runtime:lead:service-start-denied'
    );
  exception when insufficient_privilege then
    v_start_denied := true;
  end;

  if not v_start_denied then
    raise exception 'Revoked service cleanup exception allowed a direct start.';
  end if;
end
$job_punch_service_coordination$;

reset role;
select set_config('request.jwt.claims', '', true);

rollback;
