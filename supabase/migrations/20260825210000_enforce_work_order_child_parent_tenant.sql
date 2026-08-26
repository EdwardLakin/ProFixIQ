begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- RLS must be able to validate the canonical parent without inheriting the
-- caller's potentially narrower Work Order SELECT projection. Keep the helper
-- outside exposed Data API schemas and bind it to the authenticated shop.
create schema if not exists rls_helpers authorization postgres;
revoke all on schema rls_helpers from public, anon;
grant usage on schema rls_helpers to authenticated, service_role;
alter default privileges for role postgres in schema rls_helpers
  revoke execute on functions from public;

create or replace function rls_helpers.work_order_parent_matches_shop(
  p_work_order_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_work_order_id is not null
    and p_shop_id is not null
    and (
      coalesce((select auth.role()), '') = 'service_role'
      or p_shop_id = (select public.current_shop_id())
    )
    and exists (
      select 1
      from public.work_orders parent
      where parent.id = p_work_order_id
        and parent.shop_id = p_shop_id
    );
$$;

revoke all on function rls_helpers.work_order_parent_matches_shop(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function rls_helpers.work_order_parent_matches_shop(uuid, uuid)
  to authenticated, service_role;

-- This trigger is the canonical invariant and therefore applies even when a
-- trusted worker or SECURITY DEFINER engine bypasses table RLS. It preserves
-- the established repair-line behavior that derives a missing shop from its
-- parent, while rejecting an explicit mismatch before any child AFTER trigger
-- can reconcile or otherwise mutate the referenced Work Order.
create or replace function private.enforce_work_order_child_parent_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_shop_id uuid;
begin
  if new.work_order_id is null then
    return new;
  end if;

  select parent.shop_id
    into v_parent_shop_id
  from public.work_orders parent
  where parent.id = new.work_order_id
  for no key update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'WORK_ORDER_CHILD_PARENT_NOT_FOUND';
  end if;

  if new.shop_id is null then
    new.shop_id := v_parent_shop_id;
  elsif new.shop_id is distinct from v_parent_shop_id then
    raise exception using
      errcode = '23514',
      message = 'WORK_ORDER_CHILD_TENANT_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_work_order_child_parent_tenant()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_work_order_lines_parent_tenant
  on public.work_order_lines;
create trigger enforce_work_order_lines_parent_tenant
before insert or update of work_order_id, shop_id
on public.work_order_lines
for each row
execute function private.enforce_work_order_child_parent_tenant();

drop trigger if exists enforce_work_order_quote_lines_parent_tenant
  on public.work_order_quote_lines;
create trigger enforce_work_order_quote_lines_parent_tenant
before insert or update of work_order_id, shop_id
on public.work_order_quote_lines
for each row
execute function private.enforce_work_order_child_parent_tenant();

-- Locking the parent in the child trigger closes the insert/update race. This
-- matching parent-side guard prevents a trusted worker from moving an existing
-- Work Order to another tenant while either canonical child relation still
-- points at it. Childless legacy rows remain movable for established repair
-- tooling; once a child exists, the tenant becomes immutable.
create or replace function private.enforce_work_order_parent_tenant_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shop_id is not distinct from old.shop_id then
    return new;
  end if;

  if exists (
    select 1
    from public.work_order_lines line
    where line.work_order_id = old.id
  ) or exists (
    select 1
    from public.work_order_quote_lines line
    where line.work_order_id = old.id
  ) then
    raise exception using
      errcode = '23514',
      message = 'WORK_ORDER_PARENT_TENANT_CHANGE_WITH_CHILDREN';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_work_order_parent_tenant_update()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_work_order_parent_tenant_update
  on public.work_orders;
create trigger enforce_work_order_parent_tenant_update
before update of shop_id
on public.work_orders
for each row
execute function private.enforce_work_order_parent_tenant_update();

-- Existing role/capability policies remain authoritative. These restrictive
-- policies add the parent-tenant invariant to every otherwise-permitted direct
-- authenticated write without broadening any role or capability.
drop policy if exists work_order_lines_parent_tenant_insert
  on public.work_order_lines;
create policy work_order_lines_parent_tenant_insert
on public.work_order_lines
as restrictive
for insert
to authenticated
with check (
  work_order_id is null
  or rls_helpers.work_order_parent_matches_shop(work_order_id, shop_id)
);

drop policy if exists work_order_lines_parent_tenant_update
  on public.work_order_lines;
create policy work_order_lines_parent_tenant_update
on public.work_order_lines
as restrictive
for update
to authenticated
using (
  work_order_id is null
  or rls_helpers.work_order_parent_matches_shop(work_order_id, shop_id)
)
with check (
  work_order_id is null
  or rls_helpers.work_order_parent_matches_shop(work_order_id, shop_id)
);

drop policy if exists work_order_quote_lines_parent_tenant_insert
  on public.work_order_quote_lines;
create policy work_order_quote_lines_parent_tenant_insert
on public.work_order_quote_lines
as restrictive
for insert
to authenticated
with check (
  rls_helpers.work_order_parent_matches_shop(work_order_id, shop_id)
);

drop policy if exists work_order_quote_lines_parent_tenant_update
  on public.work_order_quote_lines;
create policy work_order_quote_lines_parent_tenant_update
on public.work_order_quote_lines
as restrictive
for update
to authenticated
using (
  rls_helpers.work_order_parent_matches_shop(work_order_id, shop_id)
)
with check (
  rls_helpers.work_order_parent_matches_shop(work_order_id, shop_id)
);

-- The status refresh is now independently tenant-bound. This is defense in
-- depth for the specific SECURITY DEFINER path that previously reconciled a
-- parent by ID alone immediately after repair-line insertion.
create or replace function public.refresh_work_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.work_order_id is not null then
    if not exists (
      select 1
      from public.work_orders parent
      where parent.id = new.work_order_id
        and parent.shop_id = new.shop_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'WORK_ORDER_CHILD_TENANT_MISMATCH';
    end if;

    perform private.reconcile_work_order_state(new.work_order_id);
  end if;
  return new;
end;
$function$;

create or replace function public.refresh_work_order_status_del()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_parent_shop_id uuid;
begin
  if old.work_order_id is not null then
    select parent.shop_id
      into v_parent_shop_id
    from public.work_orders parent
    where parent.id = old.work_order_id;

    if found then
      if v_parent_shop_id is distinct from old.shop_id then
        raise exception using
          errcode = '23514',
          message = 'WORK_ORDER_CHILD_TENANT_MISMATCH';
      end if;

      perform private.reconcile_work_order_state(old.work_order_id);
    end if;
  end if;
  return old;
end;
$function$;

revoke all on function public.refresh_work_order_status()
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_work_order_status_del()
  from public, anon, authenticated, service_role;

do $work_order_child_parent_tenant_postcheck$
declare
  v_trigger_definition text;
begin
  if has_function_privilege(
    'anon',
    'rls_helpers.work_order_parent_matches_shop(uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'rls_helpers.work_order_parent_matches_shop(uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'rls_helpers.work_order_parent_matches_shop(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Work Order parent RLS helper grants are unsafe or incomplete';
  end if;

  if exists (
    select 1
    from public.work_order_lines line
    join public.work_orders parent on parent.id = line.work_order_id
    where line.shop_id is distinct from parent.shop_id
  ) or exists (
    select 1
    from public.work_order_quote_lines line
    join public.work_orders parent on parent.id = line.work_order_id
    where line.shop_id is distinct from parent.shop_id
  ) then
    raise exception 'Existing Work Order child tenant mismatch blocks invariant enforcement';
  end if;

  if not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'work_order_lines'
      and policy.policyname = 'work_order_lines_parent_tenant_insert'
      and policy.permissive = 'RESTRICTIVE'
      and policy.cmd = 'INSERT'
  ) or not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'work_order_quote_lines'
      and policy.policyname = 'work_order_quote_lines_parent_tenant_insert'
      and policy.permissive = 'RESTRICTIVE'
      and policy.cmd = 'INSERT'
  ) then
    raise exception 'Restrictive Work Order child parent policies are incomplete';
  end if;

  select pg_get_triggerdef(trigger.oid)
    into v_trigger_definition
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'work_order_lines'
    and trigger.tgname = 'enforce_work_order_lines_parent_tenant'
    and not trigger.tgisinternal;

  if v_trigger_definition is null
     or position('BEFORE INSERT OR UPDATE' in v_trigger_definition) = 0 then
    raise exception 'Repair-line canonical parent trigger is missing';
  end if;

  select pg_get_triggerdef(trigger.oid)
    into v_trigger_definition
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'work_order_quote_lines'
    and trigger.tgname = 'enforce_work_order_quote_lines_parent_tenant'
    and not trigger.tgisinternal;

  if v_trigger_definition is null
     or position('BEFORE INSERT OR UPDATE' in v_trigger_definition) = 0 then
    raise exception 'Quote-line canonical parent trigger is missing';
  end if;

  select pg_get_triggerdef(trigger.oid)
    into v_trigger_definition
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'work_orders'
    and trigger.tgname = 'enforce_work_order_parent_tenant_update'
    and not trigger.tgisinternal;

  if v_trigger_definition is null
     or position('BEFORE UPDATE OF shop_id ON' in v_trigger_definition) = 0 then
    raise exception 'Work Order parent tenant update guard is missing';
  end if;
end;
$work_order_child_parent_tenant_postcheck$;

notify pgrst, 'reload schema';

commit;
