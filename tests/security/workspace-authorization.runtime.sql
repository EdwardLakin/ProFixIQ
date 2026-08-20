\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '71100000-0000-4000-8000-000000000001',
    'workspace-auth-owner-a@example.com',
    '{"full_name":"Workspace Auth Owner A"}'::jsonb
  ),
  (
    '71100000-0000-4000-8000-000000000002',
    'workspace-auth-manager-a@example.com',
    '{"full_name":"Workspace Auth Manager A"}'::jsonb
  ),
  (
    '71200000-0000-4000-8000-000000000002',
    'workspace-auth-manager-profile-a@example.com',
    '{"full_name":"Workspace Auth Manager Profile A"}'::jsonb
  ),
  (
    '71100000-0000-4000-8000-000000000003',
    'workspace-auth-mechanic-a@example.com',
    '{"full_name":"Workspace Auth Mechanic A"}'::jsonb
  ),
  (
    '71100000-0000-4000-8000-000000000004',
    'workspace-auth-target-a@example.com',
    '{"full_name":"Workspace Auth Target A"}'::jsonb
  ),
  (
    '71100000-0000-4000-8000-000000000005',
    'workspace-auth-owner-b@example.com',
    '{"full_name":"Workspace Auth Owner B"}'::jsonb
  ),
  (
    '71100000-0000-4000-8000-000000000006',
    'workspace-auth-fleet-manager-a@example.com',
    '{"full_name":"Workspace Auth Fleet Manager A"}'::jsonb
  ),
  (
    '71100000-0000-4000-8000-000000000007',
    'workspace-auth-dispatcher-a@example.com',
    '{"full_name":"Workspace Auth Dispatcher A"}'::jsonb
  ),
  (
    '71100000-0000-4000-8000-000000000008',
    'workspace-auth-driver-a@example.com',
    '{"full_name":"Workspace Auth Driver A"}'::jsonb
  );

-- The manager fixture deliberately uses a canonical profiles.id different
-- from auth.uid() to cover imported/linked staff resolution.
insert into public.profiles (id, user_id, role, full_name)
values
  (
    '71100000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'owner',
    'Workspace Auth Owner A'
  ),
  (
    '71200000-0000-4000-8000-000000000002',
    '71100000-0000-4000-8000-000000000002',
    'manager',
    'Workspace Auth Manager A'
  ),
  (
    '71100000-0000-4000-8000-000000000003',
    '71100000-0000-4000-8000-000000000003',
    'mechanic',
    'Workspace Auth Mechanic A'
  ),
  (
    '71100000-0000-4000-8000-000000000004',
    '71100000-0000-4000-8000-000000000004',
    'mechanic',
    'Workspace Auth Target A'
  ),
  (
    '71100000-0000-4000-8000-000000000005',
    '71100000-0000-4000-8000-000000000005',
    'owner',
    'Workspace Auth Owner B'
  ),
  (
    '71100000-0000-4000-8000-000000000006',
    '71100000-0000-4000-8000-000000000006',
    'fleet_manager',
    'Workspace Auth Fleet Manager A'
  ),
  (
    '71100000-0000-4000-8000-000000000007',
    '71100000-0000-4000-8000-000000000007',
    'dispatcher',
    'Workspace Auth Dispatcher A'
  ),
  (
    '71100000-0000-4000-8000-000000000008',
    '71100000-0000-4000-8000-000000000008',
    'driver',
    'Workspace Auth Driver A'
  );

insert into public.shops (id, owner_id, business_name, name)
values
  (
    '71300000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'Workspace Authorization Shop A',
    'Workspace Authorization Shop A'
  ),
  (
    '71300000-0000-4000-8000-000000000002',
    '71100000-0000-4000-8000-000000000005',
    'Workspace Authorization Shop B',
    'Workspace Authorization Shop B'
  );

update public.profiles
set shop_id = case
  when id = '71100000-0000-4000-8000-000000000005'::uuid
    then '71300000-0000-4000-8000-000000000002'::uuid
  else '71300000-0000-4000-8000-000000000001'::uuid
end
where id in (
  '71100000-0000-4000-8000-000000000001',
  '71200000-0000-4000-8000-000000000002',
  '71100000-0000-4000-8000-000000000003',
  '71100000-0000-4000-8000-000000000004',
  '71100000-0000-4000-8000-000000000005',
  '71100000-0000-4000-8000-000000000006',
  '71100000-0000-4000-8000-000000000007',
  '71100000-0000-4000-8000-000000000008'
);

