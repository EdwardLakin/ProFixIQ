-- Ops acquisition reporting reads the first-party marketing ledger through the
-- existing server-only service-role client. Keep browser roles fully revoked.
grant select on table public.marketing_events to service_role;
