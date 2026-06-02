-- Phase 5E-4: owner-configurable shop supplies auto-apply.
-- Additive and nullable/defaulted to avoid breaking existing shop/work-order flows.

alter table public.shops
  add column if not exists shop_supplies_enabled boolean default false,
  add column if not exists shop_supplies_type text default 'percentage',
  add column if not exists shop_supplies_percent numeric,
  add column if not exists shop_supplies_flat_amount numeric,
  add column if not exists shop_supplies_cap_amount numeric;

alter table public.work_orders
  add column if not exists shop_supplies_enabled_override boolean,
  add column if not exists shop_supplies_amount_override numeric;

update public.shops
set
  shop_supplies_enabled = coalesce(shop_supplies_enabled, supplies_percent is not null and supplies_percent > 0),
  shop_supplies_type = coalesce(shop_supplies_type, 'percentage'),
  shop_supplies_percent = coalesce(shop_supplies_percent, supplies_percent)
where supplies_percent is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shops_shop_supplies_type_check'
      and conrelid = 'public.shops'::regclass
  ) then
    alter table public.shops
      add constraint shops_shop_supplies_type_check
      check (shop_supplies_type is null or shop_supplies_type in ('percentage', 'flat'));
  end if;
end $$;

comment on column public.shops.shop_supplies_enabled is 'Default auto-apply flag for shop supplies on quotes/work orders.';
comment on column public.shops.shop_supplies_type is 'Default shop supplies calculation type: percentage or flat.';
comment on column public.shops.shop_supplies_percent is 'Default shop supplies percentage when type is percentage.';
comment on column public.shops.shop_supplies_flat_amount is 'Default shop supplies amount when type is flat.';
comment on column public.shops.shop_supplies_cap_amount is 'Optional cap applied to calculated shop supplies before per-work-order amount overrides.';
comment on column public.work_orders.shop_supplies_enabled_override is 'Nullable per-work-order override for including shop supplies.';
comment on column public.work_orders.shop_supplies_amount_override is 'Nullable per-work-order fixed shop supplies amount override.';
