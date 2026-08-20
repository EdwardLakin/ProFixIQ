begin;

-- A request that was previously fulfilled or returned can become actionable
-- again when approved quantity increases or issued quantity is returned. Keep
-- terminal denial states closed, but recompute current per-item shortages for
-- previously signaled completed requests.
create or replace function public.parts_reconcile_pick_request_notification(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.part_requests%rowtype;
  v_has_actionable boolean := false;
  v_required numeric := 0;
  v_remaining numeric := 0;
  v_staged numeric := 0;
  v_source text := 'manual';
begin
  if p_request_id is null then
    return;
  end if;

  select request.* into v_request
  from public.part_requests request
  where request.id = p_request_id;

  if not found then
    return;
  end if;

  v_source := case
    when lower(coalesce(v_request.pick_request_source, '')) = 'job_start'
      then 'job_start'
    else 'manual'
  end;

  if v_request.pick_requested_at is not null
     and lower(coalesce(v_request.status::text, 'requested')) not in (
       'rejected', 'cancelled', 'canceled', 'deferred'
     )
     and public.parts_request_is_operationally_released(v_request.id) then
    select
      coalesce(sum(greatest(
        coalesce(item.qty_approved, 0),
        coalesce(item.qty_requested, 0),
        coalesce(item.qty, 0),
        0
      )), 0),
      coalesce(sum(greatest(
        greatest(
          coalesce(item.qty_approved, 0),
          coalesce(item.qty_requested, 0),
          coalesce(item.qty, 0),
          0
        ) - (
          coalesce(item.qty_reserved, 0)
          + greatest(
            coalesce(item.qty_consumed, 0) - coalesce(item.qty_returned, 0),
            0
          )
        ),
        0
      )), 0)
    into v_required, v_remaining
    from public.part_request_items item
    where item.request_id = v_request.id
      and item.shop_id = v_request.shop_id
      and lower(coalesce(item.status::text, 'requested')) not in (
        'cancelled', 'canceled', 'rejected'
      );

    v_staged := greatest(v_required - v_remaining, 0);
    v_has_actionable :=
      v_request.work_order_id is not null
      and v_request.job_id is not null
      and v_required > 0
      and v_remaining > 0;
  end if;

  if v_has_actionable then
    update public.part_requests request
    set pick_requested_at = now(),
        pick_request_source = v_source
    where request.id = v_request.id;

    perform public.parts_upsert_pick_request_notification(
      v_request.shop_id,
      v_request.work_order_id,
      v_request.job_id,
      v_request.id,
      v_source,
      v_required,
      v_staged,
      v_remaining
    );
    return;
  end if;

  if to_regclass('public.assistant_notifications') is not null then
    execute $sql$
      update public.assistant_notifications notification
      set status = 'resolved',
          resolved_at = coalesce(notification.resolved_at, now()),
          last_seen_at = now(),
          updated_at = now()
      where notification.shop_id = $1
        and notification.code = 'parts_pick_requested'
        and notification.entity_type = 'part_request'
        and notification.entity_id = $2
        and notification.source in ('parts_pick_workflow', 'parts_workflow')
        and lower(coalesce(notification.status, 'active')) in (
          'active', 'open', 'acknowledged'
        )
    $sql$ using v_request.shop_id, v_request.id;
  end if;
end;
$$;

revoke all on function public.parts_reconcile_pick_request_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.parts_reconcile_pick_request_notification(uuid)
  to service_role;

commit;
