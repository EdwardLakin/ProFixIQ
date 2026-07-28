-- Atomic service-menu creation with durable internal parts intake.
--
-- A menu item, its reusable part rows, and the matching internal parts request
-- are one transaction. The caller supplies a stable request key so a retry
-- returns the original result instead of creating duplicates.

alter table public.menu_items
  add column if not exists creation_request_id uuid;

alter table public.part_requests
  add column if not exists source_menu_item_id uuid;

alter table public.part_request_items
  add column if not exists source_menu_item_part_id uuid;

create unique index if not exists menu_items_shop_creation_request_uidx
  on public.menu_items(shop_id, creation_request_id)
  where creation_request_id is not null;

create unique index if not exists menu_items_shop_id_uidx
  on public.menu_items(shop_id, id);

create unique index if not exists part_requests_shop_source_menu_item_uidx
  on public.part_requests(shop_id, source_menu_item_id)
  where source_menu_item_id is not null;

create index if not exists part_request_items_menu_item_idx
  on public.part_request_items(shop_id, menu_item_id, created_at desc)
  where menu_item_id is not null;

create unique index if not exists part_request_items_source_menu_part_uidx
  on public.part_request_items(request_id, source_menu_item_part_id)
  where source_menu_item_part_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'part_requests_source_menu_item_shop_fkey'
      and conrelid = 'public.part_requests'::regclass
  ) then
    alter table public.part_requests
      add constraint part_requests_source_menu_item_shop_fkey
      foreign key (shop_id, source_menu_item_id)
      references public.menu_items(shop_id, id)
      on delete set null (source_menu_item_id)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'part_request_items_menu_item_shop_fkey'
      and conrelid = 'public.part_request_items'::regclass
  ) then
    alter table public.part_request_items
      add constraint part_request_items_menu_item_shop_fkey
      foreign key (shop_id, menu_item_id)
      references public.menu_items(shop_id, id)
      on delete set null (menu_item_id)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'part_request_items_source_menu_part_fkey'
      and conrelid = 'public.part_request_items'::regclass
  ) then
    alter table public.part_request_items
      add constraint part_request_items_source_menu_part_fkey
      foreign key (source_menu_item_part_id)
      references public.menu_item_parts(id)
      on delete set null
      not valid;
  end if;
end
$$;

