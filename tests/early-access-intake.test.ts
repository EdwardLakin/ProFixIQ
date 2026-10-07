import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Early Access public intake", () => {
  it("keeps the campaign on a dedicated public route", () => {
    const page = source("app/early-access/page.tsx");
    const component = source("features/shared/components/EarlyAccessApplication.tsx");

    expect(page).toContain("EarlyAccessApplication");
    expect(component).toContain("/api/public/early-access");
    expect(component).toContain("30% off");
    expect(component).toContain("7-day free trial");
    expect(component).toContain("Shop Mobile");
    expect(component).toContain("Customer Portal");
  });

  it("does not alter normal trial or checkout routes", () => {
    const component = source("features/shared/components/EarlyAccessApplication.tsx");

    expect(component).not.toContain("/api/stripe/checkout");
    expect(component).not.toContain("Start free trial");
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

  it("keeps public submissions behind the server service-role boundary", () => {
    const route = source("app/api/public/early-access/route.ts");
    const server = source("features/ops/server/earlyAccessApplications.ts");
    const migration = source("supabase/migrations/20261007030000_early_access_applications.sql");

    expect(route).toContain("submitEarlyAccessApplication");
    expect(server).toContain("createAdminSupabase");
    expect(server).toContain('.from("early_access_applications")');
    expect(migration).toContain("enable row level security");
    expect(migration).not.toContain("create policy");
  });

  it("exposes applications in Ops without wiring discounted checkout yet", () => {
    const opsPage = source("app/ops/early-access/page.tsx");
    const opsShell = source("features/ops/components/OpsShell.tsx");

    expect(opsPage).toContain("listEarlyAccessApplications");
    expect(opsPage).toContain("intake-only in this PR");
    expect(opsShell).toContain('/ops/early-access');
  });
});
