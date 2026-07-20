begin;

-- The application already treats waiting_parts as a canonical operational
-- work-order-line status, but older production databases still enforce the
-- original six-value vocabulary. Extend that contract before any request
-- backfill can move an approved line into the Parts queue.
create or replace function public.normalize_work_order_line_status()
returns trigger
language plpgsql
as $$
begin
  new.status := coalesce(lower(replace(new.status, ' ', '_')), 'awaiting');

  new.status := case new.status
    when 'queued' then 'active'
    when 'in_progress' then 'active'
    when 'assigned' then 'active'
    when 'paused' then 'on_hold'
    when 'declined' then 'on_hold'
    when 'unassigned' then 'awaiting'
    when 'ready_to_invoice' then 'completed'
    when 'quoted' then 'awaiting_approval'
    else new.status
  end;

  if new.status not in (
    'awaiting', 'awaiting_approval', 'active', 'waiting_parts',
    'on_hold', 'completed', 'invoiced'
  ) then
    raise exception 'Invalid work_order_lines.status: %', new.status;
  end if;

  return new;
end;
$$;

alter table public.work_order_lines
  drop constraint if exists work_order_lines_status_check;
alter table public.work_order_lines
  add constraint work_order_lines_status_check
  check (status = any (array[
    'awaiting'::text,
    'awaiting_approval'::text,
    'active'::text,
    'waiting_parts'::text,
    'on_hold'::text,
    'completed'::text,
    'invoiced'::text
  ]));

-- A work-order part is the quoted/approved commercial row. Keep an explicit
-- reverse pointer on the request item so the same line part can be requested
-- repeatedly without creating duplicate operational items.
alter table public.part_request_items
  add column if not exists source_work_order_part_id uuid
    references public.work_order_parts(id) on delete set null;

create index if not exists idx_part_request_items_source_work_order_part
  on public.part_request_items (shop_id, source_work_order_part_id)
  where source_work_order_part_id is not null;

update public.part_request_items pri
set source_work_order_part_id = wop.id,
    updated_at = now()
from public.work_order_parts wop
where wop.source_parts_request_item_id = pri.id
  and pri.source_work_order_part_id is null;

-- Materialize every active part on one repair line into one reusable request.
-- The repair line is locked first, making concurrent clicks and approval
-- triggers serialize. A fresh operation key may safely sync newly-added parts.
create or replace function public.parts_request_work_order_line_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_work_order_line_id uuid,
  p_operation_key text,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_request public.part_requests%rowtype;
  v_operation public.parts_operation_keys;
  v_work_order_part record;
  v_request_item_id uuid;
  v_part_count integer := 0;
  v_created_count integer := 0;
  v_updated_count integer := 0;
  v_result jsonb;
  v_previous_lifecycle_guard text :=
    coalesce(current_setting('app.parts_lifecycle_reconciling', true), '0');
  v_auto_release boolean :=
    current_setting('app.parts_line_auto_releasing', true) = '1';
