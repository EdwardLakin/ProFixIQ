import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const adminClient = { __client: "admin" };
const userClient = {
  __client: "user",
  auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { shop_id: "s1" }, error: null }),
      }),
    }),
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRSC: () => userClient,
  createAdminSupabase: () => adminClient,
}));
vi.mock("@/features/maintenance/server/generateMaintenanceRules", () => ({
  generateMaintenanceRulesForVehicle: (...args: unknown[]) => generate(...args),
}));
vi.mock("@/features/shared/lib/server/ai-telemetry-context", () => ({
  withAITelemetryContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/features/shared/lib/server/ai-governance", () => ({
  aiBudgetStopResponse: () => ({ body: {}, status: 402 }),
  isAIBudgetStop: () => false,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/maintenance/generate-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/maintenance/generate-rules", () => {
  beforeEach(() => {
    generate.mockReset();
    generate.mockResolvedValue({ servicesInserted: 1, rulesInserted: 2 });
  });

  it("writes the shared catalog with the service-role client, reading with the user's", async () => {
    const res = await POST(
      request({ year: 2023, make: "Western Star", model: "4900", engineFamily: "Detroit" }),
    );

    expect(res.status).toBe(200);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: userClient,
        writeClient: adminClient,
        year: 2023,
        make: "Western Star",
        model: "4900",
        engineFamily: "Detroit",
      }),
    );
  });

  it("returns the generation error instead of reporting success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValue(new Error("AI did not return valid JSON"));

    const res = await POST(request({ year: 2023, make: "Western Star", model: "4900" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "AI did not return valid JSON" });
  });
});
