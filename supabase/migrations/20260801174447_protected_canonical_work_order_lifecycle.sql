begin;

-- The operational lifecycle is a protected projection, not another mutable
-- work-order status column. Detailed quote, approval, parts, technician, and
-- financial states remain authoritative and are folded into exactly nine
-- shop-facing stages here.
create or replace view public.v_work_order_board_cards_shop
with (security_invoker = true)
as
with line_rollup as (
  select
    wol.work_order_id,
    count(*) filter (where wol.voided_at is null) as jobs_total,
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.status::text, '')) in ('completed', 'ready_to_invoice', 'invoiced')
    ) as jobs_completed,
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.status::text, '')) not in (
          'completed', 'ready_to_invoice', 'invoiced', 'declined', 'deferred'
        )
    ) as jobs_open,
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) <> 'info'
        and lower(coalesce(wol.status::text, '')) not in (
          'declined', 'deferred', 'cancelled', 'canceled'
        )
    ) as executable_jobs_total,
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) <> 'info'
        and lower(coalesce(wol.status::text, '')) in (
          'completed', 'ready_to_invoice', 'invoiced'
        )
    ) as executable_jobs_completed,
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.status::text, '')) in (
          'awaiting_approval', 'waiting_parts', 'on_hold', 'paused'
        )
    ) as jobs_blocked,
    bool_or(
      wol.voided_at is null
      and lower(coalesce(wol.status::text, '')) in ('in_progress', 'active')
    ) as any_in_progress,
    bool_or(
      wol.voided_at is null
      and lower(coalesce(wol.status::text, '')) in ('waiting_parts', 'on_hold', 'paused')
    ) as any_waiting,
    bool_or(
      wol.voided_at is null
      and (
        lower(coalesce(wol.status::text, '')) = 'approved'
        or lower(coalesce(wol.approval_state::text, '')) = 'approved'
      )
    ) as any_authorized,
    bool_or(
      wol.voided_at is null
      and lower(coalesce(wol.status::text, '')) = 'awaiting_approval'
    ) as any_awaiting_approval
  from public.work_order_lines wol
  group by wol.work_order_id
), parts_rollup as (
  select
    wol.work_order_id,
    count(*) filter (
      where lower(coalesce(prq.status::text, '')) not in (
        'cancelled', 'deferred', 'fulfilled', 'rejected', 'returned'
      )
      and lower(coalesce(pri.status::text, '')) not in (
        'cancelled', 'consumed', 'fulfilled', 'returned'
      )
      and greatest(
            coalesce(pri.qty_approved, 0::numeric),
            coalesce(pri.qty_ordered, 0::numeric),
            coalesce(pri.qty_requested, 0::numeric),
            coalesce(pri.qty, 0::numeric)
          ) > 0
      and greatest(
            coalesce(pri.qty_consumed, 0::numeric) - coalesce(pri.qty_returned, 0::numeric),
            0::numeric
          )
        < greatest(
            coalesce(pri.qty_approved, 0::numeric),
            coalesce(pri.qty_ordered, 0::numeric),
            coalesce(pri.qty_requested, 0::numeric),
            coalesce(pri.qty, 0::numeric)
          )
      and (
        lower(coalesce(prq.status::text, '')) in (
          'approved', 'partially_consumed', 'partially_ordered', 'partially_returned'
        )
        or lower(coalesce(pri.status::text, '')) in (
          'approved', 'reserved', 'picking', 'picked', 'ordered',
          'partially_ordered', 'partially_received', 'received'
        )
        or coalesce(pri.qty_ordered, 0::numeric) > 0
        or coalesce(pri.qty_received, 0::numeric) > 0
        or coalesce(pri.qty_reserved, 0::numeric) > 0
      )
    ) as parts_blocker_count,
    bool_or(
      lower(coalesce(prq.status::text, '')) not in (
        'cancelled', 'deferred', 'fulfilled', 'rejected', 'returned'
      )
      and lower(coalesce(pri.status::text, '')) not in (
        'cancelled', 'consumed', 'fulfilled', 'returned'
      )
      and greatest(
            coalesce(pri.qty_approved, 0::numeric),
            coalesce(pri.qty_ordered, 0::numeric),
            coalesce(pri.qty_requested, 0::numeric),
            coalesce(pri.qty, 0::numeric)
          ) > 0
      and greatest(
            coalesce(pri.qty_consumed, 0::numeric) - coalesce(pri.qty_returned, 0::numeric),
            0::numeric
          )
        < greatest(
            coalesce(pri.qty_approved, 0::numeric),
            coalesce(pri.qty_ordered, 0::numeric),
            coalesce(pri.qty_requested, 0::numeric),
            coalesce(pri.qty, 0::numeric)
          )
      and (
        lower(coalesce(prq.status::text, '')) in (
          'approved', 'partially_consumed', 'partially_ordered', 'partially_returned'
        )
        or lower(coalesce(pri.status::text, '')) in (
          'approved', 'reserved', 'picking', 'picked', 'ordered',
          'partially_ordered', 'partially_received', 'received'
        )
        or coalesce(pri.qty_ordered, 0::numeric) > 0
        or coalesce(pri.qty_received, 0::numeric) > 0
        or coalesce(pri.qty_reserved, 0::numeric) > 0
      )
    ) as has_waiting_parts
  from public.part_request_items pri
  join public.part_requests prq on prq.id = pri.request_id
  join public.work_order_lines wol on wol.id = pri.work_order_line_id
  where wol.voided_at is null
  group by wol.work_order_id
), quote_rollup as (
  select
    q.work_order_id,
    count(*) filter (
      where lower(coalesce(q.status::text, '')) not in (
        'approved', 'converted', 'declined', 'deferred', 'rejected',
        'cancelled', 'canceled'
      )
    ) as quote_lines_open,
    bool_or(
      (
        q.sent_to_customer_at is not null
        or lower(coalesce(q.status::text, '')) = 'sent'
        or lower(coalesce(q.stage::text, '')) = 'sent'
      )
      and q.approved_at is null
      and q.declined_at is null
      and q.work_order_line_id is null
      and lower(coalesce(q.status::text, '')) not in (
        'approved', 'converted', 'declined', 'deferred', 'rejected',
        'cancelled', 'canceled'
      )
    ) as any_awaiting_decision
  from public.work_order_quote_lines q
  group by q.work_order_id
), tech_rollup as (
  select
    wol.work_order_id,
    count(distinct wolt.technician_id) as assigned_tech_count,
    min(nullif(p.full_name, '')) as first_tech_name,
    array_remove(array_agg(distinct nullif(p.full_name, '')), null::text) as tech_names
  from public.work_order_line_technicians wolt
  join public.work_order_lines wol on wol.id = wolt.work_order_line_id
  left join public.profiles p on p.id = wolt.technician_id
  where wol.voided_at is null
  group by wol.work_order_id
)
select
  w.id as work_order_id,
  w.custom_id,
  w.shop_id,
  w.customer_id,
  w.vehicle_id,
  coalesce(
    nullif(c.business_name, ''),
    nullif(c.name, ''),
    nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
    'Customer'
  ) as display_name,
  nullif(v.unit_number, '') as unit_label,
  nullif(trim(concat_ws(' ', v.year::text, v.make, v.model)), '') as vehicle_label,
  coalesce(lr.jobs_total, 0)::integer as jobs_total,
  coalesce(lr.jobs_completed, 0)::integer as jobs_completed,
  case
    when coalesce(lr.jobs_total, 0) = 0 then 0::numeric
    else round(
      coalesce(lr.jobs_completed, 0)::numeric
      / nullif(lr.jobs_total, 0)::numeric
      * 100::numeric
    )
  end::integer as progress_pct,
  coalesce(pr.parts_blocker_count, 0)::integer as parts_blocker_count,
  coalesce(pr.has_waiting_parts, false) as has_waiting_parts,
  coalesce(tr.assigned_tech_count, 0)::integer as assigned_tech_count,
  case
    when coalesce(tr.assigned_tech_count, 0) = 0 then 'Unassigned'::text
    when coalesce(tr.assigned_tech_count, 0) = 1 then coalesce(tr.first_tech_name, 'Assigned'::text)
    else coalesce(tr.first_tech_name, 'Assigned'::text) || ' +' || (tr.assigned_tech_count - 1)::text
  end as assigned_summary,
  stage.overall_stage,
  case
    when coalesce(pr.has_waiting_parts, false)
      and coalesce(w.updated_at, w.created_at) < now() - interval '48 hours'
      then 'danger'::text
    when stage.overall_stage in ('waiting', 'awaiting_approval')
      and coalesce(w.updated_at, w.created_at) < now() - interval '24 hours'
      then 'warn'::text
    else 'none'::text
  end as risk_level,
  case
    when coalesce(pr.has_waiting_parts, false)
      and coalesce(w.updated_at, w.created_at) < now() - interval '48 hours'
      then 'Waiting on parts too long'::text
    when stage.overall_stage = 'waiting'
      and coalesce(w.updated_at, w.created_at) < now() - interval '24 hours'
      then 'Waiting too long'::text
    when stage.overall_stage = 'awaiting_approval'
      and coalesce(w.updated_at, w.created_at) < now() - interval '24 hours'
      then 'Approval pending too long'::text
    else null::text
  end as risk_reason,
  greatest(0::numeric, extract(epoch from now() - coalesce(w.updated_at, w.created_at)))::bigint
    as time_in_stage_seconds,
  coalesce(w.updated_at, w.created_at) as activity_at,
  null::text as portal_stage_label,
  null::text as portal_status_note,
  null::text as fleet_stage_label,
  w.priority,
  coalesce(w.is_waiter, false) as is_waiter,
  w.advisor_id,
  nullif(ap.full_name, '') as advisor_name,
  tr.first_tech_name,
  tr.tech_names,
  coalesce(lr.jobs_open, 0)::integer as jobs_open,
  coalesce(lr.jobs_blocked, 0)::integer as jobs_blocked,
  case
    when coalesce(pr.has_waiting_parts, false)
      then coalesce(pr.parts_blocker_count, 0)::integer
    else 0
  end as jobs_waiting_parts
