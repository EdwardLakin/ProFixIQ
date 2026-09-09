-- Carry unresolved declined/deferred repairs into each new work order as
-- non-actionable deferred lines. Provenance reuses the canonical quote-line
-- source_work_order_line_id/source_row_id contract instead of adding a second
-- recommendation subsystem.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '15min';

-- The application already treats deferred as a canonical terminal line state,
-- but the database normalizer still predates it. Extend only that existing
-- contract; keep all legacy aliases and behavior unchanged.
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
    'on_hold', 'completed', 'invoiced', 'deferred'
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
    'invoiced'::text,
    'deferred'::text
  ]));

create or replace function public.carry_forward_deferred_work_for_work_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_candidate record;
  v_new_line_id uuid;
begin
  if new.vehicle_id is null
     or coalesce(new.record_type::text, 'work_order') <> 'work_order'
     or new.archived_at is not null then
    return new;
  end if;

  -- This trigger runs in the same transaction as the parent INSERT. Either the
  -- new work order and every carried deferred line commit together, or neither
  -- does.
  for v_candidate in
    with ranked as (
      select
        q.*,
        coalesce(q.source_work_order_line_id, q.work_order_line_id) as root_line_id,
        row_number() over (
          partition by coalesce(q.source_work_order_line_id, q.work_order_line_id)
          order by
            coalesce(q.deferred_at, q.declined_at, q.updated_at, q.created_at) desc,
            q.id desc
        ) as rn
      from public.work_order_quote_lines q
      where q.shop_id = new.shop_id
        and q.vehicle_id = new.vehicle_id
        and q.work_order_id <> new.id
        and coalesce(q.source_work_order_line_id, q.work_order_line_id) is not null
    ), latest as (
      select *
      from ranked
      where rn = 1
        and (
          lower(coalesce(status::text, '')) in ('declined', 'deferred')
          or lower(coalesce(stage::text, '')) in ('customer_declined', 'customer_deferred')
          or lower(coalesce(decision::text, '')) in ('declined', 'deferred')
        )
    )
    select
      latest.id as source_quote_line_id,
      latest.root_line_id,
      latest.title as quote_title,
      latest.description as quote_description,
      latest.labor_hours,
      latest.est_labor_hours,
      latest.labor_rate,
      latest.labor_total,
      latest.parts_total,
      latest.subtotal,
      latest.discount_total,
      latest.tax_total,
      latest.grand_total,
      latest.decline_reason,
      latest.defer_reason,
      latest.declined_at,
      latest.deferred_at,
      latest.metadata as quote_metadata,
      source_line.complaint,
      source_line.cause,
      source_line.correction,
      source_line.description as line_description,
      source_line.notes as line_notes,
      source_line.job_type,
      source_line.urgency,
      source_line.user_id
    from latest
    join public.work_order_lines source_line
      on source_line.id = latest.root_line_id
     and source_line.shop_id = new.shop_id
     and source_line.vehicle_id = new.vehicle_id
     and source_line.voided_at is null
    where not exists (
      -- A completed descendant resolves the recommendation and stops it from
      -- following the vehicle again.
      select 1
      from public.work_order_quote_lines descendant_quote
      join public.work_order_lines descendant_line
        on descendant_line.id = descendant_quote.work_order_line_id
       and descendant_line.shop_id = new.shop_id
      where descendant_quote.shop_id = new.shop_id
        and descendant_quote.vehicle_id = new.vehicle_id
        and coalesce(
          descendant_quote.source_work_order_line_id,
          descendant_quote.work_order_line_id
        ) = latest.root_line_id
        and lower(coalesce(descendant_line.status::text, '')) in (
          'completed', 'ready_to_invoice', 'invoiced'
        )
        and descendant_line.voided_at is null
    )
    and not exists (
      -- The quote provenance row is the idempotency receipt for this source
      -- repair on this destination work order.
      select 1
      from public.work_order_quote_lines existing
      where existing.shop_id = new.shop_id
        and existing.work_order_id = new.id
        and existing.source_work_order_line_id = latest.root_line_id
    )
  loop
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
      v_candidate.complaint,
      v_candidate.cause,
      v_candidate.correction,
      coalesce(v_candidate.line_description, v_candidate.quote_description, v_candidate.quote_title),
      v_candidate.line_notes,
      'deferred',
      'declined',
      coalesce(v_candidate.job_type, 'repair'),
      new.shop_id,
      v_candidate.user_id,
      v_candidate.urgency
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
      v_candidate.root_line_id,
      v_candidate.source_quote_line_id,
      new.vehicle_id,
      v_candidate.quote_title,
      v_candidate.quote_description,
      'job',
      'deferred',
      'customer_deferred',
      'deferred',
      v_candidate.decline_reason,
      v_candidate.defer_reason,
      coalesce(v_candidate.labor_hours, 0),
      coalesce(v_candidate.est_labor_hours, 0),
      v_candidate.labor_rate,
      coalesce(v_candidate.labor_total, 0),
      coalesce(v_candidate.parts_total, 0),
      coalesce(v_candidate.subtotal, 0),
      coalesce(v_candidate.discount_total, 0),
      coalesce(v_candidate.tax_total, 0),
      coalesce(v_candidate.grand_total, 0),
      coalesce(v_candidate.quote_metadata, '{}'::jsonb) || jsonb_build_object(
        'carry_forward', true,
        'source_quote_line_id', v_candidate.source_quote_line_id,
        'source_work_order_line_id', v_candidate.root_line_id,
        'prior_declined_at', v_candidate.declined_at,
        'prior_deferred_at', v_candidate.deferred_at
      ),
      v_candidate.declined_at,
      v_candidate.deferred_at
    );
  end loop;

  return new;
end;
$function$;

revoke all on function public.carry_forward_deferred_work_for_work_order()
  from public, anon, authenticated;

drop trigger if exists trg_work_orders_carry_forward_deferred_work
  on public.work_orders;
create trigger trg_work_orders_carry_forward_deferred_work
after insert on public.work_orders
for each row
execute function public.carry_forward_deferred_work_for_work_order();

comment on function public.carry_forward_deferred_work_for_work_order() is
  'Atomically carries unresolved prior declined/deferred vehicle repairs into a new work order as deferred, non-actionable lines. Provenance is stored on the copied quote line through source_work_order_line_id/source_row_id.';

commit;
