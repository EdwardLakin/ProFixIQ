# Workspace Authorization

How ProFixIQ decides what an employee is allowed to do, and the rules for
adding to that decision.

## Resolution order

An effective capability is resolved in exactly this order:

1. **Authenticated tenant membership** — the actor must resolve to a canonical
   staff profile in the shop the resource belongs to. Imported staff link
   through `profiles.user_id`; both identities resolve to the same canonical
   `profiles.id`.
2. **ProFixIQ role preset** — `workspace_role_capability_presets`, the secure
   default for a canonical Shop role.
3. **Shop role policy** — `shop_role_capability_policies`, a shop's explicit
   customization of one role. The absence of a row means "use the ProFixIQ
   default"; presets are never copied into a shop to simulate inheritance.
4. **Individual override** — `staff_capability_overrides`. `DENY` wins over an
   inherited allow, `ALLOW` wins over an inherited deny, and `INHERIT` is the
   absence of a row, so it re-resolves steps 2–3 rather than granting.
5. **Protected-capability grant ceiling** — a capability marked
   `is_protected` ignores steps 3 and 4 entirely and resolves from the preset.
   A delegated administrator may reduce a lower-authority employee or role to
   `DENY` without holding the capability, but `ALLOW` — and an `INHERIT`
   transition that would restore access — requires that they hold it.
6. **Resource scope** — shop, work-order assignment, and repair-line
   relationship. Location scope does not exist: there is no canonical
   staff-to-location membership yet, and it is not simulated from client state.
7. **Effective capability envelope** — the same decision used by the UI, the
   API/domain services, RLS and RPCs, and Shop Assistant tools.

`NONE` / `VIEW` / `MANAGE` are presentation states derived from granular
capabilities. They never replace a granular key.

## Where the decision lives

| Layer | Entry point |
| --- | --- |
| Database resolver | `private.resolve_workspace_profile_capability(profile, shop, capability)` |
| Self-scoped read | `public.workspace_current_actor_capabilities(text[])` |
| RLS predicate | `public.workspace_actor_has_capability(shop, capability)` |
| Procedure assert | `private.workspace_assert_capability(shop, capability, message)` |
| Server | `resolveCurrentWorkspaceCapabilities` and `requireShopScopedApiAccess({ requiredWorkspaceCapability })` |
| Page guard | `requireShopPageAccess({ requiredWorkspaceCapability })` |
| Client | `useWorkspaceCapabilities()` — presentation only |
| Shop Assistant | `requiredWorkspaceCapability` on a tool definition |

Every one of these fails closed. A resolver error denies; a capability missing
from a payload stays denied; an unrecognized decision source denies.

## Administrative surfaces

Two surfaces, two layers. They are deliberately not the same screen.

- **Owner Settings → Roles & permissions** configures the shop's role policy on
  top of the ProFixIQ defaults. A delegated permission administrator who is not
  an owner or admin reaches the same panel at `/dashboard/settings/permissions`
  without the rest of Owner Settings.
- **Workforce → employee → Access & Permissions** configures one employee's
  `INHERIT` / `ALLOW` / `DENY` exceptions and shows the effective result with
  its source.

Both read `public.workspace_permission_administration_snapshot(uuid)`, a
shop-scoped `SECURITY DEFINER` read gated on `team.permissions.manage`. The four
policy tables remain revoked from `anon` and `authenticated`; there is no raw
policy-table read for a client.

Both write through `set_shop_role_capability_policy_atomic` and
`set_staff_capability_override_atomic`. The snapshot's `actor_can_grant` and
`manageable_roles` fields exist so the UI can disable controls the write RPCs
would reject — they are a convenience, never the decision.

Material permission changes append immutable `operational_events`
(`authorization.shop_role_policy.changed`,
`authorization.staff_override.changed`) recording actor, target, shop,
capability, previous effect, new effect and scope.

## Capability naming

A capability key is a long-lived security contract. Treat renaming one as an
API change.

- `workspace.module.action` (or `workspace.module.sub.action`), lower snake
  case, matching `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`.
- Before adding a key, search for one that already covers the operation.
  Assignment is `work_order.assignment.manage`; there is deliberately no
  `assignment.manage`.
- Presets for a new key are **derived from the behavior it replaces**, not
  invented. If a route guard and a database guard disagree today, the preset is
  their intersection, and the two distinct authorities get two distinct keys
  (this is why `parts.operate` and `parts.desk.manage` both exist).
- Business language lives in `WORKSPACE_CAPABILITY_CATALOG`. The key is never
  the label a shop reads.

## Adding a capability

1. Trace every reachable path for the operation: UI, API/domain service,
   database procedure and RLS, and Shop Assistant. List which are authoritative.
2. Derive the preset from today's effective behavior, per role.
3. Write a forward migration. Never edit an applied migration. Insert the
   catalog row and presets, then move the gate onto
   `workspace_actor_has_capability` / `workspace_assert_capability`.
