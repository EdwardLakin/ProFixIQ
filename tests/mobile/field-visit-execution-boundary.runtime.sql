\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'fa250000-0000-4000-8000-000000000001',
    'field-execution-manager@example.com',
    '{"full_name":"Field Execution Manager"}'::jsonb
  ),
  (
    'fa250000-0000-4000-8000-000000000002',
    'field-execution-assigned@example.com',
    '{"full_name":"Assigned Field Operator"}'::jsonb
  ),
  (
    'fa250000-0000-4000-8000-000000000003',
    'field-execution-other@example.com',
    '{"full_name":"Other Field Operator"}'::jsonb
  ),
  (
    'fa250000-0000-4000-8000-000000000004',
    'field-execution-foreign@example.com',
    '{"full_name":"Foreign Field Operator"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  (
    'fa250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000001',
    'manager', 'Field Execution Manager',
    'field-execution-manager@example.com', null
  ),
  (
    'fa250000-0000-4000-8000-000000000002',
    'fa250000-0000-4000-8000-000000000002',
    'mechanic', 'Assigned Field Operator',
    'field-execution-assigned@example.com', null
  ),
  (
    'fa250000-0000-4000-8000-000000000003',
    'fa250000-0000-4000-8000-000000000003',
    'mechanic', 'Other Field Operator',
    'field-execution-other@example.com', null
  ),
  (
    'fa250000-0000-4000-8000-000000000004',
    'fa250000-0000-4000-8000-000000000004',
    'mechanic', 'Foreign Field Operator',
    'field-execution-foreign@example.com', null
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type, country, billing_entitlement_override
)
values
  (
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000001',
    'Field Execution Runtime', 'Field Execution Runtime', 10,
    true, 0, 365, 'mobile_service_branch', 'CA', 'internal_demo'
  ),
  (
    'fb250000-0000-4000-8000-000000000002',
    'fa250000-0000-4000-8000-000000000004',
    'Foreign Field Runtime', 'Foreign Field Runtime', 10,
    true, 0, 365, 'mobile_service_branch', 'CA', 'internal_demo'
  )
on conflict (id) do update
set country = 'CA',
    billing_entitlement_override = 'internal_demo';

update public.profiles
set shop_id = case
  when id = 'fa250000-0000-4000-8000-000000000004'
    then 'fb250000-0000-4000-8000-000000000002'::uuid
  else 'fb250000-0000-4000-8000-000000000001'::uuid
end
where id in (
  'fa250000-0000-4000-8000-000000000001',
  'fa250000-0000-4000-8000-000000000002',
  'fa250000-0000-4000-8000-000000000003',
  'fa250000-0000-4000-8000-000000000004'
);

insert into public.mobile_service_settings (
  shop_id, service_model, solo_mode, dispatch_enabled,
  service_vehicles_enabled, field_operator_count_target,
  onboarding_completed_at, configured_by
)
values
  (
    'fb250000-0000-4000-8000-000000000001', 'mobile', false, true,
    true, 3, now(), 'fa250000-0000-4000-8000-000000000001'
  ),
  (
    'fb250000-0000-4000-8000-000000000002', 'mobile', false, true,
    true, 1, now(), 'fa250000-0000-4000-8000-000000000004'
  )
on conflict (shop_id) do update
set service_model = excluded.service_model,
    solo_mode = excluded.solo_mode,
    dispatch_enabled = excluded.dispatch_enabled,
    service_vehicles_enabled = excluded.service_vehicles_enabled,
    field_operator_count_target = excluded.field_operator_count_target,
    onboarding_completed_at = excluded.onboarding_completed_at,
    configured_by = excluded.configured_by;

insert into public.mobile_field_operators (
  shop_id, profile_id, enabled, created_by
)
values
  (
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000001', true,
    'fa250000-0000-4000-8000-000000000001'
  ),
  (
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000002', true,
    'fa250000-0000-4000-8000-000000000001'
  ),
  (
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000003', true,
    'fa250000-0000-4000-8000-000000000001'
  ),
  (
    'fb250000-0000-4000-8000-000000000002',
    'fa250000-0000-4000-8000-000000000004', true,
    'fa250000-0000-4000-8000-000000000004'
  )
