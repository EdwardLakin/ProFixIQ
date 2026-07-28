-- Make service-menu parts intake a complete, durable workflow.
--
-- Menu edits preserve stable menu-part identities and synchronize the matching
-- internal intake request. Parts staff can then attach a catalog part and
-- confirm quantity/cost in one transaction. A completed menu intake is an
-- internal recipe setup task, so it closes as fulfilled instead of entering the
-- customer approval/order/handoff lifecycle used by work-order requests.

create or replace function public.update_menu_item_with_parts_intake(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_menu_item_id uuid,
  p_item jsonb,
  p_parts jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_menu_item public.menu_items%rowtype;
  v_menu_part public.menu_item_parts%rowtype;
  v_request_item public.part_request_items%rowtype;
  v_part jsonb;
  v_part_id uuid;
  v_catalog_part_id uuid;
  v_request_id uuid;
  v_seen_part_ids uuid[] := array[]::uuid[];
  v_name text;
  v_description text;
  v_part_name text;
  v_labor_hours numeric;
  v_quantity numeric;
  v_unit_cost numeric;
  v_part_cost numeric := 0;
  v_part_count integer := 0;
  v_labor_rate numeric := 0;
  v_inspection_template_id uuid;
  v_is_active boolean;
  v_changed boolean;
  v_active_count integer := 0;
  v_ready_count integer := 0;
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_actor_auth_user_id is null
     or p_menu_item_id is null then
    raise exception 'Shop, actor, auth user, and menu item are required';
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
    'advisor',
    'service',
    'parts',
    'mechanic',
    'lead_hand',
    'foreman'
  ) then
    raise exception 'Not authorized to update service-menu items';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_shop_id::text || ':menu-item:' || p_menu_item_id::text)
  );

  select *
  into v_menu_item
  from public.menu_items item
  where item.id = p_menu_item_id
    and item.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Menu item not found';
  end if;

  v_name := case
    when coalesce(p_item, '{}'::jsonb) ? 'name'
      then trim(coalesce(p_item ->> 'name', ''))
    else trim(coalesce(v_menu_item.name, ''))
  end;
  if v_name = '' then
    raise exception 'Menu item name is required';
  end if;
  if char_length(v_name) > 180 then
    raise exception 'Menu item name is too long';
  end if;

  v_description := case
    when coalesce(p_item, '{}'::jsonb) ? 'description'
      then nullif(trim(coalesce(p_item ->> 'description', '')), '')
    else v_menu_item.description
  end;

  if coalesce(p_item, '{}'::jsonb) ? 'labor_time' then
    if jsonb_typeof(p_item -> 'labor_time') = 'null' then
      v_labor_hours := null;
    elsif jsonb_typeof(p_item -> 'labor_time') = 'number' then
      v_labor_hours := greatest(0, (p_item ->> 'labor_time')::numeric);
    else
      raise exception 'Labor time must be a number or null';
    end if;
  else
    v_labor_hours := coalesce(
      v_menu_item.labor_time,
      v_menu_item.labor_hours
    );
  end if;

  if coalesce(p_item, '{}'::jsonb) ? 'inspection_template_id' then
    v_inspection_template_id :=
      nullif(p_item ->> 'inspection_template_id', '')::uuid;
  else
    v_inspection_template_id := v_menu_item.inspection_template_id;
  end if;

  if v_inspection_template_id is not null and not exists (
    select 1
    from public.inspection_templates template
    where template.id = v_inspection_template_id
      and (
        template.shop_id = p_shop_id
        or template.is_public = true
        or template.user_id = p_actor_auth_user_id
      )
  ) then
    raise exception 'Inspection template is not available to this shop';
  end if;

  if coalesce(p_item, '{}'::jsonb) ? 'is_active' then
    if jsonb_typeof(p_item -> 'is_active') <> 'boolean' then
      raise exception 'Active state must be true or false';
    end if;
    v_is_active := (p_item ->> 'is_active')::boolean;
  else
    v_is_active := coalesce(v_menu_item.is_active, true);
  end if;

  select greatest(0, coalesce(shop.labor_rate, 0))
  into v_labor_rate
  from public.shops shop
  where shop.id = p_shop_id;

  if not found then
    raise exception 'Shop not found';
  end if;

  select request.id
  into v_request_id
  from public.part_requests request
  where request.shop_id = p_shop_id
    and request.source_menu_item_id = p_menu_item_id
  for update;

  if p_parts is not null and jsonb_typeof(p_parts) <> 'null' then
    if jsonb_typeof(p_parts) <> 'array' then
      raise exception 'Parts must be a JSON array';
    end if;
    if jsonb_array_length(p_parts) > 100 then
      raise exception 'A menu item can contain at most 100 parts';
    end if;

    if jsonb_array_length(p_parts) > 0 then
      if v_request_id is null then
        insert into public.part_requests (
          shop_id,
          work_order_id,
          job_id,
          requested_by,
          status,
          notes,
          source_menu_item_id
        ) values (
          p_shop_id,
          null,
          null,
          p_actor_auth_user_id,
          'requested',
          'Service-menu parts intake: ' || v_name,
          p_menu_item_id
        )
        returning id into v_request_id;
      end if;

      -- A legacy edit could have deleted/recreated menu parts and left old
      -- request rows without a source part. Preserve history, but remove those
      -- orphan rows from the active intake.
      update public.part_request_items request_item
      set
        status = 'cancelled',
        updated_at = now()
      where request_item.request_id = v_request_id
        and request_item.shop_id = p_shop_id
        and request_item.menu_item_id = p_menu_item_id
        and request_item.source_menu_item_part_id is null
        and request_item.status <> 'cancelled';
    end if;

    for v_part in
      select value
      from jsonb_array_elements(p_parts)
    loop
      v_part_id := nullif(v_part ->> 'id', '')::uuid;
      v_part_name := trim(coalesce(v_part ->> 'name', ''));
      v_quantity := (v_part ->> 'quantity')::numeric;
      v_unit_cost := (v_part ->> 'unit_cost')::numeric;
      v_catalog_part_id := nullif(v_part ->> 'part_id', '')::uuid;

      if v_part_id is null then
        raise exception 'Every edited menu part needs a stable id';
      end if;
      if v_part_id = any(v_seen_part_ids) then
        raise exception 'Duplicate menu part id';
      end if;
      if v_part_name = '' then
        raise exception 'Every part needs a name';
      end if;
      if char_length(v_part_name) > 240 then
        raise exception 'Part name is too long';
      end if;
      if v_quantity is null or v_quantity <= 0 then
        raise exception 'Every part needs a positive quantity';
      end if;
      if v_unit_cost is null or v_unit_cost < 0 then
        raise exception 'Part unit cost cannot be negative';
      end if;
      if v_catalog_part_id is not null and not exists (
        select 1
        from public.parts catalog_part
        where catalog_part.id = v_catalog_part_id
          and catalog_part.shop_id = p_shop_id
      ) then
        raise exception 'A selected catalog part is not available to this shop';
      end if;

      select *
      into v_menu_part
      from public.menu_item_parts menu_part
      where menu_part.id = v_part_id
      for update;

      if found and (
        v_menu_part.menu_item_id <> p_menu_item_id
        or v_menu_part.shop_id is distinct from p_shop_id
      ) then
        raise exception 'Menu part does not belong to this menu item';
      end if;

      if found then
        v_changed :=
          v_menu_part.name is distinct from v_part_name
          or v_menu_part.quantity is distinct from v_quantity
          or v_menu_part.unit_cost is distinct from v_unit_cost
          or v_menu_part.part_id is distinct from v_catalog_part_id;

        update public.menu_item_parts menu_part
        set
          name = v_part_name,
          quantity = v_quantity,
          unit_cost = v_unit_cost,
          part_id = v_catalog_part_id
        where menu_part.id = v_part_id;
      else
        v_changed := true;
        insert into public.menu_item_parts (
          id,
          menu_item_id,
          name,
          quantity,
          unit_cost,
          user_id,
          shop_id,
          part_id
        ) values (
          v_part_id,
          p_menu_item_id,
          v_part_name,
          v_quantity,
          v_unit_cost,
          p_actor_auth_user_id,
          p_shop_id,
          v_catalog_part_id
        );
      end if;

      v_seen_part_ids := array_append(v_seen_part_ids, v_part_id);

      if v_request_id is not null then
        select *
        into v_request_item
        from public.part_request_items request_item
        where request_item.request_id = v_request_id
          and request_item.source_menu_item_part_id = v_part_id
        for update;

        if not found then
          insert into public.part_request_items (
            request_id,
            shop_id,
            work_order_id,
            work_order_line_id,
            menu_item_id,
            source_menu_item_part_id,
            part_id,
            description,
            qty,
            qty_requested,
            qty_approved,
            approved,
            status,
            unit_cost,
            unit_price,
            quoted_price
          ) values (
            v_request_id,
            p_shop_id,
            null,
            null,
            p_menu_item_id,
            v_part_id,
            v_catalog_part_id,
            v_part_name,
            v_quantity,
            v_quantity,
            0,
            false,
            'requested',
            v_unit_cost,
            null,
            null
          );
        elsif v_changed or v_request_item.status = 'cancelled' then
          update public.part_request_items request_item
          set
            part_id = v_catalog_part_id,
            description = v_part_name,
            qty = v_quantity,
            qty_requested = v_quantity,
            qty_approved = 0,
            approved = false,
            status = 'requested',
            unit_cost = v_unit_cost,
            unit_price = null,
            quoted_price = null,
            updated_at = now()
          where request_item.id = v_request_item.id;
        end if;
      end if;
    end loop;

    if v_request_id is not null then
      update public.part_request_items request_item
      set
        status = 'cancelled',
        updated_at = now()
      where request_item.request_id = v_request_id
        and request_item.shop_id = p_shop_id
        and request_item.menu_item_id = p_menu_item_id
        and request_item.source_menu_item_part_id is not null
        and not (
          request_item.source_menu_item_part_id = any(v_seen_part_ids)
        )
        and request_item.status <> 'cancelled';
    end if;

    delete from public.menu_item_parts menu_part
    where menu_part.menu_item_id = p_menu_item_id
      and menu_part.shop_id = p_shop_id
      and not (menu_part.id = any(v_seen_part_ids));
  end if;

  select
    coalesce(sum(menu_part.quantity * menu_part.unit_cost), 0),
    count(*)::integer
  into v_part_cost, v_part_count
  from public.menu_item_parts menu_part
  where menu_part.menu_item_id = p_menu_item_id
    and menu_part.shop_id = p_shop_id;

  update public.menu_items item
  set
    name = v_name,
    description = v_description,
    labor_time = v_labor_hours,
    labor_hours = v_labor_hours,
    inspection_template_id = v_inspection_template_id,
    is_active = v_is_active,
    part_cost = v_part_cost,
    total_price = v_part_cost + (coalesce(v_labor_hours, 0) * v_labor_rate)
  where item.id = p_menu_item_id
    and item.shop_id = p_shop_id;

  if v_request_id is not null then
    select
      count(*)::integer,
      count(*) filter (
        where request_item.part_id is not null
          and request_item.unit_price is not null
          and request_item.qty_requested > 0
      )::integer
    into v_active_count, v_ready_count
    from public.part_request_items request_item
    where request_item.request_id = v_request_id
      and request_item.status <> 'cancelled';

    update public.part_requests request
    set
      notes = 'Service-menu parts intake: ' || v_name,
      status = case
        when v_active_count = 0 then 'cancelled'
        when v_active_count = v_ready_count then 'fulfilled'
        else 'requested'
      end
    where request.id = v_request_id
      and request.shop_id = p_shop_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    target,
    metadata
  ) values (
    p_actor_profile_id,
    'menu.item_updated_with_parts_intake',
    p_menu_item_id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_type', 'menu_item',
      'part_request_id', v_request_id,
      'part_count', v_part_count,
      'intake_ready_count', v_ready_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'menu_item_id', p_menu_item_id,
    'part_request_id', v_request_id,
    'part_count', v_part_count,
    'intake_complete',
      v_request_id is not null
      and v_active_count > 0
      and v_active_count = v_ready_count
  );
