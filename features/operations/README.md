# Operations Foundation (Step 1)

This folder introduces a shared, branch-aware maintenance operations foundation for ProFixIQ.

## Purpose

- Establish reusable vertical-level terminology and route configuration.
- Keep fleet as the first live vertical with no behavioral changes.
- Define property terminology/routes for future use only.

## Current State

- **Fleet** is the only actively integrated vertical in this step.
- **Property** is represented in config only (no live routes/pages wired).
- Existing fleet screens, APIs, auth behavior, and Supabase query behavior are unchanged.

## Planned Extraction Path

Future iterations can incrementally extract shared modules for:

1. Shell/navigation containers
2. Control tower/dashboard widgets
3. Request list/detail surfaces
4. Asset list/detail surfaces
5. Vertical-aware permissions/roles
6. Request-to-work-order conversion adapters

## Database

No database migrations are applied as part of this step.
Any future schema expansion should be documented and applied manually.

## Step 2: OperationsPortalShell

- `FleetShell` now uses a shared `OperationsPortalShell` extracted under `features/operations/components`.
- This provides reusable portal shell structure for operations verticals while preserving existing fleet portal behavior and routes.
- Property operations can later reuse this shell with property terminology/routes.
- This step is UI-structure extraction only: no live property routes/pages and no database changes were introduced.

## Step 3: MaintenanceControlTower

- `FleetControlTower` now uses a shared `MaintenanceControlTower` foundation under `features/operations/components`.
- Fleet remains the only live operations vertical in-app.
- Property can later reuse this layout via property-specific adapters and property data sources.
- This step introduces no schema, migration, or route changes.

## Step 4: OperationsAssetDetailScreen

- `Fleet AssetDetailScreen` now delegates the shared asset detail layout to `OperationsAssetDetailScreen` under `features/operations/components`.
- Fleet remains the only live implementation; the existing fleet asset detail fetch, actions, issue actions, stats, and routes are preserved.
- Property operations can later reuse this foundation for property, unit, appliance, or asset records once those pages are intentionally built.
- This step introduces no schema changes, migrations, route changes, or Supabase RLS changes.

## Step 5: Property placeholder branch

- Property now has static/demo placeholder routes that reuse the shared operations components:
  - `OperationsPortalShell` for the property portal frame.
  - `MaintenanceControlTower` for the property maintenance dashboard.
  - `OperationsAssetDetailScreen` for property asset detail demos.
- The property branch uses property terminology and property route config with demo assets, demo requests, and demo vendor follow-ups only.
- No database migrations, schema changes, Supabase RLS changes, tenant/vendor auth wiring, API calls, request conversion, rent, accounting, or lease features are introduced.
- This step only proves the branch-aware UI architecture before any live property maintenance data model is added.

## Step 6: Property operations SQL draft

- A manual Supabase SQL draft was created for future property maintenance operations at `supabase/manual/property-operations-step-6.sql`.
- The draft has not been applied and no SQL was executed as part of this step.
- No app runtime code, APIs, live routes, existing fleet/shop RLS policies, or work-order conversion flows are wired to the proposed tables yet.

## Step 9: Internal property maintenance request creation

- Internal staff can now create property maintenance requests from `/property/requests/new` using authenticated Supabase RLS-scoped reads/writes.
- Request creation is still internal-only for the property branch: no tenant/vendor auth, no public submission surface, and no vendor portal behavior were added.
- Request-to-work-order conversion is still not implemented.

## Step 10: Internal property maintenance request detail + status management

- Added internal request detail at `/property/requests/[id]` with RLS-backed request visibility and linked property/unit/asset/vendor context.
- Internal staff can update request status with constrained server-side validation to approved states only.
- This remains internal-only property maintenance scope: no tenant/vendor auth, no vendor portal behavior, and no public request submission were added.
- Request-to-work-order conversion is still not implemented.

## Step 11A: Property setup workspace shell + read-only setup overview

- `/property/setup` is now a Property Setup workspace shell for internal operations configuration.
- Added live read-only, RLS-scoped lists for portfolios, properties, units, assets, and vendors (up to 5 rows each with counts and empty states).
- Existing internal demo seed action is preserved and moved into a dedicated Demo tools section.
- Create forms for setup entities are still pending.
- No tenant/vendor auth wiring was added.
- No request-to-work-order conversion was added.

