import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  fieldAccess: vi.fn(),
  shopAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/product-access", () => ({
  SHOP_PRODUCT_CAPABILITIES: ["shop"],
  resolveShopProductAccess: dependencies.shopAccess,
}));

vi.mock("@/features/mobile/service/server/access", () => ({
  getMobileFieldServiceAccess: dependencies.fieldAccess,
}));

import { resolveWorkOrderCommandProductAccess } from "@/features/work-orders/server/authorizeWorkOrderCommandProduct";

class VisitSupabase {
  filters: Array<[string, unknown]> = [];
  visit: { id: string } | null = { id: "visit-1" };
  visitError: { message: string } | null = null;

  from(table: string) {
    if (table !== "service_visits") {
      throw new Error(`Unexpected table read: ${table}`);
    }
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        this.filters.push([column, value]);
        return query;
      },
      in: (column: string, values: readonly unknown[]) => {
        this.filters.push([column, values]);
        return query;
      },
      limit: () => query,
      maybeSingle: async () => ({
        data: this.visit,
        error: this.visitError,
      }),
    };
    return query;
  }
}

function actor(
  db: VisitSupabase,
  role: "mechanic" | "manager" | "customer" | "fleet_manager" = "mechanic",
) {
  return {
    authUserId: "auth-1",
    canonicalRole: role,
    profile: {
      id: "profile-1",
      shop_id: "shop-1",
      role,
      email: "tech@example.com",
      completed_onboarding: true,
      full_name: "Test Technician",
      must_change_password: false,
      user_id: "auth-1",
    },
    supabase: db as never,
  };
}

describe("Work Order command product boundary", () => {
  beforeEach(() => {
    dependencies.fieldAccess.mockReset();
    dependencies.shopAccess.mockReset();
  });

  it("preserves entitled Shop command behavior without requiring a Field link", async () => {
    const db = new VisitSupabase();
    dependencies.shopAccess.mockResolvedValueOnce({
      entitled: true,
      error: null,
    });

    const result = await resolveWorkOrderCommandProductAccess({
      access: actor(db),
      workOrderId: "work-order-1",
    });

    expect(result).toEqual({
      authorized: true,
      product: "shop",
      error: null,
    });
    expect(dependencies.fieldAccess).not.toHaveBeenCalled();
    expect(db.filters).toEqual([]);
  });

  it("allows a Field technician only through an assigned mobile visit", async () => {
    const db = new VisitSupabase();
    dependencies.shopAccess.mockResolvedValueOnce({
      entitled: false,
      error: null,
    });
    dependencies.fieldAccess.mockResolvedValueOnce({
      canAccessFieldService: true,
      standaloneFieldWorkspace: false,
    });

    const result = await resolveWorkOrderCommandProductAccess({
      access: actor(db),
      workOrderId: "work-order-1",
    });

    expect(result).toEqual({
      authorized: true,
      product: "field",
      error: null,
    });
    expect(db.filters).toEqual([
      ["shop_id", "shop-1"],
      ["work_order_id", "work-order-1"],
      ["mode", "mobile"],
      [
        "status",
        [
          "scheduled",
          "dispatched",
          "en_route",
          "arrived",
          "working",
          "paused",
        ],
      ],
      ["assigned_user_id", "profile-1"],
    ]);
  });

  it("allows a Field manager only for an existing linked mobile visit", async () => {
    const db = new VisitSupabase();
    dependencies.shopAccess.mockResolvedValueOnce({
      entitled: false,
      error: null,
    });
    dependencies.fieldAccess.mockResolvedValueOnce({
      canAccessFieldService: true,
      standaloneFieldWorkspace: false,
    });

    const result = await resolveWorkOrderCommandProductAccess({
      access: actor(db, "manager"),
      workOrderId: "work-order-1",
    });

    expect(result.authorized).toBe(true);
    expect(db.filters).toContainEqual(["mode", "mobile"]);
    expect(db.filters).toContainEqual([
      "status",
      [
        "scheduled",
        "dispatched",
        "en_route",
        "arrived",
        "working",
        "paused",
      ],
    ]);
    expect(db.filters).not.toContainEqual(["assigned_user_id", "profile-1"]);
  });

  it("denies an unlinked Field Work Order", async () => {
    const db = new VisitSupabase();
    db.visit = null;
    dependencies.shopAccess.mockResolvedValueOnce({
      entitled: false,
      error: null,
    });
    dependencies.fieldAccess.mockResolvedValueOnce({
      canAccessFieldService: true,
      standaloneFieldWorkspace: false,
    });

    const result = await resolveWorkOrderCommandProductAccess({
      access: actor(db),
      workOrderId: "unlinked-work-order",
    });

    expect(result).toEqual({
      authorized: false,
      product: null,
      error: null,
    });
  });

  it.each(["customer", "fleet_manager"] as const)(
    "never turns a %s relationship into Work Order mutation authority",
    async (role) => {
      const db = new VisitSupabase();

      const result = await resolveWorkOrderCommandProductAccess({
        access: actor(db, role),
        workOrderId: "work-order-1",
      });

      expect(result).toEqual({
        authorized: false,
        product: null,
        error: null,
      });
      expect(dependencies.shopAccess).not.toHaveBeenCalled();
      expect(dependencies.fieldAccess).not.toHaveBeenCalled();
      expect(db.filters).toEqual([]);
    },
  );

  it("requires every public punch route to opt in without changing shift recovery", () => {
    for (const action of ["start", "pause", "resume", "finish"]) {
      const route = readFileSync(
        `app/api/work-orders/lines/[id]/${action}/route.ts`,
        "utf8",
      );
      expect(route).toContain("enforceProductAccess: true");
    }

    const shiftRoute = readFileSync("app/api/mobile/shifts/route.ts", "utf8");
    expect(shiftRoute).not.toContain("enforceProductAccess");
  });
});
