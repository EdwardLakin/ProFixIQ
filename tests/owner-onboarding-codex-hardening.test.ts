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
const ownerPageSource = readFileSync("app/onboarding/page.tsx", "utf8");
const bootstrapRouteSource = readFileSync(
  "app/api/onboarding/bootstrap-owner/route.ts",
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

  it("routes Shop Boost only from provenance on the current acquisition URL", () => {
    expect(ownerFormSource).toContain("readActivationContextFromSearchParams");
    expect(ownerFormSource).toContain("appendActivationContextToHref");
    expect(ownerFormSource).not.toContain("readPersistedActivationContext");
    expect(ownerFormSource).toContain('"/onboarding/shop-boost"');
    expect(middlewareSource).not.toContain("needsShopBoostIntake");
    expect(middlewareSource).not.toContain('from("shop_boost_intakes")');
  });

  it("preserves guided onboarding on mobile instead of collapsing it to generic mobile home", () => {
    expect(middlewareSource).toContain("isGuidedOnboardingPath");
    expect(middlewareSource).toContain('pathname === "/dashboard/onboarding-v2"');
    expect(middlewareSource).toContain("!isGuidedOnboardingPath");
  });

  it("keeps an owner with a created shop but incomplete billing inside onboarding", () => {
    expect(middlewareSource).toContain("pendingOwnerBootstrap");
    expect(middlewareSource).toContain('normalizedRole === "owner"');
    expect(middlewareSource).toContain("completed = pendingOwnerBootstrap");
    expect(ownerPageSource).toContain("if (profile?.completed_onboarding)");
    expect(ownerPageSource).not.toContain("profile?.shop_id || profile?.completed_onboarding");
    expect(bootstrapRouteSource).toContain("finalizeOwnerOnboarding");
    expect(bootstrapRouteSource).toContain("canonical_billing_not_ready");
  });

  it("reuses the verified HTTP-only owner PIN session in guided Shop Settings and retries refreshes", () => {
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
    expect(bootstrapRouteSource).toContain("successfulBootstrapResponse");
    expect(bootstrapRouteSource).toContain("replayed: true");
  });

  it("treats shop and hours as mandatory load state while PIN status remains optional", () => {
    expect(guidedSettingsSource).toContain("settingsReady");
    expect(guidedSettingsSource).toContain("setSettingsReady(false)");
    expect(guidedSettingsSource).toContain("setSettingsReady(true)");
    expect(guidedSettingsSource).toContain("Unable to load shop hours.");
    expect(guidedSettingsSource).toContain("PIN status is optional convenience only");
    expect(guidedSettingsSource).toContain("saving || loading || !settingsReady");
  });

  it("uses the shared timezone contract but preserves an existing unmatched stored timezone", () => {
    expect(ownerFormSource).toContain("getSupportedShopTimezones");
    expect(ownerFormSource).toContain("isSupportedShopTimezone");
    expect(guidedSettingsSource).toContain("getSupportedShopTimezones");
    expect(guidedSettingsSource).toContain("isSupportedShopTimezone");
    expect(guidedSettingsSource).toContain("if (timezone && !supported.includes(timezone))");
    expect(guidedSettingsSource).toContain("setTimezone(storedTimezone || defaultShopTimezone(shopCountry))");
    expect(guidedSettingsSource).not.toContain("const TIMEZONES = [");
  });
});
