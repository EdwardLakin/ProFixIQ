begin;

alter table public.part_requests
  add column if not exists handoff_completed_at timestamptz,
  add column if not exists handoff_completed_by uuid references auth.users(id) on delete set null;

comment on column public.part_requests.handoff_completed_at is
  'When Parts explicitly handed every staged request item to the technician. This is the active-to-completed boundary.';
comment on column public.part_requests.handoff_completed_by is
  'Authenticated Parts operator who completed the staged-parts handoff.';

create index if not exists idx_part_requests_shop_active_work_order
  on public.part_requests (shop_id, work_order_id, status, created_at desc);

-- Quote-origin parts were historically allowed to attach to an arbitrary work-order
-- line before approval. That creates PART_RELINK_CONFLICT at the canonical approval
-- boundary. Repair only records with no PO, allocation, receipt, issue, or return.
drop trigger if exists trg_prevent_part_request_item_anchor_changes
  on public.part_request_items;

update public.part_request_items pri
set work_order_line_id = q.work_order_line_id,
    updated_at = now()
from public.work_order_quote_lines q
where pri.quote_line_id = q.id
  and q.work_order_line_id is not null
  and pri.work_order_line_id is distinct from q.work_order_line_id
  and coalesce(pri.qty_ordered, 0) = 0
  and coalesce(pri.qty_received, 0) = 0
  and coalesce(pri.qty_reserved, 0) = 0
  and coalesce(pri.qty_consumed, 0) = 0
  and coalesce(pri.qty_returned, 0) = 0
  and pri.po_id is null
  and lower(coalesce(pri.status::text, 'requested')) in (
    'requested', 'quoted', 'awaiting_customer_approval', 'approved'
  )
  and not exists (
    select 1
    from public.purchase_order_lines pol
    where pol.part_request_item_id = pri.id
  );

update public.part_requests pr
set job_id = q.work_order_line_id
from public.work_order_quote_lines q
where pr.quote_line_id = q.id
  and q.work_order_line_id is not null
  and pr.job_id is distinct from q.work_order_line_id
  and lower(coalesce(pr.status::text, 'requested')) in ('requested', 'quoted', 'approved')
  and not exists (
    select 1
    from public.part_request_items pri
    where pri.request_id = pr.id
      and (
        coalesce(pri.qty_ordered, 0) > 0
        or coalesce(pri.qty_received, 0) > 0
        or coalesce(pri.qty_reserved, 0) > 0
        or coalesce(pri.qty_consumed, 0) > 0
        or coalesce(pri.qty_returned, 0) > 0
        or pri.po_id is not null
      )
  );

update public.part_request_items pri
set work_order_line_id = null,
    updated_at = now()
from public.work_order_quote_lines q
where pri.quote_line_id = q.id
  and q.work_order_line_id is null
  and pri.work_order_line_id is not null
  and q.approved_at is null
  and lower(coalesce(q.status::text, '')) not in ('approved', 'converted')
  and lower(coalesce(q.stage::text, '')) <> 'customer_approved'
  and coalesce(pri.qty_ordered, 0) = 0
  and coalesce(pri.qty_received, 0) = 0
  and coalesce(pri.qty_reserved, 0) = 0
  and coalesce(pri.qty_consumed, 0) = 0
  and coalesce(pri.qty_returned, 0) = 0
  and pri.po_id is null
  and lower(coalesce(pri.status::text, 'requested')) in (
    'requested', 'quoted', 'awaiting_customer_approval', 'approved'
  )
  and not exists (
    select 1
    from public.purchase_order_lines pol
    where pol.part_request_item_id = pri.id
  );

update public.part_requests pr
set job_id = null
from public.work_order_quote_lines q
where pr.quote_line_id = q.id
  and q.work_order_line_id is null
  and pr.job_id is not null
  and q.approved_at is null
  and lower(coalesce(q.status::text, '')) not in ('approved', 'converted')
  and lower(coalesce(q.stage::text, '')) <> 'customer_approved'
  and lower(coalesce(pr.status::text, 'requested')) in ('requested', 'quoted', 'approved')
  and not exists (
    select 1
    from public.part_request_items pri
    where pri.request_id = pr.id
      and (
        coalesce(pri.qty_ordered, 0) > 0
        or coalesce(pri.qty_received, 0) > 0
        or coalesce(pri.qty_reserved, 0) > 0
        or coalesce(pri.qty_consumed, 0) > 0
        or coalesce(pri.qty_returned, 0) > 0
        or pri.po_id is not null
      )
  );

