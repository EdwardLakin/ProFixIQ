begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- P0 security cleanup -------------------------------------------------------

-- The text job-id overload is the guarded runtime API. The older uuid
-- overload predates tenant authorization and must not remain callable. DROP is
-- intentionally idempotent and removes the overload's grants with the object.
drop function if exists public.create_part_request_with_items(uuid, jsonb, uuid, text);

-- These relations were reachable through the Data API with RLS disabled.
-- Backup and operation-ledger rows are internal-only. Shop membership remains
-- available through explicit, non-recursive tenant policies.
alter table public.parts_backup_20260708 enable row level security;
alter table public.parts_lifecycle_operations enable row level security;
alter table public.shop_users enable row level security;

revoke all on table public.parts_backup_20260708 from public, anon, authenticated;
revoke all on table public.parts_lifecycle_operations from public, anon, authenticated;
revoke all on table public.shop_users from public, anon, authenticated;

grant select, insert, update, delete on table public.shop_users to authenticated;
grant all on table public.parts_backup_20260708 to service_role;
grant all on table public.parts_lifecycle_operations to service_role;
grant all on table public.shop_users to service_role;

create or replace function public.user_is_in_shop(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.shop_users su
    where su.shop_id = target_shop_id
      and su.user_id = auth.uid()
      and su.is_active = true
  );
$$;

create or replace function public.shop_users_actor_can_manage(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = target_shop_id
      and lower(coalesce(p.role::text, '')) in ('owner', 'admin')
  );
$$;

revoke all on function public.user_is_in_shop(uuid) from public, anon;
revoke all on function public.shop_users_actor_can_manage(uuid) from public, anon;
grant execute on function public.user_is_in_shop(uuid) to authenticated, service_role;
grant execute on function public.shop_users_actor_can_manage(uuid) to authenticated, service_role;

drop policy if exists shop_users_select_member on public.shop_users;
create policy shop_users_select_member
  on public.shop_users for select to authenticated
  using (public.user_is_in_shop(shop_id));

drop policy if exists shop_users_insert_member on public.shop_users;
create policy shop_users_insert_member
  on public.shop_users for insert to authenticated
  with check (public.shop_users_actor_can_manage(shop_id));

drop policy if exists shop_users_update_member on public.shop_users;
create policy shop_users_update_member
  on public.shop_users for update to authenticated
  using (public.shop_users_actor_can_manage(shop_id))
  with check (public.shop_users_actor_can_manage(shop_id));

drop policy if exists shop_users_delete_member on public.shop_users;
create policy shop_users_delete_member
  on public.shop_users for delete to authenticated
  using (public.shop_users_actor_can_manage(shop_id));

-- Canonical source-line identity -------------------------------------------

alter table public.work_order_quote_lines
  add column if not exists source_work_order_line_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.work_order_quote_lines'::regclass
      and conname = 'work_order_quote_lines_source_work_order_line_id_fkey'
  ) then
    alter table public.work_order_quote_lines
      add constraint work_order_quote_lines_source_work_order_line_id_fkey
      foreign key (source_work_order_line_id)
      references public.work_order_lines(id)
      on delete set null
      not valid;
  end if;
end;
$$;

alter table public.work_order_quote_lines
  validate constraint work_order_quote_lines_source_work_order_line_id_fkey;

create index if not exists idx_work_order_quote_lines_source_line
  on public.work_order_quote_lines(shop_id, work_order_id, source_work_order_line_id)
  where source_work_order_line_id is not null;

comment on column public.work_order_quote_lines.source_work_order_line_id is
  'Existing repair line that originated a pre-approval quote. It is not the materialized/approved work_order_line_id.';

-- One quote-readiness definition and an all-batch rollup -------------------

