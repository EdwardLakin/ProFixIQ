# Workspace Platform — Shared Foundation and Authorization Audit

Date: 2026-08-19

## Product decision

ProFixIQ will use the following operating model:

> Queues find the work. Workspaces do the work.

Dispatch, Appointments, Parts, Receiving, Accounting, search, reporting, and
other cross-record queues remain first-class. Selecting one long-lived or
operational resource opens its canonical workspace.

The initial consumers are:

1. Customer / Vehicle Workspace — lifetime record and reference
   implementation.
2. Work Order Workspace — command center for one repair event.
3. Fleet Unit Workspace — future consumer.
4. Field Service Workspace — future consumer/adaptation.

This is a shared presentation, context, and authorization platform. It is not a
single universal data loader and it does not create copied workspace records.

## Protected Work Order ID-page contract

The existing `/work-orders/[id]` experience is the screen technicians live in.
Its one-view layout, interaction speed, and existing operational logic are a
product contract.

For the Workspace Platform foundation:

- `app/work-orders/[id]/page.tsx` is unchanged.
- `app/work-orders/[id]/Client.tsx` is unchanged.
- Existing repair, inspection, parts, punch, estimate, and work-order mutation
  logic is unchanged.
- The existing `WorkOrderOperationalTimelineDock` remains attached.
- A future Work Order Workspace must evolve this page in place at the same
  canonical URL. It must not replace it with a separate, less efficient detail
  page or duplicate its domain services.

Shared Workspace components may later be adopted incrementally where they
preserve the current layout exactly. A visual rewrite is not a prerequisite for
the Work Order Workspace.

## Phase 2A inventory

| Area | Current source | Classification | Foundation decision |
| --- | --- | --- | --- |
| Vehicle read model | `features/vehicles/server/loadVehicleWorkspaceSnapshot.ts` | Vehicle-specific, security-sensitive | Keep resource-specific and server-side. Do not generalize into one workspace loader. |
| Vehicle source-link policy | `features/vehicles/components/VehicleWorkspace.tsx` | Vehicle-specific, security-sensitive | Keep permission decisions beside the vehicle contract. Shared cards receive an already-authorized href or no href. |
| Vehicle role projection | `features/vehicles/server/vehicleWorkspacePermissions.ts` | Transitional authorization | Preserve for current behavior; replace only after an effective capability resolver exists. |
| Shell and responsive spacing | Vehicle Workspace component | Workspace-generic | Extracted as `WorkspaceShell`. |
| Sticky identity header | Vehicle Workspace component | Workspace-generic presentation | Extracted as `WorkspaceHeader`; resource identity remains the caller's responsibility. |
| Action row | Vehicle Workspace component | Workspace-generic presentation | Extracted as `WorkspaceCommandBar`; callers remain responsible for action authorization. |
| Section heading and panel | Vehicle Workspace component | Workspace-generic | Extracted as `WorkspaceSection`. |
| Linked/read-only card surface | Vehicle Workspace component | Workspace-generic presentation | Extracted as `WorkspaceCard`. It is explicitly not an authorization boundary. |
| Status, empty state, source footer | Vehicle Workspace component | Workspace-generic | Extracted as `WorkspaceStatus`, `WorkspaceEmptyState`, and `WorkspaceSourceReference`. |
| Timeline rail | Vehicle Workspace component | Workspace-generic presentation | Extracted as `WorkspaceTimeline` and `WorkspaceTimelineItem`. Event semantics remain resource-specific. |
| Vehicle identity, attention, financial and document cards | Vehicle Workspace component | Vehicle-specific | Keep in Vehicle Workspace until a second consumer proves a shared contract. |
| Copilot route context | `features/assistant/lib/deriveAssistantContext.ts` and Shop Assistant trusted context | Reusable but incomplete | Keep existing behavior. Introduce a serializable `WorkspaceResourceContext`; do not add capabilities until the effective resolver is authoritative. |

The extraction deliberately avoids theoretical abstractions. Vehicle Workspace
remains the reference implementation, and the Work Order ID page is not changed
to prove reuse.

## Shared component security rule

`WorkspaceCard`, `WorkspaceSection`, and future `WorkspaceAccessBoundary`
components are presentation helpers only.

The required request path remains:

1. Authenticate the actor.
2. Resolve tenant and resource scope from trusted server context.
3. Resolve effective capabilities.
4. Query only authorized rows and columns.
5. Shape a role-appropriate snapshot.
6. Render shared components.

Hiding a card in React is never authorization. A restricted payload must not
contain the sensitive data in the first place. Direct Data API access must also
remain protected by grants and RLS where the table is exposed.

## Current authorization audit

### What exists

- `features/shared/lib/rbac.ts` canonicalizes roles and returns a static
  `ActorCapabilities` preset.