from public.work_orders w
left join line_rollup lr on lr.work_order_id = w.id
left join parts_rollup pr on pr.work_order_id = w.id
left join quote_rollup qr on qr.work_order_id = w.id
left join tech_rollup tr on tr.work_order_id = w.id
left join public.customers c on c.id = w.customer_id
left join public.vehicles v on v.id = w.vehicle_id
left join public.profiles ap on ap.id = w.advisor_id
cross join lateral (
  select case
    when lower(coalesce(w.status::text, '')) in (
      'closed', 'completed', 'invoiced', 'cancelled', 'canceled'
    ) then 'closed'::text
    when lower(coalesce(w.status::text, '')) in ('ready', 'ready_to_invoice')
      then 'ready'::text
    when coalesce(lr.executable_jobs_total, 0) > 0
      and coalesce(lr.executable_jobs_completed, 0) = coalesce(lr.executable_jobs_total, 0)
      then 'quality_check'::text
    when coalesce(lr.any_waiting, false)
      or coalesce(pr.has_waiting_parts, false)
      or lower(coalesce(w.status::text, '')) in ('waiting', 'waiting_parts', 'on_hold', 'paused', 'planned')
      then 'waiting'::text
    when coalesce(lr.any_in_progress, false)
      or lower(coalesce(w.status::text, '')) in ('in_progress', 'active')
      then 'in_progress'::text
    when coalesce(lr.any_authorized, false)
      or lower(coalesce(w.approval_state::text, '')) in ('approved', 'partial')
      or lower(coalesce(w.status::text, '')) in ('approved', 'authorized')
      then 'authorized'::text
    when coalesce(qr.any_awaiting_decision, false)
      or coalesce(lr.any_awaiting_approval, false)
      or lower(coalesce(w.approval_state::text, '')) in (
        'awaiting_approval', 'pending', 'sent'
      )
      or lower(coalesce(w.status::text, '')) in ('awaiting_approval', 'quote_sent')
      then 'awaiting_approval'::text
    when coalesce(qr.quote_lines_open, 0) > 0
      or coalesce(lr.jobs_total, 0) > 0
      or lower(coalesce(w.status::text, '')) in ('estimate', 'awaiting_inspection', 'inspection', 'recommended')
      then 'estimate'::text
    else 'intake'::text
  end as overall_stage
) stage;

