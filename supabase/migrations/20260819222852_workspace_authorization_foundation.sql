begin;

create schema if not exists private;

create table public.workspace_capabilities (
  capability_key text primary key,
  workspace_key text not null,
  module_key text not null,
  action_key text not null,
  access_level text not null,
  is_protected boolean not null default false,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_capabilities_key_format
    check (capability_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint workspace_capabilities_access_level
    check (access_level in ('view', 'manage')),
  constraint workspace_capabilities_workspace_nonempty
    check (length(btrim(workspace_key)) > 0),
  constraint workspace_capabilities_module_nonempty
    check (length(btrim(module_key)) > 0),
  constraint workspace_capabilities_action_nonempty
    check (length(btrim(action_key)) > 0)
);

create table public.workspace_role_capability_presets (
  capability_key text not null
    references public.workspace_capabilities(capability_key) on delete cascade,
  role_key text not null,
  effect text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (capability_key, role_key),
  constraint workspace_role_capability_presets_effect
    check (effect in ('allow', 'deny')),
  constraint workspace_role_capability_presets_role_nonempty
    check (length(btrim(role_key)) > 0)
);

create table public.shop_role_capability_policies (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  role_key text not null,
  capability_key text not null
    references public.workspace_capabilities(capability_key) on delete cascade,
  effect text not null,
  changed_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, role_key, capability_key),
  constraint shop_role_capability_policies_effect
    check (effect in ('allow', 'deny')),
  constraint shop_role_capability_policies_role_nonempty
    check (length(btrim(role_key)) > 0)
);

create index shop_role_capability_policies_capability_idx
  on public.shop_role_capability_policies(capability_key, shop_id);

create index shop_role_capability_policies_changed_by_idx
  on public.shop_role_capability_policies(changed_by_profile_id)
  where changed_by_profile_id is not null;

create table public.staff_capability_overrides (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability_key text not null
    references public.workspace_capabilities(capability_key) on delete cascade,
  effect text not null,
  changed_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, profile_id, capability_key),
  constraint staff_capability_overrides_effect
    check (effect in ('allow', 'deny'))
);

create index staff_capability_overrides_profile_idx
  on public.staff_capability_overrides(profile_id, capability_key);

create index staff_capability_overrides_capability_idx
  on public.staff_capability_overrides(capability_key, shop_id);

create index staff_capability_overrides_changed_by_idx
  on public.staff_capability_overrides(changed_by_profile_id)
  where changed_by_profile_id is not null;

alter table public.workspace_capabilities enable row level security;
alter table public.workspace_role_capability_presets enable row level security;
alter table public.shop_role_capability_policies enable row level security;
alter table public.staff_capability_overrides enable row level security;

revoke all on public.workspace_capabilities from public, anon, authenticated;
revoke all on public.workspace_role_capability_presets from public, anon, authenticated;
revoke all on public.shop_role_capability_policies from public, anon, authenticated;
revoke all on public.staff_capability_overrides from public, anon, authenticated;

grant select, insert, update, delete on public.workspace_capabilities to service_role;
grant select, insert, update, delete on public.workspace_role_capability_presets to service_role;
grant select, insert, update, delete on public.shop_role_capability_policies to service_role;
grant select, insert, update, delete on public.staff_capability_overrides to service_role;

insert into public.workspace_capabilities (
  capability_key,
  workspace_key,
  module_key,
  action_key,
  access_level,
  is_protected,
  description
) values
  (
    'team.permissions.manage',
    'team',
    'permissions',
    'manage',
    'manage',
    true,
    'Manage grantable role policies and individual employee access.'
  ),
  (
    'work_order.assignment.manage',
    'work_order',
    'assignment',
    'manage',
    'manage',
    false,
    'Assign and reassign technicians on work-order repair lines.'
  )
on conflict (capability_key) do update
set workspace_key = excluded.workspace_key,
    module_key = excluded.module_key,
    action_key = excluded.action_key,
    access_level = excluded.access_level,
    is_protected = excluded.is_protected,
    description = excluded.description,
    updated_at = now();

