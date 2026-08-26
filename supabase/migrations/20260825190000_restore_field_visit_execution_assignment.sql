begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Restore the execution boundary that existed before the Field product gate
-- was added. Field entitlement is necessary, but it is not visit ownership:
-- an ordinary operator may execute only the visit assigned to their canonical
-- profile, while established dispatch managers may execute any same-shop
-- mobile visit. Shop-mode visits retain their existing authorization rules.
create or replace function public.dispatch_can_execute(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_visit_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_visits visit
    where visit.id = p_visit_id
      and visit.shop_id = p_shop_id
      and (
        (
          visit.mode = 'mobile'
          and public.mobile_actor_has_field_service_access(
            p_shop_id,
            p_actor_user_id
          )
          and (
            public.dispatch_can_manage(p_shop_id, p_actor_user_id)
            or exists (
              select 1
              from public.profiles assigned_profile
              where assigned_profile.id = visit.assigned_user_id
                and assigned_profile.shop_id = visit.shop_id
                and (
                  assigned_profile.id = p_actor_user_id
                  or assigned_profile.user_id = p_actor_user_id
                )
            )
          )
        )
        or (
          visit.mode <> 'mobile'
          and (
            public.dispatch_can_manage(p_shop_id, p_actor_user_id)
            or exists (
              select 1
              from public.profiles profile
              where profile.id = visit.assigned_user_id
                and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
                and lower(coalesce(profile.role, '')) in (
                  'mechanic','technician','tech','lead_hand','leadhand','foreman'
                )
            )
          )
        )
      )
  );
$$;

comment on function public.dispatch_can_execute(uuid, uuid, uuid) is
  'Returns whether the actor may execute a tenant-scoped Service Visit. Mobile visits require current Field access plus dispatch-management authority or exact canonical assignment; Shop-mode behavior retains the established manager-or-assigned-technician rule.';

revoke all on function public.dispatch_can_execute(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.dispatch_can_execute(uuid, uuid, uuid)
  to authenticated, service_role;

do $field_visit_execution_postcheck$
declare
  v_definition text;
begin
  if to_regprocedure('public.dispatch_can_execute(uuid,uuid,uuid)') is null then
    raise exception 'Field visit execution predicate is missing';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.dispatch_can_execute(uuid,uuid,uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if pg_catalog.strpos(
    v_definition,
    'public.mobile_actor_has_field_service_access'
  ) = 0
  or pg_catalog.strpos(v_definition, 'public.dispatch_can_manage') = 0
  or pg_catalog.strpos(v_definition, 'assigned_profile.id = visit.assigned_user_id') = 0
  or pg_catalog.strpos(v_definition, $$visit.mode <> 'mobile'$$) = 0 then
    raise exception 'Field visit execution invariant is incomplete';
  end if;

  if has_function_privilege(
    'anon',
    'public.dispatch_can_execute(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous Field visit execution probing is unsafe';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.dispatch_can_execute(uuid,uuid,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.dispatch_can_execute(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Established Field execution callers lost predicate access';
  end if;
end;
$field_visit_execution_postcheck$;

notify pgrst, 'reload schema';

commit;
