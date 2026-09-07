begin;

-- ---------------------------------------------------------------------------
-- Permission administration read model.
--
-- The four policy tables stay revoked from anon/authenticated. Administration
-- screens need to render the ProFixIQ default, the shop customization, the
-- individual override and the effective result together, so this deliberately
-- scoped SECURITY DEFINER read returns exactly that shape for one shop, and
-- only to a caller who holds team.permissions.manage.
--
-- It also returns the caller's own grant ceiling per capability so the UI can
-- disable controls the write RPCs would reject. The UI hint is presentation
-- only; set_shop_role_capability_policy_atomic and
-- set_staff_capability_override_atomic remain the authority.
-- ---------------------------------------------------------------------------

create or replace function public.workspace_permission_administration_snapshot(
  p_target_profile_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_shop_id uuid;
  v_actor_role text;
  v_actor_rank integer;
  v_can_manage boolean := false;
  v_target_role text;
  v_target_rank integer;
  v_target_name text;
  v_employee jsonb := null;
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
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
    into v_can_manage
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    v_actor_shop_id,
    'team.permissions.manage'
  ) decision;
  if not coalesce(v_can_manage, false) then
    raise exception using errcode = '42501', message = 'Permission administration is required.';
  end if;

  v_actor_rank := private.workspace_role_rank(v_actor_role);

  if p_target_profile_id is not null then
    select
      private.workspace_canonical_role(profile.role::text),
      coalesce(nullif(btrim(profile.full_name), ''), profile.email)
      into v_target_role, v_target_name
    from public.profiles profile
    where profile.id = p_target_profile_id
      and profile.shop_id = v_actor_shop_id;

    if v_target_role is null or not private.workspace_is_shop_staff_role(v_target_role) then
      raise exception using errcode = '42501', message = 'Target employee is not available for this shop.';
    end if;

    v_target_rank := private.workspace_role_rank(v_target_role);

    select jsonb_build_object(
      'profile_id', p_target_profile_id,
      'full_name', v_target_name,
      'canonical_role', v_target_role,
      'is_self', p_target_profile_id = v_actor_profile_id,
      'manageable',
        p_target_profile_id <> v_actor_profile_id
        and (v_actor_role = 'owner' or v_target_rank < v_actor_rank),
      'overrides', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'capability_key', override.capability_key,
              'effect', override.effect
            )
            order by override.capability_key
          )
          from public.staff_capability_overrides override
          where override.shop_id = v_actor_shop_id
            and override.profile_id = p_target_profile_id
        ),
        '[]'::jsonb
      ),
      'effective', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'capability_key', capability.capability_key,
              'granted', decision.granted,
              'decision_source', decision.decision_source
            )
            order by capability.capability_key
          )
          from public.workspace_capabilities capability
          cross join lateral private.resolve_workspace_profile_capability(
            p_target_profile_id,
            v_actor_shop_id,
            capability.capability_key
          ) decision
        ),
        '[]'::jsonb
      )
    ) into v_employee;
  end if;

  return jsonb_build_object(
    'shop_id', v_actor_shop_id,
    'actor', jsonb_build_object(
      'profile_id', v_actor_profile_id,
      'canonical_role', v_actor_role,
      'is_owner', v_actor_role = 'owner'
    ),
    'manageable_roles', coalesce(
      (
        select jsonb_agg(role_key order by private.workspace_role_rank(role_key) desc)
        from unnest(array[
          'admin',
          'manager',
          'foreman',
          'lead_hand',
          'advisor',
          'service',
          'parts',
          'mechanic'
        ]::text[]) as role_key
        where v_actor_role = 'owner'
           or private.workspace_role_rank(role_key) < v_actor_rank
      ),
      '[]'::jsonb
    ),
    'capabilities', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'capability_key', capability.capability_key,
            'workspace_key', capability.workspace_key,
            'module_key', capability.module_key,
            'action_key', capability.action_key,
            'access_level', capability.access_level,
            'is_protected', capability.is_protected,
            'description', capability.description,
            'actor_can_grant', coalesce(actor_decision.granted, false)
          )
          order by capability.capability_key
        )
        from public.workspace_capabilities capability
        cross join lateral private.resolve_workspace_profile_capability(
          v_actor_profile_id,
          v_actor_shop_id,
          capability.capability_key
        ) actor_decision
      ),
      '[]'::jsonb
    ),
    'presets', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'role_key', preset.role_key,
            'capability_key', preset.capability_key,
            'effect', preset.effect
          )
          order by preset.role_key, preset.capability_key
        )
        from public.workspace_role_capability_presets preset
      ),
      '[]'::jsonb
    ),
    'role_policies', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'role_key', policy.role_key,
            'capability_key', policy.capability_key,
            'effect', policy.effect
          )
          order by policy.role_key, policy.capability_key
        )
        from public.shop_role_capability_policies policy
        where policy.shop_id = v_actor_shop_id
      ),
      '[]'::jsonb
    ),
    'employee', v_employee
  );
end;
$$;

revoke all on function public.workspace_permission_administration_snapshot(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.workspace_permission_administration_snapshot(uuid)
  to authenticated;

comment on function public.workspace_permission_administration_snapshot(uuid) is
  'Shop-scoped permission administration read model for callers holding team.permissions.manage. Never exposes another shop or the raw policy tables.';

commit;
