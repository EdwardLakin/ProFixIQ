begin;

-- mark_work_order_picked_up_atomic / reverse_work_order_pickup_atomic
-- (20260928010000_work_order_vehicle_pickup.sql) write picked_up_at,
-- picked_up_by_user_id, collected_by_type, collected_by_name, pickup_notes,
-- pickup_released_unpaid, pickup_release_reason, and
-- pickup_release_authorized_by_user_id directly on work_orders from inside a
-- set_config('app.work_order_pickup_writing', '1', true) boundary -- already
-- the sole authorization signal enforce_work_order_pickup_write_boundary
-- relies on to reject any write to those same columns from outside the RPC.
-- guard_financially_locked_work_order was never told about that boundary, so
-- on any work order with a non-draft invoice version -- 'invoiced' is one of
-- the three statuses the pickup RPC itself requires, and is the normal case
-- for a shop that invoices before releasing the vehicle -- the RPC's own
-- update was rejected with WORK_ORDER_FINANCIALLY_LOCKED before the RPC's
-- logic could ever return successfully.
--
-- Rather than adding those eight columns to the static allow-list (which
-- would exempt them from this check for any future write, not only the
-- reviewed RPC's own), this trusts the exact same session flag the write-
-- boundary trigger already trusts: the function body is otherwise byte-
-- identical to 20260803173514_invoice_finalize_production_contract.sql, with
-- one early return added. For every caller that isn't inside
-- mark_work_order_picked_up_atomic or reverse_work_order_pickup_atomic's own
-- transaction, current_setting('app.work_order_pickup_writing', true) is
-- null, so this is a no-op -- every other financial-lock consumer keeps its
-- exact prior behavior, verified by
-- tests/security/vehicle-pickup-financial-lock.runtime.sql.
create or replace function public.guard_financially_locked_work_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
  v_has_financial_history boolean;
  v_old_source jsonb;
  v_new_source jsonb;
  v_allowed_keys text[] := array[
    'updated_at',
    'invoice_total',
    'payment_status',
    'outstanding_balance',
    'paid_at',
    'status',
    'invoice_sent_at',
    'invoice_last_sent_to',
    'invoice_url',
    'invoice_pdf_url'
  ];
begin
  v_locked := public.work_order_is_financially_locked(old.shop_id, old.id);
  if not v_locked then
    return new;
  end if;

  if coalesce(current_setting('app.work_order_pickup_writing', true), '0') = '1' then
    return new;
  end if;

  v_has_financial_history := coalesce(
    (public.work_order_financial_lock_state(new.shop_id, new.id) ->> 'has_financial_history')::boolean,
    false
  );

  v_old_source := to_jsonb(old) - v_allowed_keys;
  v_new_source := to_jsonb(new) - v_allowed_keys;

  if v_old_source is distinct from v_new_source then
    raise exception using
      errcode = 'P0001',
      message = 'WORK_ORDER_FINANCIALLY_LOCKED',
      detail = format(
        'Operational work-order fields cannot change after invoice finalization for work order %s',
        old.id
      ),
      hint = 'Open an audited correction session before changing finalized work-order source data.';
  end if;

  if old.status is distinct from new.status then
    if not (
      v_has_financial_history
      and lower(coalesce(new.status::text, '')) = 'invoiced'
      and lower(coalesce(old.status::text, '')) <> 'invoiced'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'WORK_ORDER_FINANCIALLY_LOCKED',
        detail = format(
          'Work-order status cannot change after invoice finalization for work order %s',
          old.id
        ),
        hint = 'Open an audited correction session before changing finalized work-order source data.';
    end if;
  end if;

  return new;
end;
$$;

commit;
