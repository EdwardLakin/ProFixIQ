begin;

-- Portal customers are locked out of the Customer Portal on current main.
--
-- `requirePortalCustomerAccess` (features/portal/server/portalAuth.ts) runs two
-- reads with the end-user client: the caller's own `customers` row, then the
-- accepted invite evidence for that row. Sign-in validates the same invite with
-- the service-role client, so it succeeds and every subsequent portal request
-- then fails the canonical guard.
--
-- Neither read can succeed today:
--
--   * every `public.customers` SELECT policy requires a staff identity -- either
--     `is_staff_for_shop(shop_id)` or a `profiles` row sharing the shop -- and a
--     pure portal customer has no `profiles` row at all;
--   * `public.customer_portal_invites` has RLS enabled with no policy of any
--     kind, so it denies every non-service-role read unconditionally.
--
-- That blocks portal entry and, through the same guard, portal payment
-- checkout. Both policies below are self-scoped: they expose a row only to the
-- authenticated user that row already identifies, and add no cross-customer,
-- cross-shop, or staff-visible surface.

-- A customer may read their own record. Staff visibility keeps flowing through
-- the existing shop-scoped policies, which this does not touch.
drop policy if exists customers_portal_self_select on public.customers;
create policy customers_portal_self_select
  on public.customers
  for select
  to authenticated
  using (user_id = auth.uid());

-- A customer may read the invite evidence that authorizes their own portal
-- session, and nothing else. Restricting the policy itself to accepted and
-- non-revoked rows means revocation removes visibility at the RLS boundary
-- rather than depending on an application filter.
drop policy if exists customer_portal_invites_self_accepted_select
  on public.customer_portal_invites;
create policy customer_portal_invites_self_accepted_select
  on public.customer_portal_invites
  for select
  to authenticated
  using (
    accepted_by_user_id = auth.uid()
    and accepted_at is not null
    and revoked_at is null
  );

-- The invite token is a bearer credential. The portal only ever reads the
-- identity and lifecycle columns, so withhold the token from `authenticated`
-- by replacing the baseline's table-wide SELECT with a column list. Every other
-- column stays readable, so any staff-facing policy keeps working unchanged.
revoke select on public.customer_portal_invites from authenticated;
grant select (
  id,
  customer_id,
  shop_id,
  work_order_id,
  enrollment_campaign_id,
  email,
  source,
  expires_at,
  accepted_at,
  accepted_by_user_id,
  revoked_at,
  acceptance_metadata,
  created_at,
  created_by
) on public.customer_portal_invites to authenticated;

-- `anon` was granted ALL on this table by the schema baseline. Nothing
-- anonymous needs it: invite acceptance runs through the SECURITY DEFINER
-- `accept_customer_portal_invite_atomic`, keyed by invite id rather than by
-- token. RLS denies anon today only because no policy exists, which would stop
-- being true the moment any permissive policy is added.
revoke all on public.customer_portal_invites from anon;

commit;
