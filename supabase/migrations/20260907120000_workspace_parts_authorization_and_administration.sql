begin;

-- ---------------------------------------------------------------------------
-- Workspace authorization: Parts capability family + permission administration
-- read model.
--
-- This migration does not introduce a second authorization system. It extends
-- the catalog created by 20260819222852_workspace_authorization_foundation.sql
-- and replaces the hard-coded role allowlists that currently live inside the
-- Parts lifecycle SECURITY DEFINER procedures with the same effective
-- capability decision the application and RLS already use.
--
-- Every preset below is derived from the allowlist it replaces, so current
-- authorized behavior is preserved exactly. What changes is that the decision
-- is now shop-configurable and individually overridable.
-- ---------------------------------------------------------------------------

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
    'parts.operate',
    'parts',
    'lifecycle',
    'operate',
    'manage',
    false,
    'Use the Parts operational workflow: picking, allocation, issuing, and returns.'
  ),
  (
    'parts.desk.manage',
    'parts',
    'desk',
    'manage',
    'manage',
    false,
    'Run the parts desk: pick, allocate, issue, return, and manage part requests.'
  ),
  (
    'parts.request',
    'parts',
    'request',
    'create',
    'manage',
    false,
    'Request parts for a job without authority to purchase them.'
  ),
  (
    'parts.order',
    'parts',
    'purchasing',
    'order',
    'manage',
    false,
    'Place purchase orders with suppliers.'
  ),
  (
    'parts.receive',
    'parts',
    'receiving',
    'receive',
    'manage',
    false,
    'Receive parts against a purchase order or request.'
  )
on conflict (capability_key) do update
set workspace_key = excluded.workspace_key,
    module_key = excluded.module_key,
    action_key = excluded.action_key,
    access_level = excluded.access_level,
    is_protected = excluded.is_protected,
    description = excluded.description,
    updated_at = now();

-- parts.operate mirrors public.parts_lifecycle_assert_shop_access's previous
-- allowlist. parts.request mirrors create_part_request_with_items, which also
-- admitted mechanics. parts.order and parts.receive start from the operational
-- allowlist because every actor who could reach the lifecycle procedures could
-- already place and receive purchase orders.
insert into public.workspace_role_capability_presets (
  capability_key,
  role_key,
  effect
) values
  -- parts.operate mirrors the previous public.parts_lifecycle_assert_shop_access
  -- allowlist exactly. It is the floor required to touch any parts lifecycle
  -- procedure, which is how an Advisor consumes parts on a job today.
  ('parts.operate', 'owner', 'allow'),
  ('parts.operate', 'admin', 'allow'),
  ('parts.operate', 'manager', 'allow'),
  ('parts.operate', 'advisor', 'allow'),
  ('parts.operate', 'service', 'allow'),
  ('parts.operate', 'parts', 'allow'),
  ('parts.operate', 'lead_hand', 'allow'),
  ('parts.operate', 'foreman', 'allow'),

  -- parts.desk.manage mirrors the legacy `canManageParts` route guard, which is
  -- a narrower set than the database floor. Advisor and Service deliberately do
  -- not run the parts desk today and must not gain it from this migration.
  ('parts.desk.manage', 'owner', 'allow'),
  ('parts.desk.manage', 'admin', 'allow'),
  ('parts.desk.manage', 'manager', 'allow'),
  ('parts.desk.manage', 'parts', 'allow'),
  ('parts.desk.manage', 'lead_hand', 'allow'),
  ('parts.desk.manage', 'foreman', 'allow'),

  -- parts.request mirrors create_part_request_with_items, which also admitted
  -- mechanics. Requesting parts is not purchasing authority.
  ('parts.request', 'owner', 'allow'),
  ('parts.request', 'admin', 'allow'),
  ('parts.request', 'manager', 'allow'),
  ('parts.request', 'advisor', 'allow'),
  ('parts.request', 'service', 'allow'),
  ('parts.request', 'parts', 'allow'),
  ('parts.request', 'mechanic', 'allow'),
  ('parts.request', 'lead_hand', 'allow'),
  ('parts.request', 'foreman', 'allow'),

  -- Ordering and receiving are the intersection of the previous route guard and
  -- the database floor, which is the set that could actually reach them.
  ('parts.order', 'owner', 'allow'),
  ('parts.order', 'admin', 'allow'),
  ('parts.order', 'manager', 'allow'),
  ('parts.order', 'parts', 'allow'),
  ('parts.order', 'lead_hand', 'allow'),
  ('parts.order', 'foreman', 'allow'),

  ('parts.receive', 'owner', 'allow'),
  ('parts.receive', 'admin', 'allow'),
  ('parts.receive', 'manager', 'allow'),
  ('parts.receive', 'parts', 'allow'),
  ('parts.receive', 'lead_hand', 'allow'),
  ('parts.receive', 'foreman', 'allow')
