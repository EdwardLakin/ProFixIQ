import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260814142500_technician_copilot_voice_capability.sql",
  "utf8",
);

const technicianOverridePattern =
  "^technician_copilot_(text|documentation|voice):[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$";

describe("Technician CoPilot voice capability schema contract", () => {
  it("preserves the existing automation capability vocabulary", () => {
    expect(migration).toContain("'appointment_intake'");
    expect(migration).toContain("'payment_collection'");
    expect(migration).toContain("'technician_copilot_text'");
    expect(migration).toContain("'technician_copilot_documentation'");
  });

  it("adds only the exact voice shop flag and UUID-scoped override", () => {
    expect(migration).toContain("'technician_copilot_voice'");
    expect(migration).toContain(technicianOverridePattern);
    expect(migration).not.toContain("technician_copilot_%");
  });

  it("does not broaden evidence or canonical work-order permissions", () => {
    expect(migration).not.toContain("ai_automation_evidence");
    expect(migration).not.toContain("work_orders");
    expect(migration).not.toContain("work_order_lines");
  });
});
