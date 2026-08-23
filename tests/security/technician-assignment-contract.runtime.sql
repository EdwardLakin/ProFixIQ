\set ON_ERROR_STOP on

-- @regression-flow work-orders.technician-assignment
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('72100000-0000-4000-8000-000000000001', 'assignment-owner@example.com', '{"full_name":"Assignment Owner"}'::jsonb),
  ('72100000-0000-4000-8000-000000000002', 'assignment-tech-one@example.com', '{"full_name":"Assignment Tech One"}'::jsonb),
  ('72100000-0000-4000-8000-000000000003', 'assignment-tech-two@example.com', '{"full_name":"Assignment Tech Two"}'::jsonb),
  ('72100000-0000-4000-8000-000000000004', 'assignment-inactive@example.com', '{"full_name":"Assignment Inactive"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('72100000-0000-4000-8000-000000000001', '72100000-0000-4000-8000-000000000001', 'owner', 'Assignment Owner'),
  ('72100000-0000-4000-8000-000000000002', '72100000-0000-4000-8000-000000000002', 'mechanic', 'Assignment Tech One'),
  ('72100000-0000-4000-8000-000000000003', '72100000-0000-4000-8000-000000000003', 'mechanic', 'Assignment Tech Two'),
  ('72100000-0000-4000-8000-000000000004', '72100000-0000-4000-8000-000000000004', 'mechanic', 'Assignment Inactive')
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values (
  '72200000-0000-4000-8000-000000000001',
  '72100000-0000-4000-8000-000000000001',
  'Assignment Contract Shop',
  'Assignment Contract Shop'
);

update public.profiles
set shop_id = '72200000-0000-4000-8000-000000000001'
where id in (
  '72100000-0000-4000-8000-000000000001',
  '72100000-0000-4000-8000-000000000002',
  '72100000-0000-4000-8000-000000000003',
  '72100000-0000-4000-8000-000000000004'
);

insert into public.people_workforce_profiles (
  shop_id, user_id, employment_status, payroll_ready
)
values
  ('72200000-0000-4000-8000-000000000001', '72100000-0000-4000-8000-000000000002', 'active', true),
  ('72200000-0000-4000-8000-000000000001', '72100000-0000-4000-8000-000000000003', 'active', true),
  ('72200000-0000-4000-8000-000000000001', '72100000-0000-4000-8000-000000000004', 'inactive', false);

insert into public.work_orders (id, shop_id, custom_id, status)
values (
  '72300000-0000-4000-8000-000000000001',
  '72200000-0000-4000-8000-000000000001',
  'ASSIGN-1001',
  'in_progress'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, line_type, status, description, assigned_to
)
values
  ('72400000-0000-4000-8000-000000000001', '72200000-0000-4000-8000-000000000001', '72300000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Assign and clear', null),
  ('72400000-0000-4000-8000-000000000002', '72200000-0000-4000-8000-000000000001', '72300000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Stale edit', null),
  ('72400000-0000-4000-8000-000000000003', '72200000-0000-4000-8000-000000000001', '72300000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Inactive technician', null),
  ('72400000-0000-4000-8000-000000000004', '72200000-0000-4000-8000-000000000001', '72300000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Legacy-only ambiguity', '72100000-0000-4000-8000-000000000002');

do $assignment_contract$
declare
  v_before timestamptz;
  v_stale_denied boolean := false;
  v_inactive_denied boolean := false;
  v_report jsonb;
  v_bulk jsonb;
begin
  if has_function_privilege(
    'authenticated',
    'public.mutate_work_order_line_assignment_atomic(uuid,uuid,uuid,uuid,text,text,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated can execute the service-only assignment mutation.';
  end if;

  if exists (
    select 1
    from public.work_order_line_technicians
    where work_order_line_id = '72400000-0000-4000-8000-000000000001'
  ) then
    raise exception 'New assignment fixture was not unassigned.';
  end if;

  select updated_at into v_before
  from public.work_order_lines
  where id = '72400000-0000-4000-8000-000000000001';

  perform public.mutate_work_order_line_assignment_atomic(
    '72200000-0000-4000-8000-000000000001',
    '72400000-0000-4000-8000-000000000001',
    '72100000-0000-4000-8000-000000000002',
    '72100000-0000-4000-8000-000000000001',
    'set_primary',
    'runtime:set-primary',
    v_before
  );
  if not exists (
    select 1
    from public.work_order_lines line
    join public.work_order_line_technicians assignment
      on assignment.work_order_line_id = line.id
     and assignment.technician_id = line.assigned_tech_id
    where line.id = '72400000-0000-4000-8000-000000000001'
      and line.assigned_tech_id = '72100000-0000-4000-8000-000000000002'
      and line.assigned_to is null
  ) then
    raise exception 'Explicit primary did not persist to both canonical sources.';
  end if;

  select updated_at into v_before
  from public.work_order_lines
  where id = '72400000-0000-4000-8000-000000000001';
  perform public.mutate_work_order_line_assignment_atomic(
    '72200000-0000-4000-8000-000000000001',
    '72400000-0000-4000-8000-000000000001',
    '72100000-0000-4000-8000-000000000003',
    '72100000-0000-4000-8000-000000000001',
    'set_primary',
    'runtime:reassign',
    v_before
  );
  if (
    select assigned_tech_id
    from public.work_order_lines
    where id = '72400000-0000-4000-8000-000000000001'
  ) <> '72100000-0000-4000-8000-000000000003'::uuid or (
    select count(*)
    from public.work_order_line_technicians
    where work_order_line_id = '72400000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'Reassignment did not preserve one primary plus explicit supporting technician.';
  end if;

  select updated_at into v_before
  from public.work_order_lines
  where id = '72400000-0000-4000-8000-000000000001';
  perform public.mutate_work_order_line_assignment_atomic(
    '72200000-0000-4000-8000-000000000001',
    '72400000-0000-4000-8000-000000000001',
    null,
    '72100000-0000-4000-8000-000000000001',
    'clear',
    'runtime:clear',
    v_before
  );
  if exists (
    select 1
    from public.work_order_lines line
    left join public.work_order_line_technicians assignment
      on assignment.work_order_line_id = line.id
    where line.id = '72400000-0000-4000-8000-000000000001'
      and (
        line.assigned_tech_id is not null
        or line.assigned_to is not null
        or assignment.id is not null
      )
  ) then
    raise exception 'Clear did not remove every assignment source.';
  end if;

  select updated_at into v_before
  from public.work_order_lines
  where id = '72400000-0000-4000-8000-000000000002';
  perform public.mutate_work_order_line_assignment_atomic(
    '72200000-0000-4000-8000-000000000001',
    '72400000-0000-4000-8000-000000000002',
    '72100000-0000-4000-8000-000000000002',
    '72100000-0000-4000-8000-000000000001',
    'set_primary',
    'runtime:stale:first',
    v_before
  );
  begin
    perform public.mutate_work_order_line_assignment_atomic(
      '72200000-0000-4000-8000-000000000001',
      '72400000-0000-4000-8000-000000000002',
      '72100000-0000-4000-8000-000000000003',
      '72100000-0000-4000-8000-000000000001',
      'set_primary',
      'runtime:stale:second',
      v_before
    );
  exception when others then
    v_stale_denied := position('ASSIGNMENT_STALE' in sqlerrm) > 0;
  end;
  if not v_stale_denied then
    raise exception 'A stale concurrent assignment was accepted.';
  end if;

  begin
    perform public.mutate_work_order_line_assignment_atomic(
      '72200000-0000-4000-8000-000000000001',
      '72400000-0000-4000-8000-000000000003',
      '72100000-0000-4000-8000-000000000004',
      '72100000-0000-4000-8000-000000000001',
      'set_primary',
      'runtime:inactive',
      null
    );
  exception when others then
    v_inactive_denied := position('not active' in sqlerrm) > 0;
  end;
  if not v_inactive_denied then
    raise exception 'An inactive technician was assigned.';
  end if;

  v_report := public.report_work_order_line_assignment_ambiguities(
    '72200000-0000-4000-8000-000000000001'
  );
  if not v_report @> '[{"work_order_line_id":"72400000-0000-4000-8000-000000000004","issue_codes":["legacy_only_assignment"]}]'::jsonb then
    raise exception 'The report did not preserve the legacy-only ambiguity.';
  end if;

  v_bulk := public.assign_work_order_primary_technician_bulk_atomic(
    '72200000-0000-4000-8000-000000000001',
    '72300000-0000-4000-8000-000000000001',
    '72100000-0000-4000-8000-000000000003',
    '72100000-0000-4000-8000-000000000001',
    true,
    'runtime:bulk-only-unassigned'
  );
  if coalesce((v_bulk ->> 'updated_count')::integer, -1) <> 2 then
    raise exception 'Bulk assignment did not update exactly the two truly unassigned lines.';
  end if;
  if not exists (
    select 1
    from public.work_order_lines
    where id = '72400000-0000-4000-8000-000000000004'
      and assigned_tech_id is null
      and assigned_to = '72100000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Only-unassigned bulk assignment overwrote a legacy ambiguity.';
  end if;

  if exists (
    select 1
    from public.work_order_line_labor_segments
    where work_order_id = '72300000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Assignment created a labor segment.';
  end if;
end
$assignment_contract$;

set constraints all immediate;
rollback;
