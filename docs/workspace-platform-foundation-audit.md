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
- `app/work-orders/[id]/Client.tsx` keeps the same layout and interactions. The
  assignment control now reads one effective Workspace capability instead of a
  fixed role boolean.
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
- The first effective Workspace capability,
  `work_order.assignment.manage`, now resolves through the same database-backed
  decision for the Work Order UI, assignment APIs, direct assignment RPC, and
  Shop Assistant.
- Secure ProFixIQ presets preserve current assignment behavior, while shop role
  policies and individual `INHERIT` / `ALLOW` / `DENY` overrides can specialize
  that capability without changing an employee's base role.
- Protected `team.permissions.manage` presets, delegated grant ceilings, tenant
  checks, peer/higher-authority checks, and canonical operational audit events
  guard the initial management RPCs.

### What remains after the first effective-capability slice

- A general staff-to-location membership/scope model suitable for Workspace
  authorization.
- Resource-relationship resolvers beyond the existing Work Order assignment
  rules and RLS.
- Expansion of the catalog from the first proving capability into the full Work
  Order module capability set.
- Business-language Settings and Employee permission administration screens.
- A complete capability envelope for every Copilot tool; assignment is the
  first tool migrated to the shared decision.
- Explicit grant-once/request-access workflows.

`profiles.role` and `profiles.shop_id` are not sufficient for those features.
Product-package entitlements, service-vehicle capabilities, integration
capabilities, and `ai_automation_capability_settings` solve different problems
and must not be repurposed as employee authorization.

## Effective-access target

Effective Workspace capability access resolves in this order:

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

The first proving capability is `work_order.assignment.manage`. It supports the
Lead Hand case without granting a technician the Manager role. Resource scope
continues to be enforced by canonical Work Order relationships and existing
RLS/RPC checks; generalized location scope remains a later, explicit model.

## Effective authorization database foundation

Forward migration
`20260819222852_workspace_authorization_foundation.sql` introduces:

- a canonical capability catalog and secure ProFixIQ role presets;
- shop role policies and individual tri-state overrides (`INHERIT` is the
  absence of an override row);
- a self-scoped effective-capability RPC for authenticated staff;
- guarded management RPCs with protected-capability and grant-authority
  ceilings and per-shop/capability transaction serialization;
- immutable `operational_events` for material permission changes;
- direct-RPC authorization for repair-line assignment and the Shop Assistant
  assignment path.

The four policy tables have RLS enabled and no Data API grants for `anon` or
`authenticated`. Authenticated callers can use only the deliberately scoped
RPCs. Authorization data is not stored in user-editable JWT metadata. The
runtime fixture verifies tenant isolation, linked-profile resolution,
precedence, privilege ceilings, direct-RPC spoof resistance, and audit events.

Location scope is deliberately not simulated; it requires a canonical
staff/location relationship before it can be added safely.

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

1. **Shared Workspace Foundation** — complete: extracted proven presentation
   primitives and recorded the authorization audit.
2. **Effective Authorization Foundation** — this slice: capability catalog,
   shop policies, individual overrides, protected grants, initial
   shop/assignment scope, audit events, and direct-access tests.
3. **Customer / Vehicle Phase 2 completion** — continue on the shared
   primitives without changing its canonical read model.
4. **Work Order Workspace MVP** — evolve the existing ID page in place,
   preserving its layout and logic.
5. **Permissions Administration** — business-language role and employee access
   controls with delegated grant ceilings.
6. **Copilot Workspace Integration** — use the same trusted resource context and
   effective authorization resolver as the UI and domain services.

## Exit criteria for the effective authorization slice

- Work Order assignment presets retain existing authorized roles by default.
- An individual mechanic can be granted assignment management without a role
  promotion, and an individual deny outranks a shop role allow.
- The Work Order ID layout and all canonical operational flows are unchanged.
- UI, API, direct RPC, and Shop Assistant assignment use the same effective
  decision and fail closed if it is unavailable.
- Policy tables are not directly exposed to API-facing roles; cross-shop and
  spoofed direct calls are denied.
- Significant policy changes append immutable operational audit events.
- Vercel remains production-only (`main: true`, wildcard preview disabled).
- Focused tests, clean migration replay/runtime integration, type-check, lint,
  application checks, build, and final diff review pass before publication.
