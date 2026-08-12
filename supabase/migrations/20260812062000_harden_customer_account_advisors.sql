begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- Keep privileged RLS predicates outside every Data API exposed schema. The
-- authenticated role may execute them only because row policies call them;
-- callers cannot select arbitrary tenant data from these boolean predicates.
create schema if not exists rls_helpers authorization postgres;
revoke all on schema rls_helpers from public, anon;
grant usage on schema rls_helpers to authenticated, service_role;
alter default privileges for role postgres in schema rls_helpers
  revoke execute on functions from public;

create or replace function rls_helpers.fleet_actor_can_read_fleet(
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

create or replace function rls_helpers.fleet_actor_can_read_member(
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

create or replace function rls_helpers.fleet_actor_can_manage_scope(
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

revoke all on function rls_helpers.fleet_actor_can_read_fleet(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function rls_helpers.fleet_actor_can_read_member(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function rls_helpers.fleet_actor_can_manage_scope(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function rls_helpers.fleet_actor_can_read_fleet(uuid, uuid)
  to authenticated, service_role;
grant execute on function rls_helpers.fleet_actor_can_read_member(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function rls_helpers.fleet_actor_can_manage_scope(uuid, uuid)
  to authenticated, service_role;

drop policy if exists fleets_actor_select on public.fleets;
create policy fleets_actor_select
  on public.fleets
  for select to authenticated
  using (rls_helpers.fleet_actor_can_read_fleet(id, shop_id));

drop policy if exists fleet_members_actor_select on public.fleet_members;
create policy fleet_members_actor_select
  on public.fleet_members
  for select to authenticated
  using (
    rls_helpers.fleet_actor_can_read_member(fleet_id, shop_id, user_id)
  );

drop policy if exists fleet_members_manager_write on public.fleet_members;
create policy fleet_members_manager_write
  on public.fleet_members
  for all to authenticated
  using (rls_helpers.fleet_actor_can_manage_scope(fleet_id, shop_id))
  with check (rls_helpers.fleet_actor_can_manage_scope(fleet_id, shop_id));

drop function public.fleet_actor_can_read_fleet(uuid, uuid);
drop function public.fleet_actor_can_read_member(uuid, uuid, uuid);
drop function public.fleet_actor_can_manage_scope(uuid, uuid);

create index if not exists customer_account_operations_actor_idx
  on private.customer_account_operations (actor_user_id);
create index if not exists customer_account_operations_customer_idx
  on private.customer_account_operations (customer_id)
  where customer_id is not null;
create index if not exists customer_account_merges_merged_by_idx
  on public.customer_account_merges (merged_by);
create index if not exists customer_account_merges_target_customer_idx
  on public.customer_account_merges (target_customer_id);

commit;