on conflict (shop_id, profile_id) do update
set enabled = true;

insert into public.work_orders (
  id, shop_id, user_id, status, approval_state, custom_id
)
values
  (
    'fc250000-0000-4000-8000-000000000001',
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000001',
    'in_progress', 'approved', 'FIELD-EXECUTION-1'
  ),
  (
    'fc250000-0000-4000-8000-000000000002',
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000001',
    'in_progress', 'approved', 'SHOP-EXECUTION-1'
  )
on conflict (id) do update
set shop_id = excluded.shop_id,
    status = excluded.status,
    approval_state = excluded.approval_state;

insert into public.service_visits (
  id, shop_id, work_order_id, mode, status,
  assigned_user_id, version, created_by
)
values
  (
    'fd250000-0000-4000-8000-000000000001',
    'fb250000-0000-4000-8000-000000000001',
    'fc250000-0000-4000-8000-000000000001',
    'mobile', 'scheduled',
    'fa250000-0000-4000-8000-000000000002', 1,
    'fa250000-0000-4000-8000-000000000001'
  ),
  (
    'fd250000-0000-4000-8000-000000000002',
    'fb250000-0000-4000-8000-000000000001',
    'fc250000-0000-4000-8000-000000000002',
    'shop', 'scheduled',
    'fa250000-0000-4000-8000-000000000002', 1,
    'fa250000-0000-4000-8000-000000000001'
  ),
  (
    'fd250000-0000-4000-8000-000000000003',
    'fb250000-0000-4000-8000-000000000001',
    null,
    'mobile', 'dispatched',
    'fa250000-0000-4000-8000-000000000002', 2,
    'fa250000-0000-4000-8000-000000000001'
  ),
  (
    'fd250000-0000-4000-8000-000000000004',
    'fb250000-0000-4000-8000-000000000001',
    null,
    'mobile', 'en_route',
    'fa250000-0000-4000-8000-000000000002', 3,
    'fa250000-0000-4000-8000-000000000001'
  )
on conflict (id) do update
set shop_id = excluded.shop_id,
    work_order_id = excluded.work_order_id,
    mode = excluded.mode,
    status = excluded.status,
    assigned_user_id = excluded.assigned_user_id,
    version = excluded.version;

insert into public.service_visit_events (
  id, shop_id, service_visit_id, event_type, actor_user_id, metadata
)
values (
  'fe250000-0000-4000-8000-000000000001',
  'fb250000-0000-4000-8000-000000000001',
  'fd250000-0000-4000-8000-000000000001',
  'created', 'fa250000-0000-4000-8000-000000000001',
  '{"fixture":true}'::jsonb
)
on conflict (id) do nothing;

-- Model two receipts committed by the pre-repair function. They contain the
-- durable result and transition event but no request hashes.
insert into public.service_visit_events (
  id, shop_id, service_visit_id, event_type, from_status, to_status,
  actor_user_id, assigned_user_id, metadata
)
values
  (
    'fe250000-0000-4000-8000-000000000003',
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000003',
    'transitioned', 'scheduled', 'dispatched',
    'fa250000-0000-4000-8000-000000000002',
    'fa250000-0000-4000-8000-000000000002',
    '{"operation_key":"field-execution:legacy:direct"}'::jsonb
  ),
  (
    'fe250000-0000-4000-8000-000000000004',
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000004',
    'transitioned', 'dispatched', 'en_route',
    'fa250000-0000-4000-8000-000000000002',
    'fa250000-0000-4000-8000-000000000002',
    '{"operation_key":"field-execution:legacy:mobile"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.scheduler_operation_keys (
  shop_id, operation_name, operation_key, actor_user_id, result
)
values
  (
    'fb250000-0000-4000-8000-000000000001',
    'dispatch_visit_transition',
    'field-execution:legacy:direct',
    'fa250000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'ok', true,
      'visit', jsonb_build_object(
        'id', 'fd250000-0000-4000-8000-000000000003',
        'shopId', 'fb250000-0000-4000-8000-000000000001',
        'status', 'dispatched',
        'version', 2
      ),
      'idempotent', false
    )
  ),
  (
    'fb250000-0000-4000-8000-000000000001',
    'dispatch_visit_transition',
    'field-execution:legacy:mobile',
    'fa250000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'ok', true,
      'visit', jsonb_build_object(
        'id', 'fd250000-0000-4000-8000-000000000004',
        'shopId', 'fb250000-0000-4000-8000-000000000001',
        'status', 'en_route',
        'version', 3
      ),
      'idempotent', false
    )
  )