## Step 11B: Property setup create forms (portfolio + property only)

- `/property/setup` now includes internal create forms for:
  - Property portfolios
  - Properties
- Portfolio creation supports required `name` and optional `description`, scoped to `profile.shop_id`.
- Property creation supports optional portfolio selection plus property address/status fields, with server-side validation and RLS-visible portfolio checks.
- Setup status handling now includes `portfolio-created`, `property-created`, and `validation-error`.
- Unit, asset, and vendor create forms are still pending for a later step.
- No tenant/vendor auth wiring was added.
- No request-to-work-order conversion was added.
- No schema or migration changes were introduced in this step.

## Step 11C: Property setup create forms (unit + asset)

- `/property/setup` now also includes internal create forms for:
  - Units
  - Assets
- Unit creation is scoped to `profile.shop_id`, requires an RLS-visible property, validates required `unit_label`, and limits `status` to allowed values.
- Asset creation is scoped to `profile.shop_id`, requires an RLS-visible property, optionally links an RLS-visible unit for that property, validates required `name`, and limits `status` to allowed values.
- Setup status handling now also includes `unit-created` and `asset-created` while keeping prior statuses.
- Vendor creation is still pending for a later step.
- No tenant/vendor auth wiring was added.
- No request-to-work-order conversion was added.
- No schema or migration changes were introduced in this step.

## Step 11D: Property setup create form (vendor)

- `/property/setup` now also includes an internal create form for vendor records.
- Vendor creation is scoped to `profile.shop_id`, requires `name`, supports optional `trade` / `contact_name` / `email` / `phone`, validates status (`active` or `inactive`), and keeps `email` as optional record data only.
- Setup status handling now also includes `vendor-created` while keeping prior statuses.
- Vendor auth/linking is still pending and was not added.
- No tenant/vendor auth wiring was added.
- No request-to-work-order conversion was added.
- No schema or migration changes were introduced in this step.

## Step 12: Internal vendor assignment on property request detail

- `/property/requests/[id]` now supports internal-only vendor assignment using RLS-visible vendor records.
- Assignment captures vendor, optional scheduled datetime, and optional notes into `property_vendor_assignments` with assigned status.
- Request detail now shows the latest/current vendor assignment summary and an internal assignment form.
- Vendor contacts remain records only in this step: no vendor portal behavior, no vendor auth, and no vendor-user linking were added.
- No tenant auth changes were added.
- No request-to-work-order conversion was added.
- No schema or migration changes were introduced in this step.

## Step 13: Internal property request to work-order conversion

- `/property/requests/[id]` now supports internal-only conversion of an RLS-visible property maintenance request into a shop work order.
- Conversion uses authenticated user context + `profile.shop_id` checks and never trusts `shop_id` from form input.
- Conversion is idempotent for already-linked requests (`already-converted`) and validates request visibility + shop scope + property context before insert.
- New work orders are created with existing safe work-order defaults (`status: awaiting_approval`, `approval_state: pending`) and include property request context in `work_orders.notes`.
- On successful conversion, `property_maintenance_requests.work_order_id` is linked and request status transitions to `scheduled` (or remains `assigned` when already assigned).
- This step remains internal-only: no tenant/vendor auth wiring, no vendor portal behavior, and no public request submission were added.
- No schema or migration changes were introduced in this step.
- Source-context limitation remains: no `source_property_maintenance_request_id` column is used because it is not part of the current applied `work_orders` schema/types.

## Step 14: Property context card on linked work orders

- Work order detail (`/work-orders/[id]`) now renders a compact, read-only **Property Maintenance Context** card only when the current work order is linked from `property_maintenance_requests.work_order_id`.
- The card shows request metadata (title/status/severity/category), property/unit/asset context, preferred window/access notes, latest vendor assignment, and a link back to `/property/requests/[id]`.
- Data is loaded with the existing authenticated Supabase client and RLS-scoped queries only (no service role usage).
- Behavior is fully additive/read-only: no schema changes, no tenant/vendor auth wiring, and no vendor portal behavior were added.
- Existing non-property work order behavior remains unchanged when no linked property request exists.

