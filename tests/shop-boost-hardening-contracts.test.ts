import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function sourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir);
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((entry) => join(dir, entry))
    .filter((entry) => /\.(ts|tsx)$/.test(entry) && statSync(join(process.cwd(), entry)).isFile());
}

describe("Shop Boost worker scheduling and recovery", () => {
  it("schedules the worker route and authenticates the cron call with the shared guard", () => {
    const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
    expect(vercel.crons.some((cron) => cron.path === "/api/internal/shop-boost/run")).toBe(true);

    const route = read("app/api/internal/shop-boost/run/route.ts");
    expect(route).toContain("export async function GET");
    expect(route).toContain('bearerEnvSecretName: "CRON_SECRET"');
    expect(route).toContain("recoverStaleRunningJobs");
    // Cron delegates to the canonical executor rather than duplicating it.
    expect(route).toContain("await POST(");
    // The existing secret-header contract for kickoff calls is preserved.
    expect(route).toContain('req.headers.get("x-shop-boost-secret")');
  });

  it("cron runs preserve existing job states instead of re-seeding them to queued", () => {
    const route = read("app/api/internal/shop-boost/run/route.ts");
    const orchestrator = read("features/integrations/shopBoost/orchestrator/index.ts");

    expect(route).toContain("preserveJobStates: true");
    expect(route).toContain("preserveExisting: body?.preserveJobStates === true");
    expect(orchestrator).toContain("ignoreDuplicates: args.preserveExisting === true");
  });

  it("keeps the public-demo purge route unscheduled so deletion stays opt-in", () => {
    const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string }> };
    expect(vercel.crons.some((cron) => cron.path.includes("purge-orphan-uploads"))).toBe(false);

    const route = read("app/api/internal/demo/purge-orphan-uploads/route.ts");
    expect(route).toContain('searchParams.get("apply") === "1"');
    expect(route).toContain('bearerEnvSecretName: "CRON_SECRET"');
  });
});

describe("Instant analysis activation failure handling", () => {
  it("raises the function ceiling and records a failed intake instead of leaving it processing", () => {
    const activation = read("app/api/demo/shop-boost/activate/route.ts");

    expect(activation).toContain("export const maxDuration = 300");
    expect(activation).toContain('status: "failed"');
    expect(activation).toContain('currentStep: "activation_failed"');
    expect(activation).toContain("strict: true");
    expect(activation.indexOf("catch (error)")).toBeGreaterThan(activation.indexOf("runShopBoostImport({"));
    // Retry safety is unchanged: an existing non-terminal intake is re-run, not re-inserted.
    expect(activation).toContain("if (!existing.data?.id)");
  });
});

describe("public demo route guards", () => {
  it.each([
    ["uploads", "demo-shop-boost-uploads"],
    ["run", "demo-shop-boost-run"],
    ["claim", "demo-shop-boost-claim"],
    ["share", "demo-shop-boost-share"],
  ])("rate-limits %s before doing any work", (name, routeKey) => {
    const source = read(`app/api/demo/shop-boost/${name}/route.ts`);
    expect(source).toContain("enforcePublicRouteRateLimit");
    expect(source).toContain(`route: "${routeKey}"`);
  });

  it("caps share emails per recipient before sending and keeps sender text out of the subject", () => {
    const share = read("app/api/demo/shop-boost/share/route.ts");

    expect(share).toContain("MAX_EMAILS_PER_RECIPIENT");
    expect(share.indexOf("MAX_EMAILS_PER_RECIPIENT)")).toBeLessThan(share.indexOf("sgMail.send"));
    expect(share).not.toContain("${senderName} shared a Shop Boost analysis");
    // The slot is reserved (conditional update / insert) before SendGrid is called.
    expect(share.indexOf('.eq("emails_sent", sentBefore)')).toBeLessThan(share.indexOf("sgMail.send"));
    expect(share).toContain("subject: `A Shop Boost analysis was shared with you for ${context.shopName}`");
  });
});

describe("parked onboarding setup cards", () => {
  const cards: Array<[string, string]> = [
    ["StaffOnboardingSetupCard", "features/dashboard/app/dashboard/owner/create-user/StaffOnboardingSetupCard.tsx"],
    ["ServiceMenuOnboardingSetupCard", "features/menu/components/ServiceMenuOnboardingSetupCard.tsx"],
    ["InspectionTemplatesOnboardingSetupCard", "features/inspections/components/InspectionTemplatesOnboardingSetupCard.tsx"],
    ["SettingsOnboardingSetupCard", "features/dashboard/components/owner-settings/SettingsOnboardingSetupCard.tsx"],
  ];

  it.each(cards)("%s is marked parked and still present", (_name, path) => {
    const source = read(path);
    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain("PARKED");
  });

  it("stays unwired: no other source file imports a parked card", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("features"), ...sourceFiles("components")];
    for (const [name, path] of cards) {
      const importers = files.filter((file) => file !== path && read(file).includes(name));
      expect(importers, `${name} should not be imported anywhere`).toEqual([]);
    }
  });
});
