# ProFixIQ release audit — 2026-08-29

This audit supersedes `docs/audits/profixiq-completion-map-2026-07-23.md`, which
predates roughly 300 merged pull requests and is no longer a usable picture of
the product.

Every finding below was verified by reading the code at the audited commit. No
finding is carried forward on the authority of an earlier document or of GitHub
issue #1535; where this audit disagrees with #1535, the code is the authority.

This is now a living release ledger. Status changes after the original audit are
recorded in place only after the corresponding repair is merged and its
exact-head required CI is green.

## Audited baseline

| Item | Value |
| --- | --- |
| Repository | `EdwardLakin/ProFixIQ` |
| Audited `main` | `2933fcaefef819ea180a54a0b940bed0ef90c559` (merge of PR #1568) |
| Method | Direct source/migration reading across three independent passes |
| Claims verified | 21 |
| Superseded ledger | GitHub issue #1535, last reconciled 2026-08-25 |

### Disposition of the earlier audits

- The 35 confirmed issues from the 2026-07-23 audit (#993–#1027) and their
  parent tracker #992 are **all closed**. A spot-check of three Wave 1
  financial-integrity guarantees confirms they are **still intact on current
  `main`** and have not regressed.
- Issue #1535 replaced that audit as the working ledger. This document replaces
  #1535's findings list with a verified one.
- The draft stack #1557, #1559, #1560, #1561, and #1562 was built against
  several of the P0 findings below but is **out of scope and will not be
  merged**. The findings it targeted are therefore still open unless a separate
  merged migration closed them, which this audit records where it happened.

## Summary

| Status | Count |
| --- | --- |
| Fixed | 6 |
| Still open | 15 |
| Partial or indeterminate | 2 |

Two findings were added on 2026-08-30 during the portal repair; see the
addendum at the end of this document. PR #1570 partially repaired item 6, but
the clean-replay sign-in bootstrap and remaining browser-only portal pages stay
open until their customer/invite lookups are policy-independent.

The important correction to #1535 is that the fixes which did land came from
standalone migrations dated 2026-08-25 that are already on `main`, independent of
the abandoned draft stack.

## Closed since the earlier ledger

| Finding | Evidence on current `main` |
| --- | --- |
| Cross-tenant Work Order child writes | `20260825210000_enforce_work_order_child_parent_tenant.sql` adds `rls_helpers.work_order_parent_matches_shop` and restrictive INSERT/UPDATE policies on `work_order_lines` and `work_order_quote_lines`; `refresh_work_order_status()` raises `WORK_ORDER_CHILD_TENANT_MISMATCH`; `work_orders.shop_id` is now immutable. |
| Approval actor spoofing | `20260825203000_bind_approval_rpc_actors.sql` republishes `apply_portal_line_decision_atomic` and `apply_approval_compatibility_bundle_atomic` behind `scheduler_actor_matches`; the unbound cores are revoked from every non-`postgres` role. |
| Field visit execution authorization | `20260825190000_restore_field_visit_execution_assignment.sql` restores manager-or-assigned-operator authority in `dispatch_can_execute`. |
| Service-worker caching of authenticated HTML | `app/sw.ts:38-65` gates every navigation cache behind `isSafePrivateNavigationShell()`; no server route sets the required `x-profixiq-offline-shell` header, so nothing is cached, and caches are swept on `SIGNED_OUT`. |
| Cross-tab offline mutation loss | `features/shared/lib/offline/database.ts` uses per-row transactional writes keyed by `clientMutationId`, with `BroadcastChannel` invalidation and a schema-version rollout fence. |
| Offline history eviction of pending work | `features/shared/lib/offline/mutations.ts:547-575` retains every non-`synced` row unconditionally; the 300-item cap only trims already-synced history. |

## Open — authorization and tenant isolation

1. **Shop product entitlement is not enforced (billing bypass).**
   `profixiq_shop_has_product_access` is called only from the Field and Fleet
   surfaces (`features/mobile/service/server/access.ts:93,136`,
   `features/fleet/lib/resolveFleetActorContext.ts:137`). The shared Shop guards
   `requireShopScopedApiAccess` / `requireShopPageAccess`
   (`features/shared/lib/server/admin-access.ts:169-310`, `69-147`) and the
   `surface === "shop"` branch of `app/api/auth/sign-in/route.ts:214-283` check
   role only. An account on an expired, unpaid, Field-only, or Fleet-only
   package still reaches Shop.

2. **Revoked Customer Portal sessions retain access through specific bypasses.**
   `can_access_conversation`
   (`20260716090050_premier_messaging_foundation.sql:174-210`) and
   `actorCanRead()` (`features/inspections/server/inspectionReportAccess.ts:36-87`)
   both key off `customers.user_id` + `shop_id` with no reference to
   `customer_portal_invites.accepted_at` / `revoked_at`, so an already-issued
   revoked session keeps messaging and inspection-report/PDF access.
   `authorizeWorkOrderEvidence()`
   (`features/work-orders/server/authorizeWorkOrderEvidence.ts:41-83`) likewise
   accepts the service-role `customers.user_id` match without invite evidence;
   `GET /api/work-orders/[id]/media` then returns customer-visible evidence and
   resolved display URLs through an admin client. `/portal/settings` is another
   confirmed bypass: its browser client reads `customers.select("*")` after
   `auth.getUser()` but never checks accepted, non-revoked invite evidence. Under
   production-only `customer_select_own`, a revoked session can therefore still
   fetch the complete customer row, including staff-facing columns.

   Sign-in and the canonical `requirePortalCustomerAccess()` /
   `requirePortalCustomerActor()` path now enforce accepted, non-revoked invite
   evidence across the dashboard, payments, approvals, bookings, requests, and
   other guarded portal routes. PR #1570's weaker `requirePortalCustomer()` does
   not itself check the invite, but its current invoice and Work Order detail-page
   callers immediately perform a session-client Work Order ownership read whose
   RLS requires an accepted, non-revoked invite; those pages are therefore not
   confirmed bypasses. The remaining repair should converge the confirmed
   messaging, inspection-report, Work Order evidence, and settings paths on the
   invite-aware primitive (or an equivalent durable revocation boundary), audit
   the other portal browser callers that resolve `customers` directly, and
   harden shared customer helpers so future consumers cannot omit that check. No
   migration currently clears `customers.user_id` on revocation.

3. **Job punch has no assignment or capability check.**
   `apply_job_punch_transition_atomic`
   (`20260816013256_technician_completion_review_hotfix.sql:427-782`) requires a
   shop profile, actor binding, and an active shift, but never compares
   `p_technician_id` to `work_order_lines.assigned_tech_id`; `start` self-assigns
   (lines 627-636). The four `/api/work-orders/lines/[id]/{start,pause,resume,finish}`
   routes check authentication only.

4. **Inspection writes have no assignment or capability check.**
   `save_inspection_progress_v3_atomic`
   (`20260827215821_repair_inspection_first_save_revision.sql:7-421`) verifies
   `auth.uid() = p_actor_user_id` and any profile in the shop (lines 42-46,
   60-69), with no reference to `work_order_lines.assigned_tech_id` or
   `work_order_line_technicians`.

5. **`job-photos` storage policy is unverifiable from the repository.**
   The table policy `work_order_media_shop_select`
   (`20260729140000_canonical_line_evidence_markup.sql:268-314`) is correctly
   scoped. However, no migration creates the `job-photos` bucket or any
   `storage.objects` policy for it. Application reads go through
   `createSignedUrl`, but the bucket's own RLS is not tracked here and must be
   confirmed directly against the Supabase project.

## Open — core staff workflows currently broken

These are not hardening items; they break daily operation on current `main`.

6. **Customer Portal bootstrap and browser-only pages still depend on
   production-only customer RLS.**
   PR #1570 correctly moved post-login customer and invite authorization behind
   server-side, invite-aware guards, without adding a customer-browser RLS
   policy. However, the `surface === "customer"` branch of
   `app/api/auth/sign-in/route.ts:183-190` still resolves the linked `customers`
   row through the signed-in end-user client before those guards can run. A
   clean-replay database has no SELECT policy admitting a pure portal customer,
   and removing production-only `customer_select_own` under item 17 would expose
   the same dependency in production, so the route denies the new session.

   Fixing that one lookup is necessary but not sufficient. Several downstream
   portal pages still resolve the customer through the browser client. For
   example, `/portal/request/when` repeats the end-user `customers` lookup before
   loading vehicles and shop hours, so a pure portal customer admitted by a
   policy-independent sign-in still cannot request service on clean replay.
   `/portal/settings`, `/portal/vehicles`, `/portal/profile`, and
   `/portal/customer-appointments` contain the same direct-read pattern, and the
   remaining portal callers must be inventoried rather than treating sign-in as
   the entire repair boundary.

   PR #1570 is therefore a partial repair: its protected portal helpers and
   payment checkout no longer depend on customer-table RLS, but the complete
   portal surface is not yet policy-independent. The intended repair is to
   converge sign-in and the remaining browser-only customer/invite lookups on a
   server-side authorization
   path pinned to the verified auth subject and requiring accepted, non-revoked
   invite evidence. It is **not** another customer RLS policy.

7. **Staff cannot approve or decline repair lines.**
   Desktop (`app/work-orders/[id]/Client.tsx:1304,1332`) and Shop Mobile
   (`features/work-orders/mobile/MobileWorkOrderClient.tsx:1147,1173`) both post
   to `/api/work-orders/lines/[id]/approval-decision`, which calls
   `requirePortalCustomerActor` (`route.ts:43`). Staff actions throw
   `PortalAccessError` unless the staff member is also a portal customer.

8. **Assigned Mechanics and Lead Hands cannot punch in.**
   `applyJobPunchTransition.ts:94-98` reads the base line row with the caller's
   RLS-scoped client, but `work_order_lines_financial_capability_select`
   (`20260824020000_enforce_work_order_financial_read_boundaries.sql:96-110`)
   requires `work_order.financial.sell.view` or `work_order.invoice.view`.
   Neither is granted to `mechanic` or `lead_hand`
   (`20260823235900_work_order_workspace_financial_capabilities.sql:97-149`), so
   the pre-check 404s for exactly the technicians who should be punching.

9. **"Send to parts" reports success without creating a request.**
   `sendToParts` / `sendAllPendingToParts`
   (`features/work-orders/mobile/MobileWorkOrderClient.tsx:1195-1226`) only call
   the job-punch `pause` transition and then toast
   `"Sent to parts for quoting"`. No `part_requests` or `part_request_items` row
   is created, so Parts never receives the request.

10. **Voided repair lines are not terminal.**
    UI projections filter `voided_at`, but voiding sets only
    `voided_at`/`voided_by`/`void_reason`
    (`20260714040200_phase3_atomic_line_void.sql:332-337`) and never changes
    `status`, while `apply_job_punch_transition_atomic` blocks `start`/`resume`
    only for `completed`/`invoiced`. A voided line in `in_progress` or
    `awaiting` can still be punched and completed. The void path also never
    checks for open labor segments.

11. **The first Fleet purchaser is locked out of their own Fleet.**
    `app/api/portal/fleet/invites/route.ts:99-181` inserts into `fleets` only,
    creating no `fleet_members` row, while
    `features/fleet/lib/resolveFleetActorContext.ts:180,241-242` requires an
    explicit membership and `requireFleetPortalActor.ts:29-31` redirects the
    purchaser back out.

12. **Field team onboarding has no product path.**
    `20260825001000_align_standalone_field_internal_configuration_authorization.sql:105-107`
    upserts `mobile_field_operators` only for the acting user, and
    `MobileServiceSetup.tsx:460-487` exposes truck assignment but no control to
    enable another technician.

## Open — client-side data isolation

13. **Sign-out destroys unsynced device work with no warning.**
    `PwaRuntime.tsx:228-238` calls `clearOfflineState()` on every `SIGNED_OUT`
    event, which wipes the `mutations`, `snapshots`, and `blobs` tables
    (`features/shared/lib/offline/mutations.ts:1685-1715`,
    `features/shared/lib/offline/database.ts:526-540`). No sign-out call site
    checks for pending work or confirms.

## Partial

14. **Unscoped customer/vehicle draft.** `cv_draft_v1`
    (`app/work-orders/state/useCustomerVehicleDraft.ts:91-95`) persists customer
    contact and vehicle VIN/plate with no user or shop in the key, and the
    create page hydrates it unconditionally. There is no auth-change reset. The
    exposure is narrower than previously recorded because the store uses
    `sessionStorage`, so it does not survive a closed tab.

15. **Tab and form persistence is user-scoped only, and `useTabState` can race.**
    Keys carry a user but never a shop
    (`TabsBridge.tsx:15-20`, `TabsProvider.tsx:44-46`). `TabsProvider` guards a
    mounted auth-key change with a `hydratedStorageKey` ref, but
    `features/shared/hooks/useTabState.ts:47-55` has no equivalent guard: on a
    user switch its persist effect runs with the previous `state` and the new
    `scopedKey`, briefly writing the former user's value into the new user's key
    before rehydration corrects it. This race was identified by this audit and
    is not recorded in #1535.

## Recommended order

1. **Item 6** — make Customer Portal sign-in and remaining browser-only pages
   policy-independent while retaining the accepted, non-revoked invite
   requirement.
2. **Items 7 and 8** — restore staff approval and assigned-technician punch-in.
3. **Items 16 and 17** — reconcile production authorization drift and remove the
   unrestricted-column customer self-read before treating Clean Replay as
   authoritative evidence for the production RLS surface.
4. **Items 1, 2, 3, 4** — the remaining live authorization and billing
   boundaries.
5. **Item 5** — confirm the `job-photos` bucket against the live project and
   bring its policy into the migration chain so it is auditable here.
6. **Items 9, 10, 11, 12** — workflow correctness and onboarding dead ends.
7. **Items 13, 14, 15** — shared-device data isolation.

Repository governance remains outstanding: current `main` is unprotected with
no required status checks, so release-critical code can bypass the audited PR
and CI loop.

## Addendum — 2026-08-30

Both findings below were discovered while repairing finding 6 in PR #1570, and
were confirmed by a read-only `pg_policies` query against the production project
`scjjkmuwadwkaaqjoigx`. No production data or schema was modified.

The audited baseline for this addendum is `main` at
`b5c402d714a17e618bf73f2d507762ac49435f4b`, the merge of PR #1569.

### 16. Production RLS has drifted from the migration chain

Security-relevant policies exist in production that no migration in this
repository creates, and at least one committed policy differs from what
production actually runs.

| Table | Policy | Command | Predicate | In the migration chain? |
| --- | --- | --- | --- | --- |
| `customers` | `customer_select_own` | SELECT | `user_id = auth.uid()` | **No** |
| `customer_portal_invites` | `cpi_staff_rw` | ALL | shop member via `is_shop_member_v2` | **No** |
| `customers` | `customers_by_profile_shop_select` | SELECT | production matches `profiles.user_id = auth.uid()` | Yes, but the committed baseline matches `profiles.id = auth.uid()` |

The consequence is larger than the individual policies. **Supabase Clean Replay
does not exercise production's real authorization surface.** It replays the
migration chain, so any policy that exists only in production is invisible to
it, and any policy that differs is tested in its committed form rather than its
deployed one. A green Clean Replay is therefore weaker evidence than it appears
for anything RLS-dependent, in either direction: it can pass while production is
more permissive, and it can fail while production is fine.

This is the second confirmed instance of the same class. Finding 5 records that
the `job-photos` bucket and its `storage.objects` policies are likewise absent
from the chain, which is why that finding could not be resolved from the
repository at all.

Reconciling policy drift into forward migrations is its own workstream. It
should not be folded into a feature or repair PR, and under AGENTS.md it is a
contract change on pre-existing objects requiring explicit approval.

### 17. A live unrestricted-column self-read on `customers`

`customers.customer_select_own` grants row access with no column restriction,
and RLS restricts rows rather than columns. Any authenticated account whose
`auth.uid()` matches `customers.user_id` can therefore read **every column of
its own row** through the Data API, including `notes`, `import_notes`,
`import_confidence`, `archive_reason`, `archived_by`, `merge_reason`,
`merged_by`, `external_id`, `created_by`, `source_intake_id`, and
`source_row_id`.

These are staff-facing fields. `notes`, `merge_reason`, and `archive_reason` in
particular are where a shop records candid internal assessments of a customer,
so the exposure is a business and possibly legal concern rather than only a
data-hygiene one.

This is live on the current release and predates PR #1570. Two portal surfaces
already issue `select("*")` against `customers`
(`app/portal/settings/page.tsx:107`, `app/portal/vehicles/page.tsx:123`), so no
crafted query is required to reach the data once a session can load those pages.

PR #1570 neither widens nor fixes this. It removes the canonical portal actor
path's dependence on the policy by resolving identity server-side, but the
browser-only callers above still depend on the policy and the policy itself
remains.

Closing it is constrained in a way worth recording, because the obvious remedies
do not work here:

- **Column privileges cannot narrow it.** Grants are role-wide, and staff and
  portal customers are both the `authenticated` role, so withholding `notes`
  from customers also withholds it from staff.
- **A view does not close it.** `20260818160000_harden_security_definer_views.sql`
  standardised views on `security_invoker = true`, so a view still evaluates the
  base-table policy and a direct query against `customers` keeps returning the
  same columns.

The workable options are an owner-privilege projection, which cuts against that
view convention, or replacing `customer_select_own` with a narrower policy and
routing customer self-service through authorized server paths. Either is a
contract change on a pre-existing object and needs explicit approval.

### Revised priority

Item 6 remains first until sign-in and the remaining browser-only portal pages
use policy-independent, invite-aware customer resolution. PR #1570 repaired the
canonical downstream authorization path but not every clean-replay dependency.
Items 7 and 8 follow as the two broken daily staff workflows. Findings 16 and 17
come next because they determine whether Clean Replay is authoritative evidence
for the deployed authorization surface;
then the remaining authorization, workflow, onboarding, and client-isolation
items follow the Recommended order above.
