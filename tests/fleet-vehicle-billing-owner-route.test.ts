import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
const FLEET_ID = "fleet-1";
const PREVIOUS_CUSTOMER_ID = "customer-old";
const RESOLVED_CUSTOMER_ID = "customer-new";
const DIAGNOSE_URL = `https://profixiq.test/api/fleet/vehicles/${VEHICLE_ID}/billing-owner?fleetId=${FLEET_ID}`;
const APPLY_URL = `${DIAGNOSE_URL}&previousCustomerId=${PREVIOUS_CUSTOMER_ID}&resolvedCustomerId=${RESOLVED_CUSTOMER_ID}`;

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
          fleet_id: FLEET_ID,
          fleet_name: "Acme Logistics",
          previous_customer_id: PREVIOUS_CUSTOMER_ID,
          previous_customer_name: "Old Billing Co",
          resolved_customer_id: RESOLVED_CUSTOMER_ID,
          resolved_customer_name: "Acme Logistics",
        },
      ],
      error: null,
    });

    const { GET } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await GET(new NextRequest(DIAGNOSE_URL), context());

    expect(routeMocks.rpc).toHaveBeenCalledWith(
      "resolve_fleet_vehicle_billing_owner",
      {
        p_vehicle_id: VEHICLE_ID,
        p_fleet_id: FLEET_ID,
        p_apply: false,
        p_expected_resolved_customer_id: undefined,
        p_expect_previous_customer: false,
        p_expected_previous_customer_id: undefined,
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      alreadyAligned: false,
      applied: false,
      vehicleId: VEHICLE_ID,
      fleetId: FLEET_ID,
      fleetName: "Acme Logistics",
      previousCustomerId: PREVIOUS_CUSTOMER_ID,
      previousCustomerName: "Old Billing Co",
      resolvedCustomerId: RESOLVED_CUSTOMER_ID,
      resolvedCustomerName: "Acme Logistics",
    });
  });

  it("applies the fix on POST, confirming the diagnosed previous/resolved customer", async () => {
    routeMocks.rpc.mockResolvedValue({
      data: [
        {
          already_aligned: false,
          applied: true,
          vehicle_id: VEHICLE_ID,
          fleet_id: FLEET_ID,
          fleet_name: "Acme Logistics",
          previous_customer_id: PREVIOUS_CUSTOMER_ID,
          previous_customer_name: "Old Billing Co",
          resolved_customer_id: RESOLVED_CUSTOMER_ID,
          resolved_customer_name: "Acme Logistics",
        },
      ],
      error: null,
    });

    const { POST } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await POST(new NextRequest(APPLY_URL), context());

    expect(routeMocks.rpc).toHaveBeenCalledWith(
      "resolve_fleet_vehicle_billing_owner",
      {
        p_vehicle_id: VEHICLE_ID,
        p_fleet_id: FLEET_ID,
        p_apply: true,
        p_expected_resolved_customer_id: RESOLVED_CUSTOMER_ID,
        p_expect_previous_customer: true,
        p_expected_previous_customer_id: PREVIOUS_CUSTOMER_ID,
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ applied: true });
  });

  it("sends an explicit null previous-customer confirmation when the vehicle had none", async () => {
    routeMocks.rpc.mockResolvedValue({
      data: [
        {
          already_aligned: false,
          applied: true,
          vehicle_id: VEHICLE_ID,
          fleet_id: FLEET_ID,
          fleet_name: "Acme Logistics",
          previous_customer_id: null,
          previous_customer_name: null,
          resolved_customer_id: RESOLVED_CUSTOMER_ID,
          resolved_customer_name: "Acme Logistics",
        },
      ],
      error: null,
    });

    const { POST } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await POST(
      new NextRequest(
        `${DIAGNOSE_URL}&previousCustomerId=&resolvedCustomerId=${RESOLVED_CUSTOMER_ID}`,
      ),
      context(),
    );

    expect(routeMocks.rpc).toHaveBeenCalledWith(
      "resolve_fleet_vehicle_billing_owner",
      {
        p_vehicle_id: VEHICLE_ID,
        p_fleet_id: FLEET_ID,
        p_apply: true,
        p_expected_resolved_customer_id: RESOLVED_CUSTOMER_ID,
        p_expect_previous_customer: true,
        p_expected_previous_customer_id: undefined,
      },
    );
    expect(response.status).toBe(200);
  });

  it("rejects a GET request missing fleetId without calling the RPC", async () => {
    const { GET } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await GET(
      new NextRequest(
        `https://profixiq.test/api/fleet/vehicles/${VEHICLE_ID}/billing-owner`,
      ),
      context(),
    );

    expect(response.status).toBe(400);
    expect(routeMocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a POST confirmation missing the diagnosed previous/resolved customer", async () => {
    const { POST } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await POST(new NextRequest(DIAGNOSE_URL), context());

    expect(response.status).toBe(400);
    expect(routeMocks.rpc).not.toHaveBeenCalled();
  });

  it("maps a vehicle not enrolled in the request's Fleet to a clear, actionable reason", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    routeMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "PFX_FLEET_VEHICLE_ENROLLMENT_MISSING" },
    });

    const { POST } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await POST(new NextRequest(APPLY_URL), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "This unit isn't actively enrolled in the Fleet that filed this request, so its billing owner can't be resolved automatically here. Check the unit's Fleet enrollment.",
      reason: "enrollment_missing",
    });
    consoleError.mockRestore();
  });

  it("maps a stale confirmation to a clear, actionable reason", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    routeMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "PFX_FLEET_BILLING_OWNER_STALE" },
    });

    const { POST } = await import(
      "../app/api/fleet/vehicles/[vehicleId]/billing-owner/route"
    );

    const response = await POST(new NextRequest(APPLY_URL), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "This unit's billing owner changed since you reviewed it. Close this and try again to see the current details.",
      reason: "stale_conflict",
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

    const response = await POST(new NextRequest(APPLY_URL), context());

    expect(response.status).toBe(403);
    expect(routeMocks.rpc).not.toHaveBeenCalled();
  });
});
