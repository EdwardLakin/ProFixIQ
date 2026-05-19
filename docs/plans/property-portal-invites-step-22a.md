# Property Portal Invites - Step 22A (Manual SQL/Schema Draft)

## Scope
This step adds a **manual SQL draft** for introducing `public.property_portal_invites`.

This step intentionally does **not**:
- execute or apply SQL,
- add runtime/API code,
- send email,
- add public invite pages,
- add unauthenticated token lookup,
- use service role for acceptance,
- alter existing runtime behavior.

## Proposed Schema
File: `supabase/manual/property-portal-invites-step-22a.sql`

### Table
`public.property_portal_invites`

Key goals:
- internal staff can invite future property portal users (tenant/owner/viewer/property manager),
- invites are tenant-scoped with `shop_id`,
- token storage is hash-only,
- scope references can target portfolio/property/unit,
- hierarchy consistency is enforced with trigger validation,
- RLS is enabled with internal-only access policies for now.

### Allowed values
- `role`: `property_manager | owner_approver | tenant_requester | viewer`
- `status`: `pending | accepted | expired | revoked`

### Constraints and integrity
- `token_hash` unique index,
- scope check: at least one of `portfolio_id/property_id/unit_id` required unless `role = property_manager`,
- trigger enforcement for:
  - `shop_id` consistency across referenced portfolio/property/unit,
  - unit belongs to property when both present,
  - property belongs to portfolio when both present.

### Indexes
- `shop_id`
- `lower(invited_email)`
- unique `token_hash`
- `status`
- `expires_at`
- `property_id`
- `unit_id`

### RLS draft
- enabled on table,
- internal select/insert/update/delete policies scoped by `profiles.shop_id = invites.shop_id`,
- no invitee-by-email access yet,
- no public token lookup policy yet,
- acceptance policy deferred to later controlled server action work.

## Intended Future Flow (Implementation Later)
1. Internal staff creates invite.
2. App generates raw token and stores only `token_hash`.
3. Email sends invite link (deferred in this step).
4. Invite accept route validates token.
5. Authenticated or newly created user accepts invite.
6. App creates/updates `property_members` row.
7. Invite row is marked `accepted` with audit fields.

## Notes / Risk Awareness
- This draft is additive and non-breaking, but should be reviewed against live table shapes (`property_portfolios`, `property_properties`, `property_units`, `profiles`) before application.
- Trigger assumptions about hierarchy columns should be confirmed in staging.
- Because public access is intentionally not added, this draft does not yet enable external self-serve acceptance.
