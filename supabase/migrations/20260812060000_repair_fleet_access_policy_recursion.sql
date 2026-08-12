begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- fleets_actor_select and fleet_members_actor_select previously selected from
-- one another. PostgreSQL correctly rejected that mutual RLS dependency as an
-- infinite recursion. These predicates preserve the existing access rules but
-- evaluate the cross-table checks as the migration owner, outside row policy
-- recursion. Each predicate remains bound to auth.uid().
create or replace function public.fleet_actor_can_read_fleet(
  p_fleet_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fleets fleet
    where fleet.id = p_fleet_id
      and fleet.shop_id = p_shop_id
      and (
        exists (
          select 1
          from public.profiles profile
          where profile.shop_id = p_shop_id
            and (
              profile.id = (select auth.uid())
              or profile.user_id = (select auth.uid())
            )
        )
        or exists (
          select 1
          from public.fleet_members membership
          where membership.fleet_id = p_fleet_id
            and membership.shop_id = p_shop_id
            and membership.user_id in (
              select profile.id
              from public.profiles profile
              where profile.id = (select auth.uid())
                 or profile.user_id = (select auth.uid())
            )
        )
      )
  );
$$;

create or replace function public.fleet_actor_can_read_member(
  p_fleet_id uuid,
  p_shop_id uuid,
  p_member_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fleets fleet
    where fleet.id = p_fleet_id
      and fleet.shop_id = p_shop_id
      and (
        p_member_user_id in (
          select profile.id
          from public.profiles profile
          where profile.id = (select auth.uid())
             or profile.user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.profiles profile
          where profile.shop_id = p_shop_id
            and (
              profile.id = (select auth.uid())
              or profile.user_id = (select auth.uid())
            )
        )
      )
  );
$$;

create or replace function public.fleet_actor_can_manage_scope(
  p_fleet_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fleets fleet
    where fleet.id = p_fleet_id
      and fleet.shop_id = p_shop_id
      and exists (
        select 1
        from public.profiles profile
        where profile.shop_id = p_shop_id
          and (
            profile.id = (select auth.uid())
            or profile.user_id = (select auth.uid())
          )
          and public.canonical_shop_membership_role(profile.role::text)
            in ('owner', 'admin', 'manager')
      )
  );
$$;

revoke all on function public.fleet_actor_can_read_fleet(uuid, uuid)
  from public, anon;
revoke all on function public.fleet_actor_can_read_member(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.fleet_actor_can_manage_scope(uuid, uuid)
  from public, anon;
grant execute on function public.fleet_actor_can_read_fleet(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fleet_actor_can_read_member(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fleet_actor_can_manage_scope(uuid, uuid)
  to authenticated, service_role;

drop policy if exists fleets_actor_select on public.fleets;
create policy fleets_actor_select
  on public.fleets
  for select to authenticated
  using (public.fleet_actor_can_read_fleet(id, shop_id));

drop policy if exists fleet_members_actor_select on public.fleet_members;
create policy fleet_members_actor_select
  on public.fleet_members
  for select to authenticated
  using (
    public.fleet_actor_can_read_member(fleet_id, shop_id, user_id)
  );

drop policy if exists fleet_members_manager_write on public.fleet_members;
create policy fleet_members_manager_write
  on public.fleet_members
  for all to authenticated
  using (public.fleet_actor_can_manage_scope(fleet_id, shop_id))
  with check (public.fleet_actor_can_manage_scope(fleet_id, shop_id));

commit;
