-- Address reviewed shared-integration gaps for deferred-work carry-forward.
-- Forward-only correction: preserves prior migrations and narrows deferred history
-- so it remains technical context rather than active operational work.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '15min';

-- Deferred carry-forward rows are non-actionable technical context and must not
-- drive the parent work-order status or approval rollup.
create or replace function private.reconcile_work_order_state(
  p_work_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_work_order public.work_orders%rowtype;
  v_actionable_count integer := 0;
  v_nonterminal_count integer := 0;
  v_pending_line_count integer := 0;
  v_pending_quote_count integer := 0;
  v_approved_count integer := 0;
  v_declined_count integer := 0;
  v_any_in_progress boolean := false;
  v_any_on_hold boolean := false;
  v_next_status text;
  v_next_approval text;
begin
  select wo.*
  into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
  for update;

  if not found
     or lower(coalesce(v_work_order.status, '')) in ('invoiced', 'cancelled')
     or public.work_order_is_financially_locked(v_work_order.shop_id, v_work_order.id) then
    return;
  end if;

  select
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and lower(coalesce(wol.status::text, '')) not in ('deferred', 'declined')
        and lower(coalesce(wol.line_status::text, '')) not in (
          'deferred', 'declined', 'voided', 'cancelled', 'canceled'
        )
    ),
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and lower(coalesce(wol.status::text, '')) not in (
          'completed', 'ready_to_invoice', 'invoiced', 'deferred', 'declined'
        )
        and lower(coalesce(wol.line_status::text, '')) not in (
          'declined', 'deferred', 'voided', 'cancelled', 'canceled'
        )
    ),
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and lower(coalesce(wol.status::text, '')) not in ('deferred', 'declined')
        and lower(coalesce(wol.line_status::text, '')) not in (
          'declined', 'deferred', 'voided', 'cancelled', 'canceled'
        )
        and (
          lower(coalesce(wol.approval_state::text, '')) in (
            'pending', 'awaiting_approval', 'sent'
          )
          or lower(coalesce(wol.status::text, '')) = 'awaiting_approval'
          or lower(coalesce(wol.line_status::text, '')) = 'pending'
        )
        and lower(coalesce(wol.status::text, '')) not in (
          'completed', 'ready_to_invoice', 'invoiced'
        )
    ),
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and lower(coalesce(wol.status::text, '')) not in ('deferred', 'declined')
        and lower(coalesce(wol.line_status::text, '')) not in (
          'deferred', 'declined', 'voided', 'cancelled', 'canceled'
        )
        and (
          lower(coalesce(wol.approval_state::text, '')) = 'approved'
          or lower(coalesce(wol.line_status::text, '')) = 'authorized'
          or lower(coalesce(wol.status::text, '')) in (
            'completed', 'ready_to_invoice', 'invoiced'
          )
        )
    ),
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and lower(coalesce(wol.status::text, '')) not in ('deferred', 'declined')
        and lower(coalesce(wol.line_status::text, '')) not in (
          'deferred', 'declined', 'voided', 'cancelled', 'canceled'
        )
        and (
          lower(coalesce(wol.approval_state::text, '')) = 'declined'
          or lower(coalesce(wol.line_status::text, '')) in ('declined', 'deferred')
        )
    ),
    coalesce(bool_or(
      wol.voided_at is null
      and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
      and lower(coalesce(wol.status::text, '')) not in ('deferred', 'declined')
      and lower(coalesce(wol.line_status::text, '')) not in (
        'deferred', 'declined', 'voided', 'cancelled', 'canceled'
      )
      and (
        lower(coalesce(wol.status::text, '')) in ('in_progress', 'active')
        or (wol.punched_in_at is not null and wol.punched_out_at is null)
      )
    ), false),
    coalesce(bool_or(
      wol.voided_at is null
      and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
      and lower(coalesce(wol.status::text, '')) not in ('deferred', 'declined')
      and lower(coalesce(wol.line_status::text, '')) not in (
        'declined', 'deferred', 'voided', 'cancelled', 'canceled'
      )
      and lower(coalesce(wol.status::text, '')) in (
        'on_hold', 'waiting_parts', 'paused'
      )
    ), false)
  into
    v_actionable_count,
    v_nonterminal_count,
    v_pending_line_count,
    v_approved_count,
    v_declined_count,
    v_any_in_progress,
    v_any_on_hold
  from public.work_order_lines wol
  where wol.work_order_id = p_work_order_id;

  select count(*)
  into v_pending_quote_count
  from public.work_order_quote_lines q
  where q.work_order_id = p_work_order_id
    and q.shop_id = v_work_order.shop_id
    and (
      q.sent_to_customer_at is not null
      or lower(coalesce(q.status::text, '')) in ('sent', 'ready_to_send', 'quoted')
    )
    and not (
      lower(coalesce(q.status::text, '')) in (
        'approved', 'converted', 'declined', 'deferred', 'rejected',
        'cancelled', 'canceled'
      )
      or q.stage::text in (
        'customer_approved', 'customer_declined', 'customer_deferred'
      )
      or q.approved_at is not null
      or q.declined_at is not null
      or q.work_order_line_id is not null
    );

  v_next_approval := case
    when v_pending_quote_count + v_pending_line_count > 0
         and v_approved_count > 0 then 'partial'
    when v_pending_quote_count + v_pending_line_count > 0 then 'pending'
    when v_approved_count > 0 and v_declined_count > 0 then 'partial'
    when v_approved_count > 0 then 'approved'
    when v_declined_count > 0 then 'declined'
    else v_work_order.approval_state
  end;

  v_next_status := case
    when v_actionable_count = 0 then 'queued'
    when v_pending_quote_count + v_pending_line_count > 0 then 'awaiting_approval'
    when v_nonterminal_count = 0 then 'ready_to_invoice'
    when v_any_in_progress then 'in_progress'
    when v_any_on_hold then 'on_hold'
    else 'queued'
  end;

  if v_work_order.status is distinct from v_next_status
     or v_work_order.approval_state is distinct from v_next_approval then
    update public.work_orders
    set status = v_next_status,
        approval_state = v_next_approval,
        updated_at = pg_catalog.now()
    where id = p_work_order_id;
  end if;