create or replace function public.create_menu_item_with_parts_intake(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_idempotency_key uuid,
  p_item jsonb,
  p_parts jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_existing_menu_id uuid;
  v_existing_request_id uuid;
  v_menu_item_id uuid;
  v_part_request_id uuid;
  v_name text;
  v_description text;
  v_inspection_template_id uuid;
  v_labor_hours numeric;
  v_labor_rate numeric := 0;
  v_part_cost numeric := 0;
  v_part_count integer := 0;
  v_part record;
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_actor_auth_user_id is null
     or p_idempotency_key is null then
    raise exception 'Shop, actor, auth user, and idempotency key are required';
  end if;

  select *
  into v_actor
  from public.profiles p
  where p.id = p_actor_profile_id
    and p.shop_id = p_shop_id
    and (p.id = p_actor_auth_user_id or p.user_id = p_actor_auth_user_id);

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
    raise exception 'Not authorized to create service-menu items';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_shop_id::text || ':' || p_idempotency_key::text)
  );

  select item.id
  into v_existing_menu_id
  from public.menu_items item
  where item.shop_id = p_shop_id
    and item.creation_request_id = p_idempotency_key;

  if v_existing_menu_id is not null then
    select request.id
    into v_existing_request_id
    from public.part_requests request
    where request.shop_id = p_shop_id
      and request.source_menu_item_id = v_existing_menu_id;

    return jsonb_build_object(
      'ok', true,
      'menu_item_id', v_existing_menu_id,
      'part_request_id', v_existing_request_id,
      'replayed', true
    );
  end if;

  v_name := trim(coalesce(p_item ->> 'name', ''));
  if v_name = '' then
    raise exception 'Menu item name is required';
  end if;
  if char_length(v_name) > 180 then
    raise exception 'Menu item name is too long';
  end if;

  v_description := nullif(trim(coalesce(p_item ->> 'description', '')), '');

  if jsonb_typeof(p_item -> 'labor_time') = 'number' then
    v_labor_hours := greatest(0, (p_item ->> 'labor_time')::numeric);
  else
    v_labor_hours := null;
  end if;

  if nullif(p_item ->> 'inspection_template_id', '') is not null then
    v_inspection_template_id := (p_item ->> 'inspection_template_id')::uuid;
    if not exists (
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
  end if;

  select greatest(0, coalesce(shop.labor_rate, 0))
  into v_labor_rate
  from public.shops shop
  where shop.id = p_shop_id;

  if not found then
    raise exception 'Shop not found';
  end if;

  if coalesce(jsonb_typeof(p_parts), 'array') <> 'array' then
    raise exception 'Parts must be a JSON array';
  end if;
  if jsonb_array_length(coalesce(p_parts, '[]'::jsonb)) > 100 then
    raise exception 'A menu item can contain at most 100 parts';
  end if;

  for v_part in
    select
      trim(coalesce(part.name, '')) as name,
      part.quantity,
      part.unit_cost,
      part.part_id
    from jsonb_to_recordset(coalesce(p_parts, '[]'::jsonb)) as part(
      name text,
      quantity numeric,
      unit_cost numeric,
      part_id uuid
    )
  loop
    if v_part.name = '' then
      raise exception 'Every part needs a name';
    end if;
    if char_length(v_part.name) > 240 then
      raise exception 'Part name is too long';
    end if;
    if v_part.quantity is null or v_part.quantity <= 0 then
      raise exception 'Every part needs a positive quantity';
    end if;
    if v_part.unit_cost is null or v_part.unit_cost < 0 then
      raise exception 'Part unit cost cannot be negative';
    end if;
    if v_part.part_id is not null and not exists (
      select 1
      from public.parts catalog_part
      where catalog_part.id = v_part.part_id
        and catalog_part.shop_id = p_shop_id
    ) then
      raise exception 'A selected catalog part is not available to this shop';
    end if;

    v_part_cost := v_part_cost + (v_part.quantity * v_part.unit_cost);
    v_part_count := v_part_count + 1;
  end loop;

  insert into public.menu_items (
    shop_id,
    user_id,
    name,
    description,
    labor_time,
    labor_hours,
    part_cost,
    total_price,
    inspection_template_id,
    is_active,
    source,
    creation_request_id
  ) values (
    p_shop_id,
    p_actor_auth_user_id,
    v_name,
    v_description,
    v_labor_hours,
    v_labor_hours,
    v_part_cost,
    v_part_cost + (coalesce(v_labor_hours, 0) * v_labor_rate),
    v_inspection_template_id,
    true,
    'service_menu_builder',
    p_idempotency_key
  )
  returning id into v_menu_item_id;

  if v_part_count > 0 then
    insert into public.menu_item_parts (
      menu_item_id,
      name,
      quantity,
      unit_cost,
      user_id,
      shop_id,
      part_id
    )
    select
      v_menu_item_id,
      trim(part.name),
      part.quantity,
      part.unit_cost,
      p_actor_auth_user_id,
      p_shop_id,
      part.part_id
    from jsonb_to_recordset(p_parts) as part(
      name text,
      quantity numeric,
      unit_cost numeric,
      part_id uuid
    );

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
      v_menu_item_id
    )
    returning id into v_part_request_id;

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
      unit_price
    )
    select
      v_part_request_id,
      p_shop_id,
      null,
      null,
      v_menu_item_id,
      menu_part.id,
      menu_part.part_id,
      trim(menu_part.name),
      menu_part.quantity,
      menu_part.quantity,
      0,
      false,
      'requested',
      menu_part.unit_cost,
      null
    from public.menu_item_parts menu_part
    where menu_part.menu_item_id = v_menu_item_id
      and menu_part.shop_id = p_shop_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    target,
    metadata
  ) values (
    p_actor_profile_id,
    'menu.item_created_with_parts_intake',
    v_menu_item_id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_type', 'menu_item',
      'part_request_id', v_part_request_id,
      'part_count', v_part_count,
      'idempotency_key', p_idempotency_key
    )
  );

  return jsonb_build_object(
    'ok', true,
    'menu_item_id', v_menu_item_id,
    'part_request_id', v_part_request_id,
    'part_count', v_part_count,
    'replayed', false
  );
end;
$$;

revoke all on function public.create_menu_item_with_parts_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) from public, anon;
grant execute on function public.create_menu_item_with_parts_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) to authenticated, service_role;

comment on function public.create_menu_item_with_parts_intake(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
) is
  'Atomically creates a service-menu item, reusable parts, and its internal parts-intake request.';
