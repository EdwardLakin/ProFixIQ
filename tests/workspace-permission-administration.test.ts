import { describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_CAPABILITIES,
  WORKSPACE_CAPABILITY_CATALOG,
  WORKSPACE_CAPABILITY_KEYS,
  createDeniedWorkspaceCapabilities,
} from "@/features/workspace/authorization/capabilities";
import { loadPermissionAdministrationSnapshot } from "@/features/workspace/authorization/server/permissionAdministration";
import {
  employeeCapabilityRows,
  roleCapabilityRows,
  type PermissionSnapshot,
} from "@/features/workspace/authorization/components/permissionModel";

const SHOP_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";

function rpcPayload(overrides: Record<string, unknown> = {}) {
  return {
    shop_id: SHOP_ID,
    actor: {
      profile_id: ACTOR_ID,
      canonical_role: "manager",
      is_owner: false,
    },
    manageable_roles: ["advisor", "parts", "mechanic"],
    capabilities: [
      {
        capability_key: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
        is_protected: false,
        actor_can_grant: true,
      },
      {
        capability_key: WORKSPACE_CAPABILITIES.orderParts,
        is_protected: false,
        actor_can_grant: false,
      },
      {
        capability_key: WORKSPACE_CAPABILITIES.manageTeamPermissions,
        is_protected: true,
        actor_can_grant: true,
      },
    ],
    presets: [
      {
        role_key: "mechanic",
        capability_key: WORKSPACE_CAPABILITIES.requestParts,
        effect: "allow",
      },
    ],
    role_policies: [
      {
        role_key: "mechanic",
        capability_key: WORKSPACE_CAPABILITIES.requestParts,
        effect: "deny",
      },
    ],
    employee: null,
    ...overrides,
  };
}

describe("catalog integrity", () => {
  it("describes every canonical capability exactly once", () => {
    const keys = Object.values(WORKSPACE_CAPABILITIES);
    expect(WORKSPACE_CAPABILITY_KEYS).toHaveLength(keys.length);
    expect(new Set(WORKSPACE_CAPABILITY_KEYS)).toEqual(new Set(keys));
    expect(new Set(Object.keys(createDeniedWorkspaceCapabilities()))).toEqual(
      new Set(keys),
    );
  });

  it("never uses a raw capability key as the label a shop reads", () => {
    for (const descriptor of WORKSPACE_CAPABILITY_CATALOG) {
      expect(descriptor.label).not.toContain(".");
      expect(descriptor.label).not.toBe(descriptor.capabilityKey);
      expect(descriptor.description.length).toBeGreaterThan(10);
    }
  });
});