create or replace view public.v_work_order_board_cards_fleet
with (security_invoker = true)
as
select
  s.work_order_id,
  s.custom_id,
  s.shop_id,
  s.customer_id,
  s.vehicle_id,
  fv.fleet_id,
  f.name as fleet_name,
  s.display_name,
  s.unit_label,
  s.vehicle_label,
  s.jobs_total,
  s.jobs_completed,
  s.progress_pct,
  s.parts_blocker_count,
  s.has_waiting_parts,
  s.assigned_tech_count,
  s.assigned_summary,
  s.overall_stage,
  s.risk_level,
  s.risk_reason,
  s.time_in_stage_seconds,
  s.activity_at,
  s.portal_stage_label,
  s.portal_status_note,
  case s.overall_stage
    when 'intake' then 'Intake'
    when 'estimate' then 'Estimate'
    when 'awaiting_approval' then 'Awaiting approval'
    when 'authorized' then 'Authorized'
    when 'waiting' then 'Waiting'
    when 'in_progress' then 'In progress'
    when 'quality_check' then 'Quality check'
    when 'ready' then 'Ready'
    when 'closed' then 'Closed'
    else 'Intake'
  end::text as fleet_stage_label,
  s.priority,
  s.is_waiter,
  s.advisor_id,
  s.advisor_name,
  s.first_tech_name,
  s.tech_names,
  s.jobs_open,
  s.jobs_blocked,
  s.jobs_waiting_parts
