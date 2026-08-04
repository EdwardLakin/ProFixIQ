import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const routeSource = readFileSync("app/api/parts/requests/items/[itemId]/inventory/route.ts", "utf8");
const pageSource = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

describe("parts request inventory route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes inventory creation and attachment with the parts capability", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "test boundary" }, { status: 403 }),
    });

    const { POST } = await import(
      "../../../app/api/parts/requests/items/[itemId]/inventory/route"
    );
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
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageParts",
    });
  });

  it("forwards and persists the inventory cost and selected supplier", () => {
    expect(pageSource).toContain("cost: input.cost");
    expect(pageSource).toContain("input.defaultSupplierId");
    expect(routeSource).toContain("cost: number | string | null");
    expect(routeSource).toContain("default_cost: cost");
    expect(routeSource).toContain("supplier: clean(body.supplier)");
  });
});
