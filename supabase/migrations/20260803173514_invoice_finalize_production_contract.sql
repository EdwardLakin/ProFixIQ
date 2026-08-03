begin;

create table if not exists public.invoice_pricing_overrides (
  work_order_id uuid primary key references public.work_orders(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  line_labor_totals jsonb not null default '{}'::jsonb,
  part_unit_prices jsonb not null default '{}'::jsonb,
  shop_supplies_amount numeric(12,2),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(line_labor_totals) = 'object'),
  check (jsonb_typeof(part_unit_prices) = 'object'),
  check (shop_supplies_amount is null or shop_supplies_amount >= 0)
);

create index if not exists invoice_pricing_overrides_shop_idx
  on public.invoice_pricing_overrides(shop_id, work_order_id);

alter table public.invoice_pricing_overrides enable row level security;
revoke all on public.invoice_pricing_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.invoice_pricing_overrides to service_role;
grant select on public.invoice_pricing_overrides to authenticated;

drop policy if exists invoice_pricing_overrides_shop_read
  on public.invoice_pricing_overrides;
create policy invoice_pricing_overrides_shop_read
  on public.invoice_pricing_overrides
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.shop_id = invoice_pricing_overrides.shop_id
        and (profile.id = (select auth.uid()) or profile.user_id = (select auth.uid()))
    )
  );

-- Delivery metadata is intentionally mutable after financial finalization. It
-- does not affect the immutable invoice snapshot, totals, parts, or labor.
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
