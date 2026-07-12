-- Payroll timekeeping policy defaults.
-- Additive, non-breaking, shop-scoped via existing shop_payroll_settings RLS policies.

alter table public.shop_payroll_settings
  add column if not exists paid_breaks_per_day smallint not null default 2,
  add column if not exists paid_break_duration_minutes integer not null default 15,
  add column if not exists breaks_are_paid boolean not null default true,
  add column if not exists lunch_is_paid boolean not null default false,
  add column if not exists default_lunch_duration_minutes integer not null default 30,
  add column if not exists lunch_required_after_minutes integer not null default 300;

do $$ begin
  alter table public.shop_payroll_settings
    add constraint shop_payroll_settings_paid_breaks_per_day_chk check (paid_breaks_per_day between 0 and 2);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.shop_payroll_settings
    add constraint shop_payroll_settings_paid_break_duration_minutes_chk check (paid_break_duration_minutes between 0 and 120);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.shop_payroll_settings
    add constraint shop_payroll_settings_default_lunch_duration_minutes_chk check (default_lunch_duration_minutes between 0 and 240);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.shop_payroll_settings
    add constraint shop_payroll_settings_lunch_required_after_minutes_chk check (lunch_required_after_minutes between 0 and 1440);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.shop_payroll_settings
    add constraint shop_payroll_settings_daily_overtime_sensible_chk check (daily_overtime_after_minutes between 0 and 1440);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.shop_payroll_settings
    add constraint shop_payroll_settings_suspicious_shift_sensible_chk check (suspicious_shift_minutes between 60 and 2880);
exception when duplicate_object then null; end $$;
