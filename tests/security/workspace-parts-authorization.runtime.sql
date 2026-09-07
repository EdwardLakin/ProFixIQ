\set ON_ERROR_STOP on

begin;

-- Runtime proof that the Parts capability family and the permission
-- administration read model are enforced by the database, not only by routes.

insert into auth.users (id, email, raw_user_meta_data)
values
  ('72100000-0000-4000-8000-000000000001', 'parts-auth-owner-a@example.com',
   '{"full_name":"Parts Auth Owner A"}'::jsonb),
  ('72100000-0000-4000-8000-000000000002', 'parts-auth-manager-a@example.com',
   '{"full_name":"Parts Auth Manager A"}'::jsonb),
  ('72100000-0000-4000-8000-000000000003', 'parts-auth-parts-a@example.com',
   '{"full_name":"Parts Auth Parts A"}'::jsonb),
  ('72100000-0000-4000-8000-000000000004', 'parts-auth-advisor-a@example.com',
   '{"full_name":"Parts Auth Advisor A"}'::jsonb),
  ('72100000-0000-4000-8000-000000000005', 'parts-auth-mechanic-a@example.com',
   '{"full_name":"Parts Auth Mechanic A"}'::jsonb),
  ('72100000-0000-4000-8000-000000000006', 'parts-auth-owner-b@example.com',
   '{"full_name":"Parts Auth Owner B"}'::jsonb),
  ('72100000-0000-4000-8000-000000000007', 'parts-auth-mechanic-b@example.com',
   '{"full_name":"Parts Auth Mechanic B"}'::jsonb);

insert into public.profiles (id, user_id, role, full_name)
values
  ('72100000-0000-4000-8000-000000000001',
   '72100000-0000-4000-8000-000000000001', 'owner', 'Parts Auth Owner A'),
  ('72100000-0000-4000-8000-000000000002',
   '72100000-0000-4000-8000-000000000002', 'manager', 'Parts Auth Manager A'),
  ('72100000-0000-4000-8000-000000000003',
   '72100000-0000-4000-8000-000000000003', 'parts', 'Parts Auth Parts A'),
  ('72100000-0000-4000-8000-000000000004',
   '72100000-0000-4000-8000-000000000004', 'advisor', 'Parts Auth Advisor A'),
  ('72100000-0000-4000-8000-000000000005',
   '72100000-0000-4000-8000-000000000005', 'mechanic', 'Parts Auth Mechanic A'),
  ('72100000-0000-4000-8000-000000000006',
   '72100000-0000-4000-8000-000000000006', 'owner', 'Parts Auth Owner B'),
  ('72100000-0000-4000-8000-000000000007',
   '72100000-0000-4000-8000-000000000007', 'mechanic', 'Parts Auth Mechanic B')
on conflict (id) do nothing;

insert into public.shops (id, owner_id, business_name, name)
values
  ('72300000-0000-4000-8000-000000000001',
   '72100000-0000-4000-8000-000000000001',
   'Parts Authorization Shop A', 'Parts Authorization Shop A'),
  ('72300000-0000-4000-8000-000000000002',
   '72100000-0000-4000-8000-000000000006',
   'Parts Authorization Shop B', 'Parts Authorization Shop B');

update public.profiles
set shop_id = case
  when id in (
    '72100000-0000-4000-8000-000000000006',
    '72100000-0000-4000-8000-000000000007'
  ) then '72300000-0000-4000-8000-000000000002'::uuid
  else '72300000-0000-4000-8000-000000000001'::uuid
end
where id::text like '72100000-0000-4000-8000-%';

insert into public.work_orders (id, shop_id, custom_id, status)
values
  ('72400000-0000-4000-8000-000000000001',
   '72300000-0000-4000-8000-000000000001', 'PARTS-AUTH-1001', 'in_progress');

insert into public.suppliers (id, shop_id, name)
values
  ('72600000-0000-4000-8000-000000000001',
   '72300000-0000-4000-8000-000000000001', 'Parts Authorization Supplier A');

insert into public.purchase_orders (id, shop_id, supplier_id, status)
values
  ('72700000-0000-4000-8000-000000000001',
   '72300000-0000-4000-8000-000000000001',
   '72600000-0000-4000-8000-000000000001', 'draft');

-- ---------------------------------------------------------------------------
-- The canonical parts implementations must not be reachable through the API.
-- ---------------------------------------------------------------------------
do $parts_private_implementation_privileges$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'private.create_part_request_with_items(uuid, jsonb, text, text)',
    'private.parts_place_purchase_order(uuid, text, text)',
    'private.parts_receive_request_item(uuid, uuid, numeric, uuid, numeric, text)',
    'private.parts_receive_free_text_po_line(uuid, uuid, numeric, text)'
  ]
  loop
    if has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'Canonical parts implementation % is executable by an API role.',
        v_signature;
    end if;
  end loop;

  if has_schema_privilege('authenticated', 'private', 'USAGE')
     or has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'API roles can use the private schema.';
  end if;
end
$parts_private_implementation_privileges$;

