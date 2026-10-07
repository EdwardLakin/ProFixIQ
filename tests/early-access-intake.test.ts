// Early Access campaign regression coverage.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Early Access public intake", () => {
  it("keeps the campaign on a dedicated standalone public route", () => {
    const page = source("app/early-access/page.tsx");
    const component = source("features/shared/components/EarlyAccessApplication.tsx");
    const boundaries = source("features/shared/lib/routes/shellBoundaries.ts");

    expect(page).toContain("EarlyAccessApplication");
    expect(component).toContain("/api/public/early-access");
    expect(component).toContain("30% off");
    expect(component).toContain("7-day free trial");
    expect(component).toContain("Shop Mobile");
    expect(component).toContain("Customer Portal");
    expect(boundaries).toContain('"/early-access"');
  });

  it("offers product-specific Early Access for Shop, Complete, Field, and Fleet", () => {
    const component = source("features/shared/components/EarlyAccessApplication.tsx");
    const server = source("features/ops/server/earlyAccessApplications.ts");
    const migration = source("supabase/migrations/20261007030000_early_access_applications.sql");

    for (const key of ["shop_operations", "complete_operations", "field_service", "fleet_maintenance"]) {
      expect(component).toContain(key);
      expect(server).toContain(key);
      expect(migration).toContain(key);
    }
    expect(component).toContain("productPackage");
    expect(component).toContain("Compare plans");
    expect(server).toContain("product_package");
  });

  it("does not leak normal checkout or the generic free-trial footer into the campaign", () => {
    const component = source("features/shared/components/EarlyAccessApplication.tsx");

    expect(component).not.toContain("/api/stripe/checkout");
    expect(component).not.toContain("Start free trial");
    expect(component).not.toContain('import Footer from');
  });

  it("captures qualification, feedback commitment, offer acknowledgement, and campaign attribution", () => {
    const component = source("features/shared/components/EarlyAccessApplication.tsx");

    expect(component).toContain("primaryChallenge");
    expect(component).toContain("interestedSurfaces");
    expect(component).toContain("purchaseTimeline");
    expect(component).toContain("feedbackCommitment");
    expect(component).toContain("offerTermsAccepted");
    expect(component).toContain("utm_source");
    expect(component).toContain("utm_campaign");
  });

  it("persists a server-controlled offer terms version for later discount grants", () => {
    const server = source("features/ops/server/earlyAccessApplications.ts");
    const migration = source("supabase/migrations/20261007030000_early_access_applications.sql");

    expect(server).toContain("EARLY_ACCESS_OFFER_TERMS_VERSION");
    expect(server).toContain("offer_terms_version");
    expect(migration).toContain("offer_terms_version text not null");
  });

  it("rate limits public submissions before using the service-role intake boundary", () => {
    const route = source("app/api/public/early-access/route.ts");
    const server = source("features/ops/server/earlyAccessApplications.ts");
    const migration = source("supabase/migrations/20261007030000_early_access_applications.sql");

    expect(route).toContain("enforcePublicRouteRateLimit");
    expect(route).toContain('route: "public-early-access"');
    expect(route.indexOf("enforcePublicRouteRateLimit")).toBeLessThan(route.indexOf("request.json"));
    expect(route).toContain("submitEarlyAccessApplication");
    expect(server).toContain("createAdminSupabase");
    expect(server).toContain('.from("early_access_applications")');
    expect(migration).toContain("enable row level security");
    expect(migration).not.toContain("create policy");
  });

  it("keeps every pending lead visible while capping only reviewed history", () => {
    const server = source("features/ops/server/earlyAccessApplications.ts");

    expect(server).toContain('.eq("status", "pending")');
    expect(server).toContain('.in("status", ["approved", "declined"])');
    expect(server).toContain("reviewedResult");
    expect(server).toContain(".limit(100)");
  });

  it("exposes product and terms details in Ops without wiring discounted checkout yet", () => {
    const opsPage = source("app/ops/early-access/page.tsx");
    const opsShell = source("features/ops/components/OpsShell.tsx");

    expect(opsPage).toContain("listEarlyAccessApplications");
    expect(opsPage).toContain("productPackage");
    expect(opsPage).toContain("offerTermsVersion");
    expect(opsPage).toContain("product-specific discounted signup");
    expect(opsShell).toContain('/ops/early-access');
  });
});