create or replace function public.part_request_item_is_quote_ready(
  p_description text,
  p_part_id uuid,
  p_requested_part_number text,
  p_requested_manufacturer text,
  p_qty numeric,
  p_unit_price numeric
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select (
    (
      nullif(trim(coalesce(p_description, '')), '') is not null
      or p_part_id is not null
      or nullif(trim(coalesce(p_requested_part_number, '')), '') is not null
      or nullif(trim(coalesce(p_requested_manufacturer, '')), '') is not null
    )
    and coalesce(p_qty, 0) > 0
    and p_unit_price is not null
    and p_unit_price >= 0
  );
$$;

create or replace function public.sync_quote_line_pricing_from_parts(
  p_shop_id uuid,
  p_quote_line_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line public.work_order_quote_lines%rowtype;
  v_request_ids uuid[] := array[]::uuid[];
  v_latest_request_id uuid;
  v_shop_labor_rate numeric := 0;
  v_labor_rate numeric := 0;
  v_labor_hours numeric := 0;
  v_labor_total numeric := 0;
  v_parts_total numeric := 0;
  v_required_count integer := 0;
  v_quoted_count integer := 0;
  v_pending_count integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_metadata_labor_rate numeric;
  v_next_status text;
  v_next_stage text;
begin
  select *
    into v_line
  from public.work_order_quote_lines
  where id = p_quote_line_id
    and shop_id = p_shop_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'quoteLineId', p_quote_line_id,
      'shopId', p_shop_id,
      'error', 'Quote line not found for shop'
    );
  end if;

  if lower(coalesce(v_line.status::text, '')) = any(array[
    'approved', 'customer_approved', 'declined', 'deferred', 'converted',
    'sent', 'rejected', 'cancelled'
  ]) or v_line.approved_at is not null
     or v_line.declined_at is not null
     or v_line.work_order_line_id is not null then
    return jsonb_build_object(
      'ok', true,
      'quoteLineId', p_quote_line_id,
      'shopId', p_shop_id,
      'status', v_line.status,
      'stage', v_line.stage,
      'skipped', 'protected_quote_line_state'
    );
  end if;

  select
    coalesce(
      array_agg(pr.id order by pr.created_at, pr.id),
      array[]::uuid[]
    ),
    (array_agg(pr.id order by pr.created_at desc, pr.id desc))[1]
  into v_request_ids, v_latest_request_id
  from public.part_requests pr
  where pr.shop_id = p_shop_id
    and pr.work_order_id = v_line.work_order_id
    and pr.quote_line_id = p_quote_line_id
    and lower(coalesce(pr.status::text, 'requested')) not in (
      'cancelled', 'canceled', 'rejected', 'declined', 'voided'
    );

  select coalesce(s.labor_rate, 0)
    into v_shop_labor_rate
  from public.shops s
  where s.id = p_shop_id;

  v_metadata := coalesce(v_line.metadata, '{}'::jsonb);
  if nullif(v_metadata ->> 'labor_rate', '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_metadata_labor_rate := (v_metadata ->> 'labor_rate')::numeric;
  end if;
  v_labor_rate := coalesce(
    nullif(v_metadata_labor_rate, 0),
    nullif(v_shop_labor_rate, 0),
    0
  );
  v_labor_hours := greatest(
    coalesce(v_line.labor_hours, 0),
    coalesce(v_line.est_labor_hours, 0),
    0
  );
  v_labor_total := case
    when coalesce(v_line.labor_total, 0) > 0 then v_line.labor_total
    when v_labor_hours > 0 and v_labor_rate > 0
      then round(v_labor_hours * v_labor_rate, 2)
    else coalesce(v_line.labor_total, 0)
  end;

  with active_requests as (
    select pr.id, pr.created_at
    from public.part_requests pr
    where pr.shop_id = p_shop_id
      and pr.work_order_id = v_line.work_order_id
      and pr.quote_line_id = p_quote_line_id
      and lower(coalesce(pr.status::text, 'requested')) not in (
        'cancelled', 'canceled', 'rejected', 'declined', 'voided'
      )
  ), canonical_items as (
    select
      pri.id,
      pri.request_id,
      ar.created_at as request_created_at,
      pri.description,
      greatest(
        coalesce(pri.qty, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty_approved, 0),
        0
      ) as qty,
      coalesce(pri.quoted_price, pri.unit_price, pri.unit_cost) as unit_price,
      pri.status,
      pri.part_id,
      pri.vendor,
      pri.vendor_id,
      pri.requested_part_number,
      pri.requested_manufacturer,
      p.name as selected_name,
      p.sku as selected_sku,
      p.part_number as selected_part_number,
      p.manufacturer as manufacturer,
      p.supplier as supplier
    from active_requests ar
    join public.part_request_items pri
      on pri.request_id = ar.id
     and pri.shop_id = p_shop_id
     and pri.work_order_id = v_line.work_order_id
     and pri.quote_line_id = p_quote_line_id
    left join public.parts p
      on p.id = pri.part_id
     and p.shop_id = pri.shop_id
    where lower(coalesce(pri.status::text, 'requested')) not in (
      'cancelled', 'canceled', 'rejected', 'declined', 'voided'
    )
      and greatest(
        coalesce(pri.qty, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty_approved, 0),
        0
      ) > 0
  )
  select
    count(*)::integer,
    count(*) filter (
      where public.part_request_item_is_quote_ready(
        description, part_id, requested_part_number,
        requested_manufacturer, qty, unit_price
      )
    )::integer,
    count(*) filter (
      where not public.part_request_item_is_quote_ready(
        description, part_id, requested_part_number,
        requested_manufacturer, qty, unit_price
      )
    )::integer,
    coalesce(round(sum(
      case when public.part_request_item_is_quote_ready(
        description, part_id, requested_part_number,
        requested_manufacturer, qty, unit_price
      ) then qty * unit_price else 0 end
    ), 2), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'request_id', request_id,
      'description', description,
      'qty', qty,
      'unit_price', unit_price,
      'line_total', case
        when unit_price is null then null
        else round(qty * unit_price, 2)
      end,
      'status', status,
      'part_id', part_id,
      'requested_part_number', requested_part_number,
      'requested_manufacturer', requested_manufacturer,
      'selected_name', selected_name,
      'selected_sku', selected_sku,
      'selected_part_number', selected_part_number,
      'manufacturer', coalesce(manufacturer, requested_manufacturer),
      'supplier', supplier,
      'vendor', vendor,
      'vendor_id', vendor_id
    ) order by request_created_at, request_id, id), '[]'::jsonb)
  into v_required_count, v_quoted_count, v_pending_count,
       v_parts_total, v_items
  from canonical_items;

  v_next_status := case
    when v_required_count > 0 and v_pending_count = 0 then 'quoted'
    else 'pending_parts'
  end;
  v_next_stage := case
    when v_required_count > 0
      and v_pending_count = 0
      and (v_labor_total + v_parts_total) > 0
      then 'ready_to_send'
    else 'advisor_pending'
  end;

  v_metadata := jsonb_set(v_metadata, '{labor_rate}', to_jsonb(v_labor_rate), true);
  v_metadata := jsonb_set(
    v_metadata,
    '{parts_quote}',
    jsonb_build_object(
      'source', 'canonical_active_part_requests',
      'request_id', v_latest_request_id,
      'request_ids', to_jsonb(v_request_ids),
      'batch_count', cardinality(v_request_ids),
      'synced_at', now(),
      'required_count', v_required_count,
      'quoted_count', v_quoted_count,
      'pending_count', v_pending_count,
      'parts_total', v_parts_total,
      'items', v_items
    ),
    true
  );

  update public.work_order_quote_lines
  set metadata = v_metadata,
      labor_total = v_labor_total,
      parts_total = v_parts_total,
      subtotal = round(v_labor_total + v_parts_total, 2),
      grand_total = round(
        v_labor_total + v_parts_total + coalesce(v_line.tax_total, 0),
        2
      ),
      status = v_next_status,
      stage = v_next_stage,
      updated_at = now()
  where id = p_quote_line_id
    and shop_id = p_shop_id;

  return jsonb_build_object(
    'ok', true,
    'quoteLineId', p_quote_line_id,
    'shopId', p_shop_id,
    'requestId', v_latest_request_id,
    'requestIds', to_jsonb(v_request_ids),
    'batchCount', cardinality(v_request_ids),
    'itemCount', v_required_count,
    'quotedCount', v_quoted_count,
    'pendingCount', v_pending_count,
    'partsTotal', v_parts_total,
    'laborRate', v_labor_rate,
    'laborTotal', v_labor_total,
    'status', v_next_status,
    'stage', v_next_stage
  );
