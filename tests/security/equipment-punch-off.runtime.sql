\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('7e100000-0000-4000-8000-000000000001', 'eqp-owner@example.test', '{"full_name":"EQP Owner"}'::jsonb),
  ('7e100000-0000-4000-8000-000000000002', 'eqp-tech-1@example.test', '{"full_name":"EQP Tech 1"}'::jsonb),
  ('7e100000-0000-4000-8000-000000000003', 'eqp-tech-2@example.test', '{"full_name":"EQP Tech 2"}'::jsonb),
  ('7e100000-0000-4000-8000-000000000004', 'eqp-tech-3@example.test', '{"full_name":"EQP Tech 3"}'::jsonb),
  ('7e100000-0000-4000-8000-000000000005', 'eqp-tech-4@example.test', '{"full_name":"EQP Tech 4"}'::jsonb),
  ('7e100000-0000-4000-8000-000000000006', 'eqp-tech-5@example.test', '{"full_name":"EQP Tech 5"}'::jsonb),
  ('7e100000-0000-4000-8000-000000000007', 'eqp-tech-6@example.test', '{"full_name":"EQP Tech 6"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('7e100000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-000000000001', 'owner', 'EQP Owner'),
  ('7e100000-0000-4000-8000-000000000002', '7e100000-0000-4000-8000-000000000002', 'mechanic', 'EQP Tech 1'),
  ('7e100000-0000-4000-8000-000000000003', '7e100000-0000-4000-8000-000000000003', 'mechanic', 'EQP Tech 2'),
  ('7e100000-0000-4000-8000-000000000004', '7e100000-0000-4000-8000-000000000004', 'mechanic', 'EQP Tech 3'),
  ('7e100000-0000-4000-8000-000000000005', '7e100000-0000-4000-8000-000000000005', 'mechanic', 'EQP Tech 4'),
  ('7e100000-0000-4000-8000-000000000006', '7e100000-0000-4000-8000-000000000006', 'mechanic', 'EQP Tech 5'),
  ('7e100000-0000-4000-8000-000000000007', '7e100000-0000-4000-8000-000000000007', 'mechanic', 'EQP Tech 6')
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values ('7e200000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-000000000001', 'EQP Shop', 'EQP Shop', 10)
on conflict (id) do nothing;

update public.profiles set shop_id = '7e200000-0000-4000-8000-000000000001'
where id::text like '7e100000-%';

-- The canonical punch requires active shop entitlement.
update public.shops set billing_entitlement_override = 'active'
where id = '7e200000-0000-4000-8000-000000000001';

insert into public.customers (id, shop_id, name)
values ('7e300000-0000-4000-8000-000000000001', '7e200000-0000-4000-8000-000000000001', 'EQP Customer');

insert into public.vehicles (id, shop_id, customer_id, user_id, unit_number, year, make, model)
values ('7e400000-0000-4000-8000-000000000001', '7e200000-0000-4000-8000-000000000001',
        '7e300000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-000000000001', 'EXC-9', 2021, 'Cat', '320');

insert into public.work_orders (id, shop_id, custom_id, vehicle_id, customer_id, status, record_type, advisor_id)
values ('7e500000-0000-4000-8000-000000000001', '7e200000-0000-4000-8000-000000000001', 'EQP-1',
        '7e400000-0000-4000-8000-000000000001', '7e300000-0000-4000-8000-000000000001', 'in_progress', 'work_order',
        '7e100000-0000-4000-8000-000000000001');

insert into public.work_order_lines (id, shop_id, work_order_id, line_type, status, description, assigned_to, assigned_tech_id)
values
  ('7e600000-0000-4000-8000-000000000001', '7e200000-0000-4000-8000-000000000001', '7e500000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Three techs', null, '7e100000-0000-4000-8000-000000000002'),
  ('7e600000-0000-4000-8000-000000000002', '7e200000-0000-4000-8000-000000000001', '7e500000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Held tech does not block', null, '7e100000-0000-4000-8000-000000000005'),
  ('7e600000-0000-4000-8000-000000000003', '7e200000-0000-4000-8000-000000000001', '7e500000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Forgotten timer', null, '7e100000-0000-4000-8000-000000000007');

insert into public.work_order_lines (id, shop_id, work_order_id, line_type, status, description, assigned_to, assigned_tech_id, approval_state)
values
  ('7e600000-0000-4000-8000-000000000004', '7e200000-0000-4000-8000-000000000001', '7e500000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Approval pending', null, '7e100000-0000-4000-8000-000000000006', 'pending');

insert into public.work_order_line_labor_segments
  (shop_id, work_order_id, work_order_line_id, technician_id, created_by, source, started_at)
values
  ('7e200000-0000-4000-8000-000000000001', '7e500000-0000-4000-8000-000000000001',
   '7e600000-0000-4000-8000-000000000004', '7e100000-0000-4000-8000-000000000006',
   '7e100000-0000-4000-8000-000000000006', 'job_punch', now() - interval '1 hour');

-- The canonical finish requires recorded labor time on the line.
update public.work_order_lines set labor_time = 1
where work_order_id = '7e500000-0000-4000-8000-000000000001';

insert into public.work_order_line_technicians (work_order_line_id, technician_id, assigned_by)
values
  ('7e600000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-000000000002', '7e100000-0000-4000-8000-000000000001'),
  ('7e600000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-000000000003', '7e100000-0000-4000-8000-000000000001'),
  ('7e600000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-000000000004', '7e100000-0000-4000-8000-000000000001'),
  ('7e600000-0000-4000-8000-000000000002', '7e100000-0000-4000-8000-000000000005', '7e100000-0000-4000-8000-000000000001'),
  ('7e600000-0000-4000-8000-000000000002', '7e100000-0000-4000-8000-000000000006', '7e100000-0000-4000-8000-000000000001'),
  ('7e600000-0000-4000-8000-000000000003', '7e100000-0000-4000-8000-000000000007', '7e100000-0000-4000-8000-000000000001');

-- Tech 1 and 2 are running on line 1; tech 3 was assigned but never punched on.
insert into public.work_order_line_labor_segments
  (shop_id, work_order_id, work_order_line_id, technician_id, created_by, source, started_at)
select '7e200000-0000-4000-8000-000000000001', '7e500000-0000-4000-8000-000000000001',
       '7e600000-0000-4000-8000-000000000001', t, t, 'job_punch', now() - interval '2 hours'
from (values ('7e100000-0000-4000-8000-000000000002'::uuid), ('7e100000-0000-4000-8000-000000000003'::uuid)) v(t);

-- Line 2: tech 4 running, tech 5 on hold (paused for parts).
insert into public.work_order_line_labor_segments
  (shop_id, work_order_id, work_order_line_id, technician_id, created_by, source, started_at, ended_at, pause_reason)
values
  ('7e200000-0000-4000-8000-000000000001', '7e500000-0000-4000-8000-000000000001',
   '7e600000-0000-4000-8000-000000000002', '7e100000-0000-4000-8000-000000000006',
   '7e100000-0000-4000-8000-000000000006', 'job_punch', now() - interval '3 hours', now() - interval '2 hours', 'parts');
insert into public.work_order_line_labor_segments
  (shop_id, work_order_id, work_order_line_id, technician_id, created_by, source, started_at)
values
  ('7e200000-0000-4000-8000-000000000001', '7e500000-0000-4000-8000-000000000001',
   '7e600000-0000-4000-8000-000000000002', '7e100000-0000-4000-8000-000000000005',
   '7e100000-0000-4000-8000-000000000005', 'job_punch', now() - interval '2 hours');

insert into public.work_order_line_labor_segments
  (shop_id, work_order_id, work_order_line_id, technician_id, created_by, source, started_at)
values
  ('7e200000-0000-4000-8000-000000000001', '7e500000-0000-4000-8000-000000000001',
   '7e600000-0000-4000-8000-000000000003', '7e100000-0000-4000-8000-000000000007',
   '7e100000-0000-4000-8000-000000000007', 'job_punch', now() - interval '4 hours');

-- The owner needs dispatch authority to use the office override.
do $equipment_punch_off$
declare
  shop constant uuid := '7e200000-0000-4000-8000-000000000001';
  t1 constant uuid := '7e100000-0000-4000-8000-000000000002';
  t2 constant uuid := '7e100000-0000-4000-8000-000000000003';
  t3 constant uuid := '7e100000-0000-4000-8000-000000000004';
  line1 constant uuid := '7e600000-0000-4000-8000-000000000001';
  t4 constant uuid := '7e100000-0000-4000-8000-000000000005';
  t6 constant uuid := '7e100000-0000-4000-8000-000000000007';
  line2 constant uuid := '7e600000-0000-4000-8000-000000000002';
  line3 constant uuid := '7e600000-0000-4000-8000-000000000003';
  line4 constant uuid := '7e600000-0000-4000-8000-000000000004';
  owner_id constant uuid := '7e100000-0000-4000-8000-000000000001';
  r jsonb;
  r2 jsonb;
  v_status text;
  v_before text;
  v_failed boolean;
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', t1), true);

  select status::text into v_before from public.work_order_lines where id = line1;

  -- 1. First technician off: only their own labor ends, the line stays open.
  r := public.equipment_punch_off_line_atomic(shop, line1, t1, t1, 'eqp-line1-t1-key', null, null, 'Seal looks worn');
  if (r ->> 'lineClosed')::boolean then raise exception 'first punch-off must not close the line: %', r; end if;
  if jsonb_array_length(r -> 'remaining') <> 1 then raise exception 'one technician should remain: %', r; end if;
  select status::text into v_status from public.work_order_lines where id = line1;
  if v_status is distinct from v_before then raise exception 'line status must be preserved: % -> %', v_before, v_status; end if;
  if exists (select 1 from public.work_order_line_labor_segments
             where work_order_line_id = line1 and technician_id = t1 and ended_at is null) then
    raise exception 'first technician timer should be stopped';
  end if;
  if not exists (select 1 from public.work_order_line_labor_segments
                 where work_order_line_id = line1 and technician_id = t2 and ended_at is null) then
    raise exception 'second technician timer must be untouched';
  end if;

  if not exists (select 1 from public.activity_logs
                 where action = 'equipment_punch_off_note' and target_id = line1
                   and context ->> 'note' = 'Seal looks worn') then
    raise exception 'the technician note must be persisted';
  end if;

  -- 2. Same key replays without a second effect; a changed request is a conflict.
  r2 := public.equipment_punch_off_line_atomic(shop, line1, t1, t1, 'eqp-line1-t1-key', null, null, 'Seal looks worn');
  if not (r2 ->> 'idempotent')::boolean then raise exception 'replay should be idempotent: %', r2; end if;
  v_failed := false;
  begin
    perform public.equipment_punch_off_line_atomic(shop, line1, t1, t1, 'eqp-line1-t1-key', 'different cause');
  exception when others then
    v_failed := sqlerrm like '%EQUIPMENT_PUNCH_OFF_OPERATION_KEY_CONFLICT%';
  end;
  if not v_failed then raise exception 'changed request on same key should conflict'; end if;

  -- 3. A technician cannot punch off someone else, or without a running timer.
  v_failed := false;
  begin
    perform public.equipment_punch_off_line_atomic(shop, line1, t2, t1, 'eqp-line1-spoof-key');
  exception when others then v_failed := sqlerrm like '%denied%';
  end;
  if not v_failed then raise exception 'punching off another technician must be denied'; end if;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', t3), true);
  v_failed := false;
  begin
    perform public.equipment_punch_off_line_atomic(shop, line1, t3, t3, 'eqp-line1-t3-key');
  exception when others then v_failed := sqlerrm like '%no running timer%';
  end;
  if not v_failed then raise exception 'technician without a timer must be refused'; end if;

  -- 4. The last technician off closes the line (assigned-but-never-started t3 does not block),
  --    and needs cause and correction.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', t2), true);
  v_failed := false;
  begin
    perform public.equipment_punch_off_line_atomic(shop, line1, t2, t2, 'eqp-line1-t2-nocause');
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'closing punch-off without cause and correction must be refused'; end if;
  select status::text into v_status from public.work_order_lines where id = line1;
  if v_status = 'completed' then raise exception 'a refused closing punch-off must not complete the line'; end if;

  r := public.equipment_punch_off_line_atomic(shop, line1, t2, t2, 'eqp-line1-t2-key', 'Worn seal', 'Replaced seal');
  if not (r ->> 'lineClosed')::boolean then raise exception 'last punch-off must close the line: %', r; end if;
  select status::text into v_status from public.work_order_lines where id = line1;
  if v_status <> 'completed' then raise exception 'line should be completed, got %', v_status; end if;

  -- 5. A technician on hold is not working, so does not block closing: tech 4
  --    punching off line 2 (tech 5 is on hold) closes it.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', t4), true);
  r := public.equipment_punch_off_line_atomic(shop, line2, t4, t4, 'eqp-line2-t1-key', 'Blown hose', 'Replaced hose');
  if not (r ->> 'lineClosed')::boolean then raise exception 'held technician must not block closing: %', r; end if;

  -- 6. Office override: close a line with a forgotten running timer.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', t1), true);
  v_failed := false;
  begin
    perform public.equipment_close_line_atomic(shop, line3, t1, 'eqp-close-tech-key', 'forgot');
  exception when others then v_failed := sqlerrm like '%denied%';
  end;
  if not v_failed then raise exception 'a technician must not use the office override'; end if;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', owner_id), true);
  v_failed := false;
  begin
    perform public.equipment_close_line_atomic(shop, line3, owner_id, 'eqp-close-noreason', '', 'Cause', 'Fix');
  exception when others then v_failed := sqlerrm like '%reason is required%';
  end;
  if not v_failed then raise exception 'override without a reason must be refused'; end if;

  v_failed := false;
  begin
    perform public.equipment_close_line_atomic(shop, line3, owner_id, 'eqp-close-nocause', 'Tech forgot to punch off');
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'override without cause and correction must be refused'; end if;
  if not exists (select 1 from public.work_order_line_labor_segments
                 where work_order_line_id = line3 and ended_at is null) then
    raise exception 'a refused override must leave timers running';
  end if;

  -- The override keeps the approval fence: approval-pending work cannot be closed.
  v_failed := false;
  begin
    perform public.equipment_close_line_atomic(shop, line4, owner_id, 'eqp-close-pending', 'Tech forgot to punch off', 'Cause', 'Fix');
  exception when others then v_failed := sqlerrm like '%LINE_APPROVAL_PENDING%';
  end;
  if not v_failed then raise exception 'approval-pending line must not be closable by the override'; end if;
  if not exists (select 1 from public.work_order_line_labor_segments
                 where work_order_line_id = line4 and ended_at is null) then
    raise exception 'a refused override must leave the pending line timer running';
  end if;

  r := public.equipment_close_line_atomic(shop, line3, owner_id, 'eqp-close-ok-key', 'Tech forgot to punch off', 'Worn belt', 'Replaced belt');
  if not (r ->> 'lineClosed')::boolean or (r ->> 'timersClosed')::int <> 1 then
    raise exception 'override should close the line and one timer: %', r;
  end if;
  select status::text into v_status from public.work_order_lines where id = line3;
  if v_status <> 'completed' then raise exception 'overridden line should be completed, got %', v_status; end if;
  if exists (select 1 from public.work_order_line_labor_segments
             where work_order_line_id = line3 and ended_at is null) then
    raise exception 'no timer may stay running after the override';
  end if;
  r2 := public.equipment_close_line_atomic(shop, line3, owner_id, 'eqp-close-ok-key', 'Tech forgot to punch off', 'Worn belt', 'Replaced belt');
  if not (r2 ->> 'idempotent')::boolean then raise exception 'override replay should be idempotent: %', r2; end if;

  -- 7. Not callable by signed-in clients directly.
  if has_function_privilege('authenticated',
       'public.equipment_punch_off_line_atomic(uuid,uuid,uuid,uuid,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated',
       'public.equipment_close_line_atomic(uuid,uuid,uuid,text,text,text,text)', 'execute') then
    raise exception 'authenticated must not execute the punch-off or office-close commands';
  end if;
end;
$equipment_punch_off$;

rollback;
