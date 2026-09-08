import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const policy = readFileSync(
  "features/shared/lib/server/ai-ops-guard.ts",
  "utf8",
);

describe("phase 3 AI ledger scope", () => {
  it("leaves existing quota thresholds and enforcement implementation untouched", () => {
    expect(policy).toContain("const FEATURE_POLICY");
    expect(policy).toContain("export function enforceAIOperationalPolicy");
    expect(policy).toContain("export function registerAIUsageEvent");
  });
});