end;
$$;

comment on function public.sync_quote_line_pricing_from_parts(uuid, uuid) is
  'Canonical Quote Review rollup across every active request batch linked to one quote line. Manual/vendor parts do not require an inventory part_id.';

revoke all on function public.sync_quote_line_pricing_from_parts(uuid, uuid)
  from public, anon;
grant execute on function public.sync_quote_line_pricing_from_parts(uuid, uuid)
  to authenticated, service_role;

-- Permit only the one-time null -> canonical quote anchor used below.
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
    if old.quote_line_id is not null
       or new.quote_line_id is null
       or not exists (
         select 1
         from public.part_requests pr
         join public.work_order_quote_lines q
           on q.id = new.quote_line_id
          and q.shop_id = new.shop_id
          and q.work_order_id = new.work_order_id
         where pr.id = new.request_id
           and pr.shop_id = new.shop_id
           and pr.work_order_id = new.work_order_id
           and pr.quote_line_id = new.quote_line_id
           and pr.job_id is not null
           and q.source_work_order_line_id = pr.job_id
       )
       or coalesce(old.qty_ordered, 0) > 0
       or coalesce(old.qty_received, 0) > 0
       or coalesce(old.qty_reserved, 0) > 0
       or coalesce(old.qty_consumed, 0) > 0
       or coalesce(old.qty_returned, 0) > 0
       or old.po_id is not null then
      raise exception 'part_request_items.quote_line_id cannot be changed';
    end if;
  end if;

  if new.work_order_line_id is distinct from old.work_order_line_id then
    select coalesce(new.quote_line_id, pr.quote_line_id)
      into v_quote_line_id
    from public.part_requests pr
    where pr.id = new.request_id;

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

