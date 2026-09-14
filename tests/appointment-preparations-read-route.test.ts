import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  resolveWorkOrderFinancialAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock(
  "@/features/work-orders/workspace/server/workOrderFinancialAuthorization",
  () => ({
    resolveWorkOrderFinancialAccess: mocks.resolveWorkOrderFinancialAccess,
  }),
);

import { GET } from "../app/api/shop-assistant/appointment-preparations/route";

type Row = Record<string, unknown>;

function createSupabase(rows: Row[]) {
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    order: () => api,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => api };
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
      supabase: createSupabase([preparationRow()]),
    });
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
});
