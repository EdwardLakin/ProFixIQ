import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI rate-card version persistence", () => {
  it("writes a version with every ledger row", () => {
    expect(telemetry).toContain("AI_RATE_CARD_VERSION");
    expect(migration).toContain("rate_card_version text not null");
  });
});
