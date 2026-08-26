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

  -- Preserve the baseline shops -> child SET NULL attempt without allowing a
  -- legacy BEFORE trigger to re-tenant the row. P0-008 later made shop_id
  -- required, so a Shop deletion with retained commercial history still fails
  -- closed at NOT NULL and rolls back atomically.
  if tg_op = 'UPDATE'
     and new.work_order_id is not distinct from old.work_order_id
     and old.shop_id is not null
     and not exists (
       select 1
       from public.shops shop
       where shop.id = old.shop_id
     ) then
    new.shop_id := null;
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

-- Parent-side tenant guards probe quote children by Work Order alone. Existing
-- quote indexes lead with shop_id and cannot support that lookup once the
-- parent tenant is being changed or cleared.
create index if not exists idx_work_order_quote_lines_work_order_id
  on public.work_order_quote_lines(work_order_id);

-- The predecessor policies allowed a caller to submit its own shop_id without
-- proving that the referenced Work Order belonged to the same tenant. A root
-- mismatch can already have tenant-owned descendants, immutable financial
-- history, quarantined pricing, or an unrelated open correction session. It is
-- not safe for this invariant migration to guess how that graph should move.
-- Fail closed with bounded, observable diagnostics before installing the
-- restrictive policies. Production was verified read-only with zero root
-- mismatches; any future nonzero result requires a separately reviewed repair
-- migration for the exact affected graph.
create or replace function private.assert_work_order_child_parent_tenants_clean()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repair_line_count bigint;
  v_quote_line_count bigint;
  v_repair_line_ids uuid[];
  v_quote_line_ids uuid[];
begin
  select count(*)
    into v_repair_line_count
  from public.work_order_lines line
  join public.work_orders parent on parent.id = line.work_order_id
  where line.shop_id is distinct from parent.shop_id;

  select coalesce(array_agg(sample.id order by sample.id), '{}'::uuid[])
    into v_repair_line_ids
  from (
    select line.id
    from public.work_order_lines line
    join public.work_orders parent on parent.id = line.work_order_id
    where line.shop_id is distinct from parent.shop_id
    order by line.id
    limit 20
  ) sample;

  select count(*)
    into v_quote_line_count
  from public.work_order_quote_lines quote_line
  join public.work_orders parent on parent.id = quote_line.work_order_id
  where quote_line.shop_id is distinct from parent.shop_id;

  select coalesce(array_agg(sample.id order by sample.id), '{}'::uuid[])
    into v_quote_line_ids
  from (
    select quote_line.id
    from public.work_order_quote_lines quote_line
    join public.work_orders parent on parent.id = quote_line.work_order_id
    where quote_line.shop_id is distinct from parent.shop_id
    order by quote_line.id
    limit 20
  ) sample;

  if v_repair_line_count > 0 or v_quote_line_count > 0 then
    raise exception using
      errcode = '23514',
      message = 'WORK_ORDER_CHILD_TENANT_PREFLIGHT_FAILED',
      detail = jsonb_build_object(
        'repair_line_count', v_repair_line_count,
        'repair_line_ids', v_repair_line_ids,
        'quote_line_count', v_quote_line_count,
        'quote_line_ids', v_quote_line_ids
      )::text,
      hint = 'Create a separately reviewed tenant-graph repair migration for these records before retrying.';
  end if;
end;
$$;

revoke all on function private.assert_work_order_child_parent_tenants_clean()
  from public, anon, authenticated, service_role;

comment on function private.assert_work_order_child_parent_tenants_clean() is
  'Fails closed with bounded diagnostics when historical Work Order child tenant mismatches require a separately reviewed graph repair.';

do $work_order_child_parent_tenant_preflight$
begin
  -- CREATE TRIGGER holds table locks through commit. The preflight therefore
  -- observes every writer that completed before the invariant was installed,
  -- and no concurrent writer can introduce a mismatch after this check.
  perform private.assert_work_order_child_parent_tenants_clean();
  raise notice 'WORK_ORDER_CHILD_TENANT_PREFLIGHT_OK';
end;
$work_order_child_parent_tenant_preflight$;

-- The baseline helper fills a NULL tenant during ordinary INSERT and UPDATE.
-- Preserve that normalization, except while the Shop foreign key is attempting
-- ON DELETE SET NULL: at that point OLD.shop_id no longer resolves. Leaving the
-- attempted value NULL lets the later required-column contract fail closed
-- instead of silently re-tenanting commercial history.
create or replace function public.assign_work_orders_shop_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shop_id is null
     and not (
       tg_op = 'UPDATE'
       and old.shop_id is not null
       and not exists (
         select 1
         from public.shops shop
         where shop.id = old.shop_id
       )
     ) then
    new.shop_id := public.current_shop_id();
  end if;
  return new;
end;
$$;

revoke all on function public.assign_work_orders_shop_id()
  from public, anon, authenticated, service_role;

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
  -- The baseline Work Order FK attempts to clear the tenant during Shop
  -- deletion, while P0-008 requires that tenant and therefore rolls the delete
  -- back. Do not let this guard or the legacy default re-tenant the Work Order
  -- while that fail-closed action is in progress.
  if old.shop_id is not null
     and not exists (
       select 1
       from public.shops shop
       where shop.id = old.shop_id
     ) then
    new.shop_id := null;
    return new;
  end if;

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
before update
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
        and parent.shop_id is not distinct from new.shop_id
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
     or position('BEFORE UPDATE ON' in v_trigger_definition) = 0 then
    raise exception 'Work Order parent tenant update guard is missing';
  end if;
end;
$work_order_child_parent_tenant_postcheck$;

notify pgrst, 'reload schema';

commit;
