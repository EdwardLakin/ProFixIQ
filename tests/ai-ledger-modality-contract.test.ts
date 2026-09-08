import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger modality attribution", () => {
  it("supports text, realtime, speech, image, and other provider units", () => {
    expect(migration).toContain("('text', 'realtime', 'speech', 'image', 'other')");
  });
});
