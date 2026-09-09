-- Harden deferred-work carry-forward as an explicit shared integration.
-- This forward migration preserves existing work-order/quote behavior while
-- making carry-forward safe across canonical inspection provenance, vehicle
-- reassignment, portal quote placeholders, source completion, and concurrent
-- decision/completion paths.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '15min';

-- Canonical inspection quote creation historically stored this lineage only in
-- metadata.source_work_order_line_id. Backfill the established column whenever
-- the metadata value is a valid same-shop/same-vehicle work-order line.
update public.work_order_quote_lines quote_line
set source_work_order_line_id = source_line.id
from public.work_order_lines source_line
where quote_line.source_work_order_line_id is null
  and quote_line.metadata is not null
  and coalesce(quote_line.metadata ->> 'source_work_order_line_id', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and source_line.id = (quote_line.metadata ->> 'source_work_order_line_id')::uuid
  and source_line.shop_id = quote_line.shop_id
  and (
    quote_line.vehicle_id is null
    or source_line.vehicle_id is not distinct from quote_line.vehicle_id
  );

-- Keep future metadata-only canonical quote inserts normalized into the
-- existing provenance column. The validation prevents arbitrary metadata from
-- linking across shops or vehicles.
create or replace function public.normalize_quote_line_source_work_order_line()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_candidate uuid;
begin
  if new.source_work_order_line_id is not null then
    return new;
  end if;

  if new.metadata is null
     or coalesce(new.metadata ->> 'source_work_order_line_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;

  v_candidate := (new.metadata ->> 'source_work_order_line_id')::uuid;

  if exists (
    select 1
    from public.work_order_lines source_line
    where source_line.id = v_candidate
      and source_line.shop_id = new.shop_id
      and (
        new.vehicle_id is null
        or source_line.vehicle_id is not distinct from new.vehicle_id
      )
  ) then
    new.source_work_order_line_id := v_candidate;
  end if;

  return new;
end;
$function$;

revoke all on function public.normalize_quote_line_source_work_order_line()
  from public, anon, authenticated;

drop trigger if exists trg_quote_lines_normalize_source_work_order_line
  on public.work_order_quote_lines;
create trigger trg_quote_lines_normalize_source_work_order_line
before insert or update of metadata, source_work_order_line_id, shop_id, vehicle_id
on public.work_order_quote_lines
for each row
execute function public.normalize_quote_line_source_work_order_line();

-- Both the synchronous carry-forward path and advisor intake history query are
-- vehicle-scoped. Support that access path without scanning/sorting a shop's
-- complete quote history inside a work-order transaction.
create index if not exists idx_work_order_quote_lines_shop_vehicle_history
  on public.work_order_quote_lines (
    shop_id,
    vehicle_id,
    updated_at desc,
    id desc
  )
  include (
    work_order_id,
    work_order_line_id,
    source_work_order_line_id,
    source_row_id,
    status,
    stage,
    decision,
    declined_at,
    deferred_at
  )
  where vehicle_id is not null;

-- Reconcile one destination work order. This function intentionally follows
-- the canonical approval lock order across every work order participating in a
-- recommendation lineage: work orders -> lines -> quote lines. Every resource
-- set is sorted before locking so concurrent carry-forward attempts cannot take
-- the same lineage in opposite order.
create or replace function public.carry_forward_deferred_work_for_work_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_root_line_id uuid;
  v_source_line public.work_order_lines%rowtype;
  v_latest_quote public.work_order_quote_lines%rowtype;
  v_lineage_work_order_ids uuid[];
  v_new_line_id uuid;
  v_actor_user_id uuid;
  v_decision text;
begin
  -- If the vehicle changes on an already-created draft, remove only rows that
  -- this integration previously carried. Deferred lines authored natively on
  -- the current visit are not touched.
  if tg_op = 'UPDATE'
     and old.vehicle_id is distinct from new.vehicle_id then
    with carried as materialized (
      select distinct quote_line.work_order_line_id
      from public.work_order_quote_lines quote_line
      where quote_line.shop_id = new.shop_id
        and quote_line.work_order_id = new.id
        and quote_line.work_order_line_id is not null
        and lower(coalesce(quote_line.metadata ->> 'carry_forward', 'false')) = 'true'
    ), deleted_quotes as (
      delete from public.work_order_quote_lines quote_line
      using carried
      where quote_line.shop_id = new.shop_id
        and quote_line.work_order_id = new.id
        and quote_line.work_order_line_id = carried.work_order_line_id
      returning quote_line.work_order_line_id
    )
    delete from public.work_order_lines line
    using (
      select distinct work_order_line_id
      from deleted_quotes
      where work_order_line_id is not null
    ) removed
    where line.id = removed.work_order_line_id
      and line.shop_id = new.shop_id
      and line.work_order_id = new.id
      and lower(coalesce(line.status::text, '')) = 'deferred';
  end if;

  -- Carry-forward belongs only to canonical operational work orders. Quote-only
  -- portal placeholders, archival imports, archived rows, and vehicle-less
  -- shells must not receive technical history lines.
  if new.vehicle_id is null
     or coalesce(new.record_type::text, 'work_order') <> 'work_order'
     or new.archived_at is not null
     or coalesce(new.type::text, '') = 'historical_import'
     or coalesce(new.external_id::text, '') like 'portal_quote:%' then
    return new;
  end if;

  -- Attribute the new row to the current operation, never the historical
  -- technician/advisor stored on the source repair. Preserve that historical
  -- actor separately in quote metadata below.
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null and new.advisor_id is not null then
    select coalesce(profile.user_id, profile.id)
      into v_actor_user_id
    from public.profiles profile
    where profile.id = new.advisor_id
      and profile.shop_id = new.shop_id;
  end if;

  -- Enumerate recommendation roots that have ever reached a terminal customer
  -- decision on this vehicle. Each root is revalidated after lineage locks, so
  -- this initial scan is only candidate discovery and cannot create stale work.
  for v_root_line_id in
    select distinct
      coalesce(quote_line.source_work_order_line_id, quote_line.work_order_line_id)
    from public.work_order_quote_lines quote_line
    join public.work_order_lines source_line
      on source_line.id = coalesce(
        quote_line.source_work_order_line_id,
        quote_line.work_order_line_id
      )
     and source_line.shop_id = new.shop_id
     and source_line.vehicle_id = new.vehicle_id
    join public.work_orders source_work_order
      on source_work_order.id = source_line.work_order_id
     and source_work_order.shop_id = new.shop_id
    where quote_line.shop_id = new.shop_id
      and quote_line.vehicle_id = new.vehicle_id
      and quote_line.work_order_id is distinct from new.id
      and coalesce(quote_line.source_work_order_line_id, quote_line.work_order_line_id) is not null
      and source_line.voided_at is null
      and source_work_order.archived_at is null
      and coalesce(source_work_order.type::text, '') <> 'historical_import'
      and coalesce(source_work_order.external_id::text, '') not like 'portal_quote:%'
      and (
        lower(coalesce(quote_line.status::text, '')) in ('declined', 'deferred')
        or lower(coalesce(quote_line.stage::text, '')) in ('customer_declined', 'customer_deferred')
        or lower(coalesce(quote_line.decision::text, '')) in ('declined', 'deferred')
      )
    order by 1
  loop
    -- Build the full historical lineage before locking. Current destination rows
    -- are excluded because the parent INSERT/UPDATE already owns that row lock.
    select array_agg(work_order_id order by work_order_id)
      into v_lineage_work_order_ids
    from (
      select distinct lineage_quote.work_order_id
      from public.work_order_quote_lines lineage_quote
      where lineage_quote.shop_id = new.shop_id
        and lineage_quote.work_order_id is not null
        and lineage_quote.work_order_id is distinct from new.id
        and coalesce(
          lineage_quote.source_work_order_line_id,
          lineage_quote.work_order_line_id
        ) = v_root_line_id
      union
      select source_line.work_order_id
      from public.work_order_lines source_line
      where source_line.id = v_root_line_id
        and source_line.shop_id = new.shop_id
        and source_line.work_order_id is distinct from new.id
    ) lineage_ids;

    if coalesce(array_length(v_lineage_work_order_ids, 1), 0) > 0 then
      perform 1
      from public.work_orders lineage_work_order
      where lineage_work_order.shop_id = new.shop_id
        and lineage_work_order.id = any(v_lineage_work_order_ids)
      order by lineage_work_order.id
      for update;

      perform 1
      from public.work_order_lines lineage_line
      where lineage_line.shop_id = new.shop_id
        and lineage_line.work_order_id = any(v_lineage_work_order_ids)
      order by lineage_line.work_order_id, lineage_line.id
      for update;

      perform 1
      from public.work_order_quote_lines lineage_quote
      where lineage_quote.shop_id = new.shop_id
        and lineage_quote.work_order_id = any(v_lineage_work_order_ids)
      order by lineage_quote.work_order_id, lineage_quote.id
      for update;
    end if;

    -- Re-read the source and latest quote after the canonical lineage locks.
    select source_line.*
      into v_source_line
    from public.work_order_lines source_line
    where source_line.id = v_root_line_id
      and source_line.shop_id = new.shop_id
      and source_line.vehicle_id = new.vehicle_id
      and source_line.voided_at is null;

    if not found then
      continue;
    end if;

    -- Completion of the original source itself resolves the recommendation even
    -- if no descendant quote row was materialized.
    if lower(coalesce(v_source_line.status::text, '')) in (
      'completed', 'ready_to_invoice', 'invoiced'
    ) then
      continue;
    end if;

    select quote_line.*
      into v_latest_quote
    from public.work_order_quote_lines quote_line
    where quote_line.shop_id = new.shop_id
      and quote_line.vehicle_id = new.vehicle_id
      and quote_line.work_order_id is distinct from new.id
      and coalesce(
        quote_line.source_work_order_line_id,
        quote_line.work_order_line_id
      ) = v_root_line_id
    order by
      coalesce(
        quote_line.deferred_at,
        quote_line.declined_at,
        quote_line.updated_at,
        quote_line.created_at
      ) desc,
      quote_line.id desc
    limit 1;

    if not found then
      continue;
    end if;

    v_decision := case
      when lower(coalesce(v_latest_quote.decision::text, '')) = 'deferred'
        or lower(coalesce(v_latest_quote.stage::text, '')) = 'customer_deferred'
        or lower(coalesce(v_latest_quote.status::text, '')) = 'deferred'
        then 'deferred'
      when lower(coalesce(v_latest_quote.decision::text, '')) = 'declined'
        or lower(coalesce(v_latest_quote.stage::text, '')) = 'customer_declined'
        or lower(coalesce(v_latest_quote.status::text, '')) = 'declined'
        then 'declined'
      else null
    end;

    -- A later approve/requote/current state supersedes an older decline.
    if v_decision is null then
      continue;
    end if;

    -- Any completed descendant in the locked lineage resolves the thread.
    if exists (
      select 1
      from public.work_order_quote_lines descendant_quote
      join public.work_order_lines descendant_line
        on descendant_line.id = descendant_quote.work_order_line_id
       and descendant_line.shop_id = new.shop_id
      where descendant_quote.shop_id = new.shop_id
        and coalesce(
          descendant_quote.source_work_order_line_id,
          descendant_quote.work_order_line_id
        ) = v_root_line_id
        and descendant_line.voided_at is null
        and lower(coalesce(descendant_line.status::text, '')) in (
          'completed', 'ready_to_invoice', 'invoiced'
        )
    ) then
      continue;
    end if;

    -- Idempotency receipt: exactly one carried quote for one recommendation root
    -- on one destination work order.
    if exists (
      select 1
      from public.work_order_quote_lines existing
      where existing.shop_id = new.shop_id
        and existing.work_order_id = new.id
        and existing.source_work_order_line_id = v_root_line_id
        and lower(coalesce(existing.metadata ->> 'carry_forward', 'false')) = 'true'
    ) then
      continue;
    end if;

    v_new_line_id := gen_random_uuid();

    insert into public.work_order_lines (
      id,
      work_order_id,
      vehicle_id,
      complaint,
      cause,
      correction,
      description,
      notes,
      status,
      approval_state,
      job_type,
      shop_id,
      user_id,
      urgency
    ) values (
      v_new_line_id,
      new.id,
      new.vehicle_id,
      v_source_line.complaint,
      v_source_line.cause,
      v_source_line.correction,
      coalesce(
        v_source_line.description,
        v_latest_quote.description,
        v_latest_quote.title
      ),
      v_source_line.notes,
      'deferred',
      'declined',
      coalesce(v_source_line.job_type, 'repair'),
      new.shop_id,
      v_actor_user_id,
      v_source_line.urgency
    );

    insert into public.work_order_quote_lines (
      shop_id,
      work_order_id,
      work_order_line_id,
      source_work_order_line_id,
      source_row_id,
      vehicle_id,
      title,
      description,
      line_type,
      status,
      stage,
      decision,
      decline_reason,
      defer_reason,
      labor_hours,
      est_labor_hours,
      labor_rate,
      labor_total,
      parts_total,
      subtotal,
      discount_total,
      tax_total,
      grand_total,
      metadata,
      declined_at,
      deferred_at
    ) values (
      new.shop_id,
      new.id,
      v_new_line_id,
      v_root_line_id,
      v_latest_quote.id,
      new.vehicle_id,
      v_latest_quote.title,
      v_latest_quote.description,
      'job',
      'deferred',
      'customer_deferred',
      'deferred',
      v_latest_quote.decline_reason,
      v_latest_quote.defer_reason,
      coalesce(v_latest_quote.labor_hours, 0),
      coalesce(v_latest_quote.est_labor_hours, 0),
      v_latest_quote.labor_rate,
      coalesce(v_latest_quote.labor_total, 0),
      coalesce(v_latest_quote.parts_total, 0),
      coalesce(v_latest_quote.subtotal, 0),
      coalesce(v_latest_quote.discount_total, 0),
      coalesce(v_latest_quote.tax_total, 0),
      coalesce(v_latest_quote.grand_total, 0),
      coalesce(v_latest_quote.metadata, '{}'::jsonb) || jsonb_build_object(
        'carry_forward', true,
        'source_quote_line_id', v_latest_quote.id,
        'source_work_order_line_id', v_root_line_id,
        'source_actor_user_id', v_source_line.user_id,
        'prior_decision', v_decision,
        'prior_declined_at', v_latest_quote.declined_at,
        'prior_deferred_at', v_latest_quote.deferred_at
      ),
      v_latest_quote.declined_at,
      v_latest_quote.deferred_at
    );
  end loop;

  return new;
end;
$function$;

revoke all on function public.carry_forward_deferred_work_for_work_order()
  from public, anon, authenticated;

-- Reconcile both initial creation and the create-flow's supported vehicle
-- reassignment path. The function itself applies the operational/placeholder
-- guards because UPDATE needs OLD/NEW cleanup semantics before early return.
drop trigger if exists trg_work_orders_carry_forward_deferred_work
  on public.work_orders;
create trigger trg_work_orders_carry_forward_deferred_work
after insert or update of vehicle_id on public.work_orders
for each row
execute function public.carry_forward_deferred_work_for_work_order();

comment on function public.carry_forward_deferred_work_for_work_order() is
  'Carries unresolved prior declined/deferred vehicle repairs into operational work orders, reconciles supported vehicle changes, and revalidates the full lineage under canonical work-order/line/quote locks.';

commit;