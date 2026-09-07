import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const MIGRATION = read(
  "supabase/migrations/20260907120000_workspace_parts_authorization_and_administration.sql",
);
const READ_MODEL = read(
  "supabase/migrations/20260907121000_workspace_permission_administration_read_model.sql",
);

describe("parts capability enforcement reaches the database", () => {
  it("resolves the lifecycle gates from effective capabilities, not a role list", () => {
    const shopGate = MIGRATION.slice(
      MIGRATION.indexOf("function public.parts_lifecycle_assert_shop_access"),
      MIGRATION.indexOf("function public.parts_lifecycle_assert_line_access"),
    );
    expect(shopGate).toContain("workspace_actor_has_capability");
    expect(shopGate).toContain("'parts.operate'");
    // The previous hard-coded allowlist must be gone from the gate itself.
    expect(shopGate).not.toContain("'advisor'");
    expect(shopGate).not.toContain("'foreman'");
  });

  it("keeps the assigned-technician branch of the line gate intact", () => {
    const lineGate = MIGRATION.slice(
      MIGRATION.indexOf("function public.parts_lifecycle_assert_line_access"),
    );
    expect(lineGate).toContain("'mechanic', 'tech', 'technician'");
    expect(lineGate).toContain("work_order_line_technicians");
    expect(lineGate).toContain("PARTS_LINE_ACCESS_DENIED");
  });

  it("gates every directly reachable parts procedure on its own capability", () => {
    const gated: Array<[string, string]> = [
      ["create_part_request_with_items", "'parts.request'"],
      ["parts_place_purchase_order", "'parts.order'"],
      ["parts_receive_request_item", "'parts.receive'"],
      ["parts_receive_free_text_po_line", "'parts.receive'"],
    ];
    for (const [name, capability] of gated) {
      // The canonical implementation is out of the Data API schema, and the
      // public entry point asserts before delegating to it.
      expect(MIGRATION).toContain(`alter function public.${name}(`);
      expect(MIGRATION).toContain("  set schema private;");
      const wrapper = MIGRATION.slice(
        MIGRATION.indexOf(`create function public.${name}(`),
      );
      const assertIndex = wrapper.indexOf("private.workspace_assert_capability");
      const delegateIndex = wrapper.indexOf(`return private.${name}(`);
      expect(assertIndex).toBeGreaterThan(-1);
      expect(delegateIndex).toBeGreaterThan(assertIndex);
      expect(wrapper.slice(assertIndex, delegateIndex)).toContain(capability);
    }
  });

  it("keeps the private implementations unreachable from API roles", () => {
    for (const name of [
      "create_part_request_with_items",
      "parts_place_purchase_order",
      "parts_receive_request_item",
      "parts_receive_free_text_po_line",
    ]) {
      expect(MIGRATION).toContain(`revoke all on function private.${name}(`);
    }
  });

  it("does not widen the parts floor beyond the allowlist it replaces", () => {
    const presets = MIGRATION.slice(
      MIGRATION.indexOf("insert into public.workspace_role_capability_presets"),
      MIGRATION.indexOf("on conflict (capability_key, role_key)"),
    );
    // Advisor and Service could reach the lifecycle procedures but never ran
    // the parts desk, ordered, or received.
    expect(presets).toContain("('parts.operate', 'advisor', 'allow')");
    expect(presets).toContain("('parts.operate', 'service', 'allow')");
    expect(presets).not.toContain("('parts.desk.manage', 'advisor'");
    expect(presets).not.toContain("('parts.desk.manage', 'service'");
    expect(presets).not.toContain("('parts.order', 'advisor'");
    expect(presets).not.toContain("('parts.receive', 'advisor'");
    // Technicians request parts and nothing more.
    expect(presets).toContain("('parts.request', 'mechanic', 'allow')");
    expect(presets).not.toContain("('parts.operate', 'mechanic'");
    expect(presets).not.toContain("('parts.order', 'mechanic'");
  });

  it("modifies no already-applied migration", () => {
    expect(MIGRATION.startsWith("begin;")).toBe(true);
    expect(MIGRATION.trimEnd().endsWith("commit;")).toBe(true);
    expect(READ_MODEL.trimEnd().endsWith("commit;")).toBe(true);
  });
});

