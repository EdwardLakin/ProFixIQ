-- Durable delivery state for Fleet portal invitations.
--
-- The invitation row previously recorded only the hashed token, so a failed or
-- suppressed delivery existed solely in the HTTP response that reported it.
-- After a refresh an undelivered owning invitation was indistinguishable from a
-- normal pending one, which left a Fleet without a usable owner access path and
-- nothing to retry against.
--
-- Additive only: three nullable columns on fleet_portal_invites. NULL means the
-- invitation predates delivery tracking. New invitations begin in `pending`
-- state before the external email call, so a lost response or failed status
-- update still leaves a durable recovery signal. No existing column, policy,
-- grant, index, constraint, or trigger is altered.

alter table public.fleet_portal_invites
  add column if not exists delivery_status text,
  add column if not exists delivery_attempted_at timestamptz,
  add column if not exists delivery_error text;

comment on column public.fleet_portal_invites.delivery_status is
  'Delivery state: pending, delivered, suppressed, or failed. NULL for invitations created before delivery tracking.';
