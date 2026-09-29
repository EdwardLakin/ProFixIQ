begin;

-- mark_work_order_picked_up_atomic (20260928010000_work_order_vehicle_pickup.sql)
-- writes picked_up_at/picked_up_by_user_id/collected_by_type/collected_by_name/
-- pickup_notes/pickup_released_unpaid/pickup_release_reason/
-- pickup_release_authorized_by_user_id directly on work_orders, guarded by its
-- own app.work_order_pickup_writing write-boundary trigger. It was never added
-- to guard_financially_locked_work_order's allow-list, so on any work order
-- whose invoice has already been finalized - status 'invoiced' is one of the
-- three statuses the pickup RPC itself requires, and is the normal case for a
-- shop that invoices before releasing the vehicle - that same update is
-- rejected by the financial-lock trigger with WORK_ORDER_FINANCIALLY_LOCKED
-- before the pickup RPC's own logic ever gets to return successfully. Vehicle
-- handover, like the invoice-delivery metadata already allowed here, never
-- touches the immutable invoice snapshot, totals, parts, or labor.
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
    'invoice_pdf_url',
    'picked_up_at',
    'picked_up_by_user_id',
    'collected_by_type',
    'collected_by_name',
    'pickup_notes',
    'pickup_released_unpaid',
    'pickup_release_reason',
    'pickup_release_authorized_by_user_id'
  ];
begin
  v_locked := public.work_order_is_financially_locked(old.shop_id, old.id);
  if not v_locked then
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