begin
  if coalesce(trim(p_operation_key), '') = '' then
    raise exception 'A stable operation key is required.';
  end if;
  if length(p_operation_key) > 300 then
    raise exception 'Parts line request operation key is too long.';
  end if;
  if position(p_shop_id::text || ':' in p_operation_key) <> 1 then
    raise exception 'Parts line request operation key must be scoped to its shop.';
  end if;

  if not v_auto_release then
    perform public.parts_lifecycle_assert_shop_access(p_shop_id);
    if auth.role() <> 'service_role' and not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = p_shop_id
        and lower(coalesce(p.role::text, '')) in (
          'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
          'mechanic', 'tech', 'technician', 'lead_hand', 'foreman'
        )
    ) then
      raise exception 'Parts line request actor is not authorized for this shop.';
    end if;
    if p_actor_user_id is not null and auth.role() <> 'service_role'
       and p_actor_user_id is distinct from auth.uid() then
      raise exception 'Parts line request actor mismatch.';
    end if;
  end if;

  select * into v_line
  from public.work_order_lines
  where id = p_work_order_line_id
    and shop_id = p_shop_id
    and work_order_id = p_work_order_id
  for update;
  if not found then
    raise exception 'Work-order line not found for this work order and shop.';
  end if;

  perform public.parts_assert_work_order_mutable(p_shop_id, p_work_order_id);

  v_operation := public.parts_begin_operation(
    p_shop_id,
    p_operation_key,
    'request_work_order_line_parts',
    'work_order_line',
    p_work_order_line_id,
    p_actor_user_id
  );
  if v_operation.completed_at is not null then
    return coalesce(v_operation.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  select count(*) into v_part_count
  from public.work_order_parts wop
  where wop.shop_id = p_shop_id
    and wop.work_order_id = p_work_order_id
    and wop.work_order_line_id = p_work_order_line_id
    and coalesce(wop.is_active, true)
    and greatest(
      coalesce(wop.quantity_requested, 0),
      coalesce(wop.quantity, 0),
      0
    ) > 0;
  if v_part_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'NO_LINE_PARTS',
      detail = 'Add at least one quoted part to this repair line before requesting Parts fulfillment.';
  end if;

  -- Reuse a request already anchored to the line, including a quote-origin
  -- request whose canonical line was materialized at approval.
  select pr.* into v_request
  from public.part_requests pr
  where pr.shop_id = p_shop_id
    and pr.work_order_id = p_work_order_id
    and pr.job_id = p_work_order_line_id
    and lower(coalesce(pr.status::text, 'requested')) not in (
      'fulfilled', 'returned', 'rejected', 'cancelled', 'deferred'
    )
  order by pr.created_at, pr.id
  limit 1
  for update;

  if not found then
    select pr.* into v_request
    from public.work_order_parts wop
    join public.part_request_items pri
      on pri.id = wop.source_parts_request_item_id
    join public.part_requests pr on pr.id = pri.request_id
    where wop.shop_id = p_shop_id
      and wop.work_order_id = p_work_order_id
      and wop.work_order_line_id = p_work_order_line_id
      and pr.shop_id = p_shop_id
      and lower(coalesce(pr.status::text, 'requested')) not in (
        'fulfilled', 'returned', 'rejected', 'cancelled', 'deferred'
      )
    order by pr.created_at, pr.id
    limit 1
    for update of pr;
  end if;

  perform set_config('app.parts_lifecycle_reconciling', '1', true);

  if v_request.id is null then
    insert into public.part_requests (
      shop_id, work_order_id, job_id, requested_by, notes, status
    ) values (
      p_shop_id, p_work_order_id, p_work_order_line_id,
      coalesce(p_actor_user_id, auth.uid()),
      'All parts requested from work-order line',
      'requested'::public.part_request_status
    ) returning * into v_request;
  elsif v_request.job_id is null then
    update public.part_requests
    set job_id = p_work_order_line_id
    where id = v_request.id
    returning * into v_request;
  end if;

  for v_work_order_part in
    select
      wop.*,
      p.name as inventory_name,
      p.part_number as inventory_part_number,
      p.manufacturer as inventory_manufacturer,
      p.price as inventory_price,
      p.cost as inventory_cost
    from public.work_order_parts wop
    left join public.parts p
      on p.id = wop.part_id and p.shop_id = p_shop_id
    where wop.shop_id = p_shop_id
      and wop.work_order_id = p_work_order_id
      and wop.work_order_line_id = p_work_order_line_id
      and coalesce(wop.is_active, true)
      and greatest(
        coalesce(wop.quantity_requested, 0),
        coalesce(wop.quantity, 0),
        0
      ) > 0
    order by wop.id
    for update of wop
  loop
    v_request_item_id := null;

    if v_work_order_part.source_parts_request_item_id is not null then
      select pri.id into v_request_item_id
      from public.part_request_items pri
      where pri.id = v_work_order_part.source_parts_request_item_id
        and pri.shop_id = p_shop_id
        and pri.request_id = v_request.id;
    end if;

    if v_request_item_id is null then
      select pri.id into v_request_item_id
      from public.part_request_items pri
      where pri.shop_id = p_shop_id
        and pri.request_id = v_request.id
        and pri.source_work_order_part_id = v_work_order_part.id
      order by pri.created_at, pri.id
      limit 1
      for update;
    end if;

    if v_request_item_id is null then
      insert into public.part_request_items (
        request_id, shop_id, work_order_id, work_order_line_id,
        source_work_order_part_id, part_id, description,
        requested_part_number, requested_manufacturer,
        qty, qty_requested, qty_approved, quoted_price, unit_price,
        unit_cost, status, approved
      ) values (
        v_request.id, p_shop_id, p_work_order_id, p_work_order_line_id,
        v_work_order_part.id, v_work_order_part.part_id,
        coalesce(
          nullif(trim(v_work_order_part.description_snapshot), ''),
          nullif(trim(v_work_order_part.inventory_name), ''),
          'Part'
        ),
        coalesce(
          nullif(trim(v_work_order_part.part_number_snapshot), ''),
          nullif(trim(v_work_order_part.inventory_part_number), '')
        ),
        coalesce(
          nullif(trim(v_work_order_part.manufacturer_snapshot), ''),
          nullif(trim(v_work_order_part.inventory_manufacturer), '')
        ),
        greatest(
          coalesce(v_work_order_part.quantity_requested, 0),
          coalesce(v_work_order_part.quantity, 0),
          0
        ),
        greatest(
          coalesce(v_work_order_part.quantity_requested, 0),
          coalesce(v_work_order_part.quantity, 0),
          0
        ),
        0,
        coalesce(
          v_work_order_part.unit_sell_price_snapshot,
          v_work_order_part.unit_price,
          v_work_order_part.inventory_price
        ),
        coalesce(
          v_work_order_part.unit_sell_price_snapshot,
          v_work_order_part.unit_price,
          v_work_order_part.inventory_price
        ),
        coalesce(
          v_work_order_part.unit_cost_snapshot,
          v_work_order_part.inventory_cost
        ),
        'requested'::public.part_request_item_status,
        false
      ) returning id into v_request_item_id;
      v_created_count := v_created_count + 1;
    else
      update public.part_request_items pri
      set source_work_order_part_id = coalesce(
            pri.source_work_order_part_id, v_work_order_part.id
          ),
          part_id = coalesce(pri.part_id, v_work_order_part.part_id),
          description = coalesce(
            nullif(trim(v_work_order_part.description_snapshot), ''),
            nullif(trim(pri.description), ''),
            nullif(trim(v_work_order_part.inventory_name), ''),
            'Part'
          ),
          qty = greatest(
            coalesce(v_work_order_part.quantity_requested, 0),
            coalesce(v_work_order_part.quantity, 0),
            coalesce(pri.qty, 0),
            0
          ),
          qty_requested = greatest(
            coalesce(v_work_order_part.quantity_requested, 0),
            coalesce(v_work_order_part.quantity, 0),
            coalesce(pri.qty_requested, 0),
            0
          ),
          quoted_price = coalesce(
            pri.quoted_price,
            v_work_order_part.unit_sell_price_snapshot,
            v_work_order_part.unit_price,
            v_work_order_part.inventory_price
          ),
          unit_price = coalesce(
            pri.unit_price,
            v_work_order_part.unit_sell_price_snapshot,
            v_work_order_part.unit_price,
            v_work_order_part.inventory_price
          ),
          updated_at = now()
      where pri.id = v_request_item_id
        and coalesce(pri.qty_ordered, 0) = 0
        and coalesce(pri.qty_received, 0) = 0
        and coalesce(pri.qty_reserved, 0) = 0
        and coalesce(pri.qty_consumed, 0) = 0
        and coalesce(pri.qty_returned, 0) = 0
        and pri.po_id is null;
      if found then
        v_updated_count := v_updated_count + 1;
      end if;
    end if;
  end loop;

  perform set_config(
    'app.parts_lifecycle_reconciling', v_previous_lifecycle_guard, true
  );
  perform public.parts_reconcile_request_lifecycle(v_request.id);
  select * into v_request
  from public.part_requests
  where id = v_request.id
  for update;

  -- The pre-approval guard intentionally blocks a work-order part from being
  -- operationally linked until the line/request is approved.
  if public.parts_request_is_operationally_released(v_request.id) then
    update public.work_order_parts wop
    set source_parts_request_id = v_request.id,
        source_parts_request_item_id = pri.id,
        updated_at = now()
    from public.part_request_items pri
    where pri.request_id = v_request.id
      and pri.source_work_order_part_id = wop.id
      and wop.shop_id = p_shop_id
      and wop.work_order_id = p_work_order_id
      and wop.work_order_line_id = p_work_order_line_id
      and (
        wop.source_parts_request_id is distinct from v_request.id
        or wop.source_parts_request_item_id is distinct from pri.id
      );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'requestId', v_request.id,
    'requestStatus', v_request.status,
    'stage', public.parts_request_operational_stage(v_request.id),
    'partCount', v_part_count,
    'createdItemCount', v_created_count,
    'updatedItemCount', v_updated_count
  );
  return public.parts_complete_operation(v_operation.id, v_result);
