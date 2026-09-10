-- private.reconcile_work_order_state assigned 'ready_to_invoice' to
-- public.work_orders.status whenever every actionable line reached a terminal
-- state. That value is not permitted by work_orders_status_check, which has
-- allowed only new, awaiting, awaiting_approval, queued, in_progress, on_hold,
-- planned and completed since the schema baseline, so the reconciler raised
-- 23514 from the trg_wol_status_refresh trigger and rejected the originating
-- work_order_lines write.
--
-- 'completed' is the canonical terminal status in that domain, and it is the
-- same mapping the work_order_lines status normalizer already applies to
-- 'ready_to_invoice'. Only that one branch changes here; the surrounding
-- 'ready_to_invoice' references are work_order_lines.status comparisons and
-- stay as they are. work_orders_status_check is left untouched.

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
    when v_nonterminal_count = 0 then 'completed'
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
