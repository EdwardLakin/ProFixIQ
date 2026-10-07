-- Ops acquisition reporting reads the first-party marketing ledger through the
-- existing server-only service-role client. Keep browser roles fully revoked
-- and expose only the columns required by the reporting helper.
revoke select on table public.marketing_events from service_role;
grant select (
  id,
  created_at,
  event_name,
  source_path,
  package_key,
  checkout_mode,
  checkout_attempt_id
) on table public.marketing_events to service_role;