on conflict (capability_key, role_key) do update
set effect = excluded.effect,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Shared assertion helper for SECURITY DEFINER operational procedures.
-- ---------------------------------------------------------------------------

create or replace function private.workspace_assert_capability(
  p_shop_id uuid,
  p_capability_key text,
  p_error_message text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Trusted server paths (Shop Assistant command execution, scheduled jobs)
  -- authorize the human actor before they reach this procedure. They keep the
  -- existing service_role behavior rather than acquiring a second identity.
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return;
  end if;
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_AUTHENTICATION_REQUIRED';
  end if;
  if p_shop_id is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_SHOP_SCOPE_REQUIRED';
  end if;
  if not public.workspace_actor_has_capability(p_shop_id, p_capability_key) then
    raise exception using errcode = '42501', message = p_error_message;
  end if;
end;
$$;

revoke all on function private.workspace_assert_capability(uuid, text, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Parts lifecycle gates now resolve the effective capability instead of a
-- fixed role list. The presets above preserve the previous allowlists.
-- ---------------------------------------------------------------------------

create or replace function public.parts_lifecycle_assert_shop_access(
  p_shop_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_shop_id is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_SHOP_SCOPE_REQUIRED';
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_AUTHENTICATION_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
  ) then
    raise exception using
      errcode = '42501',
      message = 'PARTS_SHOP_ACCESS_DENIED';
  end if;

  -- The floor is "holds some parts authority". parts.operate reproduces the
  -- previous allowlist; the purchasing capabilities are included so an
  -- individually delegated buyer is not blocked by the floor while holding the
  -- specific authority for the operation. parts.request is deliberately absent:
  -- requesting parts has never granted lifecycle access.
  if not (
    public.workspace_actor_has_capability(p_shop_id, 'parts.operate')
    or public.workspace_actor_has_capability(p_shop_id, 'parts.desk.manage')
    or public.workspace_actor_has_capability(p_shop_id, 'parts.order')
    or public.workspace_actor_has_capability(p_shop_id, 'parts.receive')
  ) then
    raise exception using
      errcode = '42501',
      message = 'PARTS_ROLE_ACCESS_DENIED';
  end if;
end;
$$;

-- The assigned-technician branch is unchanged: a mechanic keeps access to the
-- repair lines they are assigned to. Only the operational allowlist becomes an
-- effective capability.
create or replace function public.parts_lifecycle_assert_line_access(
  p_shop_id uuid,
  p_work_order_line_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_profile_id uuid;
  v_role text;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if v_actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_AUTHENTICATION_REQUIRED';
  end if;

  select
    profile.id,
    lower(trim(coalesce(profile.role::text, '')))
  into v_profile_id, v_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = v_actor_id or profile.user_id = v_actor_id)
  order by (profile.id = v_actor_id) desc
  limit 1;

  if v_role is null then
    raise exception using
      errcode = '42501',
      message = 'PARTS_SHOP_ACCESS_DENIED';
  end if;

  if public.workspace_actor_has_capability(p_shop_id, 'parts.operate')
     or public.workspace_actor_has_capability(p_shop_id, 'parts.desk.manage')
     or public.workspace_actor_has_capability(p_shop_id, 'parts.order')
     or public.workspace_actor_has_capability(p_shop_id, 'parts.receive') then
    return;
  end if;

  if v_role in ('mechanic', 'tech', 'technician')
     and exists (
       select 1
       from public.work_order_lines line
       where line.id = p_work_order_line_id
         and line.shop_id = p_shop_id
         and (
           line.assigned_tech_id = v_profile_id
           or line.assigned_tech_id = v_actor_id
           or line.assigned_to = v_profile_id
           or line.assigned_to = v_actor_id
           or exists (
             select 1
             from public.work_order_line_technicians assignment
             where assignment.work_order_line_id = line.id
               and assignment.technician_id in (
                 v_profile_id,
                 v_actor_id
               )
           )
         )
     ) then
    return;
  end if;

  raise exception using
    errcode = '42501',
    message = 'PARTS_LINE_ACCESS_DENIED';
end;
$$;


-- ---------------------------------------------------------------------------
-- Granular Parts authorization for the directly reachable procedures.
--
-- These four procedures are granted to `authenticated`, so a route-level check
-- alone would not be authorization. Rather than copying their bodies (which
-- would fork the canonical operation), each canonical implementation moves into
-- the `private` schema -- which is not exposed through the Data API -- and is
-- re-published under its original public name behind a capability gate.
-- Existing internal callers therefore keep working and are re-authorized at
-- the point the operation actually executes, which is also what an offline
-- mutation replay must do.
--
-- parts.issue and parts.return are deliberately not gated individually here:
-- parts_issue_work_order_part and parts_return_to_stock are composed by line
-- void and allocation automation, so a per-operation assert would change
-- existing composite behavior. Both remain covered by parts.operate.
-- ---------------------------------------------------------------------------

alter function public.create_part_request_with_items(uuid, jsonb, text, text)
  set schema private;
revoke all on function private.create_part_request_with_items(uuid, jsonb, text, text)
  from public, anon, authenticated, service_role;

create function public.create_part_request_with_items(
  p_work_order_id uuid,
  p_items jsonb,
  p_job_id text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
begin
  select work_order.shop_id
    into v_shop_id
  from public.work_orders work_order
  where work_order.id = p_work_order_id;

  perform private.workspace_assert_capability(
    v_shop_id,
    'parts.request',
    'PARTS_REQUEST_ACCESS_DENIED'
  );

  return private.create_part_request_with_items(
    p_work_order_id,
    p_items,
    p_job_id,
    p_notes
  );
end;
$$;

revoke all on function public.create_part_request_with_items(uuid, jsonb, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_part_request_with_items(uuid, jsonb, text, text)
  to authenticated, service_role;

alter function public.parts_place_purchase_order(uuid, text, text)
  set schema private;
revoke all on function private.parts_place_purchase_order(uuid, text, text)
  from public, anon, authenticated, service_role;

create function public.parts_place_purchase_order(
  p_po_id uuid,
  p_idempotency_key text,
  p_contact_channel text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
begin
  select purchase_order.shop_id
    into v_shop_id
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id;

  perform private.workspace_assert_capability(
    v_shop_id,
    'parts.order',
    'PARTS_ORDER_ACCESS_DENIED'
  );

  return private.parts_place_purchase_order(
    p_po_id,
    p_idempotency_key,
    p_contact_channel
  );
end;
$$;

revoke all on function public.parts_place_purchase_order(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.parts_place_purchase_order(uuid, text, text)
  to authenticated, service_role;

alter function public.parts_receive_request_item(uuid, uuid, numeric, uuid, numeric, text)
  set schema private;
revoke all on function private.parts_receive_request_item(uuid, uuid, numeric, uuid, numeric, text)
  from public, anon, authenticated, service_role;

create function public.parts_receive_request_item(
  p_request_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_po_line_id uuid default null,
  p_unit_cost numeric default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
begin
  select coalesce(item.shop_id, request.shop_id)
    into v_shop_id
  from public.part_request_items item
  join public.part_requests request
    on request.id = item.request_id
  where item.id = p_request_item_id;

  perform private.workspace_assert_capability(
    v_shop_id,
    'parts.receive',
    'PARTS_RECEIVE_ACCESS_DENIED'
  );

  return private.parts_receive_request_item(
    p_request_item_id,
    p_location_id,
    p_qty,
    p_po_line_id,
    p_unit_cost,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.parts_receive_request_item(uuid, uuid, numeric, uuid, numeric, text)
  from public, anon, authenticated, service_role;
grant execute on function public.parts_receive_request_item(uuid, uuid, numeric, uuid, numeric, text)
  to authenticated, service_role;

alter function public.parts_receive_free_text_po_line(uuid, uuid, numeric, text)
  set schema private;
revoke all on function private.parts_receive_free_text_po_line(uuid, uuid, numeric, text)
  from public, anon, authenticated, service_role;

create function public.parts_receive_free_text_po_line(
  p_po_id uuid,
  p_po_line_id uuid,
  p_qty numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
begin
  select purchase_order.shop_id
    into v_shop_id
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id;

  perform private.workspace_assert_capability(
    v_shop_id,
    'parts.receive',
    'PARTS_RECEIVE_ACCESS_DENIED'
  );

  return private.parts_receive_free_text_po_line(
    p_po_id,
    p_po_line_id,
    p_qty,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.parts_receive_free_text_po_line(uuid, uuid, numeric, text)
  from public, anon, authenticated, service_role;
grant execute on function public.parts_receive_free_text_po_line(uuid, uuid, numeric, text)
  to authenticated, service_role;

comment on function public.create_part_request_with_items(uuid, jsonb, text, text) is
  'Capability-gated entry point for parts.request. The canonical implementation is private.create_part_request_with_items, which is outside the Data API schema.';
comment on function public.parts_place_purchase_order(uuid, text, text) is
  'Capability-gated entry point for parts.order. The canonical implementation is private.parts_place_purchase_order, which is outside the Data API schema.';
comment on function public.parts_receive_request_item(uuid, uuid, numeric, uuid, numeric, text) is
  'Capability-gated entry point for parts.receive. The canonical implementation is private.parts_receive_request_item, which is outside the Data API schema.';
comment on function public.parts_receive_free_text_po_line(uuid, uuid, numeric, text) is
  'Capability-gated entry point for parts.receive. The canonical implementation is private.parts_receive_free_text_po_line, which is outside the Data API schema.';

commit;
