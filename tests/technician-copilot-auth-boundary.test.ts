import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authSource = readFileSync(
  "features/copilot/technician/server/auth.ts",
  "utf8",
);

describe("Technician CoPilot auth boundary", () => {
  it("establishes canonical shop security context before capability and assigned-work reads", () => {
    const shopContextIndex = authSource.indexOf('"set_current_shop_id"');
    const capabilityIndex = authSource.indexOf(
      "getTechnicianCopilotCapabilities(\n    supabase,",
    );

    expect(shopContextIndex).toBeGreaterThanOrEqual(0);
    expect(capabilityIndex).toBeGreaterThan(shopContextIndex);
    expect(authSource).toContain("shop_security_context_failed");
    expect(authSource).toContain("p_shop_id: profile.shop_id");
  });

  it("continues to require an authenticated technician role before the runtime is exposed", () => {
    expect(authSource).toContain('"technician_role_required"');
    expect(authSource).toContain('role !== "mechanic"');
    expect(authSource).toContain('role !== "technician"');
    expect(authSource).toContain('role !== "tech"');
    expect(authSource).toContain('"technician_copilot_disabled"');
  });
});
