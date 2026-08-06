begin;

create or replace function public.manage_fleet_workspace(
  p_action text,
  p_fleet_id uuid,
  p_member_user_id uuid default null,
  p_role text default null,
  p_name text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_existing_role text;
  v_manager_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select f.shop_id
  into v_shop_id
  from public.fleets f
  where f.id = p_fleet_id
  for update;
  if v_shop_id is null then raise exception 'Fleet not found'; end if;

  if not (
    exists (
      select 1
      from public.profiles p
      where p.id = v_user_id
        and p.shop_id = v_shop_id
        and p.role in ('owner','admin','manager')
        and exists (
          select 1
          from public.fleet_members explicit_membership
          where explicit_membership.user_id = v_user_id
            and explicit_membership.fleet_id = p_fleet_id
        )
    )
    or exists (
      select 1
      from public.fleet_members m
      where m.user_id = v_user_id
        and m.fleet_id = p_fleet_id
        and m.role in ('owner','admin','manager','fleet_manager')
    )
  ) then
    raise exception 'Fleet management access required';
  end if;

  if p_action = 'update_workspace' then
    if nullif(btrim(coalesce(p_name, '')), '') is null then
      raise exception 'Fleet name is required';
    end if;
    if length(btrim(p_name)) > 120 then
      raise exception 'Fleet name is too long';
    end if;
    if nullif(btrim(coalesce(p_contact_email, '')), '') is not null
       and position('@' in btrim(p_contact_email)) <= 1 then
      raise exception 'Enter a valid contact email';
    end if;

    update public.fleets
    set name = btrim(p_name),
        contact_name = nullif(btrim(coalesce(p_contact_name, '')), ''),
        contact_email = lower(nullif(btrim(coalesce(p_contact_email, '')), '')),
        contact_phone = nullif(btrim(coalesce(p_contact_phone, '')), ''),
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        updated_at = now()
    where id = p_fleet_id
      and shop_id = v_shop_id;

    insert into public.activity_logs (
      user_id, action, target_table, target_id, context
    ) values (
      v_user_id,
      'fleet_workspace_updated',
      'fleets',
      p_fleet_id,
      jsonb_build_object('shop_id', v_shop_id)
    );
  elsif p_action in ('update_member_role', 'remove_member') then
    if p_member_user_id is null then raise exception 'Fleet member is required'; end if;
    if p_member_user_id = v_user_id then
      raise exception 'You cannot change your own Fleet access';
    end if;

    select m.role
    into v_existing_role
    from public.fleet_members m
    where m.fleet_id = p_fleet_id
      and m.shop_id = v_shop_id
      and m.user_id = p_member_user_id
    for update;
    if v_existing_role is null then raise exception 'Fleet member not found'; end if;
    if v_existing_role in ('owner','admin') then
      raise exception 'Protected Fleet owners must be managed by support';
    end if;

    if v_existing_role in ('owner','admin','manager','fleet_manager') then
      select count(*)::integer
      into v_manager_count
      from public.fleet_members m
      where m.fleet_id = p_fleet_id
        and m.shop_id = v_shop_id
        and m.role in ('owner','admin','manager','fleet_manager');

      if v_manager_count <= 1
         and (p_action = 'remove_member' or coalesce(p_role, '') <> 'manager') then
        raise exception 'Every Fleet workspace must keep at least one manager';
      end if;
    end if;

    if p_action = 'update_member_role' then
      if coalesce(p_role, '') not in ('manager','approver','viewer') then
        raise exception 'Select a valid Fleet role';
      end if;

      update public.fleet_members
      set role = p_role,
          shop_id = v_shop_id,
          updated_at = now()
      where fleet_id = p_fleet_id
        and shop_id = v_shop_id
        and user_id = p_member_user_id;

      insert into public.activity_logs (
        user_id, action, target_table, target_id, context
      ) values (
        v_user_id,
        'fleet_member_role_updated',
        'fleet_members',
        p_member_user_id,
        jsonb_build_object(
          'fleet_id', p_fleet_id,
          'shop_id', v_shop_id,
          'previous_role', v_existing_role,
          'new_role', p_role
        )
      );
    else
      if exists (
        select 1
        from public.fleet_dispatch_assignments assignment
        where assignment.fleet_id = p_fleet_id
          and assignment.shop_id = v_shop_id
          and assignment.driver_profile_id = p_member_user_id
          and assignment.active
      ) then
        raise exception 'Reassign active assets before removing this driver';
      end if;

      delete from public.fleet_members
      where fleet_id = p_fleet_id
        and shop_id = v_shop_id
        and user_id = p_member_user_id;

      insert into public.activity_logs (
        user_id, action, target_table, target_id, context
      ) values (
        v_user_id,
        'fleet_member_removed',
        'fleet_members',
        p_member_user_id,
        jsonb_build_object(
          'fleet_id', p_fleet_id,
          'shop_id', v_shop_id,
          'previous_role', v_existing_role
        )
      );
    end if;
  else
    raise exception 'Unsupported Fleet workspace action';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'fleetId', p_fleet_id,
    'memberUserId', p_member_user_id
  );
end;
$function$;

revoke execute on function public.manage_fleet_workspace(
  text,uuid,uuid,text,text,text,text,text,text
) from public, anon;
grant execute on function public.manage_fleet_workspace(
  text,uuid,uuid,text,text,text,text,text,text
) to authenticated, service_role;

commit;