## Step 15: Internal property inspection templates + create/fill/list/detail flow

- Added dedicated property inspection templates (move-in, move-out, periodic, maintenance follow-up) in `features/property/lib/propertyInspectionTemplates.ts` for property-maintenance-specific forms (separate from vehicle inspection builders).
- Added internal-only property inspection routes:
  - `/property/inspections` (list)
  - `/property/inspections/new` (template-driven create/fill)
  - `/property/inspections/[id]` (read-only detail)
- Findings are persisted to `property_inspections.findings` JSONB with section/item/status/notes and optional `photo_notes` placeholder.
- No image upload was added in this step; `photo_notes` is a temporary placeholder until later tenant/request media work.
- No tenant request form was added.
- No tenant auth or vendor auth was added.
- No quote flow wiring was added.
- No failed-item conversion or inspection-findings-to-request/work-order conversion was added.
- No schema or migration changes were introduced in this step.

## Step 16: Tenant-side maintenance request intake preview foundation

- Added `/portal/property/request` as a tenant/customer-facing **preview** intake form for property maintenance requests.
- This route currently uses the existing authenticated Supabase RSC + RLS path only (`createServerSupabaseRSC` with logged-in user and `profile.shop_id`), because full tenant portal auth is not wired yet.
- Form submission validates RLS-visible property/unit/asset relationships server-side and inserts into `property_maintenance_requests` with:
  - `status: open`
  - `source: tenant_preview`
  - `photos: []` placeholder
- No public tenant auth, vendor auth, vendor portal behavior, or request-to-work-order conversion changes were added in this step.
- No real file/media upload was added; `photo_notes` is placeholder-only text (`"Describe any photos/videos you would attach. File upload comes later."`).
- No read receipts schema or two-party timeline schema was added yet; UI includes a note that these arrive in a later phase.
- No schema or migration changes were introduced in this step.

## Step 17: Internal conversion of failed property inspection findings to maintenance requests

- Added internal-only conversion on `/property/inspections/[id]` to create property maintenance requests from selected failed findings.
- Conversion uses authenticated/RLS-scoped Supabase server actions only (`createServerSupabaseRSC`, logged-in user, profile + `shop_id` checks) and never trusts `shop_id` from form data.
- Conversion validates that selected finding keys exist in the loaded inspection findings and are `status: fail` before insert.
- Each created request is inserted into `property_maintenance_requests` with inspection-derived property/unit context and conservative defaults:
  - `status: open`
  - `source: inspection_failed_finding`
  - `category: Inspection`
  - `severity: routine`
- Duplicate prevention is implemented without schema changes by checking for existing visible requests with matching property/unit/source and similar title before insert.
- UX includes conversion status banners, failed-item checkbox selection, and explicit note that this step creates requests only (no quotes/work orders).
- No schema or migration changes were introduced.
- No tenant auth, vendor auth, vendor portal behavior, quote flow, vehicle inspection builder changes, or direct work-order conversion from findings were added.

## Step 18A: Manual property request timeline schema draft

- Added `supabase/manual/property-request-timeline-step-18a.sql` as a **manual draft only** for future property request timeline support.
- Draft proposes additive tables for:
  - request timeline events (`property_request_events`)
  - event/request read receipts (`property_request_read_receipts`)
  - attachment metadata placeholders (`property_request_attachments`)
- Includes draft validation triggers to enforce request/event/attachment `shop_id` + `request_id` consistency.
- Includes conservative RLS draft policies for internal staff and limited property-member visibility.
- Vendor RLS remains intentionally deferred pending explicit vendor-user linkage.
- No SQL was executed and no schema was applied by this step.
- No runtime code, route behavior, tenant auth, vendor auth, or real file upload wiring was added.

## Step 18B: Internal property request timeline wiring

- `/property/requests/[id]` now reads and renders RLS-visible `property_request_events` in ascending `created_at` order under a new **Request Timeline** section.
- Internal users can add timeline events from request detail using `comment` or `internal_note` with `internal` or `tenant_visible` visibility via a dedicated server action.
- Existing internal actions now attempt additive timeline logging (non-blocking) for:
  - `status_changed`
  - `vendor_assigned`
  - `work_order_linked`