-- ---------------------------------------------------------------------------
-- The lifecycle floor reproduces the allowlist it replaced.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"72100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

do $parts_floor_preserves_advisor$
begin
  -- Advisor could always reach the parts lifecycle procedures and must still.
  perform public.parts_lifecycle_assert_shop_access(
    '72300000-0000-4000-8000-000000000001'
  );
end
$parts_floor_preserves_advisor$;

select set_config(
  'request.jwt.claims',
  '{"sub":"72100000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

do $parts_floor_denies_mechanic$
declare
  v_denied boolean := false;
begin
  begin
    perform public.parts_lifecycle_assert_shop_access(
      '72300000-0000-4000-8000-000000000001'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Mechanic reached the parts lifecycle floor without a parts capability.';
  end if;
end
$parts_floor_denies_mechanic$;

-- The Advisor preset allows requesting parts through the canonical procedure.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

do $parts_request_preset_allows_advisor$
declare
  v_request_id uuid;
begin
  select public.create_part_request_with_items(
    '72400000-0000-4000-8000-000000000001',
    '[{"description":"Front brake pads","qty":2}]'::jsonb,
    null,
    'runtime parts authorization fixture'
  ) into v_request_id;
  if v_request_id is null then
    raise exception 'Advisor parts.request preset did not create a request.';
  end if;
end
$parts_request_preset_allows_advisor$;

reset role;

-- ---------------------------------------------------------------------------
-- Individual overrides change the database decision, not just the UI.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $parts_owner_overrides$
declare
  v_result jsonb;
begin
  -- Deny one employee the ability to request parts.
  select public.set_staff_capability_override_atomic(
    '72100000-0000-4000-8000-000000000004',
    'parts.request',
    'deny'
  ) into v_result;
  if coalesce((v_result ->> 'granted')::boolean, true) is not false then
    raise exception 'parts.request DENY did not take effect: %', v_result;
  end if;

  -- Deny the parts employee purchasing authority while leaving the rest of the
  -- parts desk intact. This is the "receiving is not ordering" case.
  select public.set_staff_capability_override_atomic(
    '72100000-0000-4000-8000-000000000003',
    'parts.order',
    'deny'
  ) into v_result;
  if coalesce((v_result ->> 'granted')::boolean, true) is not false then
    raise exception 'parts.order DENY did not take effect: %', v_result;
  end if;

  -- Lead Hand style delegation: one technician runs the parts desk without a
  -- role change, and unrelated manager authority stays denied.
  select public.set_staff_capability_override_atomic(
    '72100000-0000-4000-8000-000000000005',
    'parts.desk.manage',
    'allow'
  ) into v_result;
  if coalesce((v_result ->> 'granted')::boolean, false) is not true then
    raise exception 'Individual parts.desk.manage ALLOW did not take effect: %', v_result;
  end if;
end
$parts_owner_overrides$;

do $parts_cross_shop_override_is_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.set_staff_capability_override_atomic(
      '72100000-0000-4000-8000-000000000007',
      'parts.desk.manage',
      'allow'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Owner A changed an employee in Shop B.';
  end if;
end
$parts_cross_shop_override_is_denied$;

do $parts_self_escalation_is_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.set_staff_capability_override_atomic(
      '72100000-0000-4000-8000-000000000001',
      'parts.order',
      'allow'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Owner granted themselves a capability.';
  end if;
end
$parts_self_escalation_is_denied$;

do $parts_protected_capability_is_not_delegable$
declare
  v_denied boolean := false;
begin
  begin
    perform public.set_staff_capability_override_atomic(
      '72100000-0000-4000-8000-000000000005',
      'team.permissions.manage',
      'allow'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'A protected capability was delegated to an individual.';
  end if;
end
$parts_protected_capability_is_not_delegable$;

reset role;

-- The denied technician can no longer request parts through the canonical
-- procedure, even calling it directly.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

do $parts_request_deny_blocks_direct_rpc$
declare
  v_denied boolean := false;
begin
  begin
    perform public.create_part_request_with_items(
      '72400000-0000-4000-8000-000000000001',
      '[{"description":"Rear brake pads","qty":2}]'::jsonb,
      null,
      'runtime parts authorization denied fixture'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Individual DENY did not block the direct parts-request RPC.';
  end if;
end
$parts_request_deny_blocks_direct_rpc$;

reset role;

-- The parts employee keeps the desk but loses purchasing, through the RPC.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $parts_order_deny_blocks_direct_rpc$
declare
  v_denied boolean := false;
begin
  begin
    perform public.parts_place_purchase_order(
      '72700000-0000-4000-8000-000000000001',
      'runtime-parts-authorization-place',
      null
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Individual DENY did not block the direct purchase-order RPC.';
  end if;

  -- The rest of the parts desk is untouched by the purchasing denial.
  if not public.workspace_actor_has_capability(
    '72300000-0000-4000-8000-000000000001',
    'parts.desk.manage'
  ) then
    raise exception 'Denying purchasing also removed the parts desk.';
  end if;
end
$parts_order_deny_blocks_direct_rpc$;

reset role;

-- ---------------------------------------------------------------------------
-- Permission administration read model.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72100000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

do $administration_requires_authority$
declare
  v_denied boolean := false;
begin
  begin
    perform public.workspace_permission_administration_snapshot(null);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'A technician read the permission administration snapshot.';
  end if;
end
$administration_requires_authority$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $administration_snapshot_contract$
declare
  v_snapshot jsonb;
  v_denied boolean := false;
  v_roles text[];
begin
  select public.workspace_permission_administration_snapshot(
    '72100000-0000-4000-8000-000000000005'
  ) into v_snapshot;

  if v_snapshot ->> 'shop_id' <> '72300000-0000-4000-8000-000000000001' then
    raise exception 'Snapshot returned another tenant: %', v_snapshot ->> 'shop_id';
  end if;

  -- The individually delegated parts-desk grant is visible with its source.
  if not exists (
    select 1
    from jsonb_array_elements(v_snapshot -> 'employee' -> 'effective') decision
    where decision ->> 'capability_key' = 'parts.desk.manage'
      and (decision ->> 'granted')::boolean is true
      and decision ->> 'decision_source' = 'individual_override'
  ) then
    raise exception 'Snapshot did not explain the individual parts-desk override.';
  end if;

  -- Delegating one capability must not promote the employee to a manager.
  if exists (
    select 1
    from jsonb_array_elements(v_snapshot -> 'employee' -> 'effective') decision
    where decision ->> 'capability_key' in (
      'work_order.invoice.manage',
      'work_order.financial.gp.view'
    )
      and (decision ->> 'granted')::boolean is true
  ) then
    raise exception 'An individual parts override leaked unrelated manager authority.';
  end if;

  if (v_snapshot -> 'employee' ->> 'canonical_role') <> 'mechanic' then
    raise exception 'Snapshot returned the wrong employee role.';
  end if;
  if (v_snapshot -> 'employee' ->> 'manageable')::boolean is not true then
    raise exception 'A manager could not manage a technician.';
  end if;

  -- A manager may not administer a peer or higher-authority role.
  select array_agg(role_entry.value #>> '{}')
    into v_roles
  from jsonb_array_elements(v_snapshot -> 'manageable_roles') as role_entry(value);
  if v_roles && array['owner', 'admin', 'manager'] then
    raise exception 'Manager was offered a peer or higher-authority role: %', v_roles;
  end if;

  -- The grant ceiling travels with the snapshot: this manager cannot grant a
  -- capability they do not hold.
  if exists (
    select 1
    from jsonb_array_elements(v_snapshot -> 'capabilities') capability
    where capability ->> 'capability_key' = 'work_order.financial.cost.view'
      and (capability ->> 'actor_can_grant')::boolean is not true
  ) then
    raise exception 'Manager preset unexpectedly lost cost visibility.';
  end if;

  -- A target outside the caller's shop is refused rather than disclosed.
  begin
    perform public.workspace_permission_administration_snapshot(
      '72100000-0000-4000-8000-000000000007'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Snapshot disclosed an employee from another shop.';
  end if;
end
$administration_snapshot_contract$;

reset role;

-- ---------------------------------------------------------------------------
-- Restoring INHERIT re-resolves the inherited policy rather than allowing.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $parts_inherit_restores_role_policy$
declare
  v_result jsonb;
begin
  perform public.set_shop_role_capability_policy_atomic(
    'mechanic',
    'parts.request',
    'deny'
  );

  select public.set_staff_capability_override_atomic(
    '72100000-0000-4000-8000-000000000005',
    'parts.request',
    'allow'
  ) into v_result;
  if coalesce((v_result ->> 'granted')::boolean, false) is not true then
    raise exception 'ALLOW did not override a shop role DENY: %', v_result;
  end if;

  select public.set_staff_capability_override_atomic(
    '72100000-0000-4000-8000-000000000005',
    'parts.request',
    'inherit'
  ) into v_result;

  -- INHERIT falls back to the shop role policy, which denies. It must never
  -- behave as an implicit ALLOW.
  if coalesce((v_result ->> 'granted')::boolean, true) is not false then
    raise exception 'INHERIT behaved as an implicit ALLOW: %', v_result;
  end if;
  if (v_result ->> 'decision_source') <> 'shop_role_policy' then
    raise exception 'INHERIT did not resolve through the shop role policy: %', v_result;
  end if;

  perform public.set_shop_role_capability_policy_atomic(
    'mechanic',
    'parts.request',
    'inherit'
  );
end
$parts_inherit_restores_role_policy$;

reset role;

-- Permission changes append canonical operational audit events.
do $parts_permission_audit_events$
declare
  v_events integer;
begin
  select count(*)
    into v_events
  from public.operational_events event
  where event.shop_id = '72300000-0000-4000-8000-000000000001'
    and event.event_type in (
      'authorization.staff_override.changed',
      'authorization.shop_role_policy.changed'
    )
    and event.metadata ->> 'capability_key' like 'parts.%';
  if v_events < 4 then
    raise exception 'Parts permission changes did not append audit events: %', v_events;
  end if;
end
$parts_permission_audit_events$;

rollback;