create or replace function public.prevent_part_request_item_anchor_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_line_id uuid;
begin
  if new.shop_id is distinct from old.shop_id then
    raise exception 'part_request_items.shop_id cannot be changed';
  end if;
  if new.request_id is distinct from old.request_id then
    raise exception 'part_request_items.request_id cannot be changed';
  end if;
  if new.work_order_id is distinct from old.work_order_id then
    raise exception 'part_request_items.work_order_id cannot be changed';
  end if;
  if new.quote_line_id is distinct from old.quote_line_id then
    raise exception 'part_request_items.quote_line_id cannot be changed';
  end if;

  if new.work_order_line_id is distinct from old.work_order_line_id then
    select coalesce(new.quote_line_id, pr.quote_line_id)
      into v_quote_line_id
    from public.part_requests pr
    where pr.id = new.request_id;

    -- The only legal anchor transition is the one-time materialization of a
    -- quote-origin item onto the line created from that same quote line.
    if old.work_order_line_id is not null
       or new.work_order_line_id is null
       or v_quote_line_id is null
       or not exists (
         select 1
         from public.work_order_lines wol
         where wol.id = new.work_order_line_id
           and wol.shop_id = new.shop_id
           and wol.work_order_id = new.work_order_id
           and (
             wol.source_row_id = v_quote_line_id
             or wol.external_id = 'quote_line:' || v_quote_line_id::text
           )
       ) then
      raise exception 'part_request_items.work_order_line_id cannot be changed';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_prevent_part_request_item_anchor_changes
before update on public.part_request_items
for each row
execute function public.prevent_part_request_item_anchor_changes();

-- Operational mutations are legal only after the parent request has crossed the
-- approval boundary. These guards cover legacy screens and direct RPC callers,
-- not only the redesigned queue.
create or replace function public.parts_request_is_operationally_released(
  p_request_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.part_requests pr
    where pr.id = p_request_id
      and lower(pr.status::text) in (
        'approved', 'partially_ordered', 'partially_consumed',
        'partially_returned', 'fulfilled', 'returned'
      )
  );
$$;

