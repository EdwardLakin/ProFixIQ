import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();

let profile: { shop_id: string | null } | null = { shop_id: "s1" };
let linkedProfile: { shop_id: string | null } | null = null;
let profileError: unknown = null;
let vehicles: Array<{
  make: string | null;
  model: string | null;
  engine_family: string | null;
  engine: string | null;
}> = [];
let vehicleError: unknown = null;
const vehicleFilters: Array<[string, unknown]> = [];

function vehicleBuilder() {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order"]) {
    builder[method] = () => builder;
  }
  for (const method of ["eq", "ilike"]) {
    builder[method] = (column: string, value: unknown) => {
      vehicleFilters.push([`${method}:${column}`, value]);
      return builder;
    };
  }
  builder.limit = async () => ({ data: vehicles, error: vehicleError });
  return builder;
}

function profilesBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (column: string) => {
    builder.column = column;
    return builder;
  };
  builder.maybeSingle = async () => ({
    data: builder.column === "user_id" ? linkedProfile : profile,
    error: profileError,
  });
  return builder;
}

const adminClient = { __client: "admin", from: () => profilesBuilder() };

const userClient = {
  __client: "user",
  auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  from: (table: string) => {
    if (table === "vehicles") return vehicleBuilder();
    return profilesBuilder();
  },
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

const spec = { year: 2023, make: "Western Star", model: "4900" };

describe("POST /api/maintenance/generate-rules", () => {
  beforeEach(() => {
    generate.mockReset();
    generate.mockResolvedValue({ servicesInserted: 1, rulesInserted: 2 });
    profile = { shop_id: "s1" };
    linkedProfile = null;
    profileError = null;
    vehicles = [
      { make: "Western Star", model: "4900", engine_family: "Detroit", engine: "DD15" },
    ];
    vehicleError = null;
    vehicleFilters.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("writes the shared catalog with the service role, for a vehicle in the caller's shop", async () => {
    const res = await POST(request({ ...spec, engineFamily: "DD15" }));

    expect(res.status).toBe(200);
    expect(vehicleFilters).toContainEqual(["eq:shop_id", "s1"]);
    expect(vehicleFilters).toContainEqual(["eq:year", 2023]);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: userClient,
        writeClient: adminClient,
        ...spec,
        // Taken from the stored vehicle (what suggestions look up by), not the client.
        engineFamily: "Detroit",
      }),
    );
  });

  it("persists the stored vehicle's make/model, so casing can't create duplicate rule sets", async () => {
    await POST(request({ year: 2023, make: "western STAR", model: "4900" }));

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ make: "Western Star", model: "4900" }),
    );
  });

  it("keys the schedule on the stored engine when the vehicle has no engine family", async () => {
    vehicles = [
      { make: "Western Star", model: "4900", engine_family: null, engine: " DD15 " },
    ];

    const res = await POST(request(spec));

    expect(res.status).toBe(200);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ engineFamily: "DD15" }),
    );
  });

  it("does not guess between engine variants when the request doesn't identify one", async () => {
    vehicles = [
      { make: "Western Star", model: "4900", engine_family: null, engine: "DD13" },
      { make: "Western Star", model: "4900", engine_family: null, engine: "DD15" },
    ];

    const unspecified = await POST(request(spec));
    const unknownEngine = await POST(request({ ...spec, engineFamily: "X15" }));
    const identified = await POST(request({ ...spec, engineFamily: "dd15" }));

    expect(unspecified.status).toBe(409);
    expect(unknownEngine.status).toBe(409);
    expect(identified.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ engineFamily: "DD15" }),
    );
  });

  it("proceeds when every matching vehicle shares one engine, whatever the client sent", async () => {
    vehicles = [
      { make: "Western Star", model: "4900", engine_family: null, engine: "DD15" },
      { make: "Western Star", model: "4900", engine_family: null, engine: "dd15" },
    ];

    const res = await POST(request({ ...spec, engineFamily: "X15" }));

    expect(res.status).toBe(200);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ engineFamily: "DD15" }),
    );
  });

  it("never lets the client force regeneration", async () => {
    await POST(request({ ...spec, forceRefresh: true }));

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: false }),
    );
  });

  it("refuses a spec that matches no vehicle in the caller's shop", async () => {
    vehicles = [];

    const res = await POST(request({ year: 1999, make: "Made", model: "Up" }));

    expect(res.status).toBe(404);
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses callers with no shop, without touching the catalog", async () => {
    profile = { shop_id: null };

    const res = await POST(request(spec));

    expect(res.status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });

  it("resolves legacy staff whose profile is linked through user_id", async () => {
    profile = null;
    linkedProfile = { shop_id: "s1" };

    const res = await POST(request(spec));

    expect(res.status).toBe(200);
    expect(vehicleFilters).toContainEqual(["eq:shop_id", "s1"]);
    expect(generate).toHaveBeenCalled();
  });

  it("returns a retryable error when the shop or vehicle lookup fails", async () => {
    profileError = new Error("db down");
    expect((await POST(request(spec))).status).toBe(503);

    profileError = null;
    vehicleError = new Error("db down");
    expect((await POST(request(spec))).status).toBe(503);
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns the generation error instead of reporting success", async () => {
    generate.mockRejectedValue(new Error("AI did not return valid JSON"));

    const res = await POST(request(spec));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "AI did not return valid JSON" });
  });
});
