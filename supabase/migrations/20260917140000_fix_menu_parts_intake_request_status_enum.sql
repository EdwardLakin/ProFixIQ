-- Fix the service-menu Part Picker review path against the canonical enum-backed
-- part_requests.status column.
--
-- review_menu_item_part_intake previously assigned an untyped CASE expression
-- to public.part_requests.status. PostgreSQL resolves that CASE as text, which
-- fails at runtime because status is public.part_request_status.
--
-- Keep the existing workflow unchanged and make the enum conversion explicit.

create or replace function public.review_menu_item_part_intake(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_request_item_id uuid,
  p_catalog_part_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_operation_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_request_item public.part_request_items%rowtype;
  v_request public.part_requests%rowtype;
  v_menu_item public.menu_items%rowtype;
  v_menu_part public.menu_item_parts%rowtype;
  v_catalog_part public.parts%rowtype;
  v_part_name text;
  v_part_cost numeric := 0;
  v_labor_rate numeric := 0;
  v_active_count integer := 0;
  v_ready_count integer := 0;
  v_complete boolean := false;
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_actor_auth_user_id is null
     or p_request_item_id is null
     or p_catalog_part_id is null
     or p_operation_key is null then
    raise exception 'Shop, actor, request item, catalog part, and operation key are required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_unit_cost is null or p_unit_cost < 0 then
    raise exception 'Unit cost must be zero or greater';
  end if;

  select *
  into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id
    and (
      profile.id = p_actor_auth_user_id
      or profile.user_id = p_actor_auth_user_id
    );

  if not found then
    raise exception 'Actor is not a member of this shop';
  end if;
  if auth.uid() is not null and auth.uid() <> p_actor_auth_user_id then
    raise exception 'Actor identity mismatch';
  end if;
  if lower(coalesce(v_actor.role::text, '')) not in (
    'owner',
    'admin',
    'manager',
    'parts',
    'lead_hand',
    'foreman'
  ) then
    raise exception 'Not authorized to review menu parts intake';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_shop_id::text || ':menu-intake:' || p_request_item_id::text)
  );

  select *
  into v_request_item
  from public.part_request_items request_item
  where request_item.id = p_request_item_id
    and request_item.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Menu intake item not found';
  end if;

  select *
  into v_request
  from public.part_requests request
  where request.id = v_request_item.request_id
    and request.shop_id = p_shop_id
  for update;

  if not found
     or v_request.work_order_id is not null
     or v_request.source_menu_item_id is null
     or v_request.status = 'cancelled'
     or v_request_item.status = 'cancelled'
     or v_request_item.menu_item_id is distinct from v_request.source_menu_item_id
     or v_request_item.source_menu_item_part_id is null then
    raise exception 'Request item is not an active service-menu intake';
  end if;

  select *
  into v_menu_item
  from public.menu_items item
  where item.id = v_request.source_menu_item_id
    and item.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Service-menu item not found';
  end if;

  select *
  into v_menu_part
  from public.menu_item_parts menu_part
  where menu_part.id = v_request_item.source_menu_item_part_id
    and menu_part.menu_item_id = v_menu_item.id
    and menu_part.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Service-menu recipe part not found';
  end if;

  select *
  into v_catalog_part
  from public.parts catalog_part
  where catalog_part.id = p_catalog_part_id
    and catalog_part.shop_id = p_shop_id;

  if not found then
    raise exception 'Catalog part is not available to this shop';
  end if;

  v_part_name := coalesce(
    nullif(trim(v_catalog_part.name), ''),
    nullif(trim(v_request_item.description), ''),
    v_menu_part.name
  );

  update public.menu_item_parts menu_part
  set
    name = v_part_name,
    part_id = p_catalog_part_id,
    quantity = p_quantity,
    unit_cost = p_unit_cost
  where menu_part.id = v_menu_part.id;

  update public.part_request_items request_item
  set
    description = v_part_name,
    part_id = p_catalog_part_id,
    qty = p_quantity,
    qty_requested = p_quantity,
    unit_cost = p_unit_cost,
    unit_price = p_unit_cost,
    quoted_price = p_unit_cost,
    status = 'quoted',
    updated_at = now()
  where request_item.id = v_request_item.id;

  select coalesce(sum(menu_part.quantity * menu_part.unit_cost), 0)
  into v_part_cost
  from public.menu_item_parts menu_part
  where menu_part.menu_item_id = v_menu_item.id
    and menu_part.shop_id = p_shop_id;

  select greatest(0, coalesce(shop.labor_rate, 0))
  into v_labor_rate
  from public.shops shop
  where shop.id = p_shop_id;

  update public.menu_items item
  set
    part_cost = v_part_cost,
    total_price =
      v_part_cost
      + (
        coalesce(item.labor_time, item.labor_hours, 0)
        * v_labor_rate
      )
  where item.id = v_menu_item.id
    and item.shop_id = p_shop_id;

  select
    count(*)::integer,
    count(*) filter (
      where request_item.part_id is not null
        and request_item.unit_price is not null
        and request_item.qty_requested > 0
    )::integer
  into v_active_count, v_ready_count
  from public.part_request_items request_item
  where request_item.request_id = v_request.id
    and request_item.status <> 'cancelled';

  v_complete := v_active_count > 0 and v_active_count = v_ready_count;

  update public.part_requests request
  set status = (
    case
      when v_complete then 'fulfilled'
      else 'requested'
    end
  )::public.part_request_status
  where request.id = v_request.id
    and request.shop_id = p_shop_id;

  insert into public.audit_logs (
    actor_id,
    action,
    target,
    metadata
  ) values (
    p_actor_profile_id,
    'menu.parts_intake_item_reviewed',
    v_menu_item.id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_type', 'menu_item',
      'part_request_id', v_request.id,
      'part_request_item_id', v_request_item.id,
      'catalog_part_id', p_catalog_part_id,
      'request_complete', v_complete,
      'operation_key', p_operation_key
    )
  );

  return jsonb_build_object(
    'ok', true,
    'menu_item_id', v_menu_item.id,
    'part_request_id', v_request.id,
    'part_request_item_id', v_request_item.id,
    'request_complete', v_complete,
    'remaining_items', greatest(v_active_count - v_ready_count, 0)
  );
end;
$$;

-- Preserve the existing function privilege posture after replacement.
revoke all on function public.review_menu_item_part_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  uuid
) from public;

grant execute on function public.review_menu_item_part_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  uuid
) to authenticated;

grant execute on function public.review_menu_item_part_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  uuid
) to service_role;
