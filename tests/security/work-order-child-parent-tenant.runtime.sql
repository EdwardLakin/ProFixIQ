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
  ),
  (
    'ba250000-0000-4000-8000-000000000003',
    'child-tenant-owner-cleanup@example.com',
    '{"full_name":"Child Tenant Cleanup Owner"}'::jsonb
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
  ),
  (
    'ba250000-0000-4000-8000-000000000003',
    'ba250000-0000-4000-8000-000000000003',
    'owner', 'Child Tenant Cleanup Owner',
    'child-tenant-owner-cleanup@example.com', null
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
  ),
  (
    'bb250000-0000-4000-8000-000000000003',
    'ba250000-0000-4000-8000-000000000003',
    'Child Tenant Cleanup Runtime',
    'Child Tenant Cleanup Runtime',
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
  else 'bb250000-0000-4000-8000-000000000003'::uuid
end
where id in (
  'ba250000-0000-4000-8000-000000000001',
  'ba250000-0000-4000-8000-000000000002',
  'ba250000-0000-4000-8000-000000000003'
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
  ),
  (
    'bc250000-0000-4000-8000-000000000004',
    'bb250000-0000-4000-8000-000000000003',
    'CHILD-TENANT-SHOP-CLEANUP',
    'in_progress',
    'work_order'
  ),
  (
    'bc250000-0000-4000-8000-000000000005',
    'bb250000-0000-4000-8000-000000000001',
    'CHILD-TENANT-UPDATE-NORMALIZATION',
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
  update public.work_orders
  set shop_id = null
  where id = 'bc250000-0000-4000-8000-000000000005';

  if not exists (
    select 1
    from public.work_orders parent
    where parent.id = 'bc250000-0000-4000-8000-000000000005'
      and parent.shop_id = 'bb250000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Ordinary Work Order update tenant normalization regressed';
  end if;

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

-- A predecessor deployment could admit a tenant mismatch before this
-- migration installed its canonical trigger. Reproduce that historical state
-- on a financially locked Work Order and prove the migration preflight fails
-- with bounded diagnostics without rewriting the root rows or audit history.
insert into public.invoice_versions (
  id,
  shop_id,
  work_order_id,
  version_number,
  lifecycle_status,
  currency,
  snapshot,
  snapshot_hash,
  issued_at
) values (
  'bf250000-0000-4000-8000-000000000001',
  'bb250000-0000-4000-8000-000000000001',
  'bc250000-0000-4000-8000-000000000001',
  1,
  'issued',
  'CAD',
  '{}'::jsonb,
  'work-order-child-tenant-locked-fixture',
  now()
);

set local session_replication_role = replica;
update public.work_order_lines
set shop_id = 'bb250000-0000-4000-8000-000000000002'
where id = 'bd250000-0000-4000-8000-000000000001';
update public.work_order_quote_lines
set shop_id = 'bb250000-0000-4000-8000-000000000002'
where id = 'be250000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

do $locked_historical_child_tenant_preflight$
declare
  v_denied boolean := false;
  v_detail text;
  v_repair_line_before jsonb;
  v_repair_line_after jsonb;
  v_quote_line_before jsonb;
  v_quote_line_after jsonb;
begin
  select to_jsonb(line)
    into strict v_repair_line_before
  from public.work_order_lines line
  where line.id = 'bd250000-0000-4000-8000-000000000001';

  select to_jsonb(quote_line)
    into strict v_quote_line_before
  from public.work_order_quote_lines quote_line
  where quote_line.id = 'be250000-0000-4000-8000-000000000001';

  begin
    perform private.assert_work_order_child_parent_tenants_clean();
  exception when sqlstate '23514' then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_denied := position(
      'WORK_ORDER_CHILD_TENANT_PREFLIGHT_FAILED' in sqlerrm
    ) > 0
      and position(
        'bd250000-0000-4000-8000-000000000001' in coalesce(v_detail, '')
      ) > 0
      and position(
        'be250000-0000-4000-8000-000000000001' in coalesce(v_detail, '')
      ) > 0;
  end;

  select to_jsonb(line)
    into strict v_repair_line_after
  from public.work_order_lines line
  where line.id = 'bd250000-0000-4000-8000-000000000001';

  select to_jsonb(quote_line)
    into strict v_quote_line_after
  from public.work_order_quote_lines quote_line
  where quote_line.id = 'be250000-0000-4000-8000-000000000001';

  if not v_denied then
    raise exception 'Historical mismatch did not fail the migration preflight';
  end if;

  if v_repair_line_after is distinct from v_repair_line_before
     or v_quote_line_after is distinct from v_quote_line_before then
    raise exception 'Migration preflight mutated historical tenant data';
  end if;

  if exists (
    select 1
    from public.work_order_correction_sessions correction
    where correction.work_order_id =
      'bc250000-0000-4000-8000-000000000001'
      and starts_with(
        correction.operation_key,
        'migration:20260825210000:work-order-child-tenant:'
      )
  ) or exists (
    select 1
    from public.financial_domain_outbox outbox
    where outbox.aggregate_id =
      'bc250000-0000-4000-8000-000000000001'
      and outbox.event_type = 'work_order.child_tenant_reconciled'
  ) then
    raise exception 'Migration preflight co-mingled historical audit state';
  end if;
end;
$locked_historical_child_tenant_preflight$;

set local session_replication_role = replica;
update public.work_order_lines
set shop_id = 'bb250000-0000-4000-8000-000000000001'
where id = 'bd250000-0000-4000-8000-000000000001';
update public.work_order_quote_lines
set shop_id = 'bb250000-0000-4000-8000-000000000001'
where id = 'be250000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

do $clean_child_tenant_preflight$
begin
  perform private.assert_work_order_child_parent_tenants_clean();
end;
$clean_child_tenant_preflight$;

insert into public.work_order_lines (
  id, shop_id, work_order_id, complaint, job_type, status,
  line_status, approval_state, urgency
) values (
  'bd250000-0000-4000-8000-000000000006',
  'bb250000-0000-4000-8000-000000000003',
  'bc250000-0000-4000-8000-000000000004',
  'Shop cleanup repair line', 'repair', 'awaiting',
  'pending', 'pending', 'medium'
);

insert into public.work_order_quote_lines (
  id, shop_id, work_order_id, description, status, stage, created_by
) values (
  'be250000-0000-4000-8000-000000000006',
  'bb250000-0000-4000-8000-000000000003',
  'bc250000-0000-4000-8000-000000000004',
  'Shop cleanup quote line', 'draft', 'advisor_pending',
  'ba250000-0000-4000-8000-000000000003'
);

-- profiles.shop_id intentionally uses NO ACTION in the baseline. Remove that
-- independent reference so this fixture reaches the Work Order/repair-line
-- SET NULL actions and quote-line cascade that the migration owns.
update public.profiles
set shop_id = null
where id = 'ba250000-0000-4000-8000-000000000003';

do $shop_cleanup_profile_reference$
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = 'ba250000-0000-4000-8000-000000000003'
      and profile.shop_id is null
  ) then
    raise exception 'Shop cleanup fixture retained an unrelated profile reference';
  end if;
end;
$shop_cleanup_profile_reference$;

-- P0-008 makes both work_orders.shop_id and work_order_lines.shop_id required.
-- Their older SET NULL foreign keys therefore fail closed while commercial
-- history exists; this migration must not weaken either required-column
-- contract or partially delete cascading siblings.
do $shop_cleanup_required_tenant_guard$
declare
  v_denied boolean := false;
begin
  begin
    delete from public.shops
    where id = 'bb250000-0000-4000-8000-000000000003';
  exception when not_null_violation then
    v_denied := position(
      'work_order' in sqlerrm
    ) > 0;
  end;

  if not v_denied then
    raise exception 'Shop cleanup bypassed required Work Order tenant history';
  end if;

  if not exists (
    select 1 from public.shops
    where id = 'bb250000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1 from public.work_orders
    where id = 'bc250000-0000-4000-8000-000000000004'
      and shop_id = 'bb250000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1 from public.work_order_lines
    where id = 'bd250000-0000-4000-8000-000000000006'
      and shop_id = 'bb250000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1 from public.work_order_quote_lines
    where id = 'be250000-0000-4000-8000-000000000006'
      and shop_id = 'bb250000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Denied Shop cleanup partially mutated tenant data';
  end if;
end;
$shop_cleanup_required_tenant_guard$;

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

  if not exists (
    select 1
    from public.shops shop
    where shop.id = 'bb250000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1
    from public.work_orders parent
    where parent.id = 'bc250000-0000-4000-8000-000000000004'
      and parent.shop_id = 'bb250000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1
    from public.work_order_lines line
    where line.id = 'bd250000-0000-4000-8000-000000000006'
      and line.work_order_id = 'bc250000-0000-4000-8000-000000000004'
      and line.shop_id = 'bb250000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1
    from public.work_order_quote_lines quote_line
    where quote_line.id = 'be250000-0000-4000-8000-000000000006'
      and quote_line.work_order_id = 'bc250000-0000-4000-8000-000000000004'
      and quote_line.shop_id = 'bb250000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Shop cleanup guard did not preserve tenant history';
  end if;
end;
$work_order_child_tenant_final_assertions$;

rollback;

select 'work_order_child_parent_tenant_ok' as result;