describe("permission administration read model", () => {
  it("passes the target through and narrows the payload", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcPayload(), error: null });
    const result = await loadPermissionAdministrationSnapshot({
      supabase: { rpc },
      shopId: SHOP_ID,
      targetProfileId: TARGET_ID,
    });

    expect(rpc).toHaveBeenCalledWith(
      "workspace_permission_administration_snapshot",
      { p_target_profile_id: TARGET_ID },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.actor.isOwner).toBe(false);
    expect(result.snapshot.rolePolicies).toEqual([
      {
        roleKey: "mechanic",
        capabilityKey: WORKSPACE_CAPABILITIES.requestParts,
        effect: "deny",
      },
    ]);
  });

  it("refuses a snapshot that does not belong to the caller's shop", async () => {
    const result = await loadPermissionAdministrationSnapshot({
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: rpcPayload({ shop_id: "99999999-9999-4999-8999-999999999999" }),
          error: null,
        }),
      },
      shopId: SHOP_ID,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("reports a denied caller as forbidden rather than unavailable", async () => {
    const result = await loadPermissionAdministrationSnapshot({
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Permission administration is required.", code: "42501" },
        }),
      },
      shopId: SHOP_ID,
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("fails closed when the resolver is unavailable", async () => {
    const result = await loadPermissionAdministrationSnapshot({
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "database unavailable" },
        }),
      },
      shopId: SHOP_ID,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("ignores policy rows for capabilities the application does not model", async () => {
    const payload = rpcPayload({
      role_policies: [
        { role_key: "mechanic", capability_key: "not.a.capability", effect: "allow" },
      ],
    });
    const result = await loadPermissionAdministrationSnapshot({
      supabase: { rpc: vi.fn().mockResolvedValue({ data: payload, error: null }) },
      shopId: SHOP_ID,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.rolePolicies).toEqual([]);
  });
});

function snapshot(overrides: Partial<PermissionSnapshot> = {}): PermissionSnapshot {
  return {
    shopId: SHOP_ID,
    actor: { profileId: ACTOR_ID, canonicalRole: "owner", isOwner: true },
    manageableRoles: ["mechanic"],
    capabilities: WORKSPACE_CAPABILITY_KEYS.map((capabilityKey) => ({
      capabilityKey,
      isProtected: capabilityKey === WORKSPACE_CAPABILITIES.manageTeamPermissions,
      actorCanGrant: true,
    })),
    presets: [
      {
        roleKey: "mechanic",
        capabilityKey: WORKSPACE_CAPABILITIES.requestParts,
        effect: "allow",
      },
    ],
    rolePolicies: [],
    employee: null,
    ...overrides,
  };
}

describe("presentation model precedence", () => {
  it("shows the ProFixIQ default until the shop customizes the role", () => {
    const rows = roleCapabilityRows(snapshot(), "mechanic");
    const request = rows.find(
      (row) => row.descriptor.capabilityKey === WORKSPACE_CAPABILITIES.requestParts,
    );
    expect(request).toMatchObject({
      value: "inherit",
      customized: false,
      effectiveGranted: true,
    });

    const assign = rows.find(
      (row) =>
        row.descriptor.capabilityKey ===
        WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
    );
    expect(assign).toMatchObject({ value: "inherit", effectiveGranted: false });
  });

  it("shows a shop DENY overriding an allowed ProFixIQ default", () => {
    const rows = roleCapabilityRows(
      snapshot({
        rolePolicies: [
          {
            roleKey: "mechanic",
            capabilityKey: WORKSPACE_CAPABILITIES.requestParts,
            effect: "deny",
          },
        ],
      }),
      "mechanic",
    );
    const request = rows.find(
      (row) => row.descriptor.capabilityKey === WORKSPACE_CAPABILITIES.requestParts,
    );
    expect(request).toMatchObject({
      value: "deny",
      customized: true,
      presetEffect: "allow",
      effectiveGranted: false,
    });
  });

  it("explains a Lead Hand style individual grant against the role baseline", () => {
    const rows = employeeCapabilityRows(
      snapshot({
        employee: {
          profileId: TARGET_ID,
          fullName: "Edward Smith",
          canonicalRole: "mechanic",
          isSelf: false,
          manageable: true,
          overrides: [
            {
              capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
              effect: "allow",
            },
          ],
          effective: [
            {
              capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
              granted: true,
              source: "individual_override",
            },
          ],
        },
      }),
    );

    const assign = rows.find(
      (row) =>
        row.descriptor.capabilityKey ===
        WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
    );
    expect(assign).toMatchObject({
      value: "allow",
      roleGranted: false,
      effectiveGranted: true,
      source: "individual_override",
    });

    // An unrelated manager capability stays denied: the override is scoped to
    // one capability, not promoted to a role change.
    const invoices = rows.find(
      (row) =>
        row.descriptor.capabilityKey ===
        WORKSPACE_CAPABILITIES.manageWorkOrderInvoice,
    );
    expect(invoices).toMatchObject({ value: "inherit", effectiveGranted: false });
  });

  it("treats a capability the server did not decide as denied", () => {
    const rows = employeeCapabilityRows(
      snapshot({
        employee: {
          profileId: TARGET_ID,
          fullName: null,
          canonicalRole: "mechanic",
          isSelf: false,
          manageable: true,
          overrides: [],
          effective: [],
        },
      }),
    );
    expect(rows.every((row) => row.effectiveGranted === false)).toBe(true);
    expect(rows.every((row) => row.source === "unavailable")).toBe(true);
  });
});
