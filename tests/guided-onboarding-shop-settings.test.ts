import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GUIDED_ONBOARDING_STEPS, GUIDED_ONBOARDING_STEP_KEYS } from "@/features/onboarding-v2/guided/steps";

const read = (path: string) => readFileSync(path, "utf8");

describe("guided onboarding Shop Settings step", () => {
  it("removes Staff from guided onboarding and places Shop Settings after Parts", () => {
    expect(GUIDED_ONBOARDING_STEP_KEYS).not.toContain("staff");
    expect(GUIDED_ONBOARDING_STEP_KEYS).toEqual([
      "customers",
      "vehicles",
      "vehicle_history",
      "invoices",
      "parts",
      "shop_settings",
      "analysis",
    ]);
  });

  it("keeps Shop Settings on the onboarding page instead of Owner Settings", () => {
    const partsIndex = GUIDED_ONBOARDING_STEPS.findIndex((step) => step.key === "parts");
    const shopSettingsIndex = GUIDED_ONBOARDING_STEPS.findIndex((step) => step.key === "shop_settings");
    const shopSettings = GUIDED_ONBOARDING_STEPS[shopSettingsIndex];

    expect(shopSettingsIndex).toBe(partsIndex + 1);
    expect(shopSettings.destinationPath).toBe("/dashboard/onboarding-v2");
    expect(shopSettings.destinationPath).not.toBe("/dashboard/owner/settings");
  });

  it("saves settings and hours through the existing owner settings endpoints", () => {
    const source = read("features/onboarding-v2/components/ShopSettingsSetupModal.tsx");

    expect(source).toContain('fetch("/api/settings/update"');
    expect(source).toContain('fetch("/api/settings/hours"');
    expect(source).toContain("shop_name: shopName");
    expect(source).toContain("phone_number: phone");
    expect(source).toContain("labor_rate: asNumber(laborRate)");
    expect(source).toContain("shop_supplies_type: shopSuppliesType");
    expect(source).toContain("auto_send_quote_email: autoSendQuoteEmail");
    expect(source).toContain("const openDays = hours.filter((hour) => !hour.closed)");
    expect(source).toContain("body: JSON.stringify({ shopId, hours: openDays })");
  });

  it("skip completes the step without requiring Owner PIN", () => {
    const source = read("features/onboarding-v2/components/ShopSettingsSetupModal.tsx");

    expect(source).toContain('completeStep(sessionId, "skip")');
    expect(source).toContain('"Shop settings skipped during onboarding."');
  });

  it("uses the existing Owner PIN modal and does not add plaintext PIN storage", () => {
    const source = read("features/onboarding-v2/components/ShopSettingsSetupModal.tsx");

    expect(source).toContain("OwnerPinModal");
    expect(source).toContain("setPinModalOpen(true)");
    expect(source).not.toContain("owner_pin:");
    expect(source).not.toContain("pin:");
    expect(source).not.toContain("localStorage.setItem");
    expect(source).not.toContain("sessionStorage.setItem");
  });
});
