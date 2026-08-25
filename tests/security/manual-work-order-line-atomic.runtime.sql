\set ON_ERROR_STOP on

begin;

do $manual_work_order_line_acl$
begin
  if has_function_privilege(
    'anon',
    'public.create_manual_work_order_line_atomic(uuid,uuid,uuid,uuid,uuid,text,text,numeric,text,text)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.create_manual_work_order_line_atomic(uuid,uuid,uuid,uuid,uuid,text,text,numeric,text,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.create_manual_work_order_line_atomic(uuid,uuid,uuid,uuid,uuid,text,text,numeric,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Manual Work Order line RPC ACL is not service-role-only.';
  end if;
end;
$manual_work_order_line_acl$;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '84510000-0000-4000-8000-000000000001',
    'manual-line-owner-a@example.test',
    '{"full_name":"Manual Line Owner A"}'::jsonb
  ),
  (
    '84510000-0000-4000-8000-000000000002',
    'manual-line-manager-a@example.test',
    '{"full_name":"Manual Line Manager A"}'::jsonb
  ),
  (
    '84520000-0000-4000-8000-000000000002',
    'manual-line-manager-profile-a@example.test',
    '{"full_name":"Manual Line Manager Profile A"}'::jsonb
  ),
  (
    '84510000-0000-4000-8000-000000000003',
    'manual-line-owner-b@example.test',
    '{"full_name":"Manual Line Owner B"}'::jsonb
  ),
  (
    '84510000-0000-4000-8000-000000000004',
    'manual-line-mechanic-a@example.test',
    '{"full_name":"Manual Line Mechanic A"}'::jsonb
  )
on conflict (id) do nothing;

-- The manager fixture models an imported staff identity whose canonical
-- profile UUID differs from auth.uid().
insert into public.profiles (id, user_id, role, full_name)
values
  (
    '84510000-0000-4000-8000-000000000001',
    '84510000-0000-4000-8000-000000000001',
    'owner',
    'Manual Line Owner A'
  ),
  (
    '84520000-0000-4000-8000-000000000002',
    '84510000-0000-4000-8000-000000000002',
    'manager',
    'Manual Line Manager A'
  ),
  (
    '84510000-0000-4000-8000-000000000003',
    '84510000-0000-4000-8000-000000000003',
    'owner',
    'Manual Line Owner B'
  ),
  (
    '84510000-0000-4000-8000-000000000004',
    '84510000-0000-4000-8000-000000000004',
    'mechanic',
    'Manual Line Mechanic A'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  (
    '84530000-0000-4000-8000-000000000001',
    '84510000-0000-4000-8000-000000000001',
    'Manual Line Shop A',
    'Manual Line Shop A',
    5
  ),
  (
    '84530000-0000-4000-8000-000000000002',
    '84510000-0000-4000-8000-000000000003',
    'Manual Line Shop B',
    'Manual Line Shop B',
    5
  )
on conflict (id) do nothing;

-- Baseline profile triggers can initialize user_id from profiles.id. Restore
-- the imported link explicitly after shop creation, then bind every actor to
-- its intended tenant.
update public.profiles
set user_id = case
      when id = '84520000-0000-4000-8000-000000000002'::uuid
        then '84510000-0000-4000-8000-000000000002'::uuid
      else user_id
    end,
    shop_id = case
      when id = '84510000-0000-4000-8000-000000000003'::uuid
        then '84530000-0000-4000-8000-000000000002'::uuid
      else '84530000-0000-4000-8000-000000000001'::uuid
    end
where id in (
  '84510000-0000-4000-8000-000000000001',
  '84520000-0000-4000-8000-000000000002',
  '84510000-0000-4000-8000-000000000003',
  '84510000-0000-4000-8000-000000000004'
);

insert into public.customers (id, shop_id, user_id, name)
values
  (
    '84540000-0000-4000-8000-000000000001',
    '84530000-0000-4000-8000-000000000001',
    '84510000-0000-4000-8000-000000000001',
    'Manual Line Customer A'
  ),
  (
    '84540000-0000-4000-8000-000000000002',
    '84530000-0000-4000-8000-000000000002',
    '84510000-0000-4000-8000-000000000003',
    'Manual Line Customer B'
  );

insert into public.vehicles (
  id,
  shop_id,
  user_id,
  customer_id,
  vin,
  year,
  make,
  model
)
values
  (
    '84550000-0000-4000-8000-000000000001',
    '84530000-0000-4000-8000-000000000001',
    '84510000-0000-4000-8000-000000000001',
    '84540000-0000-4000-8000-000000000001',
    '1FTBW1X80NKA84501',
    2022,
    'Ford',
    'Transit'
  ),
  (
    '84550000-0000-4000-8000-000000000002',
    '84530000-0000-4000-8000-000000000002',
    '84510000-0000-4000-8000-000000000003',
    '84540000-0000-4000-8000-000000000002',
    '1FTBW1X80NKA84502',
    2022,
    'Ford',
    'Transit'
  );

insert into public.work_orders (
  id,
  shop_id,
  customer_id,
  vehicle_id,
  custom_id,
  status
)
values
  (
    '84560000-0000-4000-8000-000000000001',
    '84530000-0000-4000-8000-000000000001',
    '84540000-0000-4000-8000-000000000001',
    '84550000-0000-4000-8000-000000000001',
    'MANUAL-LINE-ACTIVE-A',
    'in_progress'
  ),
  (
    '84560000-0000-4000-8000-000000000002',
    '84530000-0000-4000-8000-000000000001',
    '84540000-0000-4000-8000-000000000001',
    '84550000-0000-4000-8000-000000000001',
    'MANUAL-LINE-TERMINAL-A',
    'completed'
  ),
  (
    '84560000-0000-4000-8000-000000000003',
    '84530000-0000-4000-8000-000000000002',
    '84540000-0000-4000-8000-000000000002',
    '84550000-0000-4000-8000-000000000002',
    'MANUAL-LINE-ACTIVE-B',
    'in_progress'
  );

-- Clean replay retains the canonical status check, which predates the legacy
-- `done` value still normalized as terminal by the application. Model that
-- production legacy row inside this rollback-only transaction.
alter table public.work_orders
  drop constraint work_orders_status_check;

update public.work_orders
set status = 'done'
where id = '84560000-0000-4000-8000-000000000002';

-- Direct authenticated execution must be denied even with a valid same-Shop
-- identity and payload.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"84510000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $manual_work_order_line_authenticated_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.create_manual_work_order_line_atomic(
      '84530000-0000-4000-8000-000000000001',
      '84560000-0000-4000-8000-000000000001',
      '84570000-0000-4000-8000-000000000010',
      '84510000-0000-4000-8000-000000000002',
      '84520000-0000-4000-8000-000000000002',
      'Forbidden authenticated insert',
      null,
      1::numeric,
      null,
      'medium'
    );
  exception
    when insufficient_privilege then
      v_denied := true;
  end;

  if not v_denied then
    raise exception 'Authenticated actor executed the service-only manual line RPC.';
  end if;