- `ROLE_GROUPS` provides shared fixed role allowlists for common routes and
  actions.
- Server page/API guards resolve an authenticated profile and shop before
  running protected work.
- Vehicle Workspace uses a role-shaped server read model and keeps the caller's
  cookie-backed Supabase client so RLS remains part of the boundary.
- Work-order RLS in
  `supabase/migrations/20260716100000_role_gated_work_order_rls.sql` separates
  shop-wide readers from mechanics assigned to a work order or repair line.
- `operational_events` provides a useful canonical event foundation, but its
  current raw read policy is limited to owner/admin/manager.
- Shop Assistant resolves trusted resource context server-side and its tool
  registry checks the existing coarse capability map.

### What does not exist yet

- Shop-customized role policies.
- Individual employee `INHERIT` / `ALLOW` / `DENY` overrides.
- A general protected-capability catalog and grant ceiling.
- A general staff-to-location membership/scope model suitable for Workspace
  authorization.
- One effective resolver shared by UI, API, database policy, and Copilot.
- Immutable audit events for role-policy and individual-override changes.
- A safe delegated permission-administration flow that prevents privilege
  escalation.

`profiles.role` and `profiles.shop_id` are not sufficient for those features.
Product-package entitlements, service-vehicle capabilities, integration
capabilities, and `ai_automation_capability_settings` solve different problems
and must not be repurposed as employee authorization.

## Effective-access target

The next authorization slice should resolve access in this order:

1. Authenticated tenant membership.
2. ProFixIQ role preset.
3. Shop role-policy override.
4. Individual override, with `DENY` taking precedence over `ALLOW`, then
   `INHERIT` falling through.
5. Protected-capability grant ceiling.
6. Resource scope: shop, future location, assignment, and relationship to the
   resource.
7. Effective capability envelope used by UI, API/domain services, RLS/RPC, and
   Copilot tools.

`NONE`, `VIEW`, and `MANAGE` are module presentation states derived from
granular capabilities. They should not replace granular authorization keys.
For example, Work Order Assignment can derive its module state from separate
view and manage capabilities.

The first proving capability should be `work_order.assignment.manage`. It
supports the Lead Hand case without granting a technician the Manager role.

## Database implications for the next authorization slice

No database change is required for this shared presentation foundation.

The effective authorization foundation will likely require new forward-only
schema for:

- capability catalog and protected/grantable metadata;
- shop role-policy overrides;
- individual tri-state overrides;
- resource scope assignments;
- immutable permission audit events;
- stable database helpers used by RLS/RPC.

Before that migration is designed, every current capability consumer and RLS
policy must be mapped. New exposed tables require explicit grants as well as
RLS; authorization data must not be stored in user-editable metadata. Location
scope must not be simulated until a canonical staff/location relationship is
defined.

## Work Order Workspace adoption path

The Work Order Workspace is the second consumer, but it starts from the current
screen rather than replacing it:

1. Keep `/work-orders/[id]`, its one-view layout, and all existing operations.
2. Add a server-loaded, role-shaped Work Order snapshot alongside the current
   client implementation in small compatible steps.
3. Adopt shared shell/header/card/timeline primitives only where visual and
   interaction parity is proven.
4. Turn repair lines into expandable operational containers powered by the
   existing canonical services.
5. Compose Inspection, Parts, Estimate/Approval, Communication, and Timeline
   modules using effective capabilities and resource scope.
6. Add Financials and Invoice only after their column/data-access boundaries are
   enforced for every role.
7. Retire old client-side reads only after the equivalent server projection and
   mutation path are verified.

This preserves technician efficiency while improving authorization and shared
architecture underneath the screen.

## Follow-on delivery sequence

1. **Shared Workspace Foundation** — this slice: extract proven presentation
   primitives and record the authorization audit; no migration.
2. **Effective Authorization Foundation** — capability catalog, shop policies,
   individual overrides, protected grants, initial shop/assignment scope, audit
   events, and direct-access tests.
3. **Customer / Vehicle Phase 2 completion** — continue on the shared
   primitives without changing its canonical read model.
4. **Work Order Workspace MVP** — evolve the existing ID page in place,
   preserving its layout and logic.
5. **Permissions Administration** — business-language role and employee access
   controls with delegated grant ceilings.
6. **Copilot Workspace Integration** — use the same trusted resource context and
   effective authorization resolver as the UI and domain services.

## Exit criteria for this foundation slice

- Vehicle Workspace renders through shared primitives without changing its
  server read model, actions, source-link policy, responsive layout, or content.
- Shared primitives contain no role checks, database calls, or sensitive-data
  decisions.
- The Work Order ID page and client are absent from the task diff.
- No migration or production data change exists.
- Vercel remains production-only (`main: true`, wildcard preview disabled).
- Focused tests, type-check, lint, application checks, build, and final diff
  review pass before publication.
