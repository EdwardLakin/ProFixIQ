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

  it("stages files outside the analysis request and preserves questionnaire context", () => {
    const page = read("app/demo/instant-shop-analysis/page.tsx");
    const uploadRoute = read("app/api/demo/shop-boost/uploads/route.ts");
    const runRoute = read("app/api/demo/shop-boost/run/route.ts");
    const uploadHelper = read(
      "features/integrations/shopBoost/stageDemoUploads.ts",
    );
    const shadowShop = read("features/integrations/shopBoost/shadowShop.ts");

    expect(page).toContain("stageInstantAnalysisUploads");
    expect(uploadRoute).toContain("createSignedUploadUrl");
    expect(uploadHelper).toContain("uploadToSignedUrl");
    expect(runRoute).toContain("await req.json()");
    expect(runRoute).toContain(".download(upload.path)");
    expect(runRoute).toContain("uploadedCsvs");
    expect(runRoute).not.toContain("req.formData()");
    expect(page).not.toContain("new FormData()");
    expect(runRoute).toContain("questionnaire,");
    expect(shadowShop).toContain('"invoices" | "parts"');
    expect(shadowShop).toContain(
      'invoices: stageRowsByDomain(parsedRowsByDomain.invoices, "invoices")',
    );
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
    expect(handoff).toContain("importSummary: ShopBoostImportSummary");
    expect(handoff).not.toContain("importSummary?: ShopBoostImportSummary");
  });

  it("binds activation to the unlocked email and provides a retry-safe handoff page", () => {
    const activation = read("app/api/demo/shop-boost/activate/route.ts");
    const claim = read("app/api/demo/shop-boost/claim/route.ts");
    const handoffPage = read("app/onboarding/shop-boost/page.tsx");
    const signIn = read("features/auth/components/SignIn.tsx");

    expect(claim).toContain('.eq("lead_kind", "activation_claim")');
    expect(activation).toContain('.from("demo_shop_boost_leads")');
    expect(activation).toContain('.eq("email", normalizedUserEmail)');
    expect(activation).toContain('.eq("lead_kind", "activation_claim")');
    expect(activation).toContain('role !== "owner" && role !== "admin"');
    expect(activation).toContain("readPersistedImportSummary");
    expect(activation).toContain("isRecord(basics.importSummary)");
    expect(activation).toContain("ensureStorageCopy");
    expect(activation).toContain("demoRow.shop_id !== shopId");
    expect(handoffPage).toContain('fetch("/api/demo/shop-boost/activate"');
    expect(handoffPage).toContain("readPersistedActivationContext");
    expect(signIn).toContain("resolvePostAuthDestination");
    expect(signIn).toContain('searchParams.get("activationContext")');
    expect(signIn).toContain('params.set("activationContext", activationContext)');
    expect(signIn).not.toContain('router.replace("/onboarding")');
  });
});
