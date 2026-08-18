-- Production hardening: remove unintended anonymous/cross-tenant access through
-- public views that currently execute with the view owner's privileges.
--
-- Internal views become security-invoker so their base-table RLS policies are
-- enforced for the calling user. Public-facing views retain only the minimum
-- read grants required by their intended surface.

alter view public.ai_training_events_v set (security_invoker = true);
alter view public.stock_balances set (security_invoker = true);
alter view public.v_shift_rollups set (security_invoker = true);
alter view public.v_vehicle_service_history set (security_invoker = true);
alter view public.v_parts_reconciliation set (security_invoker = true);
alter view public.v_global_saved_menu_items set (security_invoker = true);
alter view public.v_video_performance_summary set (security_invoker = true);
alter view public.v_top_content_types_by_shop set (security_invoker = true);
alter view public.shop_reviews_public set (security_invoker = true);

-- Internal/authenticated views: never expose them to anon. Authenticated reads
-- are permitted, but security_invoker ensures the underlying RLS policies
-- determine which rows are visible.
revoke all on table public.ai_training_events_v from public, anon, authenticated;
revoke all on table public.stock_balances from public, anon, authenticated;
revoke all on table public.v_shift_rollups from public, anon, authenticated;
revoke all on table public.v_vehicle_service_history from public, anon, authenticated;
revoke all on table public.v_parts_reconciliation from public, anon, authenticated;
revoke all on table public.v_global_saved_menu_items from public, anon, authenticated;
revoke all on table public.v_video_performance_summary from public, anon, authenticated;
revoke all on table public.v_top_content_types_by_shop from public, anon, authenticated;

grant select on table public.ai_training_events_v to authenticated;
grant select on table public.stock_balances to authenticated;
grant select on table public.v_shift_rollups to authenticated;
grant select on table public.v_vehicle_service_history to authenticated;
grant select on table public.v_parts_reconciliation to authenticated;
grant select on table public.v_global_saved_menu_items to authenticated;
grant select on table public.v_video_performance_summary to authenticated;
grant select on table public.v_top_content_types_by_shop to authenticated;

-- Reviews are intentionally public, and the base table already has a public
-- SELECT RLS policy limited to published (`is_public = true`) reviews.
revoke all on table public.shop_reviews_public from public, anon, authenticated;
grant select on table public.shop_reviews_public to anon, authenticated;

-- Shop public profiles are an intentionally sanitized public projection. The
-- base `shops` table has no anon SELECT policy, so converting this one view to
-- security_invoker would break the public shop-profile surface. Keep the
-- projection behavior but remove every DML privilege and expose SELECT only.
revoke all on table public.shop_public_profiles from public, anon, authenticated;
grant select on table public.shop_public_profiles to anon, authenticated;