4. Add the key and its business-language descriptor to
   `features/workspace/authorization/capabilities.ts`. Both administration
   surfaces pick it up automatically.
5. Replace the route guard with `requiredWorkspaceCapability`, and remove any
   static role list the preset now reproduces — leaving it would block a
   legitimately delegated employee.
6. Give the Shop Assistant tool the same `requiredWorkspaceCapability`.
7. Regenerate Supabase types, run the clean replay, and extend
   `tests/security/*.runtime.sql` with the direct-RPC denial proof.

### Gating a procedure that is already granted to `authenticated`

Do not copy the body into the migration — that forks the canonical operation.
Move the implementation into the `private` schema and re-publish a public entry
point with the same name and signature that asserts the capability and then
delegates:

```sql
alter function public.some_operation(uuid, text) set schema private;
revoke all on function private.some_operation(uuid, text)
  from public, anon, authenticated, service_role;

create function public.some_operation(p_id uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_shop_id uuid;
begin
  select owner.shop_id into v_shop_id from public.owner_table owner where owner.id = p_id;
  perform private.workspace_assert_capability(v_shop_id, 'some.capability', 'SOME_ACCESS_DENIED');
  return private.some_operation(p_id, p_key);
end;
$$;
```

Existing internal callers keep working because they resolve the public name, and
they are re-authorized at the moment the operation executes. That is also what
an offline mutation replay must do: a mutation queued while access existed is
authorized again when it actually runs.

Two cautions. A later migration that does `create or replace function
public.some_operation(...)` would silently replace the gate — extend the private
implementation instead. And check the procedure's internal callers first: if it
is composed by an unrelated operation (as `parts_return_to_stock` is by line
void), a per-operation assert changes that operation's behavior and the gate
belongs at a shared floor instead.

## Rules

**No new protected operation may introduce a hard-coded role allowlist when an
appropriate effective capability exists.** If none exists, add one.

**Adding a UI capability check without protecting the authoritative server or
database mutation does not constitute authorization.** Hiding a control is
presentation. A restricted payload must not contain the sensitive data at all,
and a directly callable RPC must enforce the same decision as the route.

**Capabilities are not product entitlements.** Field Service and Fleet access,
the Complete Operations package, service-truck enablement, Stripe subscription
state and AI feature entitlements resolve independently. A shop permission that
says `ALLOW` never grants an unentitled product. Fleet managers, dispatchers,
drivers and customers are outside the Shop capability domain entirely: the
resolver refuses them even if a stale policy row exists.

**Client-cached capability state is guidance, not authority.** The capability
endpoints are `no-store` and request-scoped so one employee's permissions cannot
survive into the next session on a shared device.

## Current catalog

| Capability | Meaning | Enforced at |
| --- | --- | --- |
| `team.permissions.manage` | Change role and individual permissions (protected) | Page guard, API, management RPCs |
| `work_order.assignment.manage` | Assign or reassign repair work | UI, API, assignment RPC, RLS, Assistant |
| `work_order.financial.sell.view` | Customer-facing pricing and totals | Server projection, RLS |
| `work_order.financial.cost.view` | Internal labor and parts cost | Server projection |
| `work_order.financial.gp.view` | Gross profit and margin | Server projection |
| `work_order.pricing.edit` | Change quoted prices | API, RLS |
| `work_order.invoice.view` / `.manage` | See / issue and collect invoices | API, RLS |
| `work_order.parts.sell.view` / `.cost.view` | Part price / part cost | Server projection, RLS |
| `parts.operate` | Use parts on jobs — the parts lifecycle floor | `parts_lifecycle_assert_shop_access` / `_line_access` |
| `parts.desk.manage` | Run the parts desk | API, lifecycle floor, Assistant |
| `parts.request` | Request parts for a job | API, `create_part_request_with_items`, Assistant |
| `parts.order` | Place purchase orders | API, `parts_place_purchase_order`, Assistant |
| `parts.receive` | Receive against a PO or request | API, the receive procedures, Assistant |

## Known remaining work

- Work Order lifecycle beyond assignment (`view`, `create`, `edit`,
  `status.manage`, `hold.manage`, `reopen`, `archive`) is still legacy RBAC
  (`canManageWorkOrders`, ~54 call sites) plus RLS.
- Inspections are enforced by RLS and RPCs only. No inspection capability key
  exists yet, deliberately: adding one without moving `sign` and `reopen` onto
  it would be UI-only authorization.
- `parts.issue`, `parts.return` and `parts.quote` have no key yet.
  `parts_issue_work_order_part` and `parts_return_to_stock` are composed by line
  void and allocation automation, so a per-operation assert would change those
  operations. They remain covered by `parts.operate`.
- `team.members.view`, `team.members.manage` and `team.roles.manage` are not
  added. Role assignment currently has no rank ceiling, so delegating it would
  be an escalation vector; the ceiling has to land first.
- Estimates, customer communication, and customer/vehicle editing remain on
  legacy RBAC and their existing server read models.
- Location-scoped authorization still requires a canonical staff-to-location
  relationship.