end;
$manual_work_order_line_authenticated_denied$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

do $manual_work_order_line_runtime$
declare
  v_result jsonb;
  v_denied boolean;
begin
  -- The parent tenant is part of the lookup, so a Shop A actor cannot bind a
  -- Shop B work order by guessing its UUID.
  v_denied := false;
  begin
    perform public.create_manual_work_order_line_atomic(
      '84530000-0000-4000-8000-000000000001',
      '84560000-0000-4000-8000-000000000003',
      '84570000-0000-4000-8000-000000000002',
      '84510000-0000-4000-8000-000000000002',
      '84520000-0000-4000-8000-000000000002',
      'Cross-Shop parent attempt',
      null,
      null,
      null,
      'low'
    );
  exception
    when others then
      v_denied := sqlstate = 'P0002'
        and position('MANUAL_WORK_ORDER_LINE_NOT_FOUND' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Cross-Shop Work Order binding was not denied.';
  end if;

  -- A canonical profile from another Shop cannot be substituted even though
  -- the service role bypasses table RLS.
  v_denied := false;
  begin
    perform public.create_manual_work_order_line_atomic(
      '84530000-0000-4000-8000-000000000001',
      '84560000-0000-4000-8000-000000000001',
      '84570000-0000-4000-8000-000000000003',
      '84510000-0000-4000-8000-000000000003',
      '84510000-0000-4000-8000-000000000003',
      'Cross-Shop actor attempt',
      null,
      null,
      null,
      'low'
    );
  exception
    when others then
      v_denied := sqlstate = '42501'
        and position('MANUAL_WORK_ORDER_LINE_ACTOR_FORBIDDEN' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Cross-Shop actor profile was not denied.';
  end if;

  -- The canonical profile must also be linked to the authenticated user.
  v_denied := false;
  begin
    perform public.create_manual_work_order_line_atomic(
      '84530000-0000-4000-8000-000000000001',
      '84560000-0000-4000-8000-000000000001',
      '84570000-0000-4000-8000-000000000004',
      '84510000-0000-4000-8000-000000000001',
      '84520000-0000-4000-8000-000000000002',
      'Mismatched actor attempt',
      null,
      null,
      null,
      'low'
    );
  exception
    when others then
      v_denied := sqlstate = '42501'
        and position('MANUAL_WORK_ORDER_LINE_ACTOR_FORBIDDEN' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Mismatched auth user and canonical profile were accepted.';
  end if;

  -- Same-Shop identity alone is insufficient when the profile role cannot
  -- manage Work Orders.
  v_denied := false;
  begin
    perform public.create_manual_work_order_line_atomic(
      '84530000-0000-4000-8000-000000000001',
      '84560000-0000-4000-8000-000000000001',
      '84570000-0000-4000-8000-000000000005',
      '84510000-0000-4000-8000-000000000004',
      '84510000-0000-4000-8000-000000000004',
      'Mechanic actor attempt',
      null,
      null,
      null,
      'low'
    );
  exception
    when others then
      v_denied := sqlstate = '42501'
        and position('MANUAL_WORK_ORDER_LINE_ACTOR_FORBIDDEN' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Same-Shop non-manager actor executed the manual line RPC.';
  end if;

  v_result := public.create_manual_work_order_line_atomic(
    '84530000-0000-4000-8000-000000000001',
    '84560000-0000-4000-8000-000000000001',
    '84570000-0000-4000-8000-000000000001',
    '84510000-0000-4000-8000-000000000002',
    '84520000-0000-4000-8000-000000000002',
    '  Brake vibration  ',
    '   ',
    1.5::numeric,
    'Front pads',
    'high'
  );

  if (v_result ->> 'ok')::boolean is distinct from true
     or (v_result ->> 'idempotent')::boolean is distinct from false
     or (v_result ->> 'line_id')::uuid
       is distinct from '84570000-0000-4000-8000-000000000001'::uuid then
    raise exception 'First manual line creation returned the wrong result: %', v_result;
  end if;

  if not exists (
    select 1
    from public.work_order_lines line
    where line.id = '84570000-0000-4000-8000-000000000001'
      and line.work_order_id = '84560000-0000-4000-8000-000000000001'
      and line.shop_id = '84530000-0000-4000-8000-000000000001'
      and line.vehicle_id = '84550000-0000-4000-8000-000000000001'
      and line.user_id = '84510000-0000-4000-8000-000000000002'
      and line.user_id <> '84520000-0000-4000-8000-000000000002'
      and line.complaint = 'Brake vibration'
      and line.cause is null
      and line.correction is null
      and line.labor_time = 1.5::numeric
      and line.parts = 'Front pads'
      and line.status = 'awaiting_approval'
      and line.approval_state = 'pending'
      and line.job_type = 'repair'
      and line.urgency = 'high'
  ) then
    raise exception 'Manual line did not derive or preserve the canonical payload fields.';
  end if;

  -- An exact retry is accepted before parent lifecycle checks, even when the
  -- parent has since reached a legacy terminal status.
  update public.work_orders
  set status = 'done'
  where id = '84560000-0000-4000-8000-000000000001';

  v_result := public.create_manual_work_order_line_atomic(
    '84530000-0000-4000-8000-000000000001',
    '84560000-0000-4000-8000-000000000001',
    '84570000-0000-4000-8000-000000000001',
    '84510000-0000-4000-8000-000000000002',
    '84520000-0000-4000-8000-000000000002',
    '  Brake vibration  ',
    '   ',
    1.5::numeric,
    'Front pads',
    'high'
  );

  if (v_result ->> 'idempotent')::boolean is distinct from true then
    raise exception 'Exact manual line replay was not idempotent: %', v_result;
  end if;

  v_denied := false;
  begin
    perform public.create_manual_work_order_line_atomic(
      '84530000-0000-4000-8000-000000000001',
      '84560000-0000-4000-8000-000000000001',
      '84570000-0000-4000-8000-000000000001',
      '84510000-0000-4000-8000-000000000002',
      '84520000-0000-4000-8000-000000000002',
      'Different complaint',
      '   ',
      1.5::numeric,
      'Front pads',
      'high'
    );
  exception
    when others then
      v_denied := sqlstate = '23505'
        and position('MANUAL_WORK_ORDER_LINE_ID_CONFLICT' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Conflicting manual line UUID replay was accepted.';
  end if;

  v_denied := false;
  begin
    perform public.create_manual_work_order_line_atomic(
      '84530000-0000-4000-8000-000000000001',
      '84560000-0000-4000-8000-000000000002',
      '84570000-0000-4000-8000-000000000006',
      '84510000-0000-4000-8000-000000000002',
      '84520000-0000-4000-8000-000000000002',
      'Legacy terminal attempt',
      null,
      null,
      null,
      'medium'
    );
  exception
    when others then
      v_denied := sqlstate = '55000'
        and position('MANUAL_WORK_ORDER_LINE_CLOSED' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Legacy terminal `done` Work Order accepted a new line.';
  end if;

  if (
    select count(*)
    from public.work_order_lines
    where id in (
      '84570000-0000-4000-8000-000000000001',
      '84570000-0000-4000-8000-000000000002',
      '84570000-0000-4000-8000-000000000003',
      '84570000-0000-4000-8000-000000000004',
      '84570000-0000-4000-8000-000000000005',
      '84570000-0000-4000-8000-000000000006',
      '84570000-0000-4000-8000-000000000010'
    )
  ) <> 1 then
    raise exception 'Rejected manual line attempts left unexpected rows behind.';
  end if;
end;
$manual_work_order_line_runtime$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

rollback;
