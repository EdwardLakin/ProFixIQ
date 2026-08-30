\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'aa250000-0000-4000-8000-000000000001',
    'approval-binding-owner@example.com',
    '{"full_name":"Approval Binding Owner"}'::jsonb
  ),
  (
    'aa250000-0000-4000-8000-000000000002',
    'approval-binding-customer@example.com',
    '{}'::jsonb
  ),
  (
    'aa250000-0000-4000-8000-000000000003',
    'approval-binding-attacker@example.com',
    '{}'::jsonb
  ),
  (
    'aa250000-0000-4000-8000-000000000004',
    'approval-binding-imported@example.com',
    '{"full_name":"Approval Binding Imported Advisor"}'::jsonb
  ),
  (
    'aa250000-0000-4000-8000-000000000005',
    'approval-binding-imported-profile@example.com',
    '{"full_name":"Approval Binding Imported Advisor Profile"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  (
    'aa250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000001',
    'owner',
    'Approval Binding Owner',
    'approval-binding-owner@example.com',
    null
  ),
  (
    'aa250000-0000-4000-8000-000000000005',
    'aa250000-0000-4000-8000-000000000004',
    'advisor',
    'Approval Binding Imported Advisor',
    'approval-binding-imported@example.com',
    null
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

delete from public.profiles
where id in (
  'aa250000-0000-4000-8000-000000000002',
  'aa250000-0000-4000-8000-000000000003',
  'aa250000-0000-4000-8000-000000000004'
);

insert into public.shops (
  id,
  owner_id,
  business_name,
  name,
  plan,
  user_limit,
  billing_entitlement_override
)
values (
  'ab250000-0000-4000-8000-000000000001',
  'aa250000-0000-4000-8000-000000000001',
  'Approval Binding Runtime',
  'Approval Binding Runtime',
  'complete_10',
  10,
  'internal_demo'
)
on conflict (id) do update
set billing_entitlement_override = 'internal_demo';

update public.profiles
set user_id = case
      when id = 'aa250000-0000-4000-8000-000000000005'::uuid
        then 'aa250000-0000-4000-8000-000000000004'::uuid
      else user_id
    end,
    shop_id = 'ab250000-0000-4000-8000-000000000001'
where id in (
  'aa250000-0000-4000-8000-000000000001',
  'aa250000-0000-4000-8000-000000000005'
);

insert into public.customers (id, shop_id, user_id, name, email)
values (
  'ac250000-0000-4000-8000-000000000001',
  'ab250000-0000-4000-8000-000000000001',
  'aa250000-0000-4000-8000-000000000002',
  'Approval Binding Customer',
  'approval-binding-customer@example.com'
)
on conflict (id) do update
set shop_id = excluded.shop_id,
    user_id = excluded.user_id,
    name = excluded.name,
    email = excluded.email;

insert into public.customer_portal_invites (
  id,
  shop_id,
  customer_id,
  email,
  token,
  accepted_at,
  accepted_by_user_id,
  revoked_at
)
values (
  'ad250000-0000-4000-8000-000000000001',
  'ab250000-0000-4000-8000-000000000001',
  'ac250000-0000-4000-8000-000000000001',
  'approval-binding-customer@example.com',
  'ad250000-0000-4000-8000-000000000002',
  now(),
  'aa250000-0000-4000-8000-000000000002',
  null
)
on conflict (id) do update
set accepted_at = excluded.accepted_at,
    accepted_by_user_id = excluded.accepted_by_user_id,
    revoked_at = null;

insert into public.work_orders (
  id,
  shop_id,
  customer_id,
  custom_id,
  status,
  approval_state
)
values (
  'ae250000-0000-4000-8000-000000000001',
  'ab250000-0000-4000-8000-000000000001',
  'ac250000-0000-4000-8000-000000000001',
  'APPROVAL-BINDING-1',
  'in_progress',
  'pending'
)
on conflict (id) do update
set shop_id = excluded.shop_id,
    customer_id = excluded.customer_id,
    status = excluded.status,
    approval_state = excluded.approval_state;

insert into public.work_order_lines (
  id,
  work_order_id,
  complaint,
  status,
  line_status,
  approval_state,
  job_type,
  shop_id,
  user_id,
  urgency
)
values
  (
    'af250000-0000-4000-8000-000000000001',
    'ae250000-0000-4000-8000-000000000001',
    'Portal approval actor binding',
    'awaiting_approval',
    'pending',
    'pending',
    'repair',
    'ab250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000001',
    'medium'
  ),
  (
    'af250000-0000-4000-8000-000000000002',
    'ae250000-0000-4000-8000-000000000001',
    'Compatibility approval actor binding',
    'awaiting_approval',
    'pending',
    'pending',
    'repair',
    'ab250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000001',
    'medium'
  ),
  (
    'af250000-0000-4000-8000-000000000003',
    'ae250000-0000-4000-8000-000000000001',
    'Imported staff compatibility approval actor binding',
    'awaiting_approval',
    'pending',
    'pending',
    'repair',
    'ab250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000005',
    'medium'
  ),
  (
    'af250000-0000-4000-8000-000000000004',
    'ae250000-0000-4000-8000-000000000001',
    'Staff adapter replay after labor begins',
    'awaiting_approval',
    'pending',
    'pending',
    'repair',
    'ab250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000001',
    'medium'
  ),
  (
    'af250000-0000-4000-8000-000000000005',
    'ae250000-0000-4000-8000-000000000001',
    'Staff adapter rejects ended labor',
    'on_hold',
    'pending',
    'pending',
    'repair',
    'ab250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000001',
    'medium'
  );

insert into public.work_order_line_labor_segments (
  id,
  shop_id,
  work_order_id,
  work_order_line_id,
  technician_id,
  created_by,
  source,
  started_at,
  ended_at,
  pause_reason
)
values (
  'b0250000-0000-4000-8000-000000000001',
  'ab250000-0000-4000-8000-000000000001',
  'ae250000-0000-4000-8000-000000000001',
  'af250000-0000-4000-8000-000000000005',
  'aa250000-0000-4000-8000-000000000001',
  'aa250000-0000-4000-8000-000000000001',
  'approval_binding_runtime',
  now() - interval '10 minutes',
  now() - interval '5 minutes',
  'manual_pause'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'aa250000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa250000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

do $authorized_customer_decisions$
declare
  v_result jsonb;
begin
  v_result := public.apply_portal_line_decision_atomic(
    'ab250000-0000-4000-8000-000000000001',
    'ac250000-0000-4000-8000-000000000001',
    'ae250000-0000-4000-8000-000000000001',
    'af250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000002',
    'approve',
    'approval-binding:portal:victim'
  );
  if (v_result ->> 'ok')::boolean is distinct from true
     or (v_result ->> 'idempotent')::boolean is distinct from false then
    raise exception 'Authorized portal approval failed: %', v_result;
  end if;

  v_result := public.apply_approval_compatibility_bundle_atomic(
    'ab250000-0000-4000-8000-000000000001',
    'ae250000-0000-4000-8000-000000000001',
    'ac250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000002',
    array['af250000-0000-4000-8000-000000000002'::uuid],
    array[]::uuid[],
    array[]::uuid[],
    array[]::uuid[],
    null,
    'approval-binding:bundle:victim'
  );
  if (v_result ->> 'ok')::boolean is distinct from true
     or (v_result ->> 'idempotent')::boolean is distinct from false then
    raise exception 'Authorized compatibility approval failed: %', v_result;
  end if;
end;
$authorized_customer_decisions$;

select set_config(
  'request.jwt.claim.sub',
  'aa250000-0000-4000-8000-000000000004',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa250000-0000-4000-8000-000000000004"}',
  true
);

do $authorized_imported_staff_decision$
declare
  v_result jsonb;
begin
  v_result := public.apply_approval_compatibility_bundle_atomic(
    'ab250000-0000-4000-8000-000000000001',
    'ae250000-0000-4000-8000-000000000001',
    null,
    'aa250000-0000-4000-8000-000000000005',
    array['af250000-0000-4000-8000-000000000003'::uuid],
    array[]::uuid[],
    array[]::uuid[],
    array[]::uuid[],
    null,
    'approval-binding:bundle:imported-staff'
  );
  if (v_result ->> 'ok')::boolean is distinct from true
     or (v_result ->> 'idempotent')::boolean is distinct from false then
    raise exception 'Authorized imported staff compatibility approval failed: %', v_result;
  end if;
end;
$authorized_imported_staff_decision$;

select set_config(
  'request.jwt.claim.sub',
  'aa250000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa250000-0000-4000-8000-000000000001"}',
  true
);

do $authorized_staff_adapter_decision$
declare
  v_result jsonb;
begin
  v_result := public.apply_staff_line_decision_atomic(
    'ab250000-0000-4000-8000-000000000001',
    'ae250000-0000-4000-8000-000000000001',
    'af250000-0000-4000-8000-000000000004',
    'aa250000-0000-4000-8000-000000000001',
    'approve',
    'approval-binding:staff-adapter:replay'
  );
  if (v_result ->> 'ok')::boolean is distinct from true
     or (v_result ->> 'idempotent')::boolean is distinct from false then
    raise exception 'Authorized staff adapter approval failed: %', v_result;
  end if;
end;
$authorized_staff_adapter_decision$;

reset role;

insert into public.work_order_line_labor_segments (
  id,
  shop_id,
  work_order_id,
  work_order_line_id,
  technician_id,
  created_by,
  source,
  started_at,
  ended_at,
  pause_reason
)
values (
  'b0250000-0000-4000-8000-000000000002',
  'ab250000-0000-4000-8000-000000000001',
  'ae250000-0000-4000-8000-000000000001',
  'af250000-0000-4000-8000-000000000004',
  'aa250000-0000-4000-8000-000000000001',
  'aa250000-0000-4000-8000-000000000001',
  'approval_binding_runtime',
  now() - interval '4 minutes',
  now() - interval '1 minute',
  'manual_pause'
);

set local role authenticated;

do $staff_adapter_replay_and_labor_guards$
declare
  v_result jsonb;
  v_denied boolean;
begin
  v_result := public.apply_staff_line_decision_atomic(
    'ab250000-0000-4000-8000-000000000001',
    'ae250000-0000-4000-8000-000000000001',
    'af250000-0000-4000-8000-000000000004',
    'aa250000-0000-4000-8000-000000000001',
    'approve',
    'approval-binding:staff-adapter:replay'
  );
  if (v_result ->> 'idempotent')::boolean is distinct from true then
    raise exception 'Staff adapter did not return its receipt after labor began: %', v_result;
  end if;

  v_denied := false;
  begin
    perform public.apply_staff_line_decision_atomic(
      'ab250000-0000-4000-8000-000000000001',
      'ae250000-0000-4000-8000-000000000001',
      'af250000-0000-4000-8000-000000000004',
      'aa250000-0000-4000-8000-000000000001',
      'decline',
      'approval-binding:staff-adapter:new-after-labor'
    );
  exception when others then
    v_denied := sqlstate = 'P0001'
      and sqlerrm like 'STAFF_LINE_DECISION_INELIGIBLE:%labor%recorded%';
  end;
  if not v_denied then
    raise exception 'Staff adapter accepted a new decision after labor began';
  end if;

  v_denied := false;
  begin
    perform public.apply_staff_line_decision_atomic(
      'ab250000-0000-4000-8000-000000000001',
      'ae250000-0000-4000-8000-000000000001',
      'af250000-0000-4000-8000-000000000005',
      'aa250000-0000-4000-8000-000000000001',
      'approve',
      'approval-binding:staff-adapter:ended-labor'
    );
  exception when others then
    v_denied := sqlstate = 'P0001'
      and sqlerrm like 'STAFF_LINE_DECISION_INELIGIBLE:%labor%recorded%';
  end;
  if not v_denied then
    raise exception 'Staff adapter accepted a decision after ended labor';
  end if;

  v_denied := false;
  begin
    perform public.apply_staff_line_decision_atomic(
      'ab250000-0000-4000-8000-000000000001',
      'ae250000-0000-4000-8000-000000000001',
      'af250000-0000-4000-8000-000000000004',
      'aa250000-0000-4000-8000-000000000001',
      'decline',
      'approval-binding:staff-adapter:replay'
    );
  exception when unique_violation then
    v_denied := sqlerrm = 'STAFF_LINE_DECISION_OPERATION_CONFLICT';
  end;
  if not v_denied then
    raise exception 'Staff adapter replayed one operation key with a different decision';
  end if;
end;
$staff_adapter_replay_and_labor_guards$;

select set_config(
  'request.jwt.claim.sub',
  'aa250000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa250000-0000-4000-8000-000000000003"}',
  true
);

do $forged_actor_denials$
declare
  v_denied boolean;
begin
  -- The caller check must precede receipt replay, otherwise a forged actor can
  -- read another customer's durable result without causing a new mutation.
  v_denied := false;
  begin
    perform public.apply_portal_line_decision_atomic(
      'ab250000-0000-4000-8000-000000000001',
      'ac250000-0000-4000-8000-000000000001',
      'ae250000-0000-4000-8000-000000000001',
      'af250000-0000-4000-8000-000000000001',
      'aa250000-0000-4000-8000-000000000002',
      'approve',
      'approval-binding:portal:victim'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Forged portal actor replayed another customer receipt';
  end if;

  v_denied := false;
  begin
    perform public.apply_portal_line_decision_atomic(
      'ab250000-0000-4000-8000-000000000001',
      'ac250000-0000-4000-8000-000000000001',
      'ae250000-0000-4000-8000-000000000001',
      'af250000-0000-4000-8000-000000000001',
      'aa250000-0000-4000-8000-000000000002',
      'decline',
      'approval-binding:portal:attacker'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Forged portal actor created a fresh line decision';
  end if;

  v_denied := false;
  begin
    perform public.apply_approval_compatibility_bundle_atomic(
      'ab250000-0000-4000-8000-000000000001',
      'ae250000-0000-4000-8000-000000000001',
      'ac250000-0000-4000-8000-000000000001',
      'aa250000-0000-4000-8000-000000000002',
      array['af250000-0000-4000-8000-000000000002'::uuid],
      array[]::uuid[],
      array[]::uuid[],
      array[]::uuid[],
      null,
      'approval-binding:bundle:victim'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Forged compatibility actor replayed another customer receipt';
  end if;

  v_denied := false;
  begin
    perform public.apply_approval_compatibility_bundle_atomic(
      'ab250000-0000-4000-8000-000000000001',
      'ae250000-0000-4000-8000-000000000001',
      'ac250000-0000-4000-8000-000000000001',
      'aa250000-0000-4000-8000-000000000002',
      array[]::uuid[],
      array['af250000-0000-4000-8000-000000000002'::uuid],
      array[]::uuid[],
      array[]::uuid[],
      null,
      'approval-binding:bundle:attacker'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Forged compatibility actor created a fresh decision';
  end if;

  v_denied := false;
  begin
    perform public.apply_approval_compatibility_bundle_atomic(
      'ab250000-0000-4000-8000-000000000001',
      'ae250000-0000-4000-8000-000000000001',
      null,
      'aa250000-0000-4000-8000-000000000005',
      array['af250000-0000-4000-8000-000000000003'::uuid],
      array[]::uuid[],
      array[]::uuid[],
      array[]::uuid[],
      null,
      'approval-binding:bundle:imported-staff'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Forged imported staff actor replayed another profile receipt';
  end if;

  v_denied := false;
  begin
    perform public.apply_staff_line_decision_atomic(
      'ab250000-0000-4000-8000-000000000001',
      'ae250000-0000-4000-8000-000000000001',
      'af250000-0000-4000-8000-000000000004',
      'aa250000-0000-4000-8000-000000000001',
      'approve',
      'approval-binding:staff-adapter:replay'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Forged staff adapter actor replayed another profile receipt';
  end if;
end;
$forged_actor_denials$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;

do $trusted_service_replay$
declare
  v_result jsonb;
begin
  v_result := public.apply_portal_line_decision_atomic(
    'ab250000-0000-4000-8000-000000000001',
    'ac250000-0000-4000-8000-000000000001',
    'ae250000-0000-4000-8000-000000000001',
    'af250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000002',
    'approve',
    'approval-binding:portal:victim'
  );
  if (v_result ->> 'idempotent')::boolean is distinct from true then
    raise exception 'Trusted service portal replay was not preserved: %', v_result;
  end if;

  v_result := public.apply_approval_compatibility_bundle_atomic(
    'ab250000-0000-4000-8000-000000000001',
    'ae250000-0000-4000-8000-000000000001',
    'ac250000-0000-4000-8000-000000000001',
    'aa250000-0000-4000-8000-000000000002',
    array['af250000-0000-4000-8000-000000000002'::uuid],
    array[]::uuid[],
    array[]::uuid[],
    array[]::uuid[],
    null,
    'approval-binding:bundle:victim'
  );
  if (v_result ->> 'idempotent')::boolean is distinct from true then
    raise exception 'Trusted service compatibility replay was not preserved: %', v_result;
  end if;
end;
$trusted_service_replay$;

reset role;

do $approval_binding_final_assertions$
begin
  if exists (
    select 1
    from public.work_order_lines line
    where line.id in (
      'af250000-0000-4000-8000-000000000001',
      'af250000-0000-4000-8000-000000000002'
    )
      and (
        line.approval_state is distinct from 'approved'
        or line.approval_by is distinct from
          'aa250000-0000-4000-8000-000000000002'::uuid
      )
  ) then
    raise exception 'A forged approval changed the canonical line decision';
  end if;

  if not exists (
    select 1
    from public.work_order_lines line
    where line.id = 'af250000-0000-4000-8000-000000000003'
      and line.approval_state = 'approved'
      and line.approval_by = 'aa250000-0000-4000-8000-000000000005'::uuid
  ) then
    raise exception 'Linked imported staff approval did not preserve the canonical profile actor';
  end if;

  if (
    select count(*)
    from public.portal_lifecycle_operation_keys operation
    where operation.operation_name = 'portal_line_decision'
      and operation.operation_key like 'approval-binding:%'
  ) <> 1 then
    raise exception 'Portal approval denial changed durable receipt history';
  end if;

  if (
    select count(*)
    from public.quote_lifecycle_operation_keys operation
    where operation.shop_id = 'ab250000-0000-4000-8000-000000000001'
      and operation.operation_name = 'approval_compatibility_bundle'
      and operation.operation_key like 'approval-binding:%'
  ) <> 3 then
    raise exception 'Compatibility approval denial changed durable receipt history';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.apply_portal_line_decision_unbound_core(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'private.apply_approval_compatibility_bundle_unbound_core(uuid,uuid,uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated callers retain direct access to an unbound approval core';
  end if;
end;
$approval_binding_final_assertions$;

rollback;

select 'approval_actor_binding_ok' as result;
