alter table public.shops
  add column if not exists menu_repair_pricing_valid_days integer not null default 30;

alter table public.shops
  drop constraint if exists shops_menu_repair_pricing_valid_days_check;

alter table public.shops
  add constraint shops_menu_repair_pricing_valid_days_check
  check (menu_repair_pricing_valid_days >= 1 and menu_repair_pricing_valid_days <= 90);
