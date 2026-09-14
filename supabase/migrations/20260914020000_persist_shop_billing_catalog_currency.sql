begin;

-- Neither stripe_pricing_model ("product_packages_v1") nor
-- subscription_package (the package key) says whether a package shop is on
-- the new USD catalog or the grandfathered CAD one (see
-- product-package-price-contract.ts's legacyCad handling) — that only lives
-- in which Stripe Price the subscription's primary item actually uses.
-- resolveShopAIFairUseBudgetUsd (features/shared/lib/server/ai-fair-use.ts)
-- needs that distinction to avoid pricing a CAD-grandfathered shop's AI
-- ceiling off the USD list price (Complete is $499 USD vs $449 CAD; a CAD
-- shop is also never charged for additional staff seats, unlike a USD one).
--
-- reconcileProductPackageSubscription (product-package-reconciliation.ts)
-- already determines this on every sync; persist it so AI budget resolution
-- never needs its own live Stripe call on a hot path. Default to the
-- conservative 'cad' reading (smaller assumed revenue, smaller AI ceiling)
-- for every shop until its own reconciliation confirms 'usd' — never the
-- other way around, and no backfill needed: a currently-unreconciled shop
-- gets the safe underestimate, not an overestimate.
alter table public.shops
  add column if not exists billing_catalog_currency text
    not null default 'cad';

alter table public.shops
  drop constraint if exists shops_billing_catalog_currency_check;

alter table public.shops
  add constraint shops_billing_catalog_currency_check
  check (billing_catalog_currency in ('usd', 'cad'))
  not valid;

alter table public.shops
  validate constraint shops_billing_catalog_currency_check;

commit;