insert into public.work_orders (id, shop_id, custom_id, status)
values (
  '71400000-0000-4000-8000-000000000001',
  '71300000-0000-4000-8000-000000000001',
  'AUTH-1001',
  'in_progress'
);

insert into public.work_order_lines (
  id,
  shop_id,
  work_order_id,
  line_type,
  status,
  description
)
values (
  '71500000-0000-4000-8000-000000000001',
  '71300000-0000-4000-8000-000000000001',
  '71400000-0000-4000-8000-000000000001',
  'job',
  'in_progress',
  'Workspace authorization assignment fixture'
);

do $workspace_authorization_schema$
begin
  if has_table_privilege(
    'authenticated',
    'public.workspace_capabilities',
    'SELECT'
  ) or has_table_privilege(
    'authenticated',
    'public.workspace_role_capability_presets',
    'SELECT'
  ) or has_table_privilege(
    'authenticated',
    'public.shop_role_capability_policies',
    'SELECT'
  ) or has_table_privilege(
    'authenticated',
    'public.staff_capability_overrides',
    'SELECT'
  ) or has_table_privilege(
    'anon',
    'public.staff_capability_overrides',
    'SELECT'
  ) then
    raise exception 'Workspace authorization policy tables are directly readable by an API role.';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.staff_capability_overrides',
    'INSERT,UPDATE,DELETE'
  ) or has_table_privilege(
    'authenticated',
    'public.shop_role_capability_policies',
    'INSERT,UPDATE,DELETE'
  ) then
    raise exception 'Workspace authorization policy tables are directly mutable by authenticated.';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.resolve_workspace_profile_capability(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated can execute the private capability resolver.';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.workspace_current_actor_capabilities(text[])',
    'EXECUTE'
  ) then
    raise exception 'Authenticated cannot execute the self-scoped capability resolver.';
  end if;

  if exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'workspace_capabilities',
        'workspace_role_capability_presets',
        'shop_role_capability_policies',
        'staff_capability_overrides'
      )
      and not relation.relrowsecurity
  ) then
    raise exception 'A Workspace authorization table does not have RLS enabled.';
  end if;
end
$workspace_authorization_schema$;

-- Even if stale or service-authored rows exist, Fleet/portal roles must not
-- acquire Shop Workspace authority from role policies or individual overrides.
insert into public.shop_role_capability_policies (
  shop_id,
  role_key,
  capability_key,
  effect,
  changed_by_profile_id
)
select
  '71300000-0000-4000-8000-000000000001'::uuid,
  role_key,
  'work_order.assignment.manage',
  'allow',
  '71100000-0000-4000-8000-000000000001'::uuid
from unnest(array['fleet_manager', 'dispatcher', 'driver']) role_key;

insert into public.staff_capability_overrides (
  shop_id,
  profile_id,
  capability_key,
  effect,
  changed_by_profile_id
)
select
  '71300000-0000-4000-8000-000000000001'::uuid,
  profile_id,
  'work_order.assignment.manage',
  'allow',
  '71100000-0000-4000-8000-000000000001'::uuid
from unnest(array[
  '71100000-0000-4000-8000-000000000006'::uuid,
  '71100000-0000-4000-8000-000000000007'::uuid,
  '71100000-0000-4000-8000-000000000008'::uuid
]) profile_id;

set local role authenticated;

do $workspace_authorization_non_shop_actors$
declare
  v_actor record;
  v_resolver_denied boolean;
  v_assignment_denied boolean;
begin
  for v_actor in
    select *
    from (values
      ('71100000-0000-4000-8000-000000000006'::uuid, 'fleet_manager'::text),
      ('71100000-0000-4000-8000-000000000007'::uuid, 'dispatcher'::text),
      ('71100000-0000-4000-8000-000000000008'::uuid, 'driver'::text)
    ) actor(user_id, role_key)
  loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', v_actor.user_id, 'role', 'authenticated')::text,
      true
    );

    v_resolver_denied := false;
    begin
      perform 1
      from public.workspace_current_actor_capabilities(
        array['work_order.assignment.manage']
      );
    exception when insufficient_privilege then
      v_resolver_denied := true;
    end;

    v_assignment_denied := false;
    begin
      perform public.assign_work_order_line_technician_atomic(
        '71300000-0000-4000-8000-000000000001',
        '71500000-0000-4000-8000-000000000001',
        '71100000-0000-4000-8000-000000000004',
        v_actor.user_id,
        'workspace-authorization-non-shop-' || v_actor.role_key
      );
    exception when insufficient_privilege then
      v_assignment_denied := true;
    end;

    if not v_resolver_denied or not v_assignment_denied then
      raise exception 'Non-Shop role escaped Workspace authorization: %, resolver %, assignment %',
        v_actor.role_key,
        v_resolver_denied,
        v_assignment_denied;
    end if;
  end loop;
