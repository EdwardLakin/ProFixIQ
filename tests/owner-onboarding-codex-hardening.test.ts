import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getSupportedShopTimezones,
  isSupportedShopTimezone,
  shopCountryForTimezone,
} from "@/features/shared/lib/timezones/shopTimezones";

const middlewareSource = readFileSync("middleware.ts", "utf8");
const ownerFormSource = readFileSync(
  "app/onboarding/OwnerOnboardingForm.tsx",
  "utf8",
);
const guidedSettingsSource = readFileSync(
  "features/onboarding-v2/components/ShopSettingsSetupModal.tsx",
  "utf8",
);
const pinVerifySource = readFileSync(
  "app/api/shop/owner-pin/verify/route.ts",
  "utf8",
);

describe("owner onboarding Codex hardening", () => {
  it("supports the real US and Canada regional timezone set used by onboarding", () => {
    expect(isSupportedShopTimezone("US", "America/Anchorage")).toBe(true);
    expect(isSupportedShopTimezone("US", "Pacific/Honolulu")).toBe(true);
    expect(isSupportedShopTimezone("CA", "America/St_Johns")).toBe(true);
    expect(isSupportedShopTimezone("CA", "America/Regina")).toBe(true);
    expect(isSupportedShopTimezone("CA", "America/Vancouver")).toBe(true);
    expect(isSupportedShopTimezone("US", "America/St_Johns")).toBe(false);
    expect(shopCountryForTimezone("America/Regina")).toBe("CA");
    expect(shopCountryForTimezone("America/Anchorage")).toBe("US");
    expect(getSupportedShopTimezones("US").length).toBeGreaterThan(20);
    expect(getSupportedShopTimezones("CA").length).toBeGreaterThan(20);
  });

  it("routes Shop Boost only from explicit persisted acquisition provenance", () => {
    expect(ownerFormSource).toContain("readPersistedActivationContext");
    expect(ownerFormSource).toContain('"/onboarding/shop-boost"');
    expect(middlewareSource).not.toContain("needsShopBoostIntake");
    expect(middlewareSource).not.toContain('from("shop_boost_intakes")');
  });

  it("preserves guided onboarding on mobile instead of collapsing it to generic mobile home", () => {
    expect(middlewareSource).toContain("isGuidedOnboardingPath");
    expect(middlewareSource).toContain('pathname === "/dashboard/onboarding-v2"');
    expect(middlewareSource).toContain("!isGuidedOnboardingPath");
  });

  it("reuses the verified HTTP-only owner PIN session in guided Shop Settings", () => {
    expect(pinVerifySource).toContain("export async function GET(req: Request)");
    expect(pinVerifySource).toContain("getOwnerPinCookieFromRequest");
    expect(pinVerifySource).toContain("verifyOwnerPinToken");
    expect(pinVerifySource).toContain("expiresAt:");
    expect(pinVerifySource).toContain('"Cache-Control": "private, no-store"');

    expect(guidedSettingsSource).toContain(
      'fetch("/api/shop/owner-pin/verify",',
    );
    expect(guidedSettingsSource).toContain("pinStatus.verified");
    expect(guidedSettingsSource).toContain("setPinExpiresAt(pinStatus.expiresAt)");
  });

  it("uses the same timezone contract in first-shop and guided settings surfaces", () => {
    expect(ownerFormSource).toContain("getSupportedShopTimezones");
    expect(ownerFormSource).toContain("isSupportedShopTimezone");
    expect(guidedSettingsSource).toContain("getSupportedShopTimezones");
    expect(guidedSettingsSource).toContain("isSupportedShopTimezone");
    expect(guidedSettingsSource).not.toContain("const TIMEZONES = [");
  });
});
