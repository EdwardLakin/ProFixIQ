import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("AI telemetry helper contract", () => {
  it("keeps recordAITelemetry a synchronous, console-only helper", () => {
    const telemetry = source("features/shared/lib/server/ai-telemetry.ts");

    // The durable ledger is an isolated addition. The pre-existing logging
    // helper must keep its original signature and stay free of persistence
    // side effects so it can be deployed and rolled back independently.
    expect(telemetry).toContain(
      "export function recordAITelemetry(event: AITelemetryEvent): void {",
    );
    expect(telemetry).not.toContain(
      "export async function recordAITelemetry",
    );
  });

  it("exposes durable ledger persistence under a separate name", () => {
    const telemetry = source("features/shared/lib/server/ai-telemetry.ts");

    expect(telemetry).toContain(
      "export async function recordDurableAIUsage(",
    );
    expect(telemetry).toContain('admin.rpc("record_ai_usage_ledger"');
  });

  it("records branding provider usage before asset persistence can fail", () => {
    const route = source("app/api/branding/generate/route.ts");

    // OpenAI has already been charged once images are returned, so the ledger
    // write must precede the storage upload / shop_brand_assets insert, whose
    // failure paths return early.
    // Anchor on the persistence calls themselves: an earlier
    // shop_brand_assets *read* (basedOnAssetId) legitimately precedes
    // generation and must not be mistaken for the write path.
    const ledgerAt = route.indexOf("await recordDurableAIUsage({");
    const uploadAt = route.indexOf(".upload(storagePath");
    const insertAt = route.indexOf(".insert({");

    expect(ledgerAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(-1);
    expect(ledgerAt).toBeLessThan(uploadAt);
    expect(ledgerAt).toBeLessThan(insertAt);
  });

  it("forwards cached prompt tokens through the durable quota wrapper", () => {
    const quota = source("features/shared/lib/server/ai-route-quota.ts");
    const interpret = source("app/api/ai/interpret/route.ts");

    expect(quota).toContain("cachedPromptTokens?: number | null;");
    expect(quota).toContain(
      "cached_prompt_tokens: result.usage?.cachedPromptTokens ?? null,",
    );
    expect(interpret).toContain("cachedPromptTokens:");
  });
});