end;
$$;

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
  set status = case when v_complete then 'fulfilled' else 'requested' end
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

create or replace function public.delete_menu_item_with_parts_intake(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_menu_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_menu_item public.menu_items%rowtype;
  v_request_id uuid;
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_actor_auth_user_id is null
     or p_menu_item_id is null then
    raise exception 'Shop, actor, auth user, and menu item are required';
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
    'advisor',
    'service',
    'parts',
    'mechanic',
    'lead_hand',
    'foreman'
  ) then
    raise exception 'Not authorized to delete service-menu items';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_shop_id::text || ':menu-item:' || p_menu_item_id::text)
  );

  select *
  into v_menu_item
  from public.menu_items item
  where item.id = p_menu_item_id
    and item.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Menu item not found';
  end if;

  select request.id
  into v_request_id
  from public.part_requests request
  where request.shop_id = p_shop_id
    and request.source_menu_item_id = p_menu_item_id
  for update;

  if v_request_id is not null then
    update public.part_request_items request_item
    set
      status = 'cancelled',
      updated_at = now()
    where request_item.request_id = v_request_id
      and request_item.shop_id = p_shop_id
      and request_item.status <> 'cancelled';

    update public.part_requests request
    set
      status = 'cancelled',
      notes =
        'Service-menu parts intake cancelled: '
        || coalesce(nullif(trim(v_menu_item.name), ''), 'Deleted menu item')
    where request.id = v_request_id
      and request.shop_id = p_shop_id;
  end if;

  delete from public.menu_items item
  where item.id = p_menu_item_id
    and item.shop_id = p_shop_id;

  insert into public.audit_logs (
    actor_id,
    action,
    target,
    metadata
  ) values (
    p_actor_profile_id,
    'menu.item_deleted_with_parts_intake',
    p_menu_item_id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_type', 'menu_item',
      'part_request_id', v_request_id,
      'menu_item_name', v_menu_item.name
    )
  );

  return jsonb_build_object(
    'ok', true,
    'menu_item_id', p_menu_item_id,
    'part_request_id', v_request_id
  );
end;
$$;

revoke all on function public.update_menu_item_with_parts_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) from public, anon;
grant execute on function public.update_menu_item_with_parts_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) to authenticated, service_role;

revoke all on function public.review_menu_item_part_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  uuid
) from public, anon;
grant execute on function public.review_menu_item_part_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  uuid
) to authenticated, service_role;

revoke all on function public.delete_menu_item_with_parts_intake(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon;
grant execute on function public.delete_menu_item_with_parts_intake(
  uuid,
  uuid,
  uuid,
  uuid
) to authenticated, service_role;

comment on function public.update_menu_item_with_parts_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) is
  'Atomically updates a service-menu recipe while preserving and synchronizing internal parts intake.';

comment on function public.review_menu_item_part_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  uuid
) is
  'Atomically attaches and prices one service-menu intake item and closes the internal request when complete.';

comment on function public.delete_menu_item_with_parts_intake(
  uuid,
  uuid,
  uuid,
  uuid
) is
  'Atomically cancels a service-menu parts intake before deleting its menu item.';
