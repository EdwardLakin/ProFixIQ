import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOnboardingActivationPlan } from "@/features/onboarding-agent/server/buildOnboardingActivationPlan";
import { ONBOARDING_SESSION_ALLOWED_STATUSES } from "@/features/onboarding-agent/lib/sessionStatus";

describe("onboarding phase 1 consolidation", () => {
  it("dashboard rerun and session rerun share canonical route helper usage", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "features/onboarding-agent/components/OnboardingAgentDashboard.tsx"), "utf8");
    const sessionPage = readFileSync(resolve(process.cwd(), "features/onboarding-agent/components/OnboardingSessionPage.tsx"), "utf8");

    expect(dashboard).toContain('onboardingSessionActionPath(sessionId, "rerun")');
    expect(sessionPage).toContain("onboardingSessionActionPath(sessionId, mode)");
  });

  it("activation preview reads staged onboarding artifacts only", async () => {
    const tables: string[] = [];

    const sb = {
      from(table: string) {
        tables.push(table);
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() {
            if (table === "onboarding_sessions") {
              return Promise.resolve({ data: { id: "session-1", summary: {}, analyzed_at: new Date().toISOString() }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          then(resolveFn: (value: any) => unknown, rejectFn?: (reason?: unknown) => unknown) {
            const defaultData = table === "onboarding_files" ? [] : [];
            return Promise.resolve({ data: defaultData, error: null }).then(resolveFn, rejectFn);
          },
          insert() { return this; },
          update() { return this; },
          single() { return Promise.resolve({ data: { id: "plan-1", status: "ready", summary: {}, created_at: new Date().toISOString() }, error: null }); },
        };
      },
    };

    await buildOnboardingActivationPlan({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1" });

    const nonOnboardingReads = tables.filter((table) => !table.startsWith("onboarding_"));
    expect(nonOnboardingReads).toEqual([]);
  });

  it("status helper and SQL migration stay aligned", () => {
    const sql = readFileSync(resolve(process.cwd(), "db/sql/2026-04-27_onboarding_agent_phase1_consolidation.sql"), "utf8");
    for (const status of ONBOARDING_SESSION_ALLOWED_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
  });

  it("analyze/rerun server pipeline does not reference live canonical write tables", () => {
    const analyzeSource = readFileSync(resolve(process.cwd(), "features/onboarding-agent/server/analyzeOnboardingSession.ts"), "utf8");
    const applySource = readFileSync(resolve(process.cwd(), "features/onboarding-agent/server/applyOnboardingAgentPlan.ts"), "utf8");
    const combined = `${analyzeSource}\n${applySource}`;

    const disallowedTables = ["customers", "vehicles", "work_orders", "invoices", "parts", "vendors", "staff", "menu", "inspections"];
    for (const table of disallowedTables) {
      expect(combined).not.toContain(`from(\"${table}\")`);
      expect(combined).not.toContain(`into ${table}`);
    }
  });
});
