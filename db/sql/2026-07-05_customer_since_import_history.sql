-- Preserve imported shop-history relationship dates without taking over database-owned created_at semantics.
alter table public.customers
  add column if not exists customer_since timestamp with time zone;

comment on column public.customers.customer_since is
  'Historical date the customer relationship began, especially from imported DMS/customer CSV history.';

-- Safe backfill: existing customers continue showing their existing created_at until an import provides older history.
update public.customers
set customer_since = created_at
where customer_since is null
  and created_at is not null;