exception when others then
  perform set_config(
    'app.parts_lifecycle_reconciling', v_previous_lifecycle_guard, true
  );
  raise;
end;
$$;

revoke all on function public.parts_request_work_order_line_atomic(
  uuid, uuid, uuid, text, uuid
) from public, anon;
grant execute on function public.parts_request_work_order_line_atomic(
  uuid, uuid, uuid, text, uuid
) to authenticated, service_role;

-- Approval is the release boundary. Existing requests reconcile first; this
-- trigger then creates/synchronizes a request if the line only had quote parts.
create or replace function public.trg_parts_auto_release_approved_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_guard text :=
    coalesce(current_setting('app.parts_line_auto_releasing', true), '0');
  v_approved boolean;
begin
  v_approved := (
    lower(coalesce(new.approval_state::text, '')) = 'approved'
    or lower(coalesce(new.line_status::text, '')) = 'authorized'
  );
  if not v_approved or new.shop_id is null or new.work_order_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.work_order_parts wop
    where wop.shop_id = new.shop_id
      and wop.work_order_id = new.work_order_id
      and wop.work_order_line_id = new.id
      and coalesce(wop.is_active, true)
      and greatest(
        coalesce(wop.quantity_requested, 0),
        coalesce(wop.quantity, 0),
        0
      ) > 0
  ) then
    return new;
  end if;

  perform set_config('app.parts_line_auto_releasing', '1', true);
  perform public.parts_request_work_order_line_atomic(
    new.shop_id,
    new.work_order_id,
    new.id,
    new.shop_id::text || ':line-auto-release:approval:' || new.id::text,
    auth.uid()
  );
  perform set_config('app.parts_line_auto_releasing', v_previous_guard, true);
  return new;