- This step remains internal-preview only:
  - tenant/vendor auth wiring is still not implemented
  - vendor portal behavior is still not implemented
  - real attachment/image upload is still not implemented
  - read receipts remain deferred (schema ready, party-specific writes pending)
- No schema or migration changes were introduced in this step.

## Step 19C: Internal property request image upload wiring

- `/property/requests/[id]` now supports internal-only image upload via server action-backed storage writes to the private `property_request_attachments` bucket.
- Uploads are validated server-side for authenticated internal users, RLS-visible request/shop scope, allowed image MIME types, and 10 MB max file size.
- Uploaded file paths follow the storage contract: `<shop_id>/property-requests/<request_id>/<timestamp>-<safeFileName>`.
- Attachments persist metadata into `property_request_attachments`, and timeline audit events are logged into `property_request_events`.
- No public bucket behavior or public URL generation was added.
- No tenant auth, vendor auth, or vendor portal behavior was added.
- No schema or migration changes were introduced in this step.

## Step 21B: Internal property member management

- Added `/property/members` for internal staff to manage `property_members` access scopes for existing users/profiles in the same shop.
- Create flow uses authenticated Supabase RSC + RLS only, requires current `profile.shop_id`, and never trusts `shop_id` from form data.
- Server-side validation enforces same-shop user and scope visibility (portfolio/property/unit), role allowlist, scope rules, and duplicate prevention.
- Existing member rows are listed with role and scope context for internal review.
- This step remains internal-only and existing-profile-only:
  - no public invites
  - no email invites
  - no unauthenticated tenant access
  - no vendor portal behavior
- No schema or migration changes were introduced in this step.

## Step 21C: Authenticated property member portal surfaces

- Added authenticated property member portal routes:
  - `/portal/property/member`
  - `/portal/property/member/requests`
  - `/portal/property/member/requests/[id]`
- Access is derived from existing `property_members` rows (`user_id = auth.user.id`) and remains RLS-authenticated only via `createServerSupabaseRSC`.
- If no `property_members` rows exist for the logged-in user, the portal shows:
  - `No property portal access is assigned to this account.`
- Member dashboard now shows assigned scope context (shop/portfolio/property/unit/role) and links to member-visible requests.

- Requests list shows RLS-visible `property_maintenance_requests` within membership shop scope with title, status, severity, labels, created date, and detail links.
- Request detail shows tenant-visible context only:
  - request summary/status/severity/category/property-unit-asset context
  - timeline entries limited to `tenant_visible` and `all_parties`
  - attachment metadata visible through existing RLS reads
  - no internal notes rendered
- Added tenant-visible comment server action (`actions.ts` colocated in request detail route):
  - inserts `property_request_events` as `event_type=comment`, `actor_type=tenant`, `visibility=tenant_visible`
  - requires body + request id and uses authenticated/RLS Supabase client only (no service role)
  - if insert fails (including RLS policy block), an explicit error is surfaced to the user
- Explicitly not included in this step:
  - no public invites
  - no unauthenticated tenant access
  - no email invite sending
  - no vendor portal behavior
  - no tenant file upload yet
- No schema or migration changes were introduced in this step.

## Step 21D: Authenticated property member request submission

- Added authenticated member portal request submission route: `/portal/property/member/requests/new`.
- Submission uses a colocated server action (`createMemberPropertyMaintenanceRequest`) with authenticated `createServerSupabaseRSC` + RLS only.
- Access requires an existing `property_members` row for `auth.user.id`; users without member rows see no-access messaging.
- Validation enforces member-scope property/unit/asset constraints and severity allowlist, and does not trust `shop_id` from form data.
- New requests are inserted into `property_maintenance_requests` with `status: open`, `source: member_portal`, `photos: []`, and tenant actor timeline bootstrap event in `property_request_events`.
- This step does **not** add public invite flow, unauthenticated access, tenant image upload, or vendor portal behavior.
- No schema or migration changes were introduced in this step.

## Step 21E: Authenticated property member request image upload

