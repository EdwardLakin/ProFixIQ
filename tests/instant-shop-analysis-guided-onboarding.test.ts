import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INSTANT_SHOP_ANALYSIS_DATASET_KEYS,
  INSTANT_SHOP_ANALYSIS_DATASETS,
} from "@/features/integrations/shopBoost/uploadDatasets";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("instant shop analysis guided onboarding handoff", () => {
  it("uses only the five datasets owned by guided onboarding", () => {
    expect(INSTANT_SHOP_ANALYSIS_DATASET_KEYS).toEqual([
      "customers",
      "vehicles",
      "history",
      "invoices",
      "parts",
    ]);
    expect(INSTANT_SHOP_ANALYSIS_DATASETS.map((dataset) => dataset.key)).toEqual(
      INSTANT_SHOP_ANALYSIS_DATASET_KEYS,
    );
  });

  it("renders only the canonical instant-analysis dataset list", () => {
    const source = read("app/demo/instant-shop-analysis/page.tsx");

    expect(source).toContain("INSTANT_SHOP_ANALYSIS_DATASETS.map");
    expect(source).not.toContain("SHOP_BOOST_UPLOAD_DATASETS.map");
  });

  it("preserves questionnaire context and invoice analysis", () => {
    const runRoute = read("app/api/demo/shop-boost/run/route.ts");
    const shadowShop = read("features/integrations/shopBoost/shadowShop.ts");

    expect(runRoute).toContain('formData.get("questionnaire")');
    expect(runRoute).toContain("questionnaire,");
    expect(shadowShop).toContain('"invoices" | "parts"');
    expect(shadowShop).toContain('invoices: stageRowsByDomain(parsedRowsByDomain.invoices, "invoices")');
  });

  it("copies the full upload manifest and maps activation into guided onboarding", () => {
    const activation = read("app/api/demo/shop-boost/activate/route.ts");
    const handoff = read("features/onboarding-v2/guided/instantAnalysisHandoff.ts");

    expect(activation).toContain("uploadManifest");
    expect(activation).toContain("mapInstantAnalysisToGuidedOnboarding");
    expect(activation).toContain("guidedSessionId");
    expect(activation).toContain("redirectTo");

    expect(handoff).toContain('customers: "customers"');
    expect(handoff).toContain('vehicles: "vehicles"');
    expect(handoff).toContain('history: "vehicle_history"');
    expect(handoff).toContain('invoices: "invoices"');
    expect(handoff).toContain('parts: "parts"');
    expect(handoff).toContain('event_type: "instant_analysis_mapped"');
    expect(handoff).toContain("reviewPhasePending");
    expect(handoff).toContain('select("step_key,status,answer")');
    expect(handoff).toContain('!args.importSummary && existingStep?.status === "completed"');
  });

  it("binds activation to the unlocked email and provides a retry-safe handoff page", () => {
    const activation = read("app/api/demo/shop-boost/activate/route.ts");
    const handoffPage = read("app/onboarding/shop-boost/page.tsx");
    const signIn = read("features/auth/components/SignIn.tsx");

    expect(activation).toContain('.from("demo_shop_boost_leads")');
    expect(activation).toContain('.eq("email", normalizedUserEmail)');
    expect(activation).toContain("demoRow.shop_id !== shopId");
    expect(handoffPage).toContain('fetch("/api/demo/shop-boost/activate"');
    expect(handoffPage).toContain("readPersistedActivationContext");
    expect(signIn).toContain("resolvePostAuthDestination");
    expect(signIn).not.toContain('router.replace("/onboarding")');
  });
});
