-- Service-catalog parts (BOM) mapping.
--
-- Additive only: two new functions. The merged import_service_catalog function
-- is not modified.
--
--   * resolve_catalog_parts: read-only, shop-scoped inventory match by
--     normalized part number (then SKU). Shared by the import preview and the
--     import so both agree on what matches.
--   * import_service_catalog_with_parts: runs import_service_catalog and then
--     attaches each service's parts in the SAME transaction, using the same
--     records the service builder writes (menu_item_parts plus the internal
--     service-menu parts-intake request/items). A part found in inventory is
--     attached with its catalog id and cost; a part that is not found (or is
--     ambiguous) is attached by name and left as a "requested" intake item for
--     parts staff to match, exactly like a name-only part in the service
--     builder.

create or replace function public.resolve_catalog_parts(
  p_shop_id uuid,
  p_part_keys text[]
) returns table (
  part_key text,
  part_id uuid,
  part_name text,
  unit_cost numeric,
  match_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    k.key as part_key,
    case when coalesce(pn.n, 0) + coalesce(sk.n, 0) = 1 then coalesce(pn.id, sk.id) end as part_id,
    case when coalesce(pn.n, 0) + coalesce(sk.n, 0) = 1 then coalesce(pn.name, sk.name) end as part_name,
    case when coalesce(pn.n, 0) + coalesce(sk.n, 0) = 1 then coalesce(pn.cost, sk.cost) end as unit_cost,
    (case when coalesce(pn.n, 0) > 0 then pn.n else coalesce(sk.n, 0) end)::integer as match_count
  from (
    select distinct nullif(trim(raw), '') as key
    from unnest(coalesce(p_part_keys, '{}'::text[])) as raw
  ) k
  left join lateral (
    select
      count(*)::integer as n,
      (array_agg(p.id))[1] as id,
      (array_agg(p.name))[1] as name,
      (array_agg(coalesce(p.default_cost, p.cost, 0)))[1] as cost
    from public.parts p
    where p.shop_id = p_shop_id
      and regexp_replace(upper(coalesce(p.part_number, '')), '[^A-Z0-9]+', '', 'g') = k.key
  ) pn on true
  left join lateral (
    select
      count(*)::integer as n,
      (array_agg(p.id))[1] as id,
      (array_agg(p.name))[1] as name,
      (array_agg(coalesce(p.default_cost, p.cost, 0)))[1] as cost
    from public.parts p
    where coalesce(pn.n, 0) = 0
      and p.shop_id = p_shop_id
      and regexp_replace(upper(coalesce(p.sku, '')), '[^A-Z0-9]+', '', 'g') = k.key
  ) sk on true
  where k.key is not null;
$$;

revoke all on function public.resolve_catalog_parts(uuid, text[]) from public, anon;
grant execute on function public.resolve_catalog_parts(uuid, text[]) to authenticated, service_role;

comment on function public.resolve_catalog_parts(uuid, text[]) is
  'Shop-scoped, read-only match of normalized part numbers (then SKUs) to inventory parts.';

create or replace function public.import_service_catalog_with_parts(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_source_ref text,
  p_templates jsonb,
  p_services jsonb,
  p_parts jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_labor_rate numeric := 0;
  v_service_key text;
  v_menu_id uuid;
  v_menu_name text;
  v_service_price numeric;
  v_part record;
  v_res record;
  v_matched boolean;
  v_part_id uuid;
  v_name text;
  v_cost numeric;
  v_menu_part_id uuid;
  v_request_id uuid;
  v_item_id uuid;
  v_part_cost numeric;
  v_active integer;
  v_ready integer;
  v_attached integer := 0;
  v_requested integer := 0;
  v_ambiguous integer := 0;
begin
  -- Authorization, identity, validation and the catalog write all happen in
  -- import_service_catalog; it raises (rolling back this whole call) on failure.
  v_result := public.import_service_catalog(
    p_shop_id, p_actor_profile_id, p_actor_auth_user_id, p_source_ref, p_templates, p_services
  );

  if coalesce(jsonb_typeof(p_parts), 'array') <> 'array' then
    raise exception 'Parts must be a JSON array';
  end if;
  if jsonb_array_length(coalesce(p_parts, '[]'::jsonb)) > 5000 then
    raise exception 'Catalog has too many parts to import at once';
  end if;

  select greatest(0, coalesce(shop.labor_rate, 0)) into v_labor_rate
  from public.shops shop
  where shop.id = p_shop_id;

  for v_service_key in
    select distinct trim(coalesce(pt.service_key, ''))
    from jsonb_to_recordset(coalesce(p_parts, '[]'::jsonb)) as pt(service_key text)
    order by 1
  loop
    select item.id, item.name into v_menu_id, v_menu_name
    from public.menu_items item
    where item.shop_id = p_shop_id
      and item.service_key = v_service_key
    order by item.created_at
    limit 1;

    if v_menu_id is null then
      raise exception 'Parts reference an unknown service %', v_service_key;
    end if;

    select s.price into v_service_price
    from jsonb_to_recordset(coalesce(p_services, '[]'::jsonb)) as s(service_key text, price numeric)
    where trim(coalesce(s.service_key, '')) = v_service_key
    limit 1;

    v_request_id := null;
    select request.id into v_request_id
    from public.part_requests request
    where request.shop_id = p_shop_id
      and request.source_menu_item_id = v_menu_id
    order by request.created_at
    limit 1;

    for v_part in
      select
        trim(coalesce(pt.part_number, '')) as part_number,
        nullif(trim(coalesce(pt.name, '')), '') as name,
        pt.quantity
      from jsonb_to_recordset(p_parts) as pt(service_key text, part_number text, name text, quantity numeric)
      where trim(coalesce(pt.service_key, '')) = v_service_key
      order by pt.part_number
    loop
      if v_part.part_number = '' then
        raise exception 'Every part needs a part number (service %)', v_service_key;
      end if;
      if v_part.quantity is null or v_part.quantity <= 0 or v_part.quantity > 10000 then
        raise exception 'Part % has an invalid quantity', v_part.part_number;
      end if;
      if char_length(coalesce(v_part.name, v_part.part_number)) > 240 then
        raise exception 'Part name is too long: %', v_part.part_number;
      end if;

      select * into v_res
      from public.resolve_catalog_parts(
        p_shop_id,
        array[regexp_replace(upper(v_part.part_number), '[^A-Z0-9]+', '', 'g')]
      );

      v_matched := coalesce(v_res.match_count, 0) = 1;
      if coalesce(v_res.match_count, 0) > 1 then
        v_ambiguous := v_ambiguous + 1;
      end if;

      if v_matched then
        v_part_id := v_res.part_id;
        v_name := coalesce(nullif(trim(v_res.part_name), ''), v_part.name, v_part.part_number);
        v_cost := greatest(0, coalesce(v_res.unit_cost, 0));
      else
        v_part_id := null;
        v_name := coalesce(v_part.name, v_part.part_number);
        v_cost := 0;
      end if;

      -- Reconcile on the catalog part when matched, otherwise on the name, so a
      -- re-import updates the recipe instead of duplicating it.
      v_menu_part_id := null;
      select mp.id into v_menu_part_id
      from public.menu_item_parts mp
      where mp.menu_item_id = v_menu_id
        and mp.shop_id = p_shop_id
        and (
          (v_matched and mp.part_id = v_part_id)
          or (not v_matched and mp.part_id is null and lower(mp.name) = lower(v_name))
        )
      order by mp.created_at
      limit 1;

      if v_menu_part_id is null then
        insert into public.menu_item_parts (
          menu_item_id, name, quantity, unit_cost, user_id, shop_id, part_id
        ) values (
          v_menu_id, v_name, v_part.quantity, v_cost, p_actor_auth_user_id, p_shop_id, v_part_id
        )
        returning id into v_menu_part_id;
      else
        update public.menu_item_parts mp
        set name = v_name,
            quantity = v_part.quantity,
            unit_cost = case when v_matched then v_cost else mp.unit_cost end,
            part_id = coalesce(v_part_id, mp.part_id)
        where mp.id = v_menu_part_id;
      end if;

      if v_request_id is null then
        insert into public.part_requests (
          shop_id, work_order_id, job_id, requested_by, status, notes, source_menu_item_id
        ) values (
          p_shop_id, null, null, p_actor_auth_user_id, 'requested',
          'Service-menu parts intake: ' || v_menu_name, v_menu_id
        )
        returning id into v_request_id;
      end if;

      v_item_id := null;
      select ri.id into v_item_id
      from public.part_request_items ri
      where ri.request_id = v_request_id
        and ri.source_menu_item_part_id = v_menu_part_id
      limit 1;

      if v_item_id is null then
        insert into public.part_request_items (
          request_id, shop_id, work_order_id, work_order_line_id, menu_item_id,
          source_menu_item_part_id, part_id, description, qty, qty_requested,
          qty_approved, approved, status, unit_cost, unit_price, quoted_price
        ) values (
          v_request_id, p_shop_id, null, null, v_menu_id,
          v_menu_part_id, v_part_id, v_name, v_part.quantity, v_part.quantity,
          0, false,
          (case when v_matched then 'quoted' else 'requested' end)::public.part_request_item_status,
          v_cost,
          case when v_matched then v_cost end,
          case when v_matched then v_cost end
        );
      else
        update public.part_request_items ri
        set description = v_name,
            qty = v_part.quantity,
            qty_requested = v_part.quantity,
            part_id = coalesce(v_part_id, ri.part_id),
            unit_cost = case when v_matched then v_cost else ri.unit_cost end,
            unit_price = case when v_matched then v_cost else ri.unit_price end,
            quoted_price = case when v_matched then v_cost else ri.quoted_price end,
            status = case when v_matched then 'quoted'::public.part_request_item_status else ri.status end,
            updated_at = now()
        where ri.id = v_item_id;
      end if;

      if v_matched then
        v_attached := v_attached + 1;
      else
        v_requested := v_requested + 1;
      end if;
    end loop;

    select coalesce(sum(mp.quantity * mp.unit_cost), 0) into v_part_cost
    from public.menu_item_parts mp
    where mp.menu_item_id = v_menu_id
      and mp.shop_id = p_shop_id;

    -- An explicit catalog price is the shop's chosen price and is kept; a
    -- service with no price is priced the way the service builder prices it.
    update public.menu_items item
    set part_cost = v_part_cost,
        total_price = case
          when v_service_price is null
            then v_part_cost + coalesce(item.labor_time, item.labor_hours, 0) * v_labor_rate
          else item.total_price
        end
    where item.id = v_menu_id
      and item.shop_id = p_shop_id;

    select
      count(*)::integer,
      count(*) filter (
        where ri.part_id is not null and ri.unit_price is not null and ri.qty_requested > 0
      )::integer
    into v_active, v_ready
    from public.part_request_items ri
    where ri.request_id = v_request_id
      and ri.status <> 'cancelled'::public.part_request_item_status;

    update public.part_requests request
    set status = (case when v_active > 0 and v_active = v_ready then 'fulfilled' else 'requested' end)::public.part_request_status
    where request.id = v_request_id
      and request.shop_id = p_shop_id;
  end loop;

  insert into public.audit_logs (actor_id, action, target, metadata)
  values (
    p_actor_profile_id,
    'menu.service_catalog_parts_attached',
    p_shop_id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_type', 'service_catalog',
      'source_ref', p_source_ref,
      'parts_attached', v_attached,
      'parts_requested', v_requested,
      'parts_ambiguous', v_ambiguous
    )
  );

  return v_result || jsonb_build_object(
    'partsAttached', v_attached,
    'partsRequested', v_requested,
    'partsAmbiguous', v_ambiguous
  );
end;
$$;

revoke all on function public.import_service_catalog_with_parts(uuid, uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_service_catalog_with_parts(uuid, uuid, uuid, text, jsonb, jsonb, jsonb) to authenticated, service_role;

comment on function public.import_service_catalog_with_parts(uuid, uuid, uuid, text, jsonb, jsonb, jsonb) is
  'Imports a confirmed service catalog and attaches each service''s parts (BOM) in one transaction.';