- Added authenticated property member image upload on `/portal/property/member/requests/[id]` using server-action writes with Supabase RLS and no service role.
- Uploads are restricted to private bucket `property_request_attachments` with scoped storage path: `<shop_id>/property-requests/<request_id>/member-<user_id>-<timestamp>-<safeFileName>`.
- Server-side validation enforces authenticated user, request visibility via `property_members` membership scope, allowed image MIME types (JPEG/PNG/WEBP/HEIC/HEIF), and 10 MB max size.
- Attachment metadata is inserted into `property_request_attachments` and corresponding tenant-visible `attachment_added` timeline events are inserted into `property_request_events`.
- Member request detail now includes image upload form, status banners, and attachment listing with signed previews when available.
- No public invite flow, no unauthenticated access, no vendor portal behavior, no public bucket behavior, and no schema/migration changes were added.

## Step 22B: Internal property portal invite record creation

- Added `/property/invites` for internal staff to create and review `property_portal_invites` records using authenticated Supabase RSC + RLS only.
- Invite creation validates:
  - required normalized `invited_email`
  - role allowlist (`property_manager`, `owner_approver`, `tenant_requester`, `viewer`)
  - `expires_in_days` range (1–30)
  - same-shop visibility for optional `portfolio_id`, `property_id`, `unit_id`
  - unit/property hierarchy when both are provided
  - required scope unless role is `property_manager`
- Invite insertion uses only current profile context for tenancy fields:
  - `shop_id` is sourced from `profile.shop_id` only
  - `created_by_profile_id` is set to `auth.user.id`
- Token handling is internal-safe:
  - raw token is generated server-side
  - only SHA-256 hash is stored in `token_hash`
  - raw token is not exposed in URL/history/UI yet
  - UI confirms invite creation and states email + acceptance wiring are deferred
- Added an internal dashboard action link from `/property` to `/property/invites`.
- This step does **not** add:
  - public invite acceptance routes
  - unauthenticated access
  - email delivery
  - Supabase Auth user creation
  - service-role usage
  - vendor portal behavior
  - schema or migration changes.

## Step 22C: Authenticated property invite acceptance shell

- Added authenticated acceptance route at `/portal/property/invite/accept?token=<raw_token>` with invite summary + accept action wiring.
- Acceptance flow is designed to hash the raw token server-side (`sha256`) and query by `token_hash` only; raw token storage is not added.
- Flow intentionally does **not** send emails, does **not** create Supabase Auth users, and does **not** add unauthenticated/public invite acceptance.
- On successful validation, acceptance attempts to insert `property_members` (duplicate-safe), mark invite accepted, revalidate `/portal/property/member`, and redirect to `?status=invite-accepted`.
- **RLS blocker handling:** if current `property_portal_invites` RLS blocks invitee `SELECT/UPDATE` by token hash, the route/action surfaces a controlled blocker message indicating Step 22D must add a controlled acceptance policy or RPC before runtime acceptance can proceed.
- No schema or migration changes were introduced in this step.

## Step 22D: Manual SQL draft for authenticated property invite acceptance

- Added manual SQL draft at `supabase/manual/property-portal-invite-acceptance-step-22d.sql`.
- Draft proposes a `SECURITY DEFINER` RPC (`public.accept_property_portal_invite(text)`) so authenticated acceptance can be handled without adding broad invite token/email read policies.
- Function validates token hash match, pending status, expiry, and authenticated email match before membership creation/reuse and invite acceptance update.
- RLS posture remains conservative: `property_portal_invites` stays internal-only and no broad token lookup policy is added.
- This step is documentation + manual SQL draft only:
  - no SQL executed
  - no runtime code wiring
  - no service role usage
  - no email sending flow
  - no auth user creation flow
  - no unauthenticated/public acceptance

## Step 22E: Property portal invite acceptance runtime via SECURITY DEFINER RPC

- Updated `/portal/property/invite/accept` acceptance action to use `public.accept_property_portal_invite(p_raw_token)` through the authenticated Supabase RLS client.
- Acceptance no longer performs direct invite table select/update in runtime action logic.
- No service-role client usage was added.
- No email sending was added.
- No Supabase Auth user creation was added.
- No unauthenticated acceptance path was added.
- Acceptance status handling now maps safe statuses for UI messaging: `invite-accepted`, `invite-invalid`, `invite-expired`, `invite-email-mismatch`, and `invite-error`.
- Invite preview now uses a safe generic authenticated confirmation surface when token is present, with details confirmed after secure acceptance.
- No schema or migration changes were introduced in this step.

