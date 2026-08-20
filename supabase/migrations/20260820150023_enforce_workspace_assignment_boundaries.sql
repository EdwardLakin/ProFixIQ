begin;

-- Resolve the authenticated actor's shop-scoped assignment authority without
-- exposing the underlying policy tables. Unlike the public capability RPC,
-- this predicate returns false for non-staff actors so it is safe inside RLS.
create or replace function public.workspace_actor_can_manage_work_order_assignments(
  p_shop_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_granted boolean := false;
begin
  if v_auth_user_id is null or p_shop_id is null then
    return false;
  end if;

  select profile.id
    into v_profile_id
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = v_auth_user_id or profile.user_id = v_auth_user_id)
  order by (profile.id = v_auth_user_id) desc,
           profile.updated_at desc nulls last,
           profile.id
  limit 1;

  if v_profile_id is null then
    return false;
  end if;

  select decision.granted
    into v_granted
  from private.resolve_workspace_profile_capability(
    v_profile_id,
    p_shop_id,
    'work_order.assignment.manage'
  ) decision;

  return coalesce(v_granted, false);
end;
$$;

-- The assignment bridge does not carry shop_id. Resolve its owning line under
-- a definer boundary, then apply the same effective capability and tenant test.
create or replace function public.workspace_actor_can_manage_work_order_line_assignments(
  p_work_order_line_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_order_lines line
    where line.id = p_work_order_line_id
      and public.workspace_actor_can_manage_work_order_assignments(line.shop_id)
  );
$$;

revoke all on function public.workspace_actor_can_manage_work_order_assignments(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.workspace_actor_can_manage_work_order_assignments(uuid)
  to authenticated, service_role;

revoke all on function public.workspace_actor_can_manage_work_order_line_assignments(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.workspace_actor_can_manage_work_order_line_assignments(uuid)
  to authenticated, service_role;

create or replace function private.enforce_work_order_line_assignment_capability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    v_assignment_changed := new.assigned_tech_id is not null
      or new.assigned_to is not null;
  elsif tg_op = 'UPDATE' then
    v_assignment_changed := new.assigned_tech_id is distinct from old.assigned_tech_id
      or new.assigned_to is distinct from old.assigned_to;
  end if;

  if not v_assignment_changed
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or (
       session_user in ('postgres', 'supabase_admin')
       and auth.uid() is null
     ) then
    return new;
  end if;

  if not public.workspace_actor_can_manage_work_order_assignments(new.shop_id) then
    raise exception using
      errcode = '42501',
      message = 'Work-order assignment authority is required.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_work_order_line_assignment_capability()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_work_order_line_assignment_capability
  on public.work_order_lines;
create trigger trg_work_order_line_assignment_capability
before insert or update of assigned_tech_id, assigned_to
on public.work_order_lines
for each row
execute function private.enforce_work_order_line_assignment_capability();

drop policy if exists work_orders_workspace_assignment_select
  on public.work_orders;
create policy work_orders_workspace_assignment_select
on public.work_orders
for select
to authenticated
using (
  public.workspace_actor_can_manage_work_order_assignments(shop_id)
);

drop policy if exists work_order_lines_workspace_assignment_select
  on public.work_order_lines;
create policy work_order_lines_workspace_assignment_select
on public.work_order_lines
for select
to authenticated
using (
  public.workspace_actor_can_manage_work_order_assignments(shop_id)
);

drop policy if exists work_order_line_technicians_workspace_assignment_select
  on public.work_order_line_technicians;
create policy work_order_line_technicians_workspace_assignment_select
on public.work_order_line_technicians
for select
to authenticated
using (
  public.workspace_actor_can_manage_work_order_line_assignments(
    work_order_line_id
  )
);

-- RLS decides which rows an actor may update; column privileges decide which
-- fields a direct PostgREST update may target. Assignment state is RPC-only so
-- an individual DENY cannot be bypassed through a static legacy update policy.
revoke update on table public.work_order_lines
  from public, anon, authenticated;
revoke update (assigned_tech_id, assigned_to)
  on table public.work_order_lines
  from public, anon, authenticated;

do $workspace_assignment_column_privileges$
declare
  v_columns text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'work_order_lines'
    and is_generated = 'NEVER'
    and column_name not in ('assigned_tech_id', 'assigned_to');

  if v_columns is null then
    raise exception 'No non-assignment work_order_lines columns were found.';
  end if;

  execute format(
    'grant update (%s) on table public.work_order_lines to authenticated',
    v_columns
  );
end
$workspace_assignment_column_privileges$;

-- The bridge is another canonical assignment representation. Browser clients
-- may read it through RLS, but every mutation must use the guarded assignment
-- RPC or a capability-checked server service.
revoke insert, update, delete on table public.work_order_line_technicians
  from public, anon, authenticated;

comment on function public.workspace_actor_can_manage_work_order_assignments(uuid) is
  'Fail-closed RLS predicate for the authenticated actor effective shop-scoped work-order assignment capability.';
comment on function public.workspace_actor_can_manage_work_order_line_assignments(uuid) is
  'Fail-closed RLS predicate that resolves an assignment bridge row to its owning shop.';

commit;
