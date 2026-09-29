import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  getMobileFieldServiceAccess: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: routeMocks.requireShopScopedApiAccess,
}));
vi.mock("@/features/mobile/service/server/access", () => ({
  getMobileFieldServiceAccess: routeMocks.getMobileFieldServiceAccess,
}));

const VEHICLE_ID = "10000000-0000-4000-8000-000000000001";

function context() {
  return { params: Promise.resolve({ vehicleId: VEHICLE_ID }) };
}

describe("fleet vehicle billing-owner route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      canonicalRole: "owner",
      supabase: { rpc: routeMocks.rpc },
    });
  });

  it("diagnoses a mismatch without applying it on GET", async () => {
    routeMocks.rpc.mockResolvedValue({
      data: [
        {
          already_aligned: false,
          applied: false,
          vehicle_id: VEHICLE_ID,
          fleet_id: "fleet-1",
          fleet_name: "Acme Logistics",
          previous_customer_id: "customer-old",
          previous_customer_name: "Old Billing Co",
          resolved_customer_id: "customer-new",
          resolved_customer_name: "Acme Logistics",
        },
      ],
      error: null,
    });

    const { GET } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await GET(new Request("https://profixiq.test/x") as never, context());

    expect(routeMocks.rpc).toHaveBeenCalledWith(
      "resolve_fleet_vehicle_billing_owner",
      { p_vehicle_id: VEHICLE_ID, p_apply: false },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      alreadyAligned: false,
      applied: false,
      vehicleId: VEHICLE_ID,
      fleetId: "fleet-1",
      fleetName: "Acme Logistics",
      previousCustomerId: "customer-old",
      previousCustomerName: "Old Billing Co",
      resolvedCustomerId: "customer-new",
      resolvedCustomerName: "Acme Logistics",
    });
  });

  it("applies the fix on POST", async () => {
    routeMocks.rpc.mockResolvedValue({
      data: [
        {
          already_aligned: false,
          applied: true,
          vehicle_id: VEHICLE_ID,
          fleet_id: "fleet-1",
          fleet_name: "Acme Logistics",
          previous_customer_id: "customer-old",
          previous_customer_name: "Old Billing Co",
          resolved_customer_id: "customer-new",
          resolved_customer_name: "Acme Logistics",
        },
      ],
      error: null,
    });

    const { POST } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await POST(new Request("https://profixiq.test/x") as never, context());

    expect(routeMocks.rpc).toHaveBeenCalledWith(
      "resolve_fleet_vehicle_billing_owner",
      { p_vehicle_id: VEHICLE_ID, p_apply: true },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ applied: true });
  });

  it("maps an ambiguous enrollment to a clear, actionable reason", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    routeMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "PFX_FLEET_VEHICLE_ENROLLMENT_AMBIGUOUS" },
    });

    const { POST } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await POST(new Request("https://profixiq.test/x") as never, context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "This unit is actively enrolled in more than one Fleet, so its billing owner can't be resolved automatically. Fix the duplicate enrollment first.",
      reason: "enrollment_ambiguous",
    });
    consoleError.mockRestore();
  });

  it("rejects a non-intake role without verified Field access", async () => {
    routeMocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      canonicalRole: "mechanic",
      supabase: { rpc: routeMocks.rpc },
    });
    routeMocks.getMobileFieldServiceAccess.mockResolvedValue({
      canAccessFieldService: false,
    });

    const { POST } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await POST(new Request("https://profixiq.test/x") as never, context());

    expect(response.status).toBe(403);
    expect(routeMocks.rpc).not.toHaveBeenCalled();
  });
});
