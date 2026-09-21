-- private.reconcile_work_order_state's v_declined_count filter excluded every
-- row with line_status = 'declined' before the inner condition could count it,
-- so a work order with approved and ordinarily-declined lines (status =
-- 'on_hold', line_status = 'declined') lost its 'partial' approval_state and
-- could flip straight to 'approved' the next time any actionable line
-- reconciled.
--
-- Deferred context can be stamped on either field: passive carry-forward rows
-- use status = 'deferred', while the shop-assistant manual-decision path
-- leaves status = 'on_hold' and sets line_status = 'deferred'. Both are
-- passive context per 20260909163400_preserve_parent_state_for_deferred_
-- context.sql and must stay out of this rollup entirely -- excluding only on
-- status = 'deferred' still let a line_status = 'deferred' row reach the
-- line_status IN ('declined', 'deferred') branch and count toward declined.
-- The count now excludes deferred context on either field and only counts a
-- genuine line_status = 'declined' row (not 'deferred') alongside
-- approval_state = 'declined'.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '15min';

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
    -- Count lines actually declined in THIS work order (status = 'on_hold',
    -- line_status = 'declined', approval_state = 'declined' on the canonical
    -- customer-decline path). Deferred context on either field is passive and
    -- must stay excluded from this rollup, whichever path stamped it; voided/
    -- cancelled lines are never counted either way.
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and lower(coalesce(wol.status::text, '')) <> 'deferred'
        and lower(coalesce(wol.line_status::text, '')) not in (
          'deferred', 'voided', 'cancelled', 'canceled'
        )
        and (
          lower(coalesce(wol.approval_state::text, '')) = 'declined'
          or lower(coalesce(wol.line_status::text, '')) = 'declined'
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

commit;