insert into public.workspace_role_capability_presets (
  capability_key,
  role_key,
  effect
) values
  ('team.permissions.manage', 'owner', 'allow'),
  ('team.permissions.manage', 'admin', 'allow'),
  ('team.permissions.manage', 'manager', 'allow'),
  ('work_order.assignment.manage', 'owner', 'allow'),
  ('work_order.assignment.manage', 'admin', 'allow'),
  ('work_order.assignment.manage', 'manager', 'allow'),
  ('work_order.assignment.manage', 'advisor', 'allow'),
  ('work_order.assignment.manage', 'lead_hand', 'allow'),
  ('work_order.assignment.manage', 'foreman', 'allow')
on conflict (capability_key, role_key) do update
set effect = excluded.effect,
    updated_at = now();

create or replace function private.workspace_canonical_role(p_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_role, '')))
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'manager' then 'manager'
    when 'advisor' then 'advisor'
    when 'service' then 'service'
    when 'service_advisor' then 'service'
    when 'service advisor' then 'service'
    when 'parts' then 'parts'
    when 'mechanic' then 'mechanic'
    when 'tech' then 'mechanic'
    when 'technician' then 'mechanic'
    when 'lead_hand' then 'lead_hand'
    when 'leadhand' then 'lead_hand'
    when 'lead hand' then 'lead_hand'
    when 'lead' then 'lead_hand'
    when 'foreman' then 'foreman'
    when 'fleet_manager' then 'fleet_manager'
    when 'dispatcher' then 'dispatcher'
    when 'driver' then 'driver'
    when 'customer' then 'customer'
    else 'unknown'
  end;
$$;

