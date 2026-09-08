import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const routeMocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  createPortalBooking: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: routeMocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/portal/server/createPortalBooking", () => ({
  createPortalBooking: routeMocks.createPortalBooking,
}));

const staffCreate = read("app/api/portal/book/route.ts");
const mobileAppointments = read("app/mobile/appointments/page.tsx");
const advisorOfflineRoute = read("app/api/offline/advisor-day/route.ts");
const advisorOffline = read("features/work-orders/mobile/advisorOffline.ts");
const advisorOfflineTypes = read(
  "features/work-orders/mobile/advisorOfflineTypes.ts",
);

const SHOP_ID = "a4100000-0000-4000-8000-000000000001";
const USER_ID = "b4100000-0000-4000-8000-000000000001";

function legacyBookingBody(shopSlug?: string) {
  return {
    ...(shopSlug === undefined ? {} : { shopSlug }),
    customerId: "customer-1",
    vehicleId: "vehicle-1",
    startsAt: "2026-09-08T15:00:00.000Z",
    endsAt: "2026-09-08T16:00:00.000Z",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    customerPhone: "555-0100",
    notes: "Replay test",
  };
}

describe("appointment null-slug follow-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      authUserId: USER_ID,
      profile: { id: USER_ID, shop_id: SHOP_ID, role: "advisor" },
      supabase: { rpc: vi.fn(), from: vi.fn() },
    });
  });

  it("reuses the exact pre-deployment receipt identity for normalization-sensitive legacy slugs", async () => {
    const receipts = new Map<string, { id: string }>();
    routeMocks.createPortalBooking.mockImplementation(
      async (args: { input: { operationKey?: string } }) => {
        const key = args.input.operationKey ?? "";
        const existing = receipts.get(key);
        if (existing) return { ok: true, booking: existing };
        const booking = { id: `booking-${receipts.size + 1}` };
        receipts.set(key, booking);
        return { ok: true, booking };
      },
    );

    const rawSlug = " shop-slug ";
    const expectedLegacyKey = [
      "legacy-staff-booking",
      USER_ID,
      rawSlug,
      "customer-1",
      "vehicle-1",
      "2026-09-08T15:00:00.000Z",
      "2026-09-08T16:00:00.000Z",
    ].join(":");
    const { POST } = await import("../app/api/portal/book/route");

    const makeRequest = () =>
      new Request("https://profixiq.test/api/portal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legacyBookingBody(rawSlug)),
      });

    const first = await POST(makeRequest());
    const retry = await POST(makeRequest());

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    await expect(first.json()).resolves.toEqual({ booking: { id: "booking-1" } });
    await expect(retry.json()).resolves.toEqual({ booking: { id: "booking-1" } });
    expect(receipts.size).toBe(1);
    expect(routeMocks.createPortalBooking).toHaveBeenCalledTimes(2);
    for (const [call] of routeMocks.createPortalBooking.mock.calls) {
      expect(call).toMatchObject({
        actorMode: "allow-staff",
        staffShopId: SHOP_ID,
        input: { operationKey: expectedLegacyKey, shopSlug: rawSlug },
      });
    }
  });

  it("uses authenticated shop id only when a staff request has no legacy slug", async () => {
    routeMocks.createPortalBooking.mockResolvedValue({
      ok: true,
      booking: { id: "booking-null-slug" },
    });
    const { POST } = await import("../app/api/portal/book/route");
    const response = await POST(
      new Request("https://profixiq.test/api/portal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legacyBookingBody()),
      }),
    );

    expect(response.status).toBe(201);
    expect(routeMocks.createPortalBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        staffShopId: SHOP_ID,
        input: expect.objectContaining({
          operationKey: expect.stringContaining(
            `legacy-staff-booking:${USER_ID}:${SHOP_ID}:`,
          ),
        }),
      }),
    );
  });

  it("keeps staff tenant selection canonical while preserving legacy replay identity", () => {
    expect(staffCreate).toContain(
      "const legacyShopKey = body.shopSlug || shopId",
    );
    expect(staffCreate).toContain(
      "legacyStaffOperationKey(userId, access.profile.shop_id, body)",
    );
    expect(staffCreate).toContain("staffShopId: access.profile.shop_id");
  });

  it("bootstraps mobile appointments from authenticated scheduling context", () => {
    expect(mobileAppointments).toContain('fetch("/api/scheduling/context"');
    expect(mobileAppointments).toContain("const shopKey = shop.slug ?? shop.id");
    expect(mobileAppointments).toContain("!s.slug && s.id === shopSlug");
    expect(mobileAppointments).toContain(
      "(cached.shop.slug ?? cached.shop.id) === shopSlug",
    );
    expect(mobileAppointments).not.toContain(
      '.eq("accepts_online_booking", true)',
    );
  });

  it("keeps advisor offline packs and cached shells usable without a public slug", () => {
    expect(advisorOfflineRoute).toContain("if (shopError || !shop?.id)");
    expect(advisorOfflineRoute).not.toContain("!shop?.slug");
    expect(advisorOffline).toContain(
      "const shopKey = bundle.shop.slug ?? bundle.shop.id",
    );
    expect(advisorOfflineTypes).toContain("shop_slug: string | null");
  });
});
