\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'ba250000-0000-4000-8000-000000000001',
    'child-tenant-owner-a@example.com',
    '{"full_name":"Child Tenant Owner A"}'::jsonb
  ),
  (
    'ba250000-0000-4000-8000-000000000002',
    'child-tenant-owner-b@example.com',
    '{"full_name":"Child Tenant Owner B"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  (
    'ba250000-0000-4000-8000-000000000001',
    'ba250000-0000-4000-8000-000000000001',
    'owner', 'Child Tenant Owner A',
    'child-tenant-owner-a@example.com', null
  ),
  (
    'ba250000-0000-4000-8000-000000000002',
    'ba250000-0000-4000-8000-000000000002',
    'owner', 'Child Tenant Owner B',
    'child-tenant-owner-b@example.com', null
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id,
  owner_id,
  business_name,
  name,
  plan,
  user_limit,
  billing_entitlement_override
)
values
  (
    'bb250000-0000-4000-8000-000000000001',
    'ba250000-0000-4000-8000-000000000001',
    'Child Tenant Runtime A',
    'Child Tenant Runtime A',
    'complete_10', 10, 'internal_demo'
  ),
  (
    'bb250000-0000-4000-8000-000000000002',
    'ba250000-0000-4000-8000-000000000002',
    'Child Tenant Runtime B',
    'Child Tenant Runtime B',
    'complete_10', 10, 'internal_demo'
  )
on conflict (id) do update
set billing_entitlement_override = 'internal_demo';

update public.profiles
set shop_id = case id
  when 'ba250000-0000-4000-8000-000000000001'::uuid
    then 'bb250000-0000-4000-8000-000000000001'::uuid
  when 'ba250000-0000-4000-8000-000000000002'::uuid
    then 'bb250000-0000-4000-8000-000000000002'::uuid
end
where id in (
  'ba250000-0000-4000-8000-000000000001',
  'ba250000-0000-4000-8000-000000000002'
);

insert into public.work_orders (
  id,
  shop_id,
  custom_id,
  status,
  record_type
)
values
  (
    'bc250000-0000-4000-8000-000000000001',
    'bb250000-0000-4000-8000-000000000001',
    'CHILD-TENANT-A',
    'in_progress',
    'work_order'
  ),
  (
    'bc250000-0000-4000-8000-000000000002',
    'bb250000-0000-4000-8000-000000000002',
    'CHILD-TENANT-B',
    'in_progress',
    'work_order'
  ),
  (
    'bc250000-0000-4000-8000-000000000003',
    'bb250000-0000-4000-8000-000000000001',
    'CHILD-TENANT-CASCADE',
    'in_progress',
    'work_order'
  )
on conflict (id) do update
set shop_id = excluded.shop_id,
    status = excluded.status,
    record_type = excluded.record_type;

create temporary table foreign_work_order_before on commit drop as
select to_jsonb(parent) as snapshot
from public.work_orders parent
where parent.id = 'bc250000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'ba250000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ba250000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

do $authenticated_child_tenant_boundary$
declare
  v_denied boolean;
