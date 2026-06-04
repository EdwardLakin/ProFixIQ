import { describe, expect, it } from "vitest";
import { buildGuidedOnboardingDestinationUrl, parseGuidedOnboardingQuery, sanitizeGuidedReturnTo } from "@/features/onboarding-v2/guided/query";
import { getGuidedOnboardingStep, GUIDED_ONBOARDING_STEPS } from "@/features/onboarding-v2/guided/steps";

describe("guided onboarding step registry", () => {
  it("defines required routes and highlight keys", () => {
    expect(GUIDED_ONBOARDING_STEPS.map((step) => step.stepKey)).toEqual([
      "customers",
      "vehicles",
      "staff",
      "labor_tax_shop_settings",
      "inspection_templates",
      "service_menu",
      "inventory_parts",
      "invoices",
      "service_history",
    ]);

    expect(getGuidedOnboardingStep("customers")).toMatchObject({ destinationPath: "/customers", highlightKey: "customer-import" });
    expect(getGuidedOnboardingStep("vehicles")).toMatchObject({ destinationPath: "/customers", highlightKey: "vehicle-import" });
    expect(getGuidedOnboardingStep("staff")).toMatchObject({ destinationPath: "/dashboard/owner/create-user", highlightKey: "staff-import" });
    expect(getGuidedOnboardingStep("labor_tax_shop_settings")).toMatchObject({ destinationPath: "/dashboard/owner/settings", highlightKey: "shop-settings-labor-tax" });
    expect(getGuidedOnboardingStep("inspection_templates")).toMatchObject({ destinationPath: "/inspections/templates", highlightKey: "inspection-templates-setup" });
    expect(getGuidedOnboardingStep("service_menu")).toMatchObject({ destinationPath: "/menu", highlightKey: "service-menu-setup" });
    expect(getGuidedOnboardingStep("inventory_parts")).toMatchObject({ destinationPath: "/parts/inventory", highlightKey: "parts-csv-import", implementationStatus: "available" });
    expect(getGuidedOnboardingStep("invoices")).toMatchObject({ implementationStatus: "future" });
    expect(getGuidedOnboardingStep("service_history")).toMatchObject({ destinationPath: "/work-orders/history", highlightKey: "service-history-setup" });
  });
});

describe("guided onboarding query helpers", () => {
  it("builds the exact Customers destination query params", () => {
    const url = buildGuidedOnboardingDestinationUrl({ sessionId: "session-123", stepKey: "customers" });
    const parsedUrl = new URL(url, "https://app.profixiq.test");

    expect(parsedUrl.pathname).toBe("/customers");
    expect(parsedUrl.searchParams.get("onboardingSession")).toBe("session-123");
    expect(parsedUrl.searchParams.get("onboardingStep")).toBe("customers");
    expect(parsedUrl.searchParams.get("highlight")).toBe("customer-import");
    expect(parsedUrl.searchParams.get("returnTo")).toBe("/dashboard/onboarding-v2/session-123");
    expect(parsedUrl.searchParams.get("source")).toBe("guided-onboarding");
  });

  it("builds the exact Vehicles destination query params", () => {
    const url = buildGuidedOnboardingDestinationUrl({ sessionId: "session-123", stepKey: "vehicles" });
    const parsedUrl = new URL(url, "https://app.profixiq.test");

    expect(parsedUrl.pathname).toBe("/customers");
    expect(parsedUrl.searchParams.get("onboardingSession")).toBe("session-123");
    expect(parsedUrl.searchParams.get("onboardingStep")).toBe("vehicles");
    expect(parsedUrl.searchParams.get("highlight")).toBe("vehicle-import");
    expect(parsedUrl.searchParams.get("returnTo")).toBe("/dashboard/onboarding-v2/session-123");
    expect(parsedUrl.searchParams.get("source")).toBe("guided-onboarding");

    expect(parseGuidedOnboardingQuery(parsedUrl.searchParams)).toMatchObject({
      onboardingSession: "session-123",
      onboardingStep: "vehicles",
      highlight: "vehicle-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
  });

  it("builds the exact Staff destination query params", () => {
    const url = buildGuidedOnboardingDestinationUrl({ sessionId: "session-123", stepKey: "staff" });
    const parsedUrl = new URL(url, "https://app.profixiq.test");

    expect(parsedUrl.pathname).toBe("/dashboard/owner/create-user");
    expect(parsedUrl.searchParams.get("onboardingSession")).toBe("session-123");
    expect(parsedUrl.searchParams.get("onboardingStep")).toBe("staff");
    expect(parsedUrl.searchParams.get("highlight")).toBe("staff-import");
    expect(parsedUrl.searchParams.get("returnTo")).toBe("/dashboard/onboarding-v2/session-123");
    expect(parsedUrl.searchParams.get("source")).toBe("guided-onboarding");

    expect(parseGuidedOnboardingQuery(parsedUrl.searchParams)).toMatchObject({
      onboardingSession: "session-123",
      onboardingStep: "staff",
      highlight: "staff-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
  });

  it("builds and parses inventory parts destination query params", () => {
    const url = buildGuidedOnboardingDestinationUrl({ sessionId: "session-123", stepKey: "inventory_parts" });
    const parsedUrl = new URL(url, "https://app.profixiq.test");

    expect(parsedUrl.pathname).toBe("/parts/inventory");
    expect(parsedUrl.searchParams.get("onboardingSession")).toBe("session-123");
    expect(parsedUrl.searchParams.get("onboardingStep")).toBe("inventory_parts");
    expect(parsedUrl.searchParams.get("highlight")).toBe("parts-csv-import");
    expect(parsedUrl.searchParams.get("source")).toBe("guided-onboarding");

    expect(parseGuidedOnboardingQuery(parsedUrl.searchParams)).toMatchObject({
      onboardingSession: "session-123",
      onboardingStep: "inventory_parts",
      highlight: "parts-csv-import",
      source: "guided-onboarding",
    });
  });

  it("rejects unsafe returnTo values", () => {
    expect(sanitizeGuidedReturnTo("https://evil.example/path", "/fallback")).toBe("/fallback");
    expect(sanitizeGuidedReturnTo("//evil.example/path", "/fallback")).toBe("/fallback");
    expect(sanitizeGuidedReturnTo("dashboard/onboarding-v2", "/fallback")).toBe("/fallback");
    expect(sanitizeGuidedReturnTo("/dashboard/onboarding-v2/session-123", "/fallback")).toBe("/dashboard/onboarding-v2/session-123");
  });

  it("drops parsed guided query when returnTo is external", () => {
    const params = new URLSearchParams({
      onboardingSession: "session-123",
      onboardingStep: "inventory_parts",
      highlight: "parts-csv-import",
      returnTo: "https://evil.example/steal",
      source: "guided-onboarding",
    });

    expect(parseGuidedOnboardingQuery(params)).toBeNull();
  });
});
