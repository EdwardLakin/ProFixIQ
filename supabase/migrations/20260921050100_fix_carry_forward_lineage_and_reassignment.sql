-- Three reviewed correctness gaps in carry_forward_deferred_work_for_work_order:
--
-- 1. Inspection imports create one work_order_quote_lines row per finding but
--    give every finding from the same inspection the same source_work_order_
--    line_id (the inspection anchor line). The carry-forward loop grouped
--    solely by that shared root, so multiple deferred findings from one
--    inspection collapsed into a single carried line, and completing that one
--    descendant resolved the whole shared lineage. Inspection-imported quote
--    lines carry a stable metadata->>'inspection_finding_identity' (see
--    20260715060100_phase5_atomic_inspection_quote_import.sql); grouping and
--    matching now include that identity when present, falling back to the
--    root line id for non-inspection roots (unchanged behavior there, since a
--    non-inspection root line is already its own single-finding lineage).
--
-- 2. Archival is a visibility state, not resolution: the canonical archive
--    action keeps the work order in customer history. Excluding every
--    declined/deferred recommendation whose source work order was archived
--    meant the next visit for a vehicle lost carry-forward context as soon as
--    an advisor archived a finished visit that contained declined work.
--    source_intake_id (imported records) stays excluded; archived_at no
--    longer does.
--
-- 3. On vehicle reassignment, cleanup deleted a carried line's evidence and
--    quote unconditionally, but only deleted the work_order_line itself while
--    it was still status = 'deferred'. A carried line that had already been
--    activated or completed before reassignment therefore lost its quote and
--    evidence while surviving as an orphaned, provenance-less line on the
--    wrong vehicle. Cleanup is now atomic: evidence, quote, and line are only
--    ever touched together, and only for carried lines still in the passive
--    'deferred' state. A carried line that has been acted on is left fully
--    intact (quote, evidence, and line) rather than partially cleaned up.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '15min';

create or replace function public.carry_forward_deferred_work_for_work_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_root_line_id uuid;
  v_finding_key text;
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
    -- Scoped to still-passive carried lines only (see note 3 above): a carried
    -- line that has already been acted on keeps its evidence.
    delete from public.work_order_media media
    using public.work_order_quote_lines quote_line
    join public.work_order_lines carried_line
      on carried_line.id = quote_line.work_order_line_id
     and carried_line.shop_id = new.shop_id
    where quote_line.shop_id = new.shop_id
      and quote_line.work_order_id = new.id
      and lower(coalesce(quote_line.metadata ->> 'carry_forward', 'false')) = 'true'
      and lower(coalesce(carried_line.status::text, '')) = 'deferred'
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
      join public.work_order_lines carried_line
        on carried_line.id = quote_line.work_order_line_id
       and carried_line.shop_id = new.shop_id
      where quote_line.shop_id = new.shop_id
        and quote_line.work_order_id = new.id
        and quote_line.work_order_line_id is not null
        and lower(coalesce(quote_line.metadata ->> 'carry_forward', 'false')) = 'true'
        and lower(coalesce(carried_line.status::text, '')) = 'deferred'
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

  for v_root_line_id, v_finding_key in
    select distinct
      coalesce(quote_line.source_work_order_line_id, quote_line.work_order_line_id),
      coalesce(
        quote_line.metadata ->> 'inspection_finding_identity',
        coalesce(
          quote_line.source_work_order_line_id,
          quote_line.work_order_line_id
        )::text
      )
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
      and source_work_order.source_intake_id is null
      and coalesce(source_work_order.external_id::text, '') not like 'portal_quote:%'
      and (
        lower(coalesce(quote_line.status::text, '')) in ('declined', 'deferred')
        or lower(coalesce(quote_line.stage::text, '')) in ('customer_declined', 'customer_deferred')
        or lower(coalesce(quote_line.decision::text, '')) in ('declined', 'deferred')
      )
    order by 1, 2
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
      and coalesce(
        quote_line.metadata ->> 'inspection_finding_identity',
        coalesce(
          quote_line.source_work_order_line_id,
          quote_line.work_order_line_id
        )::text
      ) = v_finding_key
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
    -- recommendation, and only a descendant of the SAME finding. The completed
    -- inspection anchor itself is excluded.
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
        and coalesce(
          descendant_quote.metadata ->> 'inspection_finding_identity',
          coalesce(
            descendant_quote.source_work_order_line_id,
            descendant_quote.work_order_line_id
          )::text
        ) = v_finding_key
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
        and coalesce(
          existing.metadata ->> 'inspection_finding_identity',
          existing.source_work_order_line_id::text
        ) = v_finding_key
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

comment on function public.carry_forward_deferred_work_for_work_order() is
  'Carries unresolved declined/deferred vehicle repairs into operational work orders; excludes imported/portal records, preserves inspection-origin recommendations per finding identity, keeps carried evidence/quote/line cleanup atomic on vehicle reassignment, and reconciles estimate-to-work-order conversion. Archival no longer excludes a source work order.';

commit;
