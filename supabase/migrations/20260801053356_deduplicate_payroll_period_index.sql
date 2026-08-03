-- The live schema already carries the canonical unique index under the
-- ux_payroll_pay_periods_shop_period name. The repair migration created the
-- same index defensively for environments that lacked it. Keep whichever
-- canonical index predates the repair and remove only the redundant one.

do $deduplicate_payroll_period_index$
begin
  if to_regclass('public.ux_payroll_pay_periods_shop_period') is not null then
    drop index if exists public.payroll_pay_periods_shop_period_key;
  end if;
end
$deduplicate_payroll_period_index$;
