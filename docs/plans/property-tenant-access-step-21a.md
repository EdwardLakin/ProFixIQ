# Step 21A Plan: Tenant Access to Property Requests (Manual Design)

## Summary
This document defines a **manual design and SQL planning draft** for enabling authenticated tenant access to property requests without introducing public/unauthenticated access and without adding vendor auth.

This step is planning-only:
- No runtime code changes
- No SQL applied
- No schema changes applied

## Goals
- Represent tenant requesters using `property_members.user_id`.
- Support tenant scoping at `portfolio`, `property`, or `unit` level.
- Allow tenant users to create requests only within their allowed scope.
- Allow tenant users to read request timeline events that are either:
  - owned by that tenant user, or
  - marked visible to tenant/all parties as defined by policy.
- Allow tenant users to insert tenant-visible comments within scoped requests.
- Prepare for tenant attachment uploads under the same request scope (later step).
- Track tenant read receipts for timeline/read-state.

## Current-State Assessment
Known current state:
- Internal property setup, requests, inspections, timeline, attachments, and uploads already exist.
- Tenant request intake preview is authenticated/internal-preview only.
- `property_members` exists with `user_id`, `role`, `portfolio_id`, `property_id`, `unit_id`.
- No tenant portal auth/access model is wired yet.

## Core Access Model (Step 21A Draft)

### Identity source
Use authenticated app users mapped through `property_members.user_id`.

### Tenant role
Use `property_members.role = 'tenant_requester'` (or equivalent normalized role string already used in system enums).

### Scope resolution
Tenant scope is derived from a property member record:
- Portfolio-scoped tenant: `portfolio_id` set, `property_id`/`unit_id` nullable.
- Property-scoped tenant: `property_id` set, `unit_id` nullable.
- Unit-scoped tenant: `unit_id` set.

Access checks for tenant request creation/read/write must validate at least one matching scope boundary and enforce `shop_id` isolation.

### Request creation rules
Tenant can create a request only when:
1. authenticated user is mapped to a tenant member row,
2. target request location is inside that member’s scope,
3. target request row carries the same `shop_id` boundary.

### Timeline read rules
Tenant can read timeline events when:
- event belongs to a request within tenant scope, and
- event visibility is compatible with tenant audience (`tenant_visible`/`all_parties`), or
- event authored by the same tenant user where business policy allows owner-read.

### Timeline comment insert rules
Tenant can add comments only when:
- request is within scope,
- comment visibility is tenant-safe (`tenant_visible`),
- row stays in same `shop_id` and request scope.

### Attachments (future implementation step)
Tenant attachment uploads should reuse identical scope checks as timeline/comment operations:
- scoped request ownership/visibility,
- `shop_id` match,
- role guard (`tenant_requester`).

### Read receipts
Tenant read receipts should record tenant user read state at request/timeline granularity with:
- `shop_id`,
- `request_id` (and optionally latest event pointer),
- `tenant_user_id` (`auth.uid` mapped user),
- `read_at`.

## RLS / Policy Planning Notes (No Changes Applied)
When implemented in future steps:
- RLS must remain enabled and tenant-safe.
- Policies should rely on authenticated identity + `property_members` membership join.
- Never introduce unauthenticated public read/write paths.
- Keep policy predicates explicit on `shop_id` + scope (`portfolio_id`/`property_id`/`unit_id`).

## Future Invite Flow Review (Draft Only)

### Is `property_members` enough now?
For immediate authenticated tenant access, `property_members` is sufficient as the authorization source.

### Why a future invite table may still be needed
A dedicated invite table is useful for onboarding users not yet linked to an internal user record and for expiring/reissuing invite tokens.

Proposed future draft table (not implemented in Step 21A):

`property_portal_invites`
- `id uuid`
- `shop_id`
- `email`
- `portfolio_id/property_id/unit_id`
- `role` default `tenant_requester`
- `token_hash`
- `expires_at`
- `accepted_at`
- `created_at`

This remains design-only for later rollout steps.

## Manual Rollout Sequence (Proposed)
1. Confirm canonical tenant role value for `property_members.role`.
2. Validate existing request/timeline tables carry sufficient scope columns and `shop_id` references.
3. Draft policy SQL (in manual script) for review only.
4. Security review for scope leakage cases (cross-property, cross-unit, cross-shop).
5. Stage test matrix for:
   - unit-scoped tenant,
   - property-scoped tenant,
   - portfolio-scoped tenant,
   - out-of-scope access attempts.
6. Implement SQL in a later approved step after review.

## Out of Scope for Step 21A
- Runtime route/controller/UI code
- Executing SQL migrations
- Applying schema changes
- Public unauthenticated portal access
- Vendor authentication/access