on conflict (shop_id, operation_name, operation_key) do update
set actor_user_id = excluded.actor_user_id,
    result = excluded.result;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'fa250000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa250000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;

-- A same-shop enabled Field operator must not execute, replay, or inspect the
-- assigned operator's visit.
do $same_shop_unassigned_denial$
declare
  v_denied boolean;
begin
  if public.dispatch_can_execute(
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000003',
    'fd250000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Unassigned Field operator passed the execution predicate';
  end if;

  if public.dispatch_can_execute(
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000003',
    'fd250000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Unassigned Shop technician passed the execution predicate';
  end if;

  v_denied := false;
  begin
    perform public.dispatch_visit_history(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000001',
      'fa250000-0000-4000-8000-000000000003'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Unassigned Field operator read another visit history';
  end if;

  v_denied := false;
  begin
    perform public.dispatch_transition_service_visit_atomic(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000001',
      'dispatched', null, null, 1,
      'fa250000-0000-4000-8000-000000000003',
      'field-execution:unassigned:transition'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Unassigned Field operator transitioned another visit';
  end if;

  v_denied := false;
  begin
    perform public.mobile_replay_service_visit_transition_atomic(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000001',
      'scheduled', 'dispatched', 1,
      'fa250000-0000-4000-8000-000000000003',
      'field-execution:unassigned:replay'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Unassigned Field operator replayed another visit transition';
  end if;
end;
$same_shop_unassigned_denial$;

select set_config(
  'request.jwt.claim.sub',
  'fa250000-0000-4000-8000-000000000004',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa250000-0000-4000-8000-000000000004"}',
  true
);

do $cross_shop_denial$
declare
  v_denied boolean := false;
begin
  if public.dispatch_can_execute(
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000004',
    'fd250000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Cross-shop Field operator passed the execution predicate';
  end if;

  begin
    perform public.dispatch_visit_history(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000001',
      'fa250000-0000-4000-8000-000000000004'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Cross-shop Field operator read visit history';
  end if;
end;
$cross_shop_denial$;

select set_config(
  'request.jwt.claim.sub',
  'fa250000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa250000-0000-4000-8000-000000000002"}',
  true
);

do $assigned_operator_execution$
declare
  v_history jsonb;
  v_result jsonb;
begin
  if not public.dispatch_can_execute(
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000002',
    'fd250000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Assigned Field operator failed the execution predicate';
  end if;

  if not public.dispatch_can_execute(
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000002',
    'fd250000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Assigned Shop technician lost established execution access';
  end if;

  v_history := public.dispatch_visit_history(
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000002'
  );
  if jsonb_array_length(v_history) <> 1 then
    raise exception 'Assigned Field operator could not read canonical history';
  end if;

  v_result := public.dispatch_transition_service_visit_atomic(
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000001',
    'dispatched', null, null, 1,
    'fa250000-0000-4000-8000-000000000002',
    'field-execution:assigned:dispatched'
  );
  if coalesce((v_result ->> 'idempotent')::boolean, true) then
    raise exception 'Fresh assigned transition was incorrectly marked idempotent';
  end if;
end;
$assigned_operator_execution$;

-- Simulate the exact production ambiguity: the transition committed, its
-- response was lost, and assignment plus Field access changed before retry.
reset role;
update public.mobile_field_operators
set enabled = false
where shop_id = 'fb250000-0000-4000-8000-000000000001'
  and profile_id = 'fa250000-0000-4000-8000-000000000002';
update public.service_visits
set assigned_user_id = 'fa250000-0000-4000-8000-000000000003'
where id = 'fd250000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  'fa250000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa250000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

do $committed_direct_retry_after_revocation$
declare
  v_result jsonb;
  v_denied boolean;
begin
  v_result := public.dispatch_transition_service_visit_atomic(
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000001',
    'dispatched', null, null, 1,
    'fa250000-0000-4000-8000-000000000002',
    'field-execution:assigned:dispatched'
  );
  if not coalesce((v_result ->> 'idempotent')::boolean, false)
     or v_result #>> '{visit,status}' <> 'dispatched'
     or (v_result #>> '{visit,version}')::integer <> 2 then
    raise exception 'Committed direct retry did not return the original receipt';
  end if;

  v_result := public.dispatch_transition_service_visit_atomic(
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000003',
    'dispatched', null, null, 1,
    'fa250000-0000-4000-8000-000000000002',
    'field-execution:legacy:direct'
  );
  if not coalesce((v_result ->> 'idempotent')::boolean, false)
     or v_result #>> '{visit,status}' <> 'dispatched'
     or (v_result #>> '{visit,version}')::integer <> 2 then
    raise exception 'Legacy direct receipt was not recovered after revocation';
  end if;

  v_denied := false;
  begin
    perform public.dispatch_transition_service_visit_atomic(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000003',
      'en_route', null, null, 2,
      'fa250000-0000-4000-8000-000000000002',
      'field-execution:legacy:direct'
    );
  exception when sqlstate '22023' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Changed payload reused an upgraded legacy direct receipt';
  end if;

  v_denied := false;
  begin
    perform public.dispatch_transition_service_visit_atomic(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000001',
      'en_route', null, null, 2,
      'fa250000-0000-4000-8000-000000000002',
      'field-execution:assigned:dispatched'
    );
  exception when sqlstate '22023' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Changed direct payload reused a committed operation key';
  end if;

  v_denied := false;
  begin
    perform public.dispatch_transition_service_visit_atomic(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000001',
      'en_route', null, null, 2,
      'fa250000-0000-4000-8000-000000000002',
      'field-execution:revoked:fresh-direct'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Revoked Field operator created a fresh direct transition';
  end if;
end;
$committed_direct_retry_after_revocation$;

-- Restore current authorization only long enough to commit one offline replay.
reset role;
update public.mobile_field_operators
set enabled = true
where shop_id = 'fb250000-0000-4000-8000-000000000001'
  and profile_id = 'fa250000-0000-4000-8000-000000000002';
update public.service_visits
set assigned_user_id = 'fa250000-0000-4000-8000-000000000002'
where id = 'fd250000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  'fa250000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa250000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

do $assigned_operator_mobile_execution$
declare
  v_result jsonb;
begin
  v_result := public.mobile_replay_service_visit_transition_atomic(
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000001',
    'dispatched', 'en_route', 2,
    'fa250000-0000-4000-8000-000000000002',
    'field-execution:assigned:en-route'
  );
  if coalesce((v_result ->> 'idempotent')::boolean, true) then
    raise exception 'Fresh assigned mobile transition was incorrectly marked idempotent';
  end if;
end;
$assigned_operator_mobile_execution$;

reset role;
update public.mobile_field_operators
set enabled = false
where shop_id = 'fb250000-0000-4000-8000-000000000001'
  and profile_id = 'fa250000-0000-4000-8000-000000000002';
update public.service_visits
set assigned_user_id = 'fa250000-0000-4000-8000-000000000003'
where id = 'fd250000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  'fa250000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa250000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

do $committed_mobile_retry_after_revocation$
declare
  v_result jsonb;
  v_denied boolean;
begin
  v_result := public.mobile_replay_service_visit_transition_atomic(
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000001',
    'dispatched', 'en_route', 2,
    'fa250000-0000-4000-8000-000000000002',
    'field-execution:assigned:en-route'
  );
  if not coalesce((v_result ->> 'idempotent')::boolean, false)
     or v_result #>> '{visit,status}' <> 'en_route'
     or (v_result #>> '{visit,version}')::integer <> 3 then
    raise exception 'Committed mobile retry did not return the original receipt';
  end if;

  v_result := public.mobile_replay_service_visit_transition_atomic(
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000004',
    'dispatched', 'en_route', 2,
    'fa250000-0000-4000-8000-000000000002',
    'field-execution:legacy:mobile'
  );
  if not coalesce((v_result ->> 'idempotent')::boolean, false)
     or v_result #>> '{visit,status}' <> 'en_route'
     or (v_result #>> '{visit,version}')::integer <> 3 then
    raise exception 'Legacy mobile receipt was not recovered after revocation';
  end if;

  v_denied := false;
  begin
    perform public.mobile_replay_service_visit_transition_atomic(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000004',
      'scheduled', 'en_route', 2,
      'fa250000-0000-4000-8000-000000000002',
      'field-execution:legacy:mobile'
    );
  exception when sqlstate '22023' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Changed from-state reused an upgraded legacy mobile receipt';
  end if;

  v_denied := false;
  begin
    perform public.mobile_replay_service_visit_transition_atomic(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000001',
      'scheduled', 'en_route', 2,
      'fa250000-0000-4000-8000-000000000002',
      'field-execution:assigned:en-route'
    );
  exception when sqlstate '22023' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Changed mobile payload reused a committed operation key';
  end if;

  v_denied := false;
  begin
    perform public.mobile_replay_service_visit_transition_atomic(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000001',
      'en_route', 'arrived', 3,
      'fa250000-0000-4000-8000-000000000002',
      'field-execution:revoked:fresh-mobile'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Revoked Field operator created a fresh mobile transition';
  end if;
end;
$committed_mobile_retry_after_revocation$;

-- A different authenticated tenant must not recover the original shop's
-- receipt, even when it knows the operation key and exact public payload.
select set_config(
  'request.jwt.claim.sub',
  'fa250000-0000-4000-8000-000000000004',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa250000-0000-4000-8000-000000000004"}',
  true
);

do $cross_shop_receipt_isolation$
declare
  v_denied boolean := false;
begin
  begin
    perform public.dispatch_transition_service_visit_atomic(
      'fb250000-0000-4000-8000-000000000001',
      'fd250000-0000-4000-8000-000000000001',
      'dispatched', null, null, 1,
      'fa250000-0000-4000-8000-000000000004',
      'field-execution:assigned:dispatched'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Cross-shop actor recovered another tenant receipt';
  end if;

  v_denied := false;
  begin
    perform public.dispatch_transition_service_visit_atomic(
      'fb250000-0000-4000-8000-000000000002',
      'fd250000-0000-4000-8000-000000000001',
      'dispatched', null, null, 1,
      'fa250000-0000-4000-8000-000000000004',
      'field-execution:assigned:dispatched'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Cross-shop operation-key collision escaped tenant scope';
  end if;
end;
$cross_shop_receipt_isolation$;

select set_config(
  'request.jwt.claim.sub',
  'fa250000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa250000-0000-4000-8000-000000000001"}',
  true
);

do $dispatch_manager_execution$
declare
  v_history jsonb;
begin
  if not public.dispatch_can_execute(
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Field dispatch manager failed the execution predicate';
  end if;

  if not public.dispatch_can_execute(
    'fb250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Shop dispatch manager lost established execution access';
  end if;

  perform public.dispatch_transition_service_visit_atomic(
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000001',
    'arrived', null, null, 3,
    'fa250000-0000-4000-8000-000000000001',
    'field-execution:manager:arrived'
  );

  v_history := public.dispatch_visit_history(
    'fb250000-0000-4000-8000-000000000001',
    'fd250000-0000-4000-8000-000000000001',
    'fa250000-0000-4000-8000-000000000001'
  );
  if jsonb_array_length(v_history) <> 4 then
    raise exception 'Field dispatch manager did not receive complete history';
  end if;
end;
$dispatch_manager_execution$;

reset role;

do $field_execution_final_assertions$
begin
  if not exists (
    select 1
    from public.service_visits visit
    where visit.id = 'fd250000-0000-4000-8000-000000000001'
      and visit.status = 'arrived'
      and visit.version = 4
  ) then
    raise exception 'Authorized Field execution did not preserve canonical state';
  end if;

  if exists (
    select 1
    from public.scheduler_operation_keys operation
    where operation.shop_id = 'fb250000-0000-4000-8000-000000000001'
      and operation.operation_key in (
        'field-execution:unassigned:transition',
        'field-execution:unassigned:replay',
        'field-execution:revoked:fresh-direct',
        'field-execution:revoked:fresh-mobile'
      )
  ) then
    raise exception 'Denied Field execution created an idempotency receipt';
  end if;

  if (
    select count(*)
    from public.service_visit_events event
    where event.service_visit_id = 'fd250000-0000-4000-8000-000000000001'
      and event.event_type = 'transitioned'
  ) <> 3 then
    raise exception 'Committed retries duplicated Service Visit transition events';
  end if;

  if (
    select count(*)
    from public.scheduler_operation_keys operation
    where operation.shop_id = 'fb250000-0000-4000-8000-000000000001'
      and operation.operation_name = 'dispatch_visit_transition'
  ) <> 5 then
    raise exception 'Committed retries created duplicate transition receipts';
  end if;

  if (
    select count(*)
    from public.service_visit_events event
    where event.service_visit_id in (
      'fd250000-0000-4000-8000-000000000003',
      'fd250000-0000-4000-8000-000000000004'
    )
      and event.event_type = 'transitioned'
  ) <> 2 then
    raise exception 'Legacy receipt recovery duplicated transition events';
  end if;

  if not exists (
    select 1
    from public.scheduler_operation_keys operation
    where operation.shop_id = 'fb250000-0000-4000-8000-000000000001'
      and operation.operation_name = 'dispatch_visit_transition'
      and operation.operation_key = 'field-execution:assigned:dispatched'
      and operation.actor_user_id = 'fa250000-0000-4000-8000-000000000002'
      and operation.result ->> '_request_hash_version' = '1'
      and length(operation.result ->> '_request_hash') = 64
  ) then
    raise exception 'Direct transition receipt is not actor- and payload-bound';
  end if;

  if not exists (
    select 1
    from public.scheduler_operation_keys operation
    where operation.shop_id = 'fb250000-0000-4000-8000-000000000001'
      and operation.operation_name = 'dispatch_visit_transition'
      and operation.operation_key = 'field-execution:assigned:en-route'
      and operation.actor_user_id = 'fa250000-0000-4000-8000-000000000002'
      and length(operation.result ->> '_request_hash') = 64
      and length(operation.result ->> '_mobile_request_hash') = 64
  ) then
    raise exception 'Mobile transition receipt is not actor- and payload-bound';
  end if;

  if not exists (
    select 1
    from public.scheduler_operation_keys operation
    where operation.shop_id = 'fb250000-0000-4000-8000-000000000001'
      and operation.operation_name = 'dispatch_visit_transition'
      and operation.operation_key = 'field-execution:legacy:direct'
      and operation.actor_user_id = 'fa250000-0000-4000-8000-000000000002'
      and operation.result ->> '_request_hash_version' = '1'
      and length(operation.result ->> '_request_hash') = 64
  ) then
    raise exception 'Legacy direct receipt was not upgraded to exact hashing';
  end if;

  if not exists (
    select 1
    from public.scheduler_operation_keys operation
    where operation.shop_id = 'fb250000-0000-4000-8000-000000000001'
      and operation.operation_name = 'dispatch_visit_transition'
      and operation.operation_key = 'field-execution:legacy:mobile'
      and operation.actor_user_id = 'fa250000-0000-4000-8000-000000000002'
      and operation.result ->> '_request_hash_version' = '1'
      and length(operation.result ->> '_request_hash') = 64
      and length(operation.result ->> '_mobile_request_hash') = 64
  ) then
    raise exception 'Legacy mobile receipt was not upgraded to exact hashing';
  end if;
end;
$field_execution_final_assertions$;

rollback;

select 'field_visit_execution_boundary_ok' as result;