create or replace function public.trg_parts_require_request_release_for_item_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    (new.po_id is not null and new.po_id is distinct from old.po_id)
    or coalesce(new.qty_ordered, 0) > coalesce(old.qty_ordered, 0)
    or coalesce(new.qty_received, 0) > coalesce(old.qty_received, 0)
    or coalesce(new.qty_reserved, 0) > coalesce(old.qty_reserved, 0)
    or coalesce(new.qty_consumed, 0) > coalesce(old.qty_consumed, 0)
  ) and not public.parts_request_is_operationally_released(new.request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_APPROVAL_REQUIRED',
      detail = 'Ordering, receiving, allocation, and issue are blocked until the linked work-order line is approved.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parts_require_request_release_for_item_operation
  on public.part_request_items;
create trigger trg_parts_require_request_release_for_item_operation
before update of po_id, qty_ordered, qty_received, qty_reserved, qty_consumed
on public.part_request_items
for each row
execute function public.trg_parts_require_request_release_for_item_operation();

create or replace function public.trg_parts_require_request_release_for_wop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if new.source_parts_request_item_id is null then
    return new;
  end if;

  select pri.request_id into v_request_id
  from public.part_request_items pri
  where pri.id = new.source_parts_request_item_id
    and pri.shop_id = new.shop_id;
  if not found then
    raise exception 'Source parts request item is not available for this shop.';
  end if;
  if not public.parts_request_is_operationally_released(v_request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_APPROVAL_REQUIRED',
      detail = 'A quoted request cannot materialize work-order parts before approval.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parts_require_request_release_for_wop
  on public.work_order_parts;
create trigger trg_parts_require_request_release_for_wop
before insert or update of source_parts_request_item_id, shop_id
on public.work_order_parts
for each row
execute function public.trg_parts_require_request_release_for_wop();

create or replace function public.trg_parts_require_request_release_for_po_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if new.part_request_item_id is null then
    return new;
  end if;
  if TG_OP = 'UPDATE'
     and new.part_request_item_id is not distinct from old.part_request_item_id
     and new.po_id is not distinct from old.po_id
     and coalesce(new.qty, 0) <= coalesce(old.qty, 0) then
    return new;
  end if;

  select pri.request_id into v_request_id
  from public.part_request_items pri
  join public.purchase_orders po on po.id = new.po_id
  where pri.id = new.part_request_item_id
    and pri.shop_id = po.shop_id;
  if not found then
    raise exception 'Purchase-order request item is not available for this PO shop.';
  end if;
  if not public.parts_request_is_operationally_released(v_request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_APPROVAL_REQUIRED',
      detail = 'Purchase-order lines cannot be created or increased before approval.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parts_require_request_release_for_po_line
  on public.purchase_order_lines;
create trigger trg_parts_require_request_release_for_po_line
before insert or update of part_request_item_id, po_id, qty
on public.purchase_order_lines
for each row
execute function public.trg_parts_require_request_release_for_po_line();

create or replace function public.trg_parts_require_request_release_for_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if TG_OP = 'UPDATE'
     and new.work_order_part_id is not distinct from old.work_order_part_id
     and new.shop_id is not distinct from old.shop_id
     and coalesce(new.qty, 0) <= coalesce(old.qty, 0) then
    return new;
  end if;

  select pri.request_id into v_request_id
  from public.work_order_parts wop
  join public.part_request_items pri
    on pri.id = wop.source_parts_request_item_id
  where wop.id = new.work_order_part_id
    and wop.shop_id = new.shop_id
    and pri.shop_id = new.shop_id;

  if v_request_id is null and exists (
    select 1
    from public.work_order_parts wop
    where wop.id = new.work_order_part_id
      and wop.source_parts_request_item_id is not null
  ) then
    raise exception 'Allocated request item is not available for this shop.';
  end if;
  if v_request_id is not null
     and not public.parts_request_is_operationally_released(v_request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_APPROVAL_REQUIRED',
      detail = 'Stock cannot be allocated to a parts request before approval.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parts_require_request_release_for_allocation
  on public.work_order_part_allocations;
create trigger trg_parts_require_request_release_for_allocation
before insert or update of work_order_part_id, shop_id, qty
on public.work_order_part_allocations
for each row
execute function public.trg_parts_require_request_release_for_allocation();

revoke all on function public.parts_request_is_operationally_released(uuid)
  from public, anon, authenticated;

create or replace function public.trg_parts_protect_handoff_boundary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lifecycle_write boolean :=
    current_setting('app.parts_lifecycle_reconciling', true) = '1';
  v_handoff_write boolean :=
    current_setting('app.parts_handoff_completing', true) = '1';
begin
  if (
    (lower(new.status::text) = 'fulfilled' and lower(old.status::text) <> 'fulfilled')
    or new.handoff_completed_at is distinct from old.handoff_completed_at
    or new.handoff_completed_by is distinct from old.handoff_completed_by
  ) and not v_lifecycle_write and not v_handoff_write then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_HANDOFF_REQUIRED',
      detail = 'Use the idempotent Parts handoff command to complete a request.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parts_protect_handoff_boundary
  on public.part_requests;
create trigger trg_parts_protect_handoff_boundary
before update of status, handoff_completed_at, handoff_completed_by
on public.part_requests
for each row
execute function public.trg_parts_protect_handoff_boundary();

create or replace function public.parts_request_operational_stage(
  p_request_id uuid
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_request public.part_requests%rowtype;
  v_item_count integer := 0;
  v_all_priced boolean := false;
  v_all_staged boolean := false;
  v_all_handed_off boolean := false;
begin
  select * into v_request
  from public.part_requests
  where id = p_request_id;

  if not found then
    return 'completed';
  end if;

  if lower(v_request.status::text) in ('fulfilled', 'rejected', 'cancelled', 'deferred', 'returned')
     or v_request.handoff_completed_at is not null then
    return 'completed';
  end if;

  select
    count(*),
    coalesce(bool_and(
      nullif(trim(pri.description), '') is not null
      and pri.part_id is not null
      and greatest(
        coalesce(pri.qty_requested, 0), coalesce(pri.qty, 0), 0
      ) > 0
      and coalesce(pri.quoted_price, pri.unit_price) is not null
    ), false),
    coalesce(bool_and(
      coalesce(pri.qty_reserved, 0)
        + greatest(coalesce(pri.qty_consumed, 0) - coalesce(pri.qty_returned, 0), 0)
      >= greatest(
        coalesce(pri.qty_approved, 0), coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0), 0
      )
    ), false),
    coalesce(bool_and(
      greatest(coalesce(pri.qty_consumed, 0) - coalesce(pri.qty_returned, 0), 0)
      >= greatest(
        coalesce(pri.qty_approved, 0), coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0), 0
      )
    ), false)
  into v_item_count, v_all_priced, v_all_staged, v_all_handed_off
  from public.part_request_items pri
  where pri.request_id = p_request_id
    and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled';

  if v_item_count = 0 or not v_all_priced then
    return 'needs_quote';
  end if;
  if v_all_handed_off then
    return 'completed';
  end if;
  if lower(v_request.status::text) in ('requested', 'quoted') then
    return 'awaiting_approval';
  end if;
  if v_all_staged then
    return 'ready_for_tech';
  end if;
  return 'order_receive';
end;
$$;

create or replace function public.parts_publish_request_notification(
  p_request_id uuid,
  p_stage text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.part_requests%rowtype;
  v_work_order_label text;
  v_item_count integer := 0;
  v_fingerprint text;
  v_code text;
  v_title text;
  v_message text;
  v_level text := 'info';
  v_href text;
  v_now timestamptz := now();
  v_existing_count integer := 0;
begin
  select pr, coalesce(nullif(trim(wo.custom_id), ''), wo.id::text)
    into v_request, v_work_order_label
  from public.part_requests pr
  left join public.work_orders wo on wo.id = pr.work_order_id
  where pr.id = p_request_id;

  if not found then
    return;
  end if;

  select count(*) into v_item_count
  from public.part_request_items
  where request_id = p_request_id
    and lower(coalesce(status::text, 'requested')) <> 'cancelled';

  v_fingerprint := 'parts-workflow::' || p_request_id::text || '::' || p_stage;
  v_href := '/parts/requests/' || coalesce(v_work_order_label, v_request.work_order_id::text, p_request_id::text);

  update public.assistant_notifications
  set status = 'resolved',
      resolved_at = coalesce(resolved_at, v_now),
      updated_at = v_now
  where shop_id = v_request.shop_id
    and source = 'parts_workflow'
    and entity_type = 'part_request'
    and entity_id = p_request_id
    and fingerprint <> v_fingerprint
    and lower(coalesce(status, 'active')) in ('active', 'open', 'acknowledged');

  if p_stage = 'completed' then
    return;
  elsif p_stage = 'needs_quote' then
    v_code := 'parts_request_needs_quote';
    v_title := 'New parts request';
    v_message := format('%s needs pricing for %s part item%s.',
      coalesce(v_work_order_label, 'Work order'), v_item_count,
      case when v_item_count = 1 then '' else 's' end);
  elsif p_stage = 'awaiting_approval' then
    v_code := 'parts_quote_awaiting_approval';
    v_title := 'Parts quote awaiting approval';
    v_message := format('%s is fully priced and waiting for a customer decision.',
      coalesce(v_work_order_label, 'Work order'));
  elsif p_stage = 'ready_for_tech' then
    v_code := 'parts_ready_for_handoff';
    v_title := 'Parts ready for technician';
    v_message := format('%s has all approved parts staged. Complete the technician handoff.',
      coalesce(v_work_order_label, 'Work order'));
  else
    v_code := 'parts_approved_action_required';
    v_title := 'Approved parts need action';
    v_message := format('%s is approved. Pick and allocate stock, or order the shortage.',
      coalesce(v_work_order_label, 'Work order'));
    v_level := 'warning';
  end if;

  update public.assistant_notifications
  set code = v_code,
      level = v_level,
      title = v_title,
      message = v_message,
      href = v_href,
      role = 'parts',
      status = 'active',
      metadata = jsonb_build_object(
        'stage', p_stage,
        'requestId', p_request_id,
        'workOrderId', v_request.work_order_id,
        'itemCount', v_item_count
      ),
      last_seen_at = v_now,
      resolved_at = null,
      updated_at = v_now
  where shop_id = v_request.shop_id
    and source = 'parts_workflow'
    and fingerprint = v_fingerprint;
  get diagnostics v_existing_count = row_count;

  if v_existing_count = 0 then
    insert into public.assistant_notifications (
      shop_id, user_id, role, source, fingerprint, code, level,
      title, message, href, entity_type, entity_id, status, metadata,
      first_seen_at, last_seen_at, resolved_at, updated_at
    ) values (
      v_request.shop_id, null, 'parts', 'parts_workflow', v_fingerprint,
      v_code, v_level, v_title, v_message, v_href, 'part_request',
      p_request_id, 'active', jsonb_build_object(
      'stage', p_stage,
      'requestId', p_request_id,
      'workOrderId', v_request.work_order_id,
      'itemCount', v_item_count
      ), v_now, v_now, null, v_now
    );
  end if;
end;
$$;

create or replace function public.parts_reconcile_request_lifecycle(
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.part_requests%rowtype;
  v_quote_status text := '';
  v_quote_stage text := '';
  v_quote_approved boolean := false;
  v_quote_declined boolean := false;
  v_quote_deferred boolean := false;
  v_line_approved boolean := false;
  v_item_count integer := 0;
  v_all_priced boolean := false;
  v_all_handed_off boolean := false;
  v_old_stage text;
  v_new_stage text;
  v_new_status public.part_request_status;
  v_previous_guard text := coalesce(current_setting('app.parts_lifecycle_reconciling', true), '0');
begin
  select * into v_request
  from public.part_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'request_not_found');
  end if;

  v_old_stage := public.parts_request_operational_stage(p_request_id);
  perform set_config('app.parts_lifecycle_reconciling', '1', true);

  if v_request.quote_line_id is not null then
    select lower(coalesce(q.status::text, '')),
           lower(coalesce(q.stage::text, '')),
           (
             q.approved_at is not null
             or q.work_order_line_id is not null
             or lower(coalesce(q.status::text, '')) in ('approved', 'converted')
             or lower(coalesce(q.stage::text, '')) = 'customer_approved'
           ),
           (
             lower(coalesce(q.status::text, '')) in ('declined', 'rejected', 'cancelled')
             or lower(coalesce(q.stage::text, '')) = 'customer_declined'
           ),
           (
             lower(coalesce(q.status::text, '')) = 'deferred'
             or lower(coalesce(q.stage::text, '')) = 'customer_deferred'
           )
      into v_quote_status, v_quote_stage, v_quote_approved,
           v_quote_declined, v_quote_deferred
    from public.work_order_quote_lines q
    where q.id = v_request.quote_line_id
      and q.shop_id = v_request.shop_id
      and q.work_order_id = v_request.work_order_id;
  end if;

  if v_request.job_id is not null then
    select exists (
      select 1
      from public.work_order_lines wol
      where wol.id = v_request.job_id
        and wol.shop_id = v_request.shop_id
        and wol.work_order_id = v_request.work_order_id
        and (
          lower(coalesce(wol.approval_state::text, '')) = 'approved'
          or lower(coalesce(wol.line_status::text, '')) = 'authorized'
        )
    ) into v_line_approved;
  end if;

  select
    count(*),
    coalesce(bool_and(
      nullif(trim(pri.description), '') is not null
      and pri.part_id is not null
      and greatest(
        coalesce(pri.qty_requested, 0), coalesce(pri.qty, 0), 0
      ) > 0
      and coalesce(pri.quoted_price, pri.unit_price) is not null
    ), false),
    coalesce(bool_and(
      greatest(coalesce(pri.qty_consumed, 0) - coalesce(pri.qty_returned, 0), 0)
      >= greatest(
        coalesce(pri.qty_approved, 0), coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0), 0
      )
    ), false)
  into v_item_count, v_all_priced, v_all_handed_off
  from public.part_request_items pri
  where pri.request_id = p_request_id
    and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled';

  if lower(v_request.status::text) in ('fulfilled', 'returned', 'cancelled') then
    v_new_status := v_request.status;
  elsif v_request.handoff_completed_at is not null
        or (v_item_count > 0 and v_all_handed_off) then
    v_new_status := 'fulfilled';
  elsif v_quote_approved then
    v_new_status := 'approved';
  elsif v_quote_declined then
    v_new_status := 'rejected';
  elsif v_quote_deferred then
    v_new_status := 'deferred';
  elsif lower(v_request.status::text) in ('rejected', 'deferred') then
    v_new_status := v_request.status;
  elsif v_line_approved then
    v_new_status := 'approved';
  elsif v_item_count > 0 and v_all_priced then
    v_new_status := 'quoted';
  else
    v_new_status := 'requested';
  end if;

  if v_new_status::text not in ('fulfilled', 'returned') then
    update public.part_request_items pri
    set status = case
          when v_new_status::text in ('rejected', 'cancelled', 'deferred')
            then 'cancelled'::public.part_request_item_status
          when v_new_status::text = 'approved'
            then 'approved'::public.part_request_item_status
          when v_new_status::text = 'quoted'
               and coalesce(pri.quote_line_id, v_request.quote_line_id) is not null
            then 'awaiting_customer_approval'::public.part_request_item_status
          when v_new_status::text = 'quoted'
            then 'quoted'::public.part_request_item_status
          else 'requested'::public.part_request_item_status
        end,
        approved = v_new_status::text = 'approved',
        qty_approved = case
          when v_new_status::text = 'approved'
            then greatest(
              coalesce(pri.qty_approved, 0), coalesce(pri.qty_requested, 0),
              coalesce(pri.qty, 0), 0
            )
          else 0
        end,
        updated_at = now()
    where pri.request_id = p_request_id
      and coalesce(pri.qty_ordered, 0) = 0
      and coalesce(pri.qty_received, 0) = 0
      and coalesce(pri.qty_reserved, 0) = 0
      and coalesce(pri.qty_consumed, 0) = 0
      and coalesce(pri.qty_returned, 0) = 0
      and pri.po_id is null
      and lower(coalesce(pri.status::text, 'requested')) not in (
        'ordered', 'partially_ordered', 'partially_received', 'received',
        'reserved', 'picking', 'picked', 'partially_consumed', 'consumed',
        'partially_returned', 'returned'
      )
      and (
        v_new_status::text in ('approved', 'rejected', 'cancelled', 'deferred', 'requested')
        or (
          v_new_status::text = 'quoted'
          and nullif(trim(pri.description), '') is not null
          and pri.part_id is not null
          and greatest(
            coalesce(pri.qty_requested, 0), coalesce(pri.qty, 0), 0
          ) > 0
          and coalesce(pri.quoted_price, pri.unit_price) is not null
        )
      );
  end if;

  update public.part_requests
  set status = v_new_status,
      handoff_completed_at = case
        when v_new_status::text = 'fulfilled' then coalesce(handoff_completed_at, now())
        else handoff_completed_at
      end,
      handoff_completed_by = case
        when v_new_status::text = 'fulfilled' then coalesce(handoff_completed_by, auth.uid())
        else handoff_completed_by
      end
  where id = p_request_id
    and (
      status is distinct from v_new_status
      or (v_new_status::text = 'fulfilled' and handoff_completed_at is null)
    );

  v_new_stage := public.parts_request_operational_stage(p_request_id);
  perform public.parts_publish_request_notification(p_request_id, v_new_stage);
  perform set_config('app.parts_lifecycle_reconciling', v_previous_guard, true);

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'request_status', v_new_status,
    'previous_stage', v_old_stage,
    'stage', v_new_stage,
    'item_count', v_item_count,
    'all_priced', v_all_priced,
    'approved', v_quote_approved or v_line_approved
  );
exception when others then
  perform set_config('app.parts_lifecycle_reconciling', v_previous_guard, true);
  raise;
end;
$$;

revoke all on function public.parts_request_operational_stage(uuid)
  from public, anon, authenticated;
revoke all on function public.parts_publish_request_notification(uuid,text)
  from public, anon, authenticated;
revoke all on function public.parts_reconcile_request_lifecycle(uuid)
  from public, anon, authenticated;

create or replace function public.trg_parts_reconcile_request_from_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if tg_op = 'DELETE' then
    v_request_id := old.request_id;
  else
    v_request_id := new.request_id;
  end if;
  if current_setting('app.parts_lifecycle_reconciling', true) = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  perform public.parts_reconcile_request_lifecycle(v_request_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_parts_reconcile_request_from_item
  on public.part_request_items;
create trigger trg_parts_reconcile_request_from_item
after insert or update of description, part_id, qty, qty_requested, qty_approved,
  qty_assigned, qty_ordered, qty_received, qty_reserved, qty_consumed,
  qty_returned, quoted_price, unit_price, status, po_id or delete
on public.part_request_items
for each row
execute function public.trg_parts_reconcile_request_from_item();

create or replace function public.trg_parts_reconcile_request_from_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.parts_lifecycle_reconciling', true) = '1' then
    return new;
  end if;
  perform public.parts_reconcile_request_lifecycle(new.id);
  return new;
end;
$$;

drop trigger if exists trg_parts_reconcile_request_from_parent
  on public.part_requests;
create trigger trg_parts_reconcile_request_from_parent
after insert or update of status, job_id, quote_line_id, handoff_completed_at
on public.part_requests
for each row
execute function public.trg_parts_reconcile_request_from_parent();

create or replace function public.trg_parts_reconcile_quote_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if current_setting('app.parts_lifecycle_reconciling', true) = '1' then
    return new;
  end if;
  for v_request_id in
    select id
    from public.part_requests
    where shop_id = new.shop_id
      and work_order_id = new.work_order_id
      and quote_line_id = new.id
    order by id
  loop
    perform public.parts_reconcile_request_lifecycle(v_request_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_parts_reconcile_quote_decision
  on public.work_order_quote_lines;
create trigger trg_parts_reconcile_quote_decision
after update of status, stage, approved_at, declined_at, work_order_line_id
on public.work_order_quote_lines
for each row
execute function public.trg_parts_reconcile_quote_decision();

create or replace function public.trg_parts_reconcile_line_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if current_setting('app.parts_lifecycle_reconciling', true) = '1' then
    return new;
  end if;
  for v_request_id in
    select id
    from public.part_requests
    where shop_id = new.shop_id
      and work_order_id = new.work_order_id
      and job_id = new.id
    order by id
  loop
    perform public.parts_reconcile_request_lifecycle(v_request_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_parts_reconcile_line_approval
  on public.work_order_lines;
create trigger trg_parts_reconcile_line_approval
after update of approval_state, line_status
on public.work_order_lines
for each row
execute function public.trg_parts_reconcile_line_approval();

create table if not exists public.parts_request_handoff_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  request_id uuid not null references public.part_requests(id) on delete cascade,
  operation_key text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, operation_key)
);

alter table public.parts_request_handoff_keys enable row level security;
drop policy if exists parts_request_handoff_keys_shop_select
  on public.parts_request_handoff_keys;
create policy parts_request_handoff_keys_shop_select
  on public.parts_request_handoff_keys
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = parts_request_handoff_keys.shop_id
        and lower(coalesce(p.role::text, '')) in ('owner', 'admin', 'manager', 'parts')
    )
  );

create or replace function public.parts_complete_request_handoff_atomic(
  p_shop_id uuid,
  p_request_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.part_requests%rowtype;
  v_existing jsonb;
  v_existing_request_id uuid;
  v_item record;
  v_wop public.work_order_parts%rowtype;
  v_alloc record;
  v_target numeric;
  v_needed numeric;
  v_issue numeric;
  v_result jsonb;
  v_now timestamptz := coalesce(p_at, now());
  v_previous_handoff_guard text :=
    coalesce(current_setting('app.parts_handoff_completing', true), '0');
begin
  if nullif(trim(p_operation_key), '') is null then
    raise exception 'A stable operation key is required.';
  end if;
  if length(p_operation_key) > 300 then
    raise exception 'Parts handoff operation key is too long.';
  end if;
  if position(
    p_shop_id::text || ':parts-handoff:' || p_request_id::text || ':'
    in p_operation_key
  ) <> 1 then
    raise exception 'Parts handoff operation key must be scoped to its shop and request.';
  end if;
  if auth.uid() is null or auth.uid() <> p_actor_user_id then
    raise exception 'Parts handoff actor mismatch.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_user_id
      and p.shop_id = p_shop_id
      and lower(coalesce(p.role::text, '')) in ('owner', 'admin', 'manager', 'parts')
  ) then
    raise exception 'Parts handoff actor is not authorized.';
  end if;

  select request_id, result into v_existing_request_id, v_existing
  from public.parts_request_handoff_keys
  where shop_id = p_shop_id
    and operation_key = p_operation_key
  for update;
  if found then
    if v_existing_request_id <> p_request_id then
      raise exception 'Parts handoff operation key belongs to another request.';
    end if;
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_request
  from public.part_requests
  where id = p_request_id
    and shop_id = p_shop_id
  for update;
  if not found then
    raise exception 'Parts request not found for shop.';
  end if;

  -- A simultaneous retry can pass the first absent-key check while waiting for
  -- this request lock. Re-check after the lock so the retry returns the durable
  -- first result instead of colliding on the unique key at commit.
  select request_id, result into v_existing_request_id, v_existing
  from public.parts_request_handoff_keys
  where shop_id = p_shop_id
    and operation_key = p_operation_key
  for update;
  if found then
    if v_existing_request_id <> p_request_id then
      raise exception 'Parts handoff operation key belongs to another request.';
    end if;
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  perform public.parts_reconcile_request_lifecycle(p_request_id);
  select * into v_request from public.part_requests where id = p_request_id for update;

  if lower(v_request.status::text) = 'fulfilled' then
    v_result := jsonb_build_object(
      'ok', true, 'idempotent', true, 'request_id', p_request_id,
      'status', 'fulfilled', 'handoff_completed_at', v_request.handoff_completed_at
    );
  else
    if public.parts_request_operational_stage(p_request_id) <> 'ready_for_tech' then
      raise exception 'Request is not ready for handoff. Every approved item must be staged first.';
    end if;

    for v_item in
      select pri.*
      from public.part_request_items pri
      where pri.request_id = p_request_id
        and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled'
      order by pri.id
      for update
    loop
      v_target := greatest(
        coalesce(v_item.qty_approved, 0), coalesce(v_item.qty_requested, 0),
        coalesce(v_item.qty, 0), 0
      );
      v_needed := greatest(v_target - greatest(
        coalesce(v_item.qty_consumed, 0) - coalesce(v_item.qty_returned, 0), 0
      ), 0);
      if v_needed <= 0 then
        continue;
      end if;

      select * into v_wop
      from public.work_order_parts
      where source_parts_request_item_id = v_item.id
        and shop_id = p_shop_id
        and is_active
      order by updated_at desc, id desc
      limit 1
      for update;
      if not found then
        raise exception 'Staged work-order part is missing for request item %.', v_item.id;
      end if;

      for v_alloc in
        select id, location_id, qty
        from public.work_order_part_allocations
        where work_order_part_id = v_wop.id
          and qty > 0
        order by id
      loop
        exit when v_needed <= 0;
        v_issue := least(v_needed, v_alloc.qty);
        perform public.parts_issue_work_order_part(
          v_wop.id,
          v_alloc.location_id,
          v_issue,
          p_operation_key || ':allocation:' || v_alloc.id::text
        );
        v_needed := v_needed - v_issue;
      end loop;

      if v_needed > 0 then
        raise exception 'Staged allocation is incomplete for request item %.', v_item.id;
      end if;
    end loop;

    perform set_config('app.parts_handoff_completing', '1', true);
    update public.part_requests
    set status = 'fulfilled',
        handoff_completed_at = coalesce(handoff_completed_at, v_now),
        handoff_completed_by = coalesce(handoff_completed_by, p_actor_user_id)
    where id = p_request_id;
    perform set_config(
      'app.parts_handoff_completing', v_previous_handoff_guard, true
    );
    perform public.parts_reconcile_request_lifecycle(p_request_id);

    v_result := jsonb_build_object(
      'ok', true, 'idempotent', false, 'request_id', p_request_id,
      'status', 'fulfilled', 'handoff_completed_at', v_now
    );
  end if;

  insert into public.parts_request_handoff_keys (
    shop_id, request_id, operation_key, actor_user_id, result
  ) values (
    p_shop_id, p_request_id, p_operation_key, p_actor_user_id, v_result
  );
  return v_result;
exception when others then
  perform set_config(
    'app.parts_handoff_completing', v_previous_handoff_guard, true
  );
  raise;
end;
$$;

revoke all on function public.parts_complete_request_handoff_atomic(uuid,uuid,uuid,text,timestamptz)
  from public, anon;
grant execute on function public.parts_complete_request_handoff_atomic(uuid,uuid,uuid,text,timestamptz)
  to authenticated;

-- Harden the request creator and make direct requests inherit the approval state
-- of their real work-order line. Quote-origin requests continue to start requested.
create or replace function public.create_part_request_with_items(
  p_work_order_id uuid,
  p_items jsonb,
  p_job_id text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_actor_id uuid := auth.uid();
  v_request_id uuid;
  v_job_id uuid;
  v_preapproved boolean := false;
  v_item jsonb;
  v_description text;
  v_part_number text;
  v_manufacturer text;
  v_qty numeric;
begin
  select wo.shop_id into v_shop_id
  from public.work_orders wo
  where wo.id = p_work_order_id;
  if v_shop_id is null then
    raise exception 'Work order not found or missing shop_id';
  end if;

  if auth.role() <> 'service_role' and not exists (
    select 1
    from public.profiles p
    where p.id = v_actor_id
      and p.shop_id = v_shop_id
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
        'mechanic', 'tech', 'technician', 'lead_hand', 'foreman'
      )
  ) then
    raise exception 'Parts request actor is not authorized for this shop.';
  end if;

  if nullif(trim(coalesce(p_job_id, '')), '') is not null then
    if trim(p_job_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Invalid work-order line id.';
    end if;
    v_job_id := trim(p_job_id)::uuid;
    select (
      lower(coalesce(wol.approval_state::text, '')) = 'approved'
      or lower(coalesce(wol.line_status::text, '')) = 'authorized'
    ) into v_preapproved
    from public.work_order_lines wol
    where wol.id = v_job_id
      and wol.shop_id = v_shop_id
      and wol.work_order_id = p_work_order_id;
    if not found then
      raise exception 'Work-order line not found for this work order and shop.';
    end if;
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one parts request item is required.';
  end if;

  insert into public.part_requests (
    work_order_id, shop_id, job_id, notes, status, requested_by
  ) values (
    p_work_order_id, v_shop_id, v_job_id, nullif(trim(coalesce(p_notes, '')), ''),
    case when v_preapproved then 'approved'::public.part_request_status
         else 'requested'::public.part_request_status end,
    v_actor_id
  ) returning id into v_request_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(coalesce(v_item->>'description', ''));
    v_part_number := nullif(btrim(coalesce(
      v_item->>'partNumber', v_item->>'requested_part_number', ''
    )), '');
    v_manufacturer := nullif(btrim(coalesce(
      v_item->>'manufacturer', v_item->>'requested_manufacturer', ''
    )), '');
    v_qty := greatest(1, coalesce(nullif(v_item->>'qty', '')::numeric, 1));

    if v_description <> '' then
      insert into public.part_request_items (
        request_id, shop_id, work_order_id, work_order_line_id,
        description, qty, qty_requested, qty_approved,
        requested_part_number, requested_manufacturer, status, approved
      ) values (
        v_request_id, v_shop_id, p_work_order_id, v_job_id,
        v_description, v_qty, v_qty, case when v_preapproved then v_qty else 0 end,
        v_part_number, v_manufacturer,
        case when v_preapproved then 'approved'::public.part_request_item_status
             else 'requested'::public.part_request_item_status end,
        v_preapproved
      );
    end if;
  end loop;

  if not exists (
    select 1 from public.part_request_items where request_id = v_request_id
  ) then
    raise exception 'No valid parts request items were supplied.';
  end if;

  perform public.parts_reconcile_request_lifecycle(v_request_id);
  return v_request_id;
end;
$$;

revoke all on function public.create_part_request_with_items(uuid,jsonb,text,text)
  from public, anon;
grant execute on function public.create_part_request_with_items(uuid,jsonb,text,text)
  to authenticated, service_role;

-- Reconcile existing active data and create one current, deduplicated Parts notice.
do $$
declare
  v_request_id uuid;
begin
  for v_request_id in
    select id
    from public.part_requests
    where lower(status::text) not in ('fulfilled', 'rejected', 'cancelled', 'deferred', 'returned')
    order by id
  loop
    perform public.parts_reconcile_request_lifecycle(v_request_id);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'part_requests'
    ) then
      alter publication supabase_realtime add table public.part_requests;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'part_request_items'
    ) then
      alter publication supabase_realtime add table public.part_request_items;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
