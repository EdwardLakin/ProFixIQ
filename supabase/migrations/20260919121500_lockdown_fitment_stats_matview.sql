-- fitment_stats is a materialized view aggregating part_fitment_events by
-- shop_id/part_id/vehicle_signature_id. Materialized views cannot carry RLS,
-- and this one was selectable by anon and authenticated with no policy layer,
-- exposing every shop's parts usage/allocation counts cross-tenant to anyone
-- holding the public anon key. Nothing in the application queries it, so
-- remove the public grants entirely rather than trying to filter it.

revoke all on table public.fitment_stats from public, anon, authenticated;
