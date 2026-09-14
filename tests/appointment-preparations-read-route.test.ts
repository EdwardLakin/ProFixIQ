import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  resolveWorkOrderFinancialAccess: vi.fn(),
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));
vi.mock(
  "@/features/work-orders/workspace/server/workOrderFinancialAuthorization",
  () => ({
    resolveWorkOrderFinancialAccess: mocks.resolveWorkOrderFinancialAccess,
  }),
);

import { GET } from "../app/api/shop-assistant/appointment-preparations/route";

type Row = Record<string, unknown>;

function createAdminSupabase(rows: Row[]) {
  const eqCalls: Array<[string, unknown]> = [];
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, value: unknown) => {
      eqCalls.push([col, value]);
      return api;
    },
    order: () => api,
    range: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => api, __eqCalls: eqCalls };
}

function preparationRow(overrides: Row = {}): Row {
  return {
    booking_id: "booking-1",
    starts_at: "2026-09-15T09:00:00.000Z",
    vehicle_id: "vehicle-1",
    customer_id: "customer-1",
    vehicle_snapshot: { year: 2020, make: "Ford", model: "F150" },
    customer_snapshot: { name: "Jane Doe" },
    deferred_items: [
      {
        rootLineId: "line-1",
        quoteLineId: "q1",
        workOrderId: "wo1",
        workOrderNumber: "A100",
        title: "Front brakes",
        complaint: null,
        decision: "deferred",
        decisionAt: "2026-08-01T00:00:00.000Z",
        laborTotal: 100,
        partsTotal: 50,
        taxTotal: 10,
        grandTotal: 160,
      },
    ],
    matched_menu_items: [
      {
        menuRepairItemId: "mri-1",
        name: "Brake Job",
        laborHours: 1.5,
        priceEstimate: 250,
        isActive: true,
        sourceRootLineId: "line-1",
        partsReadiness: [],
      },
    ],
    missing_info: [],
    generated_at: "2026-09-14T12:00:00.000Z",
    ...overrides,
  };
}

describe("GET /api/shop-assistant/appointment-preparations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "profile-1", shop_id: "shop-1" },
      supabase: {},
    });
    mocks.createAdminSupabase.mockReturnValue(createAdminSupabase([preparationRow()]));
    mocks.resolveWorkOrderFinancialAccess.mockResolvedValue({
      error: null,
      access: { canViewSellPricing: true },
    });
  });

  it("returns access.response unchanged when the caller is not shop-scoped", async () => {
    const denied = { ok: false, response: new Response("nope", { status: 403 }) };
    mocks.requireShopScopedApiAccess.mockResolvedValue(denied);

    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("reads with the service-role client scoped to the caller's own shop, not the RLS-scoped one", async () => {
    const admin = createAdminSupabase([preparationRow()]);
    mocks.createAdminSupabase.mockReturnValue(admin);

    await GET();

    expect(mocks.createAdminSupabase).toHaveBeenCalled();
    expect((admin as unknown as { __eqCalls: Array<[string, unknown]> }).__eqCalls).toContainEqual([
      "shop_id",
      "shop-1",
    ]);
  });

  it("returns pricing fields when the caller can view sell pricing", async () => {
    const response = await GET();
    const body = (await response.json()) as { ok: true; canViewPricing: boolean; items: Row[] };

    expect(body.ok).toBe(true);
    expect(body.canViewPricing).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      bookingId: "booking-1",
      deferredItems: [expect.objectContaining({ grandTotal: 160 })],
      matchedMenuItems: [expect.objectContaining({ priceEstimate: 250 })],
    });
  });

  it("redacts deferred-item and menu-item pricing when the caller cannot view sell pricing", async () => {
    mocks.resolveWorkOrderFinancialAccess.mockResolvedValue({
      error: null,
      access: { canViewSellPricing: false },
    });

    const response = await GET();
    const body = (await response.json()) as { ok: true; canViewPricing: boolean; items: Row[] };

    expect(body.canViewPricing).toBe(false);
    expect(body.items[0]).toMatchObject({
      deferredItems: [
        expect.objectContaining({
          laborTotal: null,
          partsTotal: null,
          taxTotal: null,
          grandTotal: null,
        }),
      ],
      matchedMenuItems: [expect.objectContaining({ priceEstimate: null })],
    });
  });

  it("returns 500 when workspace financial authorization cannot be resolved", async () => {
    mocks.resolveWorkOrderFinancialAccess.mockResolvedValue({ error: "boom", access: null });

    const response = await GET();
    expect(response.status).toBe(500);
  });

  it("pages through more than one page of active preparations instead of truncating", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) =>
      preparationRow({ booking_id: `booking-${index}` }),
    );
    const secondPage = [preparationRow({ booking_id: "booking-500" })];
    let call = 0;
    const admin = {
      from: () => {
        const api: Record<string, unknown> = {
          select: () => api,
          eq: () => api,
          order: () => api,
          range: () => {
            const page = call === 0 ? firstPage : secondPage;
            call += 1;
            return Promise.resolve({ data: page, error: null });
          },
        };
        return api;
      },
    };
    mocks.createAdminSupabase.mockReturnValue(admin);

    const response = await GET();
    const body = (await response.json()) as { ok: true; items: Row[] };

    expect(body.items).toHaveLength(501);
  });
});
