import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const staffCreate = read("app/api/portal/book/route.ts");
const mobileAppointments = read("app/mobile/appointments/page.tsx");
const advisorOfflineRoute = read("app/api/offline/advisor-day/route.ts");
const advisorOffline = read("features/work-orders/mobile/advisorOffline.ts");
const advisorOfflineTypes = read(
  "features/work-orders/mobile/advisorOfflineTypes.ts",
);

describe("appointment null-slug follow-up", () => {
  it("preserves legacy slug replay identities while allowing canonical shop-id fallback", () => {
    expect(staffCreate).toContain(
      "const legacyShopKey = body.shopSlug?.trim() || shopId",
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
