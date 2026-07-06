-- Invoice import stabilization indexes.
-- These are additive and intended to keep historical invoice billing-page reads
-- and duplicate legacy source-id checks bounded to a shop-scoped, indexed path.

create index concurrently if not exists invoices_shop_imported_historical_issued_created_idx
  on public.invoices (shop_id, issued_at desc nulls last, created_at desc)
  where (metadata->>'imported' = 'true' or metadata->>'read_only' = 'true');

create index concurrently if not exists invoices_metadata_jsonb_path_idx
  on public.invoices using gin (metadata jsonb_path_ops);