from public.v_work_order_board_cards_shop s
left join public.fleet_vehicles fv on fv.vehicle_id = s.vehicle_id
left join public.fleets f on f.id = fv.fleet_id;

create or replace view public.v_work_order_board_cards_portal
with (security_invoker = true)
as
select
  s.work_order_id,
  s.custom_id,
  s.shop_id,
  s.customer_id,
  s.vehicle_id,
  null::uuid as fleet_id,
  null::text as fleet_name,
  s.display_name,
  s.unit_label,
  s.vehicle_label,
  s.jobs_total,
  s.jobs_completed,
  s.progress_pct,
  s.parts_blocker_count,
  s.has_waiting_parts,
  s.assigned_tech_count,
  null::text as assigned_summary,
  s.overall_stage,
  null::text as risk_level,
  null::text as risk_reason,
  s.time_in_stage_seconds,
  s.activity_at,
  case s.overall_stage
    when 'awaiting_approval' then 'Your approval is needed'
    when 'authorized' then 'Approved'
    when 'waiting' then 'Preparing for service'
    when 'in_progress' then 'In service'
    when 'quality_check' then 'Final checks'
    when 'ready' then 'Ready'
    when 'closed' then 'Closed'
    else 'Being reviewed'
  end::text as portal_stage_label,
  case s.overall_stage
    when 'intake' then 'Your request has been received.'
    when 'estimate' then 'The shop is reviewing the work and preparing your estimate.'
    when 'awaiting_approval' then 'Please review the estimate and choose which work to authorize.'
    when 'authorized' then 'Your approved work is ready for the shop to begin.'
    when 'waiting' then 'The shop is preparing for the next step in your service.'
    when 'in_progress' then 'Your vehicle is currently being worked on.'
    when 'quality_check' then 'Repairs are complete and final checks are underway.'
    when 'ready' then 'Your vehicle is ready.'
    when 'closed' then 'This service visit is complete.'
    else 'Your request has been received.'
  end::text as portal_status_note,
  null::text as fleet_stage_label,
  s.priority,
  s.is_waiter,
  s.advisor_id,
  null::text as advisor_name,
  s.first_tech_name,
  null::text[] as tech_names,
  s.jobs_open,
  s.jobs_blocked,
  s.jobs_waiting_parts
from public.v_work_order_board_cards_shop s;

-- Supabase projects created after the 2026 Data API exposure change require
-- explicit grants. Reassert them even though these views already existed.
revoke all privileges on table
  public.v_work_order_board_cards_shop,
  public.v_work_order_board_cards_fleet,
  public.v_work_order_board_cards_portal
from anon, authenticated;

revoke all privileges on table
  public.v_work_order_board_cards_shop,
  public.v_work_order_board_cards_fleet,
  public.v_work_order_board_cards_portal
from service_role;

grant select on table
  public.v_work_order_board_cards_shop,
  public.v_work_order_board_cards_fleet,
  public.v_work_order_board_cards_portal
to authenticated, service_role;

comment on view public.v_work_order_board_cards_shop is
  'Protected nine-stage work-order lifecycle projection derived from detailed operational records.';

notify pgrst, 'reload schema';

commit;