exception when others then
  perform set_config('app.parts_line_auto_releasing', v_previous_guard, true);
  raise;
end;
$$;

drop trigger if exists trg_parts_auto_release_approved_line
  on public.work_order_lines;
create trigger trg_parts_auto_release_approved_line
after insert or update of approval_state, line_status
on public.work_order_lines
for each row
execute function public.trg_parts_auto_release_approved_line();

-- Parts added to an already-approved menu/repair line should enter the same
-- Pick/Order queue without another user-to-user request.
create or replace function public.trg_parts_auto_release_approved_line_part()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_previous_guard text :=
    coalesce(current_setting('app.parts_line_auto_releasing', true), '0');
  v_signature text;
begin
  if new.shop_id is null or new.work_order_id is null
     or new.work_order_line_id is null or not coalesce(new.is_active, true) then
    return new;
  end if;

  select * into v_line
  from public.work_order_lines
  where id = new.work_order_line_id
    and shop_id = new.shop_id
    and work_order_id = new.work_order_id;
  if not found or not (
    lower(coalesce(v_line.approval_state::text, '')) = 'approved'
    or lower(coalesce(v_line.line_status::text, '')) = 'authorized'
  ) then
    return new;
  end if;

  v_signature := md5(concat_ws('|',
    new.id::text,
    coalesce(new.part_id::text, ''),
    coalesce(new.quantity::text, ''),
    coalesce(new.quantity_requested::text, ''),
    coalesce(new.unit_price::text, ''),
    coalesce(new.unit_sell_price_snapshot::text, ''),
    coalesce(new.is_active::text, '')
  ));

  perform set_config('app.parts_line_auto_releasing', '1', true);
  perform public.parts_request_work_order_line_atomic(
    new.shop_id,
    new.work_order_id,
    new.work_order_line_id,
    new.shop_id::text || ':line-auto-release:part:'
      || new.id::text || ':' || v_signature,
    auth.uid()
  );
  perform set_config('app.parts_line_auto_releasing', v_previous_guard, true);
  return new;