end;
$function$;

revoke all on function private.reconcile_work_order_state(uuid)
  from public, anon, authenticated;

-- Replace the carry-forward trigger function to use canonical import markers,
-- preserve inspection-origin recommendations, clean evidence on vehicle change,
-- and support estimate -> work_order conversion.
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
  v_root_is_inspection boolean := false;
begin
  if tg_op = 'UPDATE'
     and old.vehicle_id is distinct from new.vehicle_id then
    -- Evidence copied from inspection quote metadata must leave with the carried
    -- line. The canonical media FKs are SET NULL, so delete explicitly first.
    delete from public.work_order_media media
    using public.work_order_quote_lines quote_line
    where quote_line.shop_id = new.shop_id
      and quote_line.work_order_id = new.id
      and lower(coalesce(quote_line.metadata ->> 'carry_forward', 'false')) = 'true'
      and media.shop_id = new.shop_id
      and media.work_order_id = new.id
      and (
        media.quote_line_id = quote_line.id
        or (
          quote_line.work_order_line_id is not null
          and media.work_order_line_id = quote_line.work_order_line_id
        )
      );

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

  -- Only canonical operational work orders receive technical carry-forward.
  -- source_intake_id is the repository's durable imported-history marker.
  if new.vehicle_id is null
     or coalesce(new.record_type::text, 'work_order') <> 'work_order'
     or new.archived_at is not null
     or new.source_intake_id is not null
     or coalesce(new.external_id::text, '') like 'portal_quote:%' then
    return new;
  end if;

  v_actor_user_id := auth.uid();
  if v_actor_user_id is null and new.advisor_id is not null then
    select coalesce(profile.user_id, profile.id)
      into v_actor_user_id
    from public.profiles profile
    where profile.id = new.advisor_id
      and profile.shop_id = new.shop_id;
  end if;

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
      and source_work_order.source_intake_id is null
      and coalesce(source_work_order.external_id::text, '') not like 'portal_quote:%'
      and (
        lower(coalesce(quote_line.status::text, '')) in ('declined', 'deferred')
        or lower(coalesce(quote_line.stage::text, '')) in ('customer_declined', 'customer_deferred')
        or lower(coalesce(quote_line.decision::text, '')) in ('declined', 'deferred')
      )
    order by 1
  loop
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

    select exists (
      select 1
      from public.inspections inspection
      where inspection.shop_id = new.shop_id
        and inspection.work_order_line_id = v_root_line_id
    ) into v_root_is_inspection;

    -- Completing the inspection task does not mean its recommended repair was
    -- completed. A completed non-inspection root repair does resolve itself.
    if not v_root_is_inspection
       and lower(coalesce(v_source_line.status::text, '')) in (
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

    if v_decision is null then
      continue;
    end if;

    -- Only a completed actual repair descendant resolves an inspection-origin
    -- recommendation. The completed inspection anchor itself is excluded.
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
        and (
          descendant_line.id <> v_root_line_id
          or not v_root_is_inspection
        )
    ) then
      continue;
    end if;

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
      coalesce(v_source_line.description, v_latest_quote.description, v_latest_quote.title),
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

-- The existing estimate row becomes operational by record_type transition; run
-- reconciliation on that transition as well as inserts/vehicle reassignment.
drop trigger if exists trg_work_orders_carry_forward_deferred_work
  on public.work_orders;
create trigger trg_work_orders_carry_forward_deferred_work
after insert or update of vehicle_id, record_type on public.work_orders
for each row
execute function public.carry_forward_deferred_work_for_work_order();

comment on function public.carry_forward_deferred_work_for_work_order() is
  'Carries unresolved declined/deferred vehicle repairs into operational work orders; excludes imported/portal records, preserves inspection-origin recommendations, cleans carried media on vehicle reassignment, and reconciles estimate-to-work-order conversion.';

commit;