create or replace function private.workspace_role_rank(p_role text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case private.workspace_canonical_role(p_role)
    when 'owner' then 100
    when 'admin' then 90
    when 'manager' then 80
    when 'foreman' then 70
    when 'lead_hand' then 70
    when 'advisor' then 60
    when 'service' then 60
    when 'parts' then 50
    when 'mechanic' then 50
    when 'fleet_manager' then 40
    when 'dispatcher' then 30
    when 'driver' then 20
    when 'customer' then 10
    else 0
  end;
$$;

create or replace function private.workspace_is_shop_staff_role(p_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.workspace_canonical_role(p_role) = any(array[
    'owner',
    'admin',
    'manager',
    'advisor',
    'service',
    'parts',
    'mechanic',
    'lead_hand',
    'foreman'
  ]::text[]);
$$;

create or replace function private.resolve_workspace_profile_capability(
  p_profile_id uuid,
  p_shop_id uuid,
  p_capability_key text
)
returns table(granted boolean, decision_source text, effect text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_is_protected boolean;
  v_effect text;
begin
  select
    private.workspace_canonical_role(profile.role::text),
    capability.is_protected
    into v_role, v_is_protected
  from public.profiles profile
  join public.workspace_capabilities capability
    on capability.capability_key = p_capability_key
  where profile.id = p_profile_id
    and profile.shop_id = p_shop_id;

  if not found or not private.workspace_is_shop_staff_role(v_role) then
    return query select false, 'unavailable'::text, 'deny'::text;
    return;
  end if;

  if not v_is_protected then
    select override.effect
      into v_effect
    from public.staff_capability_overrides override
    where override.shop_id = p_shop_id
      and override.profile_id = p_profile_id
      and override.capability_key = p_capability_key;
    if found then
      return query
        select v_effect = 'allow', 'individual_override'::text, v_effect;
      return;
    end if;

    select policy.effect
      into v_effect
    from public.shop_role_capability_policies policy
    where policy.shop_id = p_shop_id
      and policy.role_key = v_role
      and policy.capability_key = p_capability_key;
    if found then
      return query
        select v_effect = 'allow', 'shop_role_policy'::text, v_effect;
      return;
    end if;
  end if;

  select preset.effect
    into v_effect
  from public.workspace_role_capability_presets preset
  where preset.capability_key = p_capability_key
    and preset.role_key = v_role;
  if found then
    return query select v_effect = 'allow', 'profixiq_preset'::text, v_effect;
    return;
  end if;

  return query select false, 'profixiq_preset'::text, 'deny'::text;
end;
$$;

create or replace function public.workspace_current_actor_capabilities(
  p_capability_keys text[] default null
)
returns table(
  profile_id uuid,
  shop_id uuid,
  canonical_role text,
  capability_key text,
  access_level text,
  granted boolean,
  decision_source text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_shop_id uuid;
  v_role text;
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select
    profile.id,
    profile.shop_id,
    private.workspace_canonical_role(profile.role::text)
    into v_profile_id, v_shop_id, v_role
  from public.profiles profile
  where profile.shop_id is not null
    and (profile.id = v_auth_user_id or profile.user_id = v_auth_user_id)
  order by (profile.id = v_auth_user_id) desc,
           profile.updated_at desc nulls last,
           profile.id
  limit 1;

  if v_profile_id is null
     or v_shop_id is null
     or not private.workspace_is_shop_staff_role(v_role) then
    raise exception using errcode = '42501', message = 'A shop staff profile is required.';
  end if;

  return query
  select
    v_profile_id,
    v_shop_id,
    v_role,
    capability.capability_key,
    capability.access_level,
    decision.granted,
    decision.decision_source
  from public.workspace_capabilities capability
  cross join lateral private.resolve_workspace_profile_capability(
    v_profile_id,
    v_shop_id,
    capability.capability_key
  ) decision
  where p_capability_keys is null
     or capability.capability_key = any(p_capability_keys)
  order by capability.capability_key;
end;
$$;

create or replace function public.set_staff_capability_override_atomic(
  p_target_profile_id uuid,
  p_capability_key text,
  p_effect text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_shop_id uuid;
  v_actor_role text;
  v_target_role text;
  v_effect text := lower(btrim(coalesce(p_effect, '')));
  v_previous_effect text := 'inherit';
  v_actor_can_manage boolean := false;
  v_actor_can_grant boolean := false;
  v_target_granted boolean := false;
  v_target_source text := 'unavailable';
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_effect not in ('inherit', 'allow', 'deny') then
    raise exception using errcode = '22023', message = 'Effect must be INHERIT, ALLOW, or DENY.';
  end if;

  select
    profile.id,
    profile.shop_id,
    private.workspace_canonical_role(profile.role::text)
    into v_actor_profile_id, v_actor_shop_id, v_actor_role
  from public.profiles profile
  where profile.shop_id is not null
    and (profile.id = v_auth_user_id or profile.user_id = v_auth_user_id)
  order by (profile.id = v_auth_user_id) desc,
           profile.updated_at desc nulls last,
           profile.id
  limit 1;

  if v_actor_profile_id is null
     or v_actor_shop_id is null
     or not private.workspace_is_shop_staff_role(v_actor_role) then
    raise exception using errcode = '42501', message = 'A shop staff profile is required.';
  end if;
  if p_target_profile_id = v_actor_profile_id then
    raise exception using errcode = '42501', message = 'Self-service permission changes are not allowed.';
  end if;

  select decision.granted
    into v_actor_can_manage
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    v_actor_shop_id,
    'team.permissions.manage'
  ) decision;
  if not coalesce(v_actor_can_manage, false) then
    raise exception using errcode = '42501', message = 'Permission administration is required.';
  end if;

  perform 1
  from public.workspace_capabilities capability
  where capability.capability_key = p_capability_key
    and not capability.is_protected;
  if not found then
    raise exception using errcode = '42501', message = 'This capability cannot be delegated.';
  end if;

  -- Serialize every policy/override change for one shop capability. This keeps
  -- the captured previous state and immutable audit sequence accurate when
  -- two administrators update related access at the same time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workspace-authorization:' || v_actor_shop_id::text || ':' || p_capability_key,
      0
    )
  );

  select decision.granted
    into v_actor_can_grant
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    v_actor_shop_id,
    p_capability_key
  ) decision;
  if not coalesce(v_actor_can_grant, false) then
    raise exception using errcode = '42501', message = 'You cannot grant authority you do not hold.';
  end if;

  select private.workspace_canonical_role(profile.role::text)
    into v_target_role
  from public.profiles profile
  where profile.id = p_target_profile_id
    and profile.shop_id = v_actor_shop_id;
  if not found or not private.workspace_is_shop_staff_role(v_target_role) then
    raise exception using errcode = '42501', message = 'Target employee is not available for this shop.';
  end if;
  if v_actor_role <> 'owner'
     and private.workspace_role_rank(v_target_role) >= private.workspace_role_rank(v_actor_role) then
    raise exception using errcode = '42501', message = 'You cannot modify a peer or higher-authority employee.';
  end if;

  select override.effect
    into v_previous_effect
  from public.staff_capability_overrides override
  where override.shop_id = v_actor_shop_id
    and override.profile_id = p_target_profile_id
    and override.capability_key = p_capability_key;
  if not found then
    v_previous_effect := 'inherit';
  end if;

  if v_effect = v_previous_effect then
    select decision.granted, decision.decision_source
      into v_target_granted, v_target_source
    from private.resolve_workspace_profile_capability(
      p_target_profile_id,
      v_actor_shop_id,
      p_capability_key
    ) decision;
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'shop_id', v_actor_shop_id,
      'profile_id', p_target_profile_id,
      'capability_key', p_capability_key,
      'effect', v_effect,
      'granted', coalesce(v_target_granted, false),
      'decision_source', v_target_source
    );
  end if;

  if v_effect = 'inherit' then
    delete from public.staff_capability_overrides override
    where override.shop_id = v_actor_shop_id
      and override.profile_id = p_target_profile_id
      and override.capability_key = p_capability_key;
  else
    insert into public.staff_capability_overrides (
      shop_id,
      profile_id,
      capability_key,
      effect,
      changed_by_profile_id
    ) values (
      v_actor_shop_id,
      p_target_profile_id,
      p_capability_key,
      v_effect,
      v_actor_profile_id
    )
    on conflict (shop_id, profile_id, capability_key) do update
    set effect = excluded.effect,
        changed_by_profile_id = excluded.changed_by_profile_id,
        updated_at = now();
  end if;

  select decision.granted, decision.decision_source
    into v_target_granted, v_target_source
  from private.resolve_workspace_profile_capability(
    p_target_profile_id,
    v_actor_shop_id,
    p_capability_key
  ) decision;

  perform private.append_operational_event(
    v_actor_shop_id,
    'authorization.staff_override.changed',
    now(),
    v_auth_user_id,
    v_actor_role,
    'profile',
    p_target_profile_id,
    'shop',
    v_actor_shop_id,
    null,
    null,
    null,
    'workspace_authorization_rpc',
    'info',
    jsonb_build_object(
      'actor_profile_id', v_actor_profile_id,
      'target_profile_id', p_target_profile_id,
      'capability_key', p_capability_key,
      'previous_effect', v_previous_effect,
      'new_effect', v_effect,
      'scope', 'shop'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'shop_id', v_actor_shop_id,
    'profile_id', p_target_profile_id,
    'capability_key', p_capability_key,
    'effect', v_effect,
    'granted', coalesce(v_target_granted, false),
    'decision_source', v_target_source
  );
end;
$$;

create or replace function public.set_shop_role_capability_policy_atomic(
  p_role_key text,
  p_capability_key text,
  p_effect text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_shop_id uuid;
  v_actor_role text;
  v_target_role text := private.workspace_canonical_role(p_role_key);
  v_effect text := lower(btrim(coalesce(p_effect, '')));
  v_previous_effect text := 'inherit';
  v_actor_can_manage boolean := false;
  v_actor_can_grant boolean := false;
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_effect not in ('inherit', 'allow', 'deny') then
    raise exception using errcode = '22023', message = 'Effect must be INHERIT, ALLOW, or DENY.';
  end if;
  if not private.workspace_is_shop_staff_role(v_target_role)
     or v_target_role = 'owner' then
    raise exception using errcode = '42501', message = 'This role policy cannot be modified.';
  end if;

  select
    profile.id,
    profile.shop_id,
    private.workspace_canonical_role(profile.role::text)
    into v_actor_profile_id, v_actor_shop_id, v_actor_role
  from public.profiles profile
  where profile.shop_id is not null
    and (profile.id = v_auth_user_id or profile.user_id = v_auth_user_id)
  order by (profile.id = v_auth_user_id) desc,
           profile.updated_at desc nulls last,
           profile.id
  limit 1;

  if v_actor_profile_id is null
     or v_actor_shop_id is null
     or not private.workspace_is_shop_staff_role(v_actor_role) then
    raise exception using errcode = '42501', message = 'A shop staff profile is required.';
  end if;

  select decision.granted
    into v_actor_can_manage
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    v_actor_shop_id,
    'team.permissions.manage'
  ) decision;
  if not coalesce(v_actor_can_manage, false) then
    raise exception using errcode = '42501', message = 'Permission administration is required.';
  end if;

  perform 1
  from public.workspace_capabilities capability
  where capability.capability_key = p_capability_key
    and not capability.is_protected;
  if not found then
    raise exception using errcode = '42501', message = 'This capability cannot be delegated.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workspace-authorization:' || v_actor_shop_id::text || ':' || p_capability_key,
      0
    )
  );

  select decision.granted
    into v_actor_can_grant
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    v_actor_shop_id,
    p_capability_key
  ) decision;
  if not coalesce(v_actor_can_grant, false) then
    raise exception using errcode = '42501', message = 'You cannot grant authority you do not hold.';
  end if;

  if v_actor_role <> 'owner'
     and private.workspace_role_rank(v_target_role) >= private.workspace_role_rank(v_actor_role) then
    raise exception using errcode = '42501', message = 'You cannot modify a peer or higher-authority role.';
  end if;

  select policy.effect
    into v_previous_effect
  from public.shop_role_capability_policies policy
  where policy.shop_id = v_actor_shop_id
    and policy.role_key = v_target_role
    and policy.capability_key = p_capability_key;
  if not found then
    v_previous_effect := 'inherit';
  end if;

  if v_effect = v_previous_effect then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'shop_id', v_actor_shop_id,
      'role_key', v_target_role,
      'capability_key', p_capability_key,
      'effect', v_effect
    );
  end if;

  if v_effect = 'inherit' then
    delete from public.shop_role_capability_policies policy
    where policy.shop_id = v_actor_shop_id
      and policy.role_key = v_target_role
      and policy.capability_key = p_capability_key;
  else
    insert into public.shop_role_capability_policies (
      shop_id,
      role_key,
      capability_key,
      effect,
      changed_by_profile_id
    ) values (
      v_actor_shop_id,
      v_target_role,
      p_capability_key,
      v_effect,
      v_actor_profile_id
    )
    on conflict (shop_id, role_key, capability_key) do update
    set effect = excluded.effect,
        changed_by_profile_id = excluded.changed_by_profile_id,
        updated_at = now();
  end if;

  perform private.append_operational_event(
    v_actor_shop_id,
    'authorization.shop_role_policy.changed',
    now(),
    v_auth_user_id,
    v_actor_role,
    'shop',
    v_actor_shop_id,
    null,
    null,
    null,
    null,
    null,
    'workspace_authorization_rpc',
    'info',
    jsonb_build_object(
      'actor_profile_id', v_actor_profile_id,
      'role_key', v_target_role,
      'capability_key', p_capability_key,
      'previous_effect', v_previous_effect,
      'new_effect', v_effect,
      'scope', 'shop'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'shop_id', v_actor_shop_id,
    'role_key', v_target_role,
    'capability_key', p_capability_key,
    'effect', v_effect
  );
end;
$$;

create or replace function public.assign_work_order_line_technician_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_technician_id uuid,
  p_assigned_by uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_role text;
  v_existing jsonb;
  v_result jsonb;
  v_auth_user_id uuid := auth.uid();
  v_actor_auth_user_id uuid;
  v_authenticated_actor_matches boolean := false;
  v_actor_can_assign boolean := false;
begin
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select
    coalesce(profile.user_id, profile.id),
    v_auth_user_id is not null
      and (profile.id = v_auth_user_id or profile.user_id = v_auth_user_id)
    into v_actor_auth_user_id, v_authenticated_actor_matches
  from public.profiles profile
  where profile.id = p_assigned_by
    and profile.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = '42501', message = 'Assigning user is not available for this shop.';
  end if;
  if v_auth_user_id is not null and not v_authenticated_actor_matches then
    raise exception using errcode = '42501', message = 'Authenticated actor does not match assigning user.';
  end if;
  if v_auth_user_id is null
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_auth_user_id is not null then
    v_actor_auth_user_id := v_auth_user_id;
  end if;

  select decision.granted
    into v_actor_can_assign
  from private.resolve_workspace_profile_capability(
    p_assigned_by,
    p_shop_id,
    'work_order.assignment.manage'
  ) decision;
  if not coalesce(v_actor_can_assign, false) then
    raise exception using errcode = '42501', message = 'Work-order assignment authority is required.';
  end if;

  select operation.result
    into v_existing
  from public.workforce_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'assign_line_technician'
    and operation.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select *
    into v_line
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
  end if;
  if coalesce(v_line.line_type::text, 'job') = 'info' then
    raise exception using errcode = 'P0001', message = 'Info lines cannot be technician-assigned.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, v_line.work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: assignment cannot change after invoice finalization.';
  end if;

  select lower(coalesce(profile.role::text, ''))
    into v_role
  from public.profiles profile
  where profile.id = p_technician_id
    and profile.shop_id = p_shop_id
  for update;
  if not found or v_role not in ('mechanic','tech','technician','foreman','lead_hand','lead hand','leadhand') then
    raise exception using errcode = 'P0001', message = 'Technician is not assignable for this shop.';
  end if;

  insert into public.work_order_line_technicians(
    work_order_line_id,
    technician_id,
    assigned_by
  ) values (
    p_work_order_line_id,
    p_technician_id,
    p_assigned_by
  )
  on conflict (work_order_line_id, technician_id)
  do update set assigned_by = excluded.assigned_by;

  update public.work_order_lines
  set assigned_tech_id = p_technician_id,
      updated_at = now()
  where id = p_work_order_line_id
    and shop_id = p_shop_id;

  select jsonb_build_object(
    'ok', true,
    'shop_id', p_shop_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'primary_technician_id', p_technician_id,
    'technician_ids', coalesce(
      (
        select jsonb_agg(assignment.technician_id order by assignment.technician_id)
        from public.work_order_line_technicians assignment
        where assignment.work_order_line_id = p_work_order_line_id
      ),
      '[]'::jsonb
    ),
    'assignment_mode', 'additive_multi_tech_primary_mirror',
    'idempotent', false
  ) into v_result;

  insert into public.workforce_operation_keys(
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    work_order_line_id,
    result
  ) values (
    p_shop_id,
    'assign_line_technician',
    p_operation_key,
    v_actor_auth_user_id,
    v_line.work_order_id,
    p_work_order_line_id,
    v_result
  );

  insert into public.activity_logs(
    action,
    user_id,
    timestamp,
    target_table,
    target_id,
    context
  ) values (
    'technician_assigned',
    p_assigned_by,
    now(),
    'work_order_line',
    p_work_order_line_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'work_order_id', v_line.work_order_id,
      'technician_id', p_technician_id,
      'assignment_mode', 'additive_multi_tech_primary_mirror'
    )
  );

  return v_result;