exception when others then
  perform set_config('app.parts_line_auto_releasing', v_previous_guard, true);
  raise;
end;
$$;

drop trigger if exists trg_parts_auto_release_approved_line_part
  on public.work_order_parts;
create trigger trg_parts_auto_release_approved_line_part
after insert or update of part_id, quantity, quantity_requested, unit_price,
  unit_sell_price_snapshot, is_active, work_order_line_id
on public.work_order_parts
for each row
execute function public.trg_parts_auto_release_approved_line_part();

-- Mirror the Parts fulfillment boundary onto the repair line so the work order
-- tells the same story as the Parts queue. The request stage remains the source
-- of truth; this projection only marks the line waiting or active.
create or replace function public.parts_sync_work_order_line_fulfillment_status(
  p_request_id uuid,
  p_stage text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.part_requests%rowtype;
  v_line_id uuid;
begin
  select * into v_request
  from public.part_requests
  where id = p_request_id;
  if not found then return; end if;

  v_line_id := v_request.job_id;
  if v_line_id is null then
    select pri.work_order_line_id into v_line_id
    from public.part_request_items pri
    where pri.request_id = p_request_id
      and pri.work_order_line_id is not null
    order by pri.created_at, pri.id
    limit 1;
  end if;
  if v_line_id is null then return; end if;

  if p_stage = 'order_receive' then
    update public.work_order_lines
    set status = 'waiting_parts',
        hold_reason = coalesce(
          nullif(trim(hold_reason), ''), 'Awaiting parts'
        ),
        updated_at = now()
    where id = v_line_id
      and shop_id = v_request.shop_id
      and work_order_id = v_request.work_order_id
      and lower(coalesce(status::text, '')) in (
        'awaiting', 'active', 'on_hold', 'waiting_parts'
      );
  elsif p_stage = 'ready_for_tech' then
    update public.work_order_lines
    set status = 'active',
        hold_reason = case
          when lower(trim(coalesce(hold_reason, ''))) = 'awaiting parts'
            then null
          else hold_reason
        end,
        updated_at = now()
    where id = v_line_id
      and shop_id = v_request.shop_id
      and work_order_id = v_request.work_order_id
      and lower(coalesce(status::text, '')) = 'waiting_parts';
  end if;
end;
$$;

revoke all on function public.parts_sync_work_order_line_fulfillment_status(
  uuid, text
) from public, anon, authenticated;

-- Keep technician notices user-scoped. Parts still receives its existing
-- shop-scoped parts_workflow notice; the assigned technician gets a separate
-- notification only after every approved quantity is staged.
create or replace function public.parts_sync_technician_ready_notification(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.part_requests%rowtype;
  v_stage text;
  v_work_order_label text;
  v_line_id uuid;
  v_technician_id uuid;
  v_now timestamptz := now();
  v_fingerprint text;
begin
  select * into v_request
  from public.part_requests
  where id = p_request_id;
  if not found then
    return;
  end if;

  v_stage := public.parts_request_operational_stage(p_request_id);
  perform public.parts_sync_work_order_line_fulfillment_status(
    p_request_id, v_stage
  );
  update public.assistant_notifications
  set status = 'resolved',
      resolved_at = coalesce(resolved_at, v_now),
      updated_at = v_now
  where shop_id = v_request.shop_id
    and source = 'parts_tech_workflow'
    and entity_type = 'part_request'
    and entity_id = p_request_id
    and lower(coalesce(status, 'active')) in (
      'active', 'open', 'acknowledged'
    );

  if v_stage <> 'ready_for_tech' then
    return;
  end if;

  select coalesce(nullif(trim(wo.custom_id), ''), wo.id::text)
  into v_work_order_label
  from public.work_orders wo
  where wo.id = v_request.work_order_id;

  v_line_id := v_request.job_id;
  if v_line_id is null then
    select pri.work_order_line_id into v_line_id
    from public.part_request_items pri
    where pri.request_id = p_request_id
      and pri.work_order_line_id is not null
    order by pri.created_at, pri.id
    limit 1;
  end if;

  for v_technician_id in
    select technician_id
    from (
      select wol.assigned_tech_id as technician_id
      from public.work_order_lines wol
      where wol.id = v_line_id
        and wol.shop_id = v_request.shop_id
      union
      select wolt.technician_id
      from public.work_order_line_technicians wolt
      where wolt.work_order_line_id = v_line_id
    ) assigned
    where technician_id is not null
  loop
    v_fingerprint := 'parts-tech-ready::' || p_request_id::text
      || '::' || v_technician_id::text;
    insert into public.assistant_notifications (
      shop_id, user_id, role, source, fingerprint, code, level,
      title, message, href, entity_type, entity_id, status, metadata,
      first_seen_at, last_seen_at, resolved_at, updated_at
    ) values (
      v_request.shop_id,
      v_technician_id,
      'mechanic',
      'parts_tech_workflow',
      v_fingerprint,
      'parts_ready_for_technician',
      'info',
      'Parts ready for your job',
      format('%s has every approved part staged and ready.',
        coalesce(v_work_order_label, 'Work order')),
      '/work-orders/' || v_request.work_order_id::text
        || case when v_line_id is null then ''
          else '?line=' || v_line_id::text end,
      'part_request',
      p_request_id,
      'active',
      jsonb_build_object(
        'requestId', p_request_id,
        'workOrderId', v_request.work_order_id,
        'workOrderLineId', v_line_id,
        'stage', v_stage
      ),
      v_now, v_now, null, v_now
    )
    on conflict (shop_id, fingerprint)
    do update set
      user_id = excluded.user_id,
      role = excluded.role,
      code = excluded.code,
      level = excluded.level,
      title = excluded.title,
      message = excluded.message,
      href = excluded.href,
      status = 'active',
      metadata = excluded.metadata,
      last_seen_at = excluded.last_seen_at,
      resolved_at = null,
      updated_at = excluded.updated_at;
  end loop;
end;
$$;

revoke all on function public.parts_sync_technician_ready_notification(uuid)
  from public, anon, authenticated;

create or replace function public.trg_parts_sync_technician_ready_from_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.parts_sync_technician_ready_notification(
    case when tg_op = 'DELETE' then old.request_id else new.request_id end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_zz_parts_sync_technician_ready_from_item
  on public.part_request_items;
create trigger trg_zz_parts_sync_technician_ready_from_item
after insert or update of qty_approved, qty_reserved, qty_consumed,
  qty_returned, status or delete
on public.part_request_items
for each row
execute function public.trg_parts_sync_technician_ready_from_item();

create or replace function public.trg_parts_sync_technician_ready_from_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.parts_sync_technician_ready_notification(new.id);
  return new;
end;
$$;

drop trigger if exists trg_zz_parts_sync_technician_ready_from_request
  on public.part_requests;
create trigger trg_zz_parts_sync_technician_ready_from_request
after insert or update of status, job_id, handoff_completed_at
on public.part_requests
for each row
execute function public.trg_parts_sync_technician_ready_from_request();

-- Reconcile already-approved active lines without duplicating existing work.
do $$
declare
  v_line record;
  v_previous_guard text :=
    coalesce(current_setting('app.parts_line_auto_releasing', true), '0');
begin
  perform set_config('app.parts_line_auto_releasing', '1', true);
  for v_line in
    select wol.id, wol.shop_id, wol.work_order_id
    from public.work_order_lines wol
    where (
      lower(coalesce(wol.approval_state::text, '')) = 'approved'
      or lower(coalesce(wol.line_status::text, '')) = 'authorized'
    )
      and not public.work_order_is_financially_locked(
        wol.shop_id, wol.work_order_id
      )
      and exists (
        select 1
        from public.work_order_parts wop
        where wop.shop_id = wol.shop_id
          and wop.work_order_id = wol.work_order_id
          and wop.work_order_line_id = wol.id
          and coalesce(wop.is_active, true)
      )
    order by wol.id
  loop
    perform public.parts_request_work_order_line_atomic(
      v_line.shop_id,
      v_line.work_order_id,
      v_line.id,
      v_line.shop_id::text || ':line-auto-release:backfill:'
        || v_line.id::text,
      null
    );
  end loop;
  perform set_config('app.parts_line_auto_releasing', v_previous_guard, true);
exception when others then
  perform set_config('app.parts_line_auto_releasing', v_previous_guard, true);
  raise;
end $$;

notify pgrst, 'reload schema';

commit;
