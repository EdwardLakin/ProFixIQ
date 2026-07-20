begin;

-- Duplicate request items can exist before a canonical work_order_parts row is
-- materialized. Cancellation previously required that row, leaving an unpicked
-- duplicate impossible to dismiss. Preserve the normal allocation-release path
-- when a row exists, but allow an untouched request item to be cancelled before
-- materialization. Keep the lifecycle reconciler from restoring a cancelled
-- item to the approved parent status.
create or replace function public.parts_cancel_request_item(
  p_request_item_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.part_request_items%rowtype;
  v_wop public.work_order_parts%rowtype;
  v_alloc record;
  v_cancel numeric := 0;
  v_key text;
  v_released numeric := 0;
  v_previous_guard text :=
    coalesce(current_setting('app.parts_lifecycle_reconciling', true), '0');
begin
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key is required.';
  end if;

  select * into v_item
  from public.part_request_items
  where id = p_request_item_id
  for update;
  if not found then raise exception 'Request item not found.'; end if;
  perform public.parts_lifecycle_assert_shop_access(v_item.shop_id);

  if lower(coalesce(v_item.status::text, '')) = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'work_order_part_id', null,
      'released_qty', 0,
      'cancelled_qty', 0
    );
  end if;

  select * into v_wop
  from public.work_order_parts
  where source_parts_request_item_id = p_request_item_id
    and coalesce(is_active, true)
  order by updated_at desc, id desc
  limit 1
  for update;

  if found then
    for v_alloc in
      select *
      from public.work_order_part_allocations
      where work_order_part_id = v_wop.id
      order by id
      for update
    loop
      v_key := p_idempotency_key || ':release:' || v_alloc.id::text;
      perform public.parts_release_allocation(
        p_request_item_id,
        v_alloc.location_id,
        v_alloc.qty,
        v_key
      );
      v_released := v_released + v_alloc.qty;
    end loop;

    v_cancel := greatest(
      coalesce(v_wop.quantity_requested, 0)
        - coalesce(v_wop.quantity_consumed, 0)
        - coalesce(v_wop.quantity_returned, 0),
      0
    );

    update public.work_order_parts
    set quantity_cancelled = greatest(
          coalesce(quantity_cancelled, 0), v_cancel
        ),
        lifecycle_status = case
          when coalesce(quantity_consumed, 0) > 0
            then lifecycle_status
          else 'cancelled'
        end,
        updated_at = now()
    where id = v_wop.id;
  end if;

  perform set_config('app.parts_lifecycle_reconciling', '1', true);
  update public.part_request_items
  set status = 'cancelled',
      approved = false,
      qty_approved = 0,
      updated_at = now()
  where id = p_request_item_id;
  perform set_config(
    'app.parts_lifecycle_reconciling', v_previous_guard, true
  );

  perform public.parts_publish_request_notification(
    v_item.request_id,
    public.parts_request_operational_stage(v_item.request_id)
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'work_order_part_id', v_wop.id,
    'released_qty', v_released,
    'cancelled_qty', v_cancel
  );
exception when others then
  perform set_config(
    'app.parts_lifecycle_reconciling', v_previous_guard, true
  );
  raise;
end;
$$;

revoke all on function public.parts_cancel_request_item(uuid,text)
  from public, anon;
grant execute on function public.parts_cancel_request_item(uuid,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