end;
$$;

create or replace function public.shop_assistant_assign_work_order_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_only_unassigned boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_work_order public.work_orders%rowtype;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_actor_can_assign boolean := false;
  v_technician_role text;
  v_technician_name text;
  v_expected text;
  v_expected_count integer;
  v_count integer := 0;
  v_label text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'assign_work_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_actor_profile_id := public.shop_assistant_profile_id(
    p_shop_id, p_actor_user_id
  );
  v_actor_role := public.shop_assistant_profile_role(
    p_shop_id, p_actor_user_id
  );
  select decision.granted
    into v_actor_can_assign
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    p_shop_id,
    'work_order.assignment.manage'
  ) decision;
  if not coalesce(v_actor_can_assign, false) then
    raise exception using errcode = '42501', message = 'Your role cannot assign work.';
  end if;

  select
    public.shop_assistant_profile_role(p_shop_id, profile.id),
    profile.full_name
    into v_technician_role, v_technician_name
  from public.profiles profile
  where profile.id = p_technician_id
    and profile.shop_id = p_shop_id
  for update;
  if not found or v_technician_role not in ('mechanic', 'foreman', 'lead_hand') then
    raise exception using
      errcode = 'P0001',
      message = 'Technician is not assignable for this shop.';
  end if;

  select * into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: assignment cannot change after invoice finalization.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'The work order changed after the confirmation preview.';
  end if;

  perform 1
  from public.work_order_lines line
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
  order by line.id
  for update;

  v_expected_count := public.shop_assistant_assert_line_snapshot(
    v_action.target_versions,
    p_shop_id,
    p_work_order_id,
    'assign',
    p_only_unassigned
  );
  if v_expected_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'This work order has no eligible job lines to assign.';
  end if;

  with candidates as materialized (
    select line.id
    from public.work_order_lines line
    where line.shop_id = p_shop_id
      and line.work_order_id = p_work_order_id
      and line.voided_at is null
      and coalesce(line.line_type::text, 'job') = 'job'
      and (
        not coalesce(p_only_unassigned, true)
        or line.assigned_tech_id is null
      )
      and lower(replace(coalesce(line.status::text, ''), ' ', '_')) not in (
        'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
        'void', 'voided', 'ready_to_invoice', 'invoiced'
      )
      and lower(replace(coalesce(line.line_status::text, ''), ' ', '_')) not in (
        'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
        'void', 'voided', 'ready_to_invoice', 'invoiced'
      )
  ), bridge_rows as (
    insert into public.work_order_line_technicians(
      work_order_line_id,
      technician_id,
      assigned_by
    )
    select candidate.id, p_technician_id, v_actor_profile_id
    from candidates candidate
    on conflict (work_order_line_id, technician_id)
    do update set assigned_by = excluded.assigned_by
    returning work_order_line_id
  ), updated_rows as (
    update public.work_order_lines line
    set assigned_tech_id = p_technician_id,
        updated_at = now()
    from candidates candidate
    where line.id = candidate.id
    returning line.id
  )
  select count(*)::integer into v_count from updated_rows;

  if v_count <> v_expected_count then
    raise exception using
      errcode = '40001',
      message = 'The eligible work-order lines changed during assignment.';
  end if;

  update public.work_orders
  set updated_at = now()
  where id = p_work_order_id
    and shop_id = p_shop_id;

  v_label := case
    when nullif(trim(v_work_order.custom_id), '') is not null
      then 'WO #' || trim(v_work_order.custom_id)
    else 'WO ' || left(p_work_order_id::text, 8)
  end;
  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', p_work_order_id,
    'technicianId', p_technician_id,
    'technicianName', coalesce(nullif(trim(v_technician_name), ''), 'Technician'),
    'assignedLines', v_count,
    'summary', v_label || ' assigned ' || v_count::text || ' line(s) to '
      || coalesce(nullif(trim(v_technician_name), ''), 'the selected technician') || '.',
    'href', '/work-orders/' || p_work_order_id::text
  );

  insert into public.activity_logs(
    action, user_id, timestamp, target_table, target_id, context
  ) values (
    'shop_assistant_work_order_assigned',
    p_actor_user_id,
    now(),
    'work_order',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'profile_id', v_actor_profile_id,
      'action_id', p_action_id,
      'technician_id', p_technician_id,
      'assigned_lines', v_count,
      'only_unassigned', coalesce(p_only_unassigned, true)
    )
  );
  return public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