end
$workspace_authorization_non_shop_actors$;

reset role;

-- The canonical owner preset can assign and establishes an idempotent result.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $workspace_authorization_non_shop_policy_admin$
declare
  v_target record;
  v_override_denied boolean;
  v_policy_denied boolean;
begin
  for v_target in
    select *
    from (values
      ('71100000-0000-4000-8000-000000000006'::uuid, 'fleet_manager'::text),
      ('71100000-0000-4000-8000-000000000007'::uuid, 'dispatcher'::text),
      ('71100000-0000-4000-8000-000000000008'::uuid, 'driver'::text)
    ) target(profile_id, role_key)
  loop
    v_override_denied := false;
    begin
      perform public.set_staff_capability_override_atomic(
        v_target.profile_id,
        'work_order.assignment.manage',
        'allow'
      );
    exception when insufficient_privilege then
      v_override_denied := true;
    end;

    v_policy_denied := false;
    begin
      perform public.set_shop_role_capability_policy_atomic(
        v_target.role_key,
        'work_order.assignment.manage',
        'allow'
      );
    exception when insufficient_privilege then
      v_policy_denied := true;
    end;

    if not v_override_denied or not v_policy_denied then
      raise exception 'Owner delegated Shop Workspace authority to non-Shop role: %, override %, policy %',
        v_target.role_key,
        v_override_denied,
        v_policy_denied;
    end if;
  end loop;
end
$workspace_authorization_non_shop_policy_admin$;

do $workspace_authorization_owner_assignment$
declare
  v_result jsonb;
begin
  select public.assign_work_order_line_technician_atomic(
    '71300000-0000-4000-8000-000000000001',
    '71500000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000004',
    '71100000-0000-4000-8000-000000000001',
    'workspace-authorization-existing-operation'
  ) into v_result;

  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'Owner preset could not perform the canonical assignment: %', v_result;
  end if;
end
$workspace_authorization_owner_assignment$;

reset role;

-- A mechanic starts denied and cannot spoof the owner—even when replaying an
-- already completed operation key. Authorization is evaluated before the
-- idempotency return path.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $workspace_authorization_mechanic_denied$
declare
  v_granted boolean;
  v_source text;
  v_spoof_denied boolean := false;
  v_self_denied boolean := false;
begin
  select decision.granted, decision.decision_source
    into v_granted, v_source
  from public.workspace_current_actor_capabilities(
    array['work_order.assignment.manage']
  ) decision
  where decision.capability_key = 'work_order.assignment.manage';

  if coalesce(v_granted, true) or v_source is distinct from 'profixiq_preset' then
    raise exception 'Mechanic assignment preset did not fail closed: %, %',
      v_granted,
      v_source;
  end if;

  begin
    perform public.assign_work_order_line_technician_atomic(
      '71300000-0000-4000-8000-000000000001',
      '71500000-0000-4000-8000-000000000001',
      '71100000-0000-4000-8000-000000000004',
      '71100000-0000-4000-8000-000000000001',
      'workspace-authorization-existing-operation'
    );
  exception when insufficient_privilege then
    v_spoof_denied := true;
  end;
  if not v_spoof_denied then
    raise exception 'Mechanic replayed an owner idempotency result by spoofing p_assigned_by.';
  end if;

  begin
    perform public.assign_work_order_line_technician_atomic(
      '71300000-0000-4000-8000-000000000001',
      '71500000-0000-4000-8000-000000000001',
      '71100000-0000-4000-8000-000000000004',
      '71100000-0000-4000-8000-000000000003',
      'workspace-authorization-denied-mechanic'
    );
  exception when insufficient_privilege then
    v_self_denied := true;
  end;
  if not v_self_denied then
    raise exception 'Mechanic assigned work without an effective capability.';
  end if;
end
$workspace_authorization_mechanic_denied$;

reset role;