begin
  insert into public.work_order_lines (
    id, shop_id, work_order_id, complaint, job_type, status,
    line_status, approval_state, urgency
  ) values (
    'bd250000-0000-4000-8000-000000000001',
    'bb250000-0000-4000-8000-000000000001',
    'bc250000-0000-4000-8000-000000000001',
    'Valid same-shop repair line', 'repair', 'awaiting',
    'pending', 'pending', 'medium'
  );

  insert into public.work_order_quote_lines (
    id, shop_id, work_order_id, description, status, stage, created_by
  ) values (
    'be250000-0000-4000-8000-000000000001',
    'bb250000-0000-4000-8000-000000000001',
    'bc250000-0000-4000-8000-000000000001',
    'Valid same-shop quote line', 'draft', 'advisor_pending',
    'ba250000-0000-4000-8000-000000000001'
  );

  v_denied := false;
  begin
    insert into public.work_order_lines (
      id, shop_id, work_order_id, complaint, job_type, status,
      line_status, approval_state, urgency
    ) values (
      'bd250000-0000-4000-8000-000000000002',
      'bb250000-0000-4000-8000-000000000001',
      'bc250000-0000-4000-8000-000000000002',
      'Cross-tenant repair-line insert', 'repair', 'awaiting',
      'pending', 'pending', 'medium'
    );
  exception when sqlstate '23514' then
    v_denied := position('WORK_ORDER_CHILD_TENANT_MISMATCH' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Authenticated repair line crossed the parent tenant';
  end if;

  v_denied := false;
  begin
    insert into public.work_order_quote_lines (
      id, shop_id, work_order_id, description, status, stage, created_by
    ) values (
      'be250000-0000-4000-8000-000000000002',
      'bb250000-0000-4000-8000-000000000001',
      'bc250000-0000-4000-8000-000000000002',
      'Cross-tenant quote-line insert', 'draft', 'advisor_pending',
      'ba250000-0000-4000-8000-000000000001'
    );
  exception when sqlstate '23514' then
    v_denied := position('WORK_ORDER_CHILD_TENANT_MISMATCH' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Authenticated quote line crossed the parent tenant';
  end if;

  v_denied := false;
  begin
    update public.work_order_lines
    set work_order_id = 'bc250000-0000-4000-8000-000000000002'
    where id = 'bd250000-0000-4000-8000-000000000001';
  exception when sqlstate '23514' then
    v_denied := position('WORK_ORDER_CHILD_TENANT_MISMATCH' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Authenticated repair line changed to a foreign parent';
  end if;

  v_denied := false;
  begin
    update public.work_order_quote_lines
    set work_order_id = 'bc250000-0000-4000-8000-000000000002'
    where id = 'be250000-0000-4000-8000-000000000001';
  exception when sqlstate '23514' then
    v_denied := position('WORK_ORDER_CHILD_TENANT_MISMATCH' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Authenticated quote line changed to a foreign parent';
  end if;

  insert into public.work_order_lines (
    id, shop_id, work_order_id, complaint, job_type, status,
    line_status, approval_state, urgency
  ) values (
    'bd250000-0000-4000-8000-000000000005',
    'bb250000-0000-4000-8000-000000000001',
    'bc250000-0000-4000-8000-000000000003',
    'Authorized cascade-delete repair line', 'repair', 'awaiting',
    'pending', 'pending', 'medium'
  );

  delete from public.work_orders
  where id = 'bc250000-0000-4000-8000-000000000003';

  if not found then
    raise exception 'Authorized Work Order cascade delete did not delete its parent';
  end if;
end;
$authenticated_child_tenant_boundary$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;

do $trusted_worker_child_tenant_boundary$
declare
  v_denied boolean := false;
begin
  begin
    insert into public.work_order_lines (
      id, shop_id, work_order_id, complaint, job_type, status,
      line_status, approval_state, urgency
    ) values (
      'bd250000-0000-4000-8000-000000000003',
      'bb250000-0000-4000-8000-000000000001',
      'bc250000-0000-4000-8000-000000000002',
      'Trusted-worker cross-tenant attempt', 'repair', 'awaiting',
      'pending', 'pending', 'medium'
    );
  exception when sqlstate '23514' then
    v_denied := position('WORK_ORDER_CHILD_TENANT_MISMATCH' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Service role bypassed the repair-line parent tenant invariant';
  end if;

  v_denied := false;
  begin
    insert into public.work_order_quote_lines (
      id, shop_id, work_order_id, description, status, stage, created_by
    ) values (
      'be250000-0000-4000-8000-000000000003',
      'bb250000-0000-4000-8000-000000000001',
      'bc250000-0000-4000-8000-000000000002',
      'Trusted-worker cross-tenant quote attempt', 'draft',
      'advisor_pending', 'ba250000-0000-4000-8000-000000000001'
    );
  exception when sqlstate '23514' then
    v_denied := position('WORK_ORDER_CHILD_TENANT_MISMATCH' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'Service role bypassed the quote-line parent tenant invariant';
  end if;

  -- Legacy repair-line callers may still omit shop_id. The canonical trigger
  -- derives it from the verified parent instead of weakening the invariant.
  insert into public.work_order_lines (
    id, shop_id, work_order_id, complaint, job_type, status,
    line_status, approval_state, urgency
  ) values (
    'bd250000-0000-4000-8000-000000000004',
    null,
    'bc250000-0000-4000-8000-000000000001',
    'Derived same-shop repair line', 'repair', 'awaiting',
    'pending', 'pending', 'medium'
  );

  v_denied := false;
  begin
    update public.work_orders
    set shop_id = 'bb250000-0000-4000-8000-000000000002'
    where id = 'bc250000-0000-4000-8000-000000000001';
  exception when sqlstate '23514' then
    v_denied := position(
      'WORK_ORDER_PARENT_TENANT_CHANGE_WITH_CHILDREN' in sqlerrm
    ) > 0;
  end;
  if not v_denied then
    raise exception 'Service role moved a Work Order away from existing children';
  end if;

  v_denied := false;
  begin
    update public.work_orders
    set shop_id = null
    where id = 'bc250000-0000-4000-8000-000000000001';
  exception when sqlstate '23514' then
    v_denied := position(
      'WORK_ORDER_PARENT_TENANT_CHANGE_WITH_CHILDREN' in sqlerrm
    ) > 0;
  end;
  if not v_denied then
    raise exception 'Service role manually cleared a parent tenant with children';
  end if;
end;
$trusted_worker_child_tenant_boundary$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);

do $work_order_child_tenant_final_assertions$
declare
  v_foreign_after jsonb;
  v_foreign_before jsonb;
begin
  select to_jsonb(parent)
    into strict v_foreign_after
  from public.work_orders parent
  where parent.id = 'bc250000-0000-4000-8000-000000000002';

  select snapshot
    into strict v_foreign_before
  from foreign_work_order_before;

  if v_foreign_after is distinct from v_foreign_before then
    raise exception 'Denied child write changed the foreign Work Order';
  end if;

  if exists (
    select 1
    from public.work_order_lines line
    join public.work_orders parent on parent.id = line.work_order_id
    where line.shop_id is distinct from parent.shop_id
  ) or exists (
    select 1
    from public.work_order_quote_lines line
    join public.work_orders parent on parent.id = line.work_order_id
    where line.shop_id is distinct from parent.shop_id
  ) then
    raise exception 'A Work Order child tenant mismatch persisted';
  end if;

  if not exists (
    select 1
    from public.work_order_lines line
    where line.id = 'bd250000-0000-4000-8000-000000000004'
      and line.shop_id = 'bb250000-0000-4000-8000-000000000001'
      and line.work_order_id = 'bc250000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Verified parent shop derivation was not preserved';
  end if;

  if not exists (
    select 1
    from public.work_orders parent
    where parent.id = 'bc250000-0000-4000-8000-000000000001'
      and parent.shop_id = 'bb250000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Denied parent tenant change modified the Work Order';
  end if;

  if exists (
    select 1
    from public.work_order_lines line
    where line.id in (
      'bd250000-0000-4000-8000-000000000002',
      'bd250000-0000-4000-8000-000000000003'
    )
  ) or exists (
    select 1
    from public.work_order_quote_lines line
    where line.id in (
      'be250000-0000-4000-8000-000000000002',
      'be250000-0000-4000-8000-000000000003'
    )
  ) then
    raise exception 'A denied cross-tenant child row persisted';
  end if;

  if exists (
    select 1
    from public.work_orders parent
    where parent.id = 'bc250000-0000-4000-8000-000000000003'
  ) or exists (
    select 1
    from public.work_order_lines line
    where line.id = 'bd250000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Authorized Work Order cascade delete did not remove parent and child';
  end if;

end;
$work_order_child_tenant_final_assertions$;

rollback;

select 'work_order_child_parent_tenant_ok' as result;