end;
$$;

revoke all on function private.workspace_canonical_role(text)
  from public, anon, authenticated, service_role;
revoke all on function private.workspace_role_rank(text)
  from public, anon, authenticated, service_role;
revoke all on function private.workspace_is_shop_staff_role(text)
  from public, anon, authenticated, service_role;
revoke all on function private.resolve_workspace_profile_capability(uuid, uuid, text)
  from public, anon, authenticated, service_role;

revoke all on function public.workspace_current_actor_capabilities(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.workspace_current_actor_capabilities(text[])
  to authenticated;

revoke all on function public.set_staff_capability_override_atomic(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_staff_capability_override_atomic(uuid, text, text)
  to authenticated;

revoke all on function public.set_shop_role_capability_policy_atomic(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_shop_role_capability_policy_atomic(text, text, text)
  to authenticated;

revoke all on function public.assign_work_order_line_technician_atomic(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_work_order_line_technician_atomic(uuid, uuid, uuid, uuid, text)
  to authenticated, service_role;

revoke all on function public.shop_assistant_assign_work_order_atomic(uuid, uuid, uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.shop_assistant_assign_work_order_atomic(uuid, uuid, uuid, uuid, uuid, boolean)
  to service_role;

comment on table public.workspace_capabilities is
  'Canonical granular Workspace capability catalog. Presentation labels remain application-owned.';
comment on table public.workspace_role_capability_presets is
  'Secure ProFixIQ role presets used when no shop policy or individual override applies.';
comment on table public.shop_role_capability_policies is
  'Shop-specific role policy overrides for grantable capabilities.';
comment on table public.staff_capability_overrides is
  'Individual INHERIT/ALLOW/DENY capability overrides. INHERIT is represented by no row.';
comment on function public.workspace_current_actor_capabilities(text[]) is
  'Returns the authenticated staff actor effective Workspace capabilities without exposing policy tables.';
comment on function public.set_staff_capability_override_atomic(uuid, text, text) is
  'Safely changes one grantable staff capability and appends an immutable operational audit event.';
comment on function public.set_shop_role_capability_policy_atomic(text, text, text) is
  'Safely changes one grantable shop role policy and appends an immutable operational audit event.';

commit;
