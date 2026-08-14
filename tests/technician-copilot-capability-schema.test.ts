import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260814024500_technician_copilot_capability_settings_contract.sql",
  "utf8",
);

const technicianOverridePattern =
  "^technician_copilot_(text|documentation):[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$";

describe("Technician CoPilot capability schema contract", () => {
  it("preserves the existing AI automation capability vocabulary", () => {
    expect(migration).toContain("'appointment_intake'");
    expect(migration).toContain("'payment_collection'");
    expect(migration).toContain(
      "ai_automation_capability_settings_capability_chk",
    );
  });

  it("allows the exact shop-level CoPilot rollout flags", () => {
    expect(migration).toContain("'technician_copilot_text'");
    expect(migration).toContain("'technician_copilot_documentation'");
  });

  it("limits technician overrides to the two known flags with a UUID suffix", () => {
    expect(migration).toContain(technicianOverridePattern);
    expect(migration).not.toContain("technician_copilot_%");
  });

  it("does not broaden the separate automation evidence vocabulary", () => {
    expect(migration).not.toContain(
      "alter table public.ai_automation_evidence",
    );
  });
});