-- Atomic/idempotent canonical quote creation and batch linkage.
create or replace function public.parts_ensure_request_quote_line(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.part_requests%rowtype;
  v_source_line public.work_order_lines%rowtype;
  v_quote public.work_order_quote_lines%rowtype;
  v_vehicle_id uuid;
  v_items_linked integer := 0;
begin
  select * into v_request
  from public.part_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'request_not_found');
  end if;
  if v_request.shop_id is null
     or v_request.work_order_id is null
     or v_request.job_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_source_line');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_request.job_id::text, 0));

  select * into v_source_line
  from public.work_order_lines
  where id = v_request.job_id
    and shop_id = v_request.shop_id
    and work_order_id = v_request.work_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001',
      message = 'PARTS_SOURCE_LINE_NOT_FOUND';
  end if;

  if lower(coalesce(v_source_line.approval_state::text, '')) = 'approved'
     or lower(coalesce(v_source_line.line_status::text, '')) = 'authorized' then
    return jsonb_build_object(
      'ok', true,
      'request_id', p_request_id,
      'skipped', 'source_line_already_approved'
    );
  end if;

  if exists (
    select 1
    from public.part_request_items pri
    where pri.request_id = p_request_id
      and (
        (pri.work_order_line_id is not null and pri.work_order_line_id <> v_request.job_id)
        or (pri.quote_line_id is not null
            and pri.quote_line_id is distinct from v_request.quote_line_id)
        or coalesce(pri.qty_ordered, 0) > 0
        or coalesce(pri.qty_received, 0) > 0
        or coalesce(pri.qty_reserved, 0) > 0
        or coalesce(pri.qty_consumed, 0) > 0
        or coalesce(pri.qty_returned, 0) > 0
        or pri.po_id is not null
      )
  ) then
    raise exception using errcode = 'P0001',
      message = 'PARTS_QUOTE_LINK_HAS_OPERATIONAL_ACTIVITY';
  end if;

  if v_request.quote_line_id is not null then
    select * into v_quote
    from public.work_order_quote_lines q
    where q.id = v_request.quote_line_id
      and q.shop_id = v_request.shop_id
      and q.work_order_id = v_request.work_order_id
    for update;

    if not found then
      raise exception using errcode = 'P0001',
        message = 'PARTS_QUOTE_LINE_NOT_FOUND';
    end if;
    if v_quote.source_work_order_line_id is null
       and v_quote.work_order_line_id is null
       and v_quote.approved_at is null
       and v_quote.declined_at is null then
      update public.work_order_quote_lines
      set source_work_order_line_id = v_request.job_id,
          updated_at = now()
      where id = v_quote.id;
      v_quote.source_work_order_line_id := v_request.job_id;
    end if;
    if v_quote.source_work_order_line_id is distinct from v_request.job_id then
      raise exception using errcode = 'P0001',
        message = 'PARTS_QUOTE_SOURCE_LINE_MISMATCH';
    end if;
  else
    select * into v_quote
    from public.work_order_quote_lines q
    where q.shop_id = v_request.shop_id
      and q.work_order_id = v_request.work_order_id
      and q.source_work_order_line_id = v_request.job_id
      and q.work_order_line_id is null
      and q.approved_at is null
      and q.declined_at is null
      and lower(coalesce(q.status::text, '')) not in (
        'approved', 'converted', 'declined', 'deferred', 'rejected',
        'cancelled', 'sent'
      )
    order by q.created_at, q.id
    limit 1
    for update;

    if not found then
      select coalesce(v_source_line.vehicle_id, wo.vehicle_id)
        into v_vehicle_id
      from public.work_orders wo
      where wo.id = v_request.work_order_id
        and wo.shop_id = v_request.shop_id;

      insert into public.work_order_quote_lines(
        shop_id,
        work_order_id,
        vehicle_id,
        suggested_by,
        description,
        job_type,
        est_labor_hours,
        labor_hours,
        notes,
        status,
        stage,
        source_work_order_line_id,
        metadata
      ) values (
        v_request.shop_id,
        v_request.work_order_id,
        v_vehicle_id,
        v_request.requested_by,
        coalesce(
          nullif(trim(v_source_line.description), ''),
          nullif(trim(v_source_line.complaint), ''),
          'Repair line ' || coalesce(v_source_line.line_no::text, '')
        ),
        coalesce(nullif(trim(v_source_line.job_type), ''), 'tech-suggested'),
        greatest(coalesce(v_source_line.labor_time, 0), 0),
        greatest(coalesce(v_source_line.labor_time, 0), 0),
        nullif(trim(v_source_line.notes), ''),
        'pending_parts',
        'advisor_pending',
        v_request.job_id,
        jsonb_build_object(
          'source', 'parts_request',
          'source_work_order_line_id', v_request.job_id,
          'created_from_request_id', p_request_id
        )
      )
      returning * into v_quote;
    end if;

    update public.part_requests
    set quote_line_id = v_quote.id
    where id = p_request_id
      and quote_line_id is null;
    v_request.quote_line_id := v_quote.id;
  end if;

  if exists (
    select 1
    from public.part_request_items pri
    where pri.request_id = p_request_id
      and pri.quote_line_id is not null
      and pri.quote_line_id <> v_quote.id
  ) then
    raise exception using errcode = 'P0001',
      message = 'PARTS_ITEM_QUOTE_LINE_MISMATCH';
  end if;

  update public.part_request_items
  set quote_line_id = v_quote.id,
      updated_at = now()
  where request_id = p_request_id
    and quote_line_id is null;
  get diagnostics v_items_linked = row_count;

  perform public.sync_quote_line_pricing_from_parts(
    v_request.shop_id,
    v_quote.id
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'quote_line_id', v_quote.id,
    'source_work_order_line_id', v_request.job_id,
    'items_linked', v_items_linked
  );
