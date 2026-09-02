import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const routeSource = readFileSync(
  "app/api/parts/requests/items/[itemId]/inventory/route.ts",
  "utf8",
);
const pageSource = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");
const editRouteSource = readFileSync(
  "app/api/parts/requests/items/[itemId]/edit/route.ts",
  "utf8",
);
const addRouteSource = readFileSync(
  "app/api/parts/requests/items/[itemId]/add/route.ts",
  "utf8",
);
const commitRouteSource = readFileSync(
  "app/api/parts/requests/[requestId]/commit-package/route.ts",
  "utf8",
);

const mocks = vi.hoisted(() => ({
  requireCanonicalShopOrFieldApiAccess: vi.fn(),
  canFieldActorAccessWorkOrder: vi.fn(),
}));

vi.mock("@/features/mobile/service/server/access", () => ({
  requireCanonicalShopOrFieldApiAccess:
    mocks.requireCanonicalShopOrFieldApiAccess,
  canFieldActorAccessWorkOrder: mocks.canFieldActorAccessWorkOrder,
}));

describe("parts request inventory route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes inventory creation and attachment with the parts capability", async () => {
    mocks.requireCanonicalShopOrFieldApiAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "test boundary" }, { status: 403 }),
    });

    const { POST } =
      await import("../../app/api/parts/requests/items/[itemId]/inventory/route");
    const response = await POST(
      new Request(
        "http://localhost/api/parts/requests/items/11111111-1111-4111-8111-111111111111/inventory",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "attach",
            partId: "22222222-2222-4222-8222-222222222222",
          }),
        },
      ),
      {
        params: Promise.resolve({
          itemId: "11111111-1111-4111-8111-111111111111",
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(mocks.requireCanonicalShopOrFieldApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageParts",
    });
  });

  it("keeps the complete parts workbench sequence available to parts operators", () => {
    for (const source of [
      routeSource,
      editRouteSource,
      addRouteSource,
      commitRouteSource,
    ]) {
      expect(source).toContain('requiredCapability: "canManageParts"');
      expect(source).not.toContain('requiredCapability: "canManageWorkOrders"');
    }
  });

  it("forwards and persists the inventory cost and selected supplier", () => {
    expect(pageSource).toContain("cost: input.cost");
    expect(pageSource).toContain("input.defaultSupplierId");
    expect(routeSource).toContain("cost?: number | string | null");
    expect(routeSource).toContain("p_cost: cost.value");
    expect(routeSource).toContain("p_supplier: clean(body.supplier)");
    expect(routeSource).toMatch(
      /rpc\(\s*"parts_create_and_attach_inventory_atomic"/,
    );
  });

  it("requires Field request items to belong to an authorized work order", () => {
    for (const source of [routeSource, addRouteSource]) {
      expect(source).toContain('access.productScope === "field"');
      expect(source).toContain("work_order_id");
      expect(source).toContain("canFieldActorAccessWorkOrder");
      expect(source).toContain("requireCanonicalShopOrFieldApiAccess");
    }
  });
});
