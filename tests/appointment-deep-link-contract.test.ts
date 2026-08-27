import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SHOP_ID = "a4100000-0000-4000-8000-000000000001";

const routeMocks = vi.hoisted(() => ({
  requireApiAccess: vi.fn(),
  createAdminSupabase: vi.fn(),
  createServerSupabaseRoute: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: routeMocks.requireApiAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: routeMocks.createAdminSupabase,
  createServerSupabaseRoute: routeMocks.createServerSupabaseRoute,
}));

const read = (path: string) => readFileSync(path, "utf8");

const appointmentsPage = read("app/dashboard/appointments/page.tsx");
const staffBookingsRoute = read("app/api/portal/bookings/route.ts");
const workspaceLoader = read(
  "features/vehicles/server/loadVehicleWorkspaceSnapshot.ts",
);
const workspaceSearch = read(
  "features/vehicles/server/searchShopVehicleRecords.ts",
);

describe("vehicle workspace appointment deep links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retains each canonical booking id in workspace appointment links", () => {
    const canonicalHref =
      "`/dashboard/appointments?bookingId=${encodeURIComponent(row.id)}`";

    expect(workspaceLoader.split(canonicalHref)).toHaveLength(3);
    expect(workspaceSearch).toContain(canonicalHref);
  });

  it("preserves the booking id while canonicalizing the authorized shop", () => {
    expect(appointmentsPage).toContain('search.get("bookingId")');
    expect(appointmentsPage).toContain(
      "new URLSearchParams(search.toString())",
    );
    expect(appointmentsPage).toContain(
      'canonicalQuery.set("shop", authorizedSlug)',
    );
  });

  it("loads the exact tenant-scoped booking before opening the edit panel", () => {
    expect(staffBookingsRoute).toContain(
      "if (bookingId && !actor.canManageScheduling)",
    );
    expect(staffBookingsRoute).toContain('.eq("shop_id", shop.id)');
    expect(staffBookingsRoute).toContain('.eq("id", bookingId).limit(1)');
    expect(staffBookingsRoute).toContain(
      'return bad("Appointment not found", 404)',
    );

    expect(appointmentsPage).toContain(
      "&bookingId=${encodeURIComponent(requestedBookingId)}",
    );
    expect(appointmentsPage).toContain("setWeekStart(appointmentDate)");
    expect(appointmentsPage).toContain('setPanelMode("edit")');
  });

  it("bootstraps the shop through the canonical server profile guard", () => {
    expect(staffBookingsRoute).toContain("await requireShopScopedApiAccess({");
    expect(staffBookingsRoute).toContain(
      "requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES",
    );
    expect(staffBookingsRoute).toContain('.eq("id", profile.shop_id)');
    expect(appointmentsPage).toContain(
      'fetch("/api/portal/bookings?scope=shop"',
    );
    expect(appointmentsPage).not.toContain('.from("profiles")');
  });

  it("returns only the canonical linked profile's shop context", async () => {
    const shopBuilder = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    shopBuilder.select.mockReturnValue(shopBuilder);
    shopBuilder.eq.mockReturnValue(shopBuilder);
    shopBuilder.maybeSingle.mockResolvedValue({
      data: {
        id: SHOP_ID,
        name: "Linked Profile Shop",
        slug: "linked-profile-shop",
        accepts_online_booking: false,
      },
      error: null,
    });
    const from = vi.fn(() => shopBuilder);
    routeMocks.createAdminSupabase.mockReturnValue({ from });
    routeMocks.requireApiAccess.mockResolvedValue({
      ok: true,
      profile: {
        id: "canonical-profile-id",
        shop_id: SHOP_ID,
        role: "advisor",
      },
      canonicalRole: "advisor",
      authUserId: "linked-auth-user-id",
      supabase: { from: vi.fn(), rpc: vi.fn() },
    });

    const { GET } = await import("../app/api/portal/bookings/route");
    const response = await GET(
      new Request(
        "https://profixiq.test/api/portal/bookings?scope=shop&shop=forged-shop",
      ),
    );

    expect(response.status).toBe(200);
    expect(routeMocks.requireApiAccess).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("shops");
    expect(shopBuilder.eq).toHaveBeenCalledWith("id", SHOP_ID);
    expect(shopBuilder.eq).not.toHaveBeenCalledWith("slug", "forged-shop");
    await expect(response.json()).resolves.toEqual({
      shop: {
        id: SHOP_ID,
        name: "Linked Profile Shop",
        slug: "linked-profile-shop",
        accepts_online_booking: false,
      },
    });
  });

  it("does not use the service client when canonical access is denied", async () => {
    routeMocks.requireApiAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const { GET } = await import("../app/api/portal/bookings/route");
    const response = await GET(
      new Request("https://profixiq.test/api/portal/bookings?scope=shop"),
    );

    expect(response.status).toBe(403);
    expect(routeMocks.createAdminSupabase).not.toHaveBeenCalled();
  });
});