## Step 22F: One-time property invite link display on create

- Updated `/property/invites` invite creation UX to show a one-time invite acceptance link immediately after a successful invite insert.
- The invite link is returned only in server action state for the current request lifecycle and is not persisted.
- Raw invite token continues to be generated server-side and only `token_hash` is stored in `property_portal_invites`.
- Raw token is not passed through redirect query params and no token is exposed in invite list rows.
- Existing invite rows remain token-blind and now explicitly show: `Link not available. Create a new invite to generate a one-time link.`
- Email sending is still not wired.
- No auth user creation was added.
- No schema or migration changes were introduced in this step.

## Property invite link configuration

- Property invite links require `NEXT_PUBLIC_APP_URL` in production.
- If `NEXT_PUBLIC_APP_URL` is not set, `VERCEL_URL` is used as a fallback when available.


## Step 22: Property inspection worksheet revamp + private inspection photos + member portal inspections

- Revamped internal inspection create UI at `/property/inspections/new` from nested card stacks to a flatter worksheet layout with a clear header, compact type tabs, context controls, and row-based section items.
- Added real inspection image uploads (internal-only) during inspection creation using the existing private `property_request_attachments` bucket path contract:
  - `<shop_id>/property-inspections/<inspection_id>/<finding_key>/<timestamp>-<filename>`
- Inspection findings in `property_inspections.findings` now persist photo metadata arrays (`photos`) per finding JSON object; no schema changes were made.
- Upload flow is resilient: inspection rows are created first, images are attempted after insert, successful uploads are stored, and failed uploads surface warnings without losing the inspection.
- Revamped internal inspection detail at `/property/inspections/[id]` with flatter summary/findings layout and inline photo metadata + signed preview URLs (private signed URLs only, short expiry).
- Moved failed-finding conversion server action out of `app/property/inspections/[id]/page.tsx` into `app/property/inspections/[id]/actions.ts` (behavior preserved: creates `property_maintenance_requests` only, no quote flow, no direct work-order conversion from findings).
- Added authenticated property member portal inspection surfaces:
  - `/portal/property/member/inspections`
  - `/portal/property/member/inspections/[id]`
- Member inspection pages are read-only, membership-scoped, and include signed private photo previews where possible.
- Added navigation link from `/portal/property/member` to member inspections.
- No vehicle custom inspection builder integration was added.
- No quote flow was added.
- No tenant/vendor auth expansion was added.
- No schema or migration changes were introduced.

## Step 24B: Typed/acknowledged property inspection signatures wired

- Wired runtime signature reads/writes for dedicated property inspection detail surfaces:
  - Internal route: `/property/inspections/[id]`
  - Property member portal route: `/portal/property/member/inspections/[id]`
- Added internal signature action for typed/acknowledged signatures with authenticated user + `profile.shop_id` validation, RLS-visible inspection checks, role/type validation, duplicate prevention, and scoped revalidation/redirect statuses.
- Added property member portal acknowledgement action with authenticated member visibility checks through `property_members` + inspection RLS visibility, conservative member-role-to-signer-role mapping, duplicate prevention, and scoped revalidation/redirect statuses.
- Added UI sections and status banners for:
  - `signature-added`
  - `already-signed`
  - `signature-error`
  - `validation-error`
- This step is explicitly limited to typed/acknowledged signature records only.
- No public unauthenticated signing was added.
- No drawn signature canvas was added.
- No signature image upload was added.
- No schema or migration changes were introduced.
- No service role usage was introduced.
- No quote flow or vehicle inspection builder behavior was changed.

## Step 25A: Property inspection print/export pages

- Added authenticated print/export routes for property inspections:
  - Internal: `/property/inspections/[id]/print`
  - Member portal: `/portal/property/member/inspections/[id]/print`
- Print pages render a clean white report layout with inspection metadata, status counts, section-grouped findings, optional signed photo thumbnails, and recorded signatures.
- Export is browser-native only via `window.print()` (print-to-PDF); no generated PDF service/library is introduced in this step.
- Access remains authenticated/RLS-scoped only (no public unauthenticated access).
- No quote flow changes were added.
- No schema or migration changes were introduced in this step.