end;
$$;

revoke all on function public.parts_ensure_request_quote_line(uuid)
  from public, anon, authenticated;
grant execute on function public.parts_ensure_request_quote_line(uuid)
  to service_role;

-- Reconcile parent and item state using the same helper, creating canonical
-- quote linkage before a request is exposed as quoted.
create or replace function public.parts_reconcile_request_lifecycle(
  p_request_id uuid
)
returns jsonb
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
  v_link_result jsonb := '{}'::jsonb;
  v_previous_guard text := coalesce(
    current_setting('app.parts_lifecycle_reconciling', true),
    '0'
  );
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
             lower(coalesce(q.status::text, '')) in (
               'declined', 'rejected', 'cancelled'
             )
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
    coalesce(bool_and(public.part_request_item_is_quote_ready(
      pri.description,
      pri.part_id,
      pri.requested_part_number,
      pri.requested_manufacturer,
      greatest(
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0),
        0
      ),
      coalesce(pri.quoted_price, pri.unit_price)
    )), false),
    coalesce(bool_and(
      greatest(
        coalesce(pri.qty_consumed, 0) - coalesce(pri.qty_returned, 0),
        0
      ) >= greatest(
        coalesce(pri.qty_approved, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0),
        0
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

  if v_new_status::text = 'quoted'
     and not v_line_approved
     and v_request.job_id is not null
     and v_request.quote_line_id is null then
    v_link_result := public.parts_ensure_request_quote_line(p_request_id);
    if coalesce((v_link_result ->> 'ok')::boolean, false)
       and nullif(v_link_result ->> 'quote_line_id', '') is not null then
      select * into v_request
      from public.part_requests
      where id = p_request_id
      for update;
    end if;
  end if;

  if v_new_status::text not in ('fulfilled', 'returned') then
    update public.part_request_items pri
    set status = case
          when v_new_status::text in (
            'rejected', 'cancelled', 'deferred'
          ) then 'cancelled'::public.part_request_item_status
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
          when v_new_status::text = 'approved' then greatest(
            coalesce(pri.qty_approved, 0),
            coalesce(pri.qty_requested, 0),
            coalesce(pri.qty, 0),
            0
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
        v_new_status::text in (
          'approved', 'rejected', 'cancelled', 'deferred', 'requested'
        )
        or (
          v_new_status::text = 'quoted'
          and public.part_request_item_is_quote_ready(
            pri.description,
            pri.part_id,
            pri.requested_part_number,
            pri.requested_manufacturer,
            greatest(
              coalesce(pri.qty_requested, 0),
              coalesce(pri.qty, 0),
              0
            ),
            coalesce(pri.quoted_price, pri.unit_price)
          )
        )
      );
  end if;

  update public.part_requests
  set status = v_new_status,
      handoff_completed_at = case
        when v_new_status::text = 'fulfilled'
          then coalesce(handoff_completed_at, now())
        else handoff_completed_at
      end,
      handoff_completed_by = case
        when v_new_status::text = 'fulfilled'
          then coalesce(handoff_completed_by, auth.uid())
        else handoff_completed_by
      end
  where id = p_request_id
    and (
      status is distinct from v_new_status
      or (v_new_status::text = 'fulfilled' and handoff_completed_at is null)
    );

  if v_request.quote_line_id is not null then
    perform public.sync_quote_line_pricing_from_parts(
      v_request.shop_id,
      v_request.quote_line_id
    );
  end if;

  v_new_stage := public.parts_request_operational_stage(p_request_id);
  perform public.parts_publish_request_notification(p_request_id, v_new_stage);
  perform set_config(
    'app.parts_lifecycle_reconciling',
    v_previous_guard,
    true
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'quote_line_id', v_request.quote_line_id,
    'request_status', v_new_status,
    'previous_stage', v_old_stage,
    'stage', v_new_stage,
    'item_count', v_item_count,
    'all_priced', v_all_priced,
    'approved', v_quote_approved or v_line_approved,
    'linkage', v_link_result
  );
exception when others then
  perform set_config(
    'app.parts_lifecycle_reconciling',
    v_previous_guard,
    true
  );
  raise;
end;
$$;

revoke all on function public.parts_reconcile_request_lifecycle(uuid)
  from public, anon, authenticated;

-- Approval must reuse and activate the source repair line instead of creating
-- a duplicate line. Keep the deployed decision function otherwise unchanged.
do $$
declare
  v_sql text;
  v_old text := 'v_work_order_line_id := v_quote.work_order_line_id;';
  v_new text := 'v_work_order_line_id := coalesce(v_quote.work_order_line_id, v_quote.source_work_order_line_id);';
begin
  select pg_get_functiondef(
    'public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_sql;

  if position(v_new in v_sql) = 0 then
    if position(v_old in v_sql) = 0 then
      raise exception 'apply_customer_quote_decision_atomic source-line patch point not found';
    end if;
    v_sql := replace(v_sql, v_old, v_new);
    if position(v_old in v_sql) > 0 or position(v_new in v_sql) = 0 then
      raise exception 'apply_customer_quote_decision_atomic source-line patch failed';
    end if;
    execute v_sql;
  end if;
end;
$$;

create or replace function public.activate_source_work_order_line_from_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_actor_text text;
  v_previous_guard text := coalesce(
    current_setting('app.parts_lifecycle_reconciling', true),
    '0'
  );
begin
  if new.source_work_order_line_id is null
     or not (
       new.approved_at is not null
       or lower(coalesce(new.status::text, '')) in ('approved', 'converted')
       or lower(coalesce(new.stage::text, '')) = 'customer_approved'
     ) then
    return new;
  end if;

  if not exists (
    select 1
    from public.work_order_lines wol
    where wol.id = new.source_work_order_line_id
      and wol.shop_id = new.shop_id
      and wol.work_order_id = new.work_order_id
  ) then
    raise exception using errcode = 'P0001',
      message = 'QUOTE_SOURCE_LINE_TENANT_MISMATCH';
  end if;

  v_actor_text := coalesce(new.metadata, '{}'::jsonb)
    ->> 'customer_actor_user_id';
  if v_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor := v_actor_text::uuid;
  end if;

  -- Prevent the line-approval trigger from reconciling this quote while its
  -- own BEFORE UPDATE is still in flight. The quote's AFTER trigger performs
  -- the lifecycle reconciliation once the converted state is visible.
  perform set_config('app.parts_lifecycle_reconciling', '1', true);
  update public.work_order_lines
  set approval_state = 'approved',
      line_status = 'authorized',
      status = case
        when lower(coalesce(status, '')) in ('awaiting', 'awaiting_approval')
          then 'active'
        else status
      end,
      approval_at = coalesce(approval_at, new.approved_at, now()),
      approval_by = coalesce(approval_by, v_actor),
      quoted_at = coalesce(quoted_at, new.sent_to_customer_at, new.created_at),
      price_estimate = coalesce(
        new.grand_total,
        new.subtotal,
        coalesce(new.labor_total, 0) + coalesce(new.parts_total, 0),
        price_estimate
      ),
      updated_at = now()
  where id = new.source_work_order_line_id
    and shop_id = new.shop_id
    and work_order_id = new.work_order_id;
  perform set_config(
    'app.parts_lifecycle_reconciling',
    v_previous_guard,
    true
  );

  new.work_order_line_id := coalesce(
    new.work_order_line_id,
    new.source_work_order_line_id
  );
  return new;
exception when others then
  perform set_config(
    'app.parts_lifecycle_reconciling',
    v_previous_guard,
    true
  );
  raise;
end;
$$;

drop trigger if exists trg_activate_source_work_order_line_from_quote
  on public.work_order_quote_lines;
create trigger trg_activate_source_work_order_line_from_quote
before update of status, stage, approved_at, work_order_line_id
on public.work_order_quote_lines
for each row
execute function public.activate_source_work_order_line_from_quote();

revoke all on function public.activate_source_work_order_line_from_quote()
  from public, anon, authenticated;

-- PO header + line now share one transaction and one operation key. Any
-- release/quantity/tenant failure rolls the newly inserted header back.
create or replace function public.parts_create_or_reuse_po_line_for_request(
  p_request_item_id uuid,
  p_qty numeric,
  p_idempotency_key text,
  p_po_id uuid default null,
  p_supplier_id uuid default null,
  p_unit_cost numeric default null,
  p_location_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.part_request_items%rowtype;
  v_po_id uuid := p_po_id;
  v_operation_id uuid;
  v_existing jsonb;
  v_result jsonb;
  v_created boolean := false;
begin
  if p_qty <= 0 then
    raise exception 'PO quantity must be greater than zero.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'A stable idempotency key is required.';
  end if;
  if length(p_idempotency_key) > 300 then
    raise exception 'PO-line idempotency key is too long.';
  end if;

  select * into v_item
  from public.part_request_items
  where id = p_request_item_id
  for update;
  if not found or v_item.shop_id is null then
    raise exception 'Request item not found or missing shop.';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_item.shop_id);
  if auth.role() <> 'service_role' and not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = v_item.shop_id
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'parts'
      )
  ) then
    raise exception 'Parts ordering actor is not authorized for this shop.';
  end if;
  if not public.parts_request_is_operationally_released(v_item.request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_APPROVAL_REQUIRED',
      detail = 'A purchase order cannot be created until the linked work is approved.';
  end if;

  if v_po_id is null then
    if p_supplier_id is null or not exists (
      select 1
      from public.suppliers s
      where s.id = p_supplier_id
        and s.shop_id = v_item.shop_id
    ) then
      raise exception 'Supplier not found for this shop.';
    end if;
  end if;

  insert into public.parts_lifecycle_operations(
    shop_id,
    idempotency_key,
    operation_type,
    part_request_item_id,
    result,
    created_by
  ) values (
    v_item.shop_id,
    p_idempotency_key,
    'create_or_reuse_po_line',
    p_request_item_id,
    jsonb_build_object('state', 'started'),
    auth.uid()
  )
  on conflict (shop_id, idempotency_key) do nothing
  returning id into v_operation_id;

  if v_operation_id is null then
    select result into v_existing
    from public.parts_lifecycle_operations
    where shop_id = v_item.shop_id
      and idempotency_key = p_idempotency_key;
    return coalesce(v_existing, '{}'::jsonb)
      || jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  if v_po_id is null then
    insert into public.purchase_orders(
      shop_id,
      supplier_id,
      status,
      notes
    ) values (
      v_item.shop_id,
      p_supplier_id,
      'open',
      nullif(trim(p_notes), '')
    )
    returning id into v_po_id;
    v_created := true;
  end if;

  v_result := public.parts_create_po_line_for_request(
    v_po_id,
    p_request_item_id,
    p_qty,
    p_unit_cost,
    p_location_id,
    p_idempotency_key
  ) || jsonb_build_object(
    'po_id', v_po_id,
    'po_created', v_created,
    'idempotent', false
  );

  update public.parts_lifecycle_operations
  set result = v_result,
      work_order_part_id = case
        when nullif(v_result ->> 'work_order_part_id', '') is null then null
        else (v_result ->> 'work_order_part_id')::uuid
      end
  where id = v_operation_id;

  return v_result;
end;
$$;

revoke all on function public.parts_create_or_reuse_po_line_for_request(
  uuid, numeric, text, uuid, uuid, numeric, uuid, text
) from public, anon;
grant execute on function public.parts_create_or_reuse_po_line_for_request(
  uuid, numeric, text, uuid, uuid, numeric, uuid, text
) to authenticated, service_role;

-- Safe generic backfill: only complete, non-operational requests on an
-- unapproved source line are canonicalized. Generated IDs are not embedded.
do $$
declare
  r record;
begin
  for r in
    select pr.id
    from public.part_requests pr
    join public.work_order_lines wol
      on wol.id = pr.job_id
     and wol.shop_id = pr.shop_id
     and wol.work_order_id = pr.work_order_id
    where pr.quote_line_id is null
      and pr.job_id is not null
      and lower(coalesce(pr.status::text, 'requested')) in ('requested', 'quoted')
      and lower(coalesce(wol.approval_state::text, '')) <> 'approved'
      and lower(coalesce(wol.line_status::text, '')) <> 'authorized'
      and exists (
        select 1
        from public.part_request_items pri
        where pri.request_id = pr.id
          and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled'
      )
      and not exists (
        select 1
        from public.part_request_items pri
        where pri.request_id = pr.id
          and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled'
          and not public.part_request_item_is_quote_ready(
            pri.description,
            pri.part_id,
            pri.requested_part_number,
            pri.requested_manufacturer,
            greatest(
              coalesce(pri.qty_requested, 0),
              coalesce(pri.qty, 0),
              0
            ),
            coalesce(pri.quoted_price, pri.unit_price)
          )
      )
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
      )
    order by pr.created_at, pr.id
  loop
    perform public.parts_reconcile_request_lifecycle(r.id);
  end loop;
end;
$$;

-- Migration postconditions --------------------------------------------------

do $$
declare
  v_definition text;
begin
  if to_regprocedure(
    'public.create_part_request_with_items(uuid,jsonb,uuid,text)'
  ) is not null then
    raise exception 'Unsafe create_part_request_with_items overload remains';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'parts_backup_20260708',
        'parts_lifecycle_operations',
        'shop_users'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'P0 Data API relation still has RLS disabled';
  end if;

  select pg_get_functiondef(
    'public.apply_customer_quote_decision_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)'::regprocedure
  ) into v_definition;
  if position(
    'coalesce(v_quote.work_order_line_id, v_quote.source_work_order_line_id)'
    in v_definition
  ) = 0 then
    raise exception 'Quote approval does not reuse the source work-order line';
  end if;

  if exists (
    select 1
    from public.part_requests pr
    join public.work_order_lines wol
      on wol.id = pr.job_id
     and wol.shop_id = pr.shop_id
     and wol.work_order_id = pr.work_order_id
    where pr.quote_line_id is null
      and pr.job_id is not null
      and lower(coalesce(pr.status::text, 'requested')) in ('requested', 'quoted')
      and lower(coalesce(wol.approval_state::text, '')) <> 'approved'
      and lower(coalesce(wol.line_status::text, '')) <> 'authorized'
      and exists (
        select 1
        from public.part_request_items pri
        where pri.request_id = pr.id
          and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled'
      )
      and not exists (
        select 1
        from public.part_request_items pri
        where pri.request_id = pr.id
          and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled'
          and not public.part_request_item_is_quote_ready(
            pri.description,
            pri.part_id,
            pri.requested_part_number,
            pri.requested_manufacturer,
            greatest(
              coalesce(pri.qty_requested, 0),
              coalesce(pri.qty, 0),
              0
            ),
            coalesce(pri.quoted_price, pri.unit_price)
          )
      )
  ) then
    raise exception 'Quote-ready request remains without canonical quote linkage';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