-- Inspect the canonical assignment relationship outside the mechanic's RLS
-- context. An unrelated mechanic correctly cannot select this line, so this
-- precondition must not run while impersonating that actor.
do $workspace_authorization_lead_hand_scope_fixture$
begin
  if not exists (
    select 1
    from public.work_order_lines line
    where line.id = '71500000-0000-4000-8000-000000000001'
      and line.assigned_tech_id = '71100000-0000-4000-8000-000000000004'
  ) or exists (
    select 1
    from public.work_order_line_technicians assignment
    where assignment.work_order_line_id = '71500000-0000-4000-8000-000000000001'
      and assignment.technician_id = '71100000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Lead Hand scope fixture was already related to the mechanic.';
  end if;
end
$workspace_authorization_lead_hand_scope_fixture$;

-- Owner grants only the assignment capability to the mechanic. This is the
-- Lead Hand-style individual exception without changing the employee role.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $workspace_authorization_owner_grant$
declare
  v_result jsonb;
begin
  select public.set_staff_capability_override_atomic(
    '71100000-0000-4000-8000-000000000003',
    'work_order.assignment.manage',
    'allow'
  ) into v_result;

  if coalesce((v_result ->> 'changed')::boolean, false) is not true
     or v_result ->> 'effect' is distinct from 'allow'
     or coalesce((v_result ->> 'granted')::boolean, false) is not true then
    raise exception 'Owner could not grant the individual assignment override: %',
      v_result;
  end if;
end
$workspace_authorization_owner_grant$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $workspace_authorization_mechanic_allowed$
declare
  v_profile_id uuid;
  v_shop_id uuid;
  v_granted boolean;
  v_source text;
  v_result jsonb;
begin
  select
    decision.profile_id,
    decision.shop_id,
    decision.granted,
    decision.decision_source
    into v_profile_id, v_shop_id, v_granted, v_source
  from public.workspace_current_actor_capabilities(
    array['work_order.assignment.manage']
  ) decision
  where decision.capability_key = 'work_order.assignment.manage';

  if v_profile_id <> '71100000-0000-4000-8000-000000000003'::uuid
     or v_shop_id <> '71300000-0000-4000-8000-000000000001'::uuid
     or not coalesce(v_granted, false)
     or v_source is distinct from 'individual_override' then
    raise exception 'Individual assignment override resolved incorrectly.';
  end if;

  select public.assign_work_order_line_technician_atomic(
    '71300000-0000-4000-8000-000000000001',
    '71500000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000003',
    '71100000-0000-4000-8000-000000000003',
    'workspace-authorization-allowed-mechanic'
  ) into v_result;

  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'Individually authorized mechanic could not assign: %', v_result;
  end if;
end
$workspace_authorization_mechanic_allowed$;

reset role;

do $workspace_authorization_assignment_result$
begin
  if not exists (
    select 1
    from public.work_order_lines line
    where line.id = '71500000-0000-4000-8000-000000000001'
      and line.assigned_tech_id = '71100000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Authorized assignment did not preserve the canonical work-order mutation.';
  end if;
end
$workspace_authorization_assignment_result$;

-- Exercise the full precedence contract:
-- individual DENY/ALLOW > shop role policy > ProFixIQ preset.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.set_staff_capability_override_atomic(
  '71100000-0000-4000-8000-000000000003',
  'work_order.assignment.manage',
  'inherit'
);
select public.set_shop_role_capability_policy_atomic(
  'mechanic',
  'work_order.assignment.manage',
  'allow'
);

reset role;

-- A delegated permission manager who has personally been denied assignment
-- authority can still reduce lower-authority access. They cannot ALLOW it or
-- remove a deny when INHERIT would restore granted authority.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.set_shop_role_capability_policy_atomic(
  'mechanic',
  'work_order.assignment.manage',
  'allow'
);
select public.set_staff_capability_override_atomic(
  '71200000-0000-4000-8000-000000000002',
  'work_order.assignment.manage',
  'deny'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $workspace_authorization_deny_only_admin$
declare
  v_team_granted boolean;
  v_assignment_granted boolean;
  v_result jsonb;
  v_staff_allow_denied boolean := false;
  v_staff_inherit_denied boolean := false;
  v_role_inherit_denied boolean := false;
begin
  select
    bool_or(decision.granted) filter (
      where decision.capability_key = 'team.permissions.manage'
    ),
    bool_or(decision.granted) filter (
      where decision.capability_key = 'work_order.assignment.manage'
    )
    into v_team_granted, v_assignment_granted
  from public.workspace_current_actor_capabilities(array[
    'team.permissions.manage',
    'work_order.assignment.manage'
  ]) decision;

  if not coalesce(v_team_granted, false)
     or coalesce(v_assignment_granted, true) then
    raise exception 'Deny-only manager fixture did not resolve as intended.';
  end if;

  select public.set_staff_capability_override_atomic(
    '71100000-0000-4000-8000-000000000004',
    'work_order.assignment.manage',
    'deny'
  ) into v_result;
  if coalesce((v_result ->> 'changed')::boolean, false) is not true
     or v_result ->> 'effect' is distinct from 'deny'
     or coalesce((v_result ->> 'granted')::boolean, true) then
    raise exception 'Permission manager could not apply a staff DENY: %', v_result;
  end if;

  begin
    perform public.set_staff_capability_override_atomic(
      '71100000-0000-4000-8000-000000000004',
      'work_order.assignment.manage',
      'allow'
    );
  exception when insufficient_privilege then
    v_staff_allow_denied := true;
  end;

  begin
    perform public.set_staff_capability_override_atomic(
      '71100000-0000-4000-8000-000000000004',
      'work_order.assignment.manage',
      'inherit'
    );
  exception when insufficient_privilege then
    v_staff_inherit_denied := true;
  end;

  if not v_staff_allow_denied or not v_staff_inherit_denied then
    raise exception 'Permission manager restored staff authority they do not hold.';
  end if;

  select public.set_shop_role_capability_policy_atomic(
    'parts',
    'work_order.assignment.manage',
    'deny'
  ) into v_result;
  if coalesce((v_result ->> 'changed')::boolean, false) is not true
     or v_result ->> 'effect' is distinct from 'deny' then
    raise exception 'Permission manager could not apply a role DENY: %', v_result;
  end if;

  select public.set_shop_role_capability_policy_atomic(
    'parts',
    'work_order.assignment.manage',
    'inherit'
  ) into v_result;
  if coalesce((v_result ->> 'changed')::boolean, false) is not true
     or v_result ->> 'effect' is distinct from 'inherit' then
    raise exception 'Permission manager could not restore deny-only role inheritance: %',
      v_result;
  end if;

  perform public.set_shop_role_capability_policy_atomic(
    'advisor',
    'work_order.assignment.manage',
    'deny'
  );
  begin
    perform public.set_shop_role_capability_policy_atomic(
      'advisor',
      'work_order.assignment.manage',
      'inherit'
    );
  exception when insufficient_privilege then
    v_role_inherit_denied := true;
  end;
  if not v_role_inherit_denied then
    raise exception 'Permission manager restored role authority they do not hold.';
  end if;
end
$workspace_authorization_deny_only_admin$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $workspace_authorization_shop_allow$
declare
  v_granted boolean;
  v_source text;
begin
  select decision.granted, decision.decision_source
    into v_granted, v_source
  from public.workspace_current_actor_capabilities(
    array['work_order.assignment.manage']
  ) decision;
  if not coalesce(v_granted, false) or v_source is distinct from 'shop_role_policy' then
    raise exception 'Shop role ALLOW did not override the mechanic preset.';
  end if;
end
$workspace_authorization_shop_allow$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.set_staff_capability_override_atomic(
  '71100000-0000-4000-8000-000000000003',
  'work_order.assignment.manage',
  'deny'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $workspace_authorization_individual_deny$
declare
  v_granted boolean;
  v_source text;
begin
  select decision.granted, decision.decision_source
    into v_granted, v_source
  from public.workspace_current_actor_capabilities(
    array['work_order.assignment.manage']
  ) decision;
  if coalesce(v_granted, true) or v_source is distinct from 'individual_override' then
    raise exception 'Individual DENY did not outrank the shop role ALLOW.';
  end if;
end
$workspace_authorization_individual_deny$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.set_shop_role_capability_policy_atomic(
  'mechanic',
  'work_order.assignment.manage',
  'deny'
);
select public.set_staff_capability_override_atomic(
  '71100000-0000-4000-8000-000000000003',
  'work_order.assignment.manage',
  'allow'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $workspace_authorization_individual_allow$
declare
  v_granted boolean;
  v_source text;
begin
  select decision.granted, decision.decision_source
    into v_granted, v_source
  from public.workspace_current_actor_capabilities(
    array['work_order.assignment.manage']
  ) decision;
  if not coalesce(v_granted, false) or v_source is distinct from 'individual_override' then
    raise exception 'Individual ALLOW did not outrank the shop role DENY.';
  end if;
end
$workspace_authorization_individual_allow$;

reset role;

-- The linked manager resolves to the canonical profile but cannot alter an
-- owner/peer-level employee. Protected capability delegation is also rejected.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $workspace_authorization_manager_ceiling$
declare
  v_profile_id uuid;
  v_team_granted boolean;
  v_peer_denied boolean := false;
begin
  select decision.profile_id, decision.granted
    into v_profile_id, v_team_granted
  from public.workspace_current_actor_capabilities(
    array['team.permissions.manage']
  ) decision;

  if v_profile_id <> '71200000-0000-4000-8000-000000000002'::uuid
     or not coalesce(v_team_granted, false) then
    raise exception 'Linked manager did not resolve to its canonical profile preset.';
  end if;

  begin
    perform public.set_staff_capability_override_atomic(
      '71100000-0000-4000-8000-000000000001',
      'work_order.assignment.manage',
      'deny'
    );
  exception when insufficient_privilege then
    v_peer_denied := true;
  end;
  if not v_peer_denied then
    raise exception 'Manager modified a higher-authority owner.';
  end if;
end
$workspace_authorization_manager_ceiling$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $workspace_authorization_protected_ceiling$
declare
  v_protected_denied boolean := false;
  v_self_denied boolean := false;
begin
  begin
    perform public.set_staff_capability_override_atomic(
      '71100000-0000-4000-8000-000000000003',
      'team.permissions.manage',
      'allow'
    );
  exception when insufficient_privilege then
    v_protected_denied := true;
  end;
  if not v_protected_denied then
    raise exception 'Owner delegated a protected capability.';
  end if;

  begin
    perform public.set_staff_capability_override_atomic(
      '71100000-0000-4000-8000-000000000001',
      'work_order.assignment.manage',
      'deny'
    );
  exception when insufficient_privilege then
    v_self_denied := true;
  end;
  if not v_self_denied then
    raise exception 'Owner changed their own capability through the delegation RPC.';
  end if;
end
$workspace_authorization_protected_ceiling$;

reset role;

-- Another shop owner cannot use the SECURITY DEFINER management function to
-- target Shop A, and their self resolver returns only Shop B scope.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71100000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

do $workspace_authorization_tenant_boundary$
declare
  v_shop_id uuid;
  v_cross_shop_denied boolean := false;
begin
  select decision.shop_id
    into v_shop_id
  from public.workspace_current_actor_capabilities(
    array['work_order.assignment.manage']
  ) decision;
  if v_shop_id <> '71300000-0000-4000-8000-000000000002'::uuid then
    raise exception 'Shop B owner resolver escaped its tenant scope.';
  end if;

  begin
    perform public.set_staff_capability_override_atomic(
      '71100000-0000-4000-8000-000000000003',
      'work_order.assignment.manage',
      'deny'
    );
  exception when insufficient_privilege then
    v_cross_shop_denied := true;
  end;
  if not v_cross_shop_denied then
    raise exception 'Shop B owner modified a Shop A employee.';
  end if;
end
$workspace_authorization_tenant_boundary$;

reset role;
select set_config('request.jwt.claims', '', true);

do $workspace_authorization_audit$
begin
  if not exists (
    select 1
    from public.operational_events event
    where event.shop_id = '71300000-0000-4000-8000-000000000001'
      and event.event_type = 'authorization.staff_override.changed'
      and event.entity_type = 'profile'
      and event.entity_id = '71100000-0000-4000-8000-000000000003'
      and event.metadata ->> 'capability_key' = 'work_order.assignment.manage'
      and event.metadata ? 'previous_effect'
      and event.metadata ? 'new_effect'
  ) then
    raise exception 'Individual permission change did not append an operational audit event.';
  end if;

  if not exists (
    select 1
    from public.operational_events event
    where event.shop_id = '71300000-0000-4000-8000-000000000001'
      and event.event_type = 'authorization.shop_role_policy.changed'
      and event.metadata ->> 'role_key' = 'mechanic'
      and event.metadata ->> 'capability_key' = 'work_order.assignment.manage'
  ) then
    raise exception 'Shop role permission change did not append an operational audit event.';
  end if;
end
$workspace_authorization_audit$;

rollback;
