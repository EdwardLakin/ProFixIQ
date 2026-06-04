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
    expect(getGuidedOnboardingStep("vehicles")).toMatchObject({ destinationPath: "/vehicles", highlightKey: "vehicle-import" });
    expect(getGuidedOnboardingStep("staff")).toMatchObject({ destinationPath: "/dashboard/owner/create-user", highlightKey: "staff-import" });
    expect(getGuidedOnboardingStep("labor_tax_shop_settings")).toMatchObject({ destinationPath: "/dashboard/owner/settings", highlightKey: "shop-settings" });
    expect(getGuidedOnboardingStep("inspection_templates")).toMatchObject({
      destinationPath: "/inspections/templates",
      highlightKey: "inspection-template-import",
      question: "Do you want to set up or import inspection templates now?",
    });
    expect(getGuidedOnboardingStep("service_menu")).toMatchObject({
      destinationPath: "/menu",
      highlightKey: "service-menu-setup",
      question: "Do you want to set up service menu items, canned jobs, or common repairs now?",
    });
    expect(getGuidedOnboardingStep("inventory_parts")).toMatchObject({ destinationPath: "/parts/inventory", highlightKey: "parts-csv-import", implementationStatus: "available" });
    expect(getGuidedOnboardingStep("invoices")).toMatchObject({
      destinationPath: "/billing",
      highlightKey: "invoice-import",
      question: "Do you want to import historical invoices now?",
      implementationStatus: "future",
    });
    expect(getGuidedOnboardingStep("service_history")).toMatchObject({
      destinationPath: "/work-orders/history",
      highlightKey: "service-history-import",
      question: "Do you want to import service history or repair records now?",
      implementationStatus: "future",
    });
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

    expect(parsedUrl.pathname).toBe("/vehicles");
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


  it("builds the exact Labor/tax/shop settings destination query params", () => {
    const url = buildGuidedOnboardingDestinationUrl({ sessionId: "session-123", stepKey: "labor_tax_shop_settings" });
    const parsedUrl = new URL(url, "https://app.profixiq.test");

    expect(parsedUrl.pathname).toBe("/dashboard/owner/settings");
    expect(parsedUrl.searchParams.get("onboardingSession")).toBe("session-123");
    expect(parsedUrl.searchParams.get("onboardingStep")).toBe("labor_tax_shop_settings");
    expect(parsedUrl.searchParams.get("highlight")).toBe("shop-settings");
    expect(parsedUrl.searchParams.get("returnTo")).toBe("/dashboard/onboarding-v2/session-123");
    expect(parsedUrl.searchParams.get("source")).toBe("guided-onboarding");

    expect(parseGuidedOnboardingQuery(parsedUrl.searchParams)).toMatchObject({
      onboardingSession: "session-123",
      onboardingStep: "labor_tax_shop_settings",
      highlight: "shop-settings",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
  });

  it("builds the exact Inspection templates destination query params", () => {
    const url = buildGuidedOnboardingDestinationUrl({ sessionId: "session-123", stepKey: "inspection_templates" });
    const parsedUrl = new URL(url, "https://app.profixiq.test");

    expect(parsedUrl.pathname).toBe("/inspections/templates");
    expect(parsedUrl.searchParams.get("onboardingSession")).toBe("session-123");
    expect(parsedUrl.searchParams.get("onboardingStep")).toBe("inspection_templates");
    expect(parsedUrl.searchParams.get("highlight")).toBe("inspection-template-import");
    expect(parsedUrl.searchParams.get("returnTo")).toBe("/dashboard/onboarding-v2/session-123");
    expect(parsedUrl.searchParams.get("source")).toBe("guided-onboarding");

    expect(parseGuidedOnboardingQuery(parsedUrl.searchParams)).toMatchObject({
      onboardingSession: "session-123",
      onboardingStep: "inspection_templates",
      highlight: "inspection-template-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
  });

  it("builds the exact Service menu destination query params", () => {
    const url = buildGuidedOnboardingDestinationUrl({ sessionId: "session-123", stepKey: "service_menu" });
    const parsedUrl = new URL(url, "https://app.profixiq.test");

    expect(parsedUrl.pathname).toBe("/menu");
    expect(parsedUrl.searchParams.get("onboardingSession")).toBe("session-123");
    expect(parsedUrl.searchParams.get("onboardingStep")).toBe("service_menu");
    expect(parsedUrl.searchParams.get("highlight")).toBe("service-menu-setup");
    expect(parsedUrl.searchParams.get("returnTo")).toBe("/dashboard/onboarding-v2/session-123");
    expect(parsedUrl.searchParams.get("source")).toBe("guided-onboarding");

    expect(parseGuidedOnboardingQuery(parsedUrl.searchParams)).toMatchObject({
      onboardingSession: "session-123",
      onboardingStep: "service_menu",
      highlight: "service-menu-setup",
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



  it("builds and parses Invoices destination query params", () => {
    const url = buildGuidedOnboardingDestinationUrl({ sessionId: "session-123", stepKey: "invoices" });
    const parsedUrl = new URL(url, "https://app.profixiq.test");

    expect(parsedUrl.pathname).toBe("/billing");
    expect(parsedUrl.searchParams.get("onboardingSession")).toBe("session-123");
    expect(parsedUrl.searchParams.get("onboardingStep")).toBe("invoices");
    expect(parsedUrl.searchParams.get("highlight")).toBe("invoice-import");
    expect(parsedUrl.searchParams.get("returnTo")).toBe("/dashboard/onboarding-v2/session-123");
    expect(parsedUrl.searchParams.get("source")).toBe("guided-onboarding");

    expect(parseGuidedOnboardingQuery(parsedUrl.searchParams)).toMatchObject({
      onboardingSession: "session-123",
      onboardingStep: "invoices",
      highlight: "invoice-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
  });

  it("builds and parses Service history destination query params", () => {
    const url = buildGuidedOnboardingDestinationUrl({ sessionId: "session-123", stepKey: "service_history" });
    const parsedUrl = new URL(url, "https://app.profixiq.test");

    expect(parsedUrl.pathname).toBe("/work-orders/history");
    expect(parsedUrl.searchParams.get("onboardingSession")).toBe("session-123");
    expect(parsedUrl.searchParams.get("onboardingStep")).toBe("service_history");
    expect(parsedUrl.searchParams.get("highlight")).toBe("service-history-import");
    expect(parsedUrl.searchParams.get("returnTo")).toBe("/dashboard/onboarding-v2/session-123");
    expect(parsedUrl.searchParams.get("source")).toBe("guided-onboarding");

    expect(parseGuidedOnboardingQuery(parsedUrl.searchParams)).toMatchObject({
      onboardingSession: "session-123",
      onboardingStep: "service_history",
      highlight: "service-history-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
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