describe("permission administration is not a raw policy-table read", () => {
  it("re-checks team.permissions.manage inside the read model", () => {
    expect(READ_MODEL).toContain("'team.permissions.manage'");
    expect(READ_MODEL).toContain("Permission administration is required.");
    expect(READ_MODEL).toContain("security definer");
  });

  it("binds every returned row to the caller's own shop", () => {
    expect(READ_MODEL).toContain("profile.shop_id = v_actor_shop_id");
    expect(READ_MODEL).toContain("policy.shop_id = v_actor_shop_id");
    expect(READ_MODEL).toContain("override.shop_id = v_actor_shop_id");
  });

  it("stays revoked from anon and service callers", () => {
    expect(READ_MODEL).toContain(
      "revoke all on function public.workspace_permission_administration_snapshot(uuid)\n  from public, anon, authenticated, service_role;",
    );
    expect(READ_MODEL).toContain(
      "grant execute on function public.workspace_permission_administration_snapshot(uuid)\n  to authenticated;",
    );
  });
});

describe("parts routes and assistant tools use the effective decision", () => {
  it("gates each parts route on the capability its operation needs", () => {
    expect(read("app/api/parts/requests/create/route.ts")).toContain(
      "WORKSPACE_CAPABILITIES.requestParts",
    );
    expect(read("app/api/parts/purchase-orders/[poId]/place/route.ts")).toContain(
      "WORKSPACE_CAPABILITIES.orderParts",
    );
    expect(read("app/api/parts/requests/items/[itemId]/po-line/route.ts")).toContain(
      "WORKSPACE_CAPABILITIES.orderParts",
    );
    expect(read("app/api/parts/_lib/receivePartRequestItem.ts")).toContain(
      "WORKSPACE_CAPABILITIES.receiveParts",
    );
    expect(
      read(
        "app/api/parts/purchase-orders/[poId]/lines/[lineId]/receive-free-text/route.ts",
      ),
    ).toContain("WORKSPACE_CAPABILITIES.receiveParts");
  });

  it("no longer gates parts routes on the static role matrix", () => {
    for (const route of [
      "app/api/parts/_lib/lifecycleCommand.ts",
      "app/api/parts/_lib/receivePartRequestItem.ts",
      "app/api/parts/requests/create/route.ts",
      "app/api/parts/vendors/route.ts",
      "app/api/parts/purchase-orders/[poId]/place/route.ts",
    ]) {
      expect(read(route)).not.toContain('requiredCapability: "canManageParts"');
    }
  });

  it("fails a capability-gated assistant tool closed without an envelope", () => {
    const types = read("features/shop-assistant/server/tools/types.ts");
    const guard = types.slice(types.indexOf("export function assertToolCapability"));
    expect(guard).toContain(
      "if (!workspaceCapabilities?.[workspaceCapability]?.granted)",
    );
    const registry = read("features/shop-assistant/server/tools/registry.ts");
    expect(registry).toContain("params.context.actor.workspaceCapabilities");
    expect(registry).toContain(
      "workspaceCapabilities?.[tool.requiredWorkspaceCapability]?.granted ===\n            true",
    );
  });

  it("gives assistant parts tools the same capability the human path uses", () => {
    const inventory = read(
      "features/shop-assistant/server/tools/domains/inventory.ts",
    );
    expect(inventory).toContain("WORKSPACE_CAPABILITIES.orderParts");
    expect(inventory).toContain("WORKSPACE_CAPABILITIES.receiveParts");
    expect(inventory).toContain("WORKSPACE_CAPABILITIES.requestParts");
    expect(inventory).not.toContain('requiredCapability: "canManageParts"');
    expect(inventory).not.toContain(
      'allowedRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"]',
    );
  });
});
