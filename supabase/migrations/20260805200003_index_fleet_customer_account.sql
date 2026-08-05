-- Cover the Fleet customer foreign key for deletes and customer-led lookups.
create index if not exists fleets_customer_id_idx
  on public.fleets (customer_id);
