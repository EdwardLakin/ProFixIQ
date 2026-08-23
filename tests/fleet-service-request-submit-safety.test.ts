import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  resolveFleetActorContext: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/features/fleet/lib/resolveFleetActorContext", () => ({
  resolveFleetActorContext: mocks.resolveFleetActorContext,
}));

const body = {
  fleetId: "11111111-1111-4111-8111-111111111111",
  vehicleId: "22222222-2222-4222-8222-222222222222",
  title: "QA connected lifecycle request",
  summary: "Validate Fleet to Shop intake",
  requestedForDate: null,
  lines: [
    {
      lineKind: "diagnostic",
      description: "Diagnose brake vibration",
      quantity: 1,
      sourceSnapshot: {},
    },
  ],
  operationKey: "qa-phase-15-request",
};

describe("Fleet request submission safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFleetActorContext.mockResolvedValue({
      userId: "user-1",
      actorType: "fleet_manager",
    });
  });

  it("returns an actionable conflict for invalid unit ownership", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "PFX_FLEET_UNIT_OWNERSHIP_MISMATCH" },
    });
    const { POST } = await import(
      "../app/api/fleet/request-builder/submit/route"
    );

    const response = await POST(
      new Request("https://fleet.profixiq.test/api/fleet/request-builder/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "This unit's billing ownership must be reviewed before service can continue.",
    });
    consoleError.mockRestore();
  });

  it("does not expose unexpected database failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "column internal_customer_key does not exist" },
    });
    const { POST } = await import(
      "../app/api/fleet/request-builder/submit/route"
    );

    const response = await POST(
      new Request("https://fleet.profixiq.test/api/fleet/request-builder/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create fleet service request.",
    });
    consoleError.mockRestore();
  });
});
