begin;

create or replace function public.parts_dismiss_stale_placeholder_request_atomic(
  p_shop_id uuid,
  p_request_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authenticated_user_id uuid := auth.uid();
  v_actor_role text;
  v_request public.part_requests%rowtype;
  v_item_count integer := 0;
begin
  if p_shop_id is null or p_request_id is null then
    raise exception using errcode = '22023', message = 'PARTS_DISMISS_SCOPE_REQUIRED';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if v_authenticated_user_id is null then
      raise exception using errcode = '42501', message = 'PARTS_AUTHENTICATION_REQUIRED';
    end if;
    if p_actor_user_id is null or v_authenticated_user_id is distinct from p_actor_user_id then
      raise exception using errcode = '42501', message = 'PARTS_ACTOR_MISMATCH';
    end if;

    select lower(trim(coalesce(profile.role::text, '')))
      into v_actor_role
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (profile.id = v_authenticated_user_id or profile.user_id = v_authenticated_user_id)
    order by (profile.id = v_authenticated_user_id) desc
    limit 1;

    if v_actor_role not in ('owner','admin','manager','advisor','parts') then
      raise exception using errcode = '42501', message = 'PARTS_ROLE_ACCESS_DENIED';
    end if;
  end if;

  select request_row.*
    into v_request
  from public.part_requests request_row
  where request_row.id = p_request_id
    and request_row.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PARTS_REQUEST_NOT_FOUND_FOR_SHOP';
  end if;

  if v_request.status::text = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request_id', v_request.id,
      'work_order_id', v_request.work_order_id,
      'quote_line_id', v_request.quote_line_id,
      'status', 'cancelled'
    );
  end if;

  if v_request.status::text <> 'requested' then
    raise exception using errcode = 'P0001', message = 'PARTS_STALE_REQUEST_NOT_DISMISSIBLE';
  end if;

  select count(*)::integer
    into v_item_count
  from public.part_request_items item
  where item.request_id = p_request_id
    and item.shop_id = p_shop_id;

  if v_item_count = 0 then
    raise exception using errcode = 'P0001', message = 'PARTS_STALE_REQUEST_HAS_NO_PLACEHOLDER';
  end if;

  if exists (
    select 1
    from public.part_request_items item
    where item.request_id = p_request_id
      and item.shop_id = p_shop_id
      and (
        item.status::text <> 'requested'
        or item.part_id is not null
        or nullif(trim(coalesce(item.requested_part_number, '')), '') is not null
        or nullif(trim(coalesce(item.requested_manufacturer, '')), '') is not null
        or coalesce(item.quoted_price, 0) <> 0
        or coalesce(item.unit_price, 0) <> 0
        or coalesce(item.unit_cost, 0) <> 0
        or item.vendor_id is not null
        or item.po_id is not null
        or item.location_id is not null
        or item.latest_supplier_quote_request_id is not null
        or item.supplier_quote_requested_at is not null
        or item.supplier_quote_received_at is not null
        or coalesce(item.qty_approved, 0) > 0
        or coalesce(item.qty_reserved, 0) > 0
        or coalesce(item.qty_picked, 0) > 0
        or coalesce(item.qty_received, 0) > 0
        or coalesce(item.qty_consumed, 0) > 0
        or coalesce(item.qty_assigned, 0) > 0
        or coalesce(item.qty_ordered, 0) > 0
        or coalesce(item.qty_returned, 0) > 0
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PARTS_STALE_REQUEST_HAS_ACTIVITY';
  end if;

  if exists (
    select 1
    from public.work_order_parts wop
    join public.part_request_items item
      on item.id = wop.source_parts_request_item_id
    where item.request_id = p_request_id
      and wop.shop_id = p_shop_id
      and coalesce(wop.is_active, true)
  ) then
    raise exception using errcode = 'P0001', message = 'PARTS_STALE_REQUEST_ALREADY_MATERIALIZED';
  end if;

  update public.part_request_items
  set status = 'cancelled'::public.part_request_item_status,
      updated_at = now()
  where request_id = p_request_id
    and shop_id = p_shop_id;

  update public.part_requests
  set status = 'cancelled'::public.part_request_status
  where id = p_request_id
    and shop_id = p_shop_id;

  if v_request.quote_line_id is not null then
    perform public.sync_quote_line_pricing_from_parts(
      p_shop_id,
      v_request.quote_line_id
    );

    update public.work_order_quote_lines
    set metadata = jsonb_set(
          jsonb_set(
            coalesce(metadata, '{}'::jsonb),
            '{parts_required}',
            'false'::jsonb,
            true
          ),
          '{no_parts_required}',
          'true'::jsonb,
          true
        ),
        status = case
          when lower(coalesce(status, '')) = 'pending_parts'
            then 'advisor_pending'
          else status
        end,
        stage = case
          when lower(coalesce(stage, '')) = 'advisor_pending'
            then 'advisor_pending'
          else stage
        end,
        updated_at = now()
    where id = v_request.quote_line_id
      and shop_id = p_shop_id
      and work_order_line_id is null
      and sent_to_customer_at is null
      and sent_at is null
      and approved_at is null
      and declined_at is null
      and deferred_at is null
      and converted_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request_id', v_request.id,
    'work_order_id', v_request.work_order_id,
    'quote_line_id', v_request.quote_line_id,
    'cancelled_item_count', v_item_count,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.parts_dismiss_stale_placeholder_request_atomic(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.parts_dismiss_stale_placeholder_request_atomic(uuid, uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
