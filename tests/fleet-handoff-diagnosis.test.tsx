import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ShopFleetRequestInbox from "@/features/fleet/components/ShopFleetRequestInbox";
import {
  describeAccount,
  isBillingOwnerRecoverable,
  parseDiagnosisRow,
  refineHandoffFailure,
} from "@/features/fleet/lib/fleetHandoffDiagnosis";
import { mapFleetServiceRequestError } from "@/features/fleet/lib/fleetServiceRequestError";

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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const VEHICLE_ID = "6d85b7b8-d836-4cf8-a4ce-a48c542e0c43";
const FLEET_CUSTOMER_ID = "b548b107-e600-413f-b3a3-b48256b8929e";
const VEHICLE_CUSTOMER_ID = "b18caa90-bfc3-43d5-aab7-4c9c0b7390a5";

function diagnosisRow(overrides: Record<string, unknown> = {}) {
  return {
    cause: "ownership_mismatch",
    vehicle_id: VEHICLE_ID,
    unit_label: "QA-WALKIN-0804",
    fleet_id: "fleet-1",
    fleet_name: "Profixiq Fleet services",
    vehicle_customer_id: VEHICLE_CUSTOMER_ID,
    vehicle_customer_name: null,
    fleet_customer_id: FLEET_CUSTOMER_ID,
    fleet_customer_name: "Edward",
    ...overrides,
  };
}

async function convert(diagnosis: unknown, diagnosisError: unknown = null) {
  routeMocks.rpc.mockImplementation(async (fn: string) =>
    fn === "diagnose_fleet_service_request_handoff"
      ? { data: diagnosis, error: diagnosisError }
      : { data: null, error: { message: "PFX_FLEET_HANDOFF_UNAVAILABLE" } },
  );
  const { POST } = await import(
    "../app/api/fleet/service-requests/convert-to-work-order/route"
  );
  const response = await POST({
    headers: new Headers(),
    json: async () => ({ serviceRequestId: "req-1" }),
  } as never);
  return { status: response.status, body: await response.json() };
}

describe("fleet handoff diagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    routeMocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      canonicalRole: "owner",
      supabase: { rpc: routeMocks.rpc },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("names the accounts and unit for a mismatched billing customer, including an unnamed one", async () => {
    const { status, body } = await convert([diagnosisRow()]);
    expect(status).toBe(409);
    expect(body.reason).toBe("ownership_conflict");
    expect(body.error).toContain("QA-WALKIN-0804");
    expect(body.error).toContain("Unnamed account (b18caa90)");
    expect(body.error).toContain("Edward");
    expect(body.diagnosis).toMatchObject({
      cause: "ownership_mismatch",
      vehicleId: VEHICLE_ID,
      fleetCustomerId: FLEET_CUSTOMER_ID,
    });
  });

  it.each([
    ["enrollment_missing", "enrollment_missing", /not actively enrolled/],
    ["billing_unavailable", "billing_unavailable", /no billing account/],
    ["lines_invalid", "lines_invalid", /service lines/],
    ["already_converted", "stale_conflict", /already accepted/],
    ["ready", "stale_conflict", /Nothing is blocking/],
  ])("reports %s specifically", async (cause, reason, message) => {
    const { status, body } = await convert([diagnosisRow({ cause })]);
    expect(status).toBe(409);
    expect(body.reason).toBe(reason);
    expect(body.error).toMatch(message);
  });

  it("falls back to the generic handoff failure when diagnosis is unavailable", async () => {
    const { body } = await convert(null, { message: "function missing" });
    expect(body.reason).toBe("handoff_unavailable");
    expect(body.diagnosis).toBeUndefined();
  });

  it("does not diagnose failures unrelated to the handoff", async () => {
    routeMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "operation key already used with a different payload" },
    });
    const { POST } = await import(
      "../app/api/fleet/service-requests/convert-to-work-order/route"
    );
    const response = await POST({
      headers: new Headers(),
      json: async () => ({ serviceRequestId: "req-1" }),
    } as never);
    expect((await response.json()).reason).toBe("replay_conflict");
    expect(routeMocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("only treats an ownership mismatch as billing-owner recoverable", () => {
    const mismatch = parseDiagnosisRow([diagnosisRow()]);
    const lines = parseDiagnosisRow([diagnosisRow({ cause: "lines_invalid" })]);
    expect(isBillingOwnerRecoverable("ownership_conflict", mismatch)).toBe(true);
    expect(isBillingOwnerRecoverable("lines_invalid", lines)).toBe(false);
    // handoff_unavailable with a lines diagnosis must not offer recovery
    expect(isBillingOwnerRecoverable("handoff_unavailable", lines)).toBe(false);
    // no diagnosis: legacy behaviour is preserved
    expect(isBillingOwnerRecoverable("handoff_unavailable", null)).toBe(true);
    expect(isBillingOwnerRecoverable("replay_conflict", null)).toBe(false);
  });

  it("rejects malformed diagnosis rows and keeps the original failure", () => {
    expect(parseDiagnosisRow([{ cause: "bogus" }])).toBeNull();
    expect(parseDiagnosisRow(null)).toBeNull();
    const failure = mapFleetServiceRequestError(
      { message: "PFX_FLEET_HANDOFF_UNAVAILABLE" },
      "x",
    );
    expect(refineHandoffFailure(failure, null)).toBe(failure);
  });

  it("never renders a blank account", () => {
    expect(describeAccount("  ", VEHICLE_CUSTOMER_ID)).toBe(
      "Unnamed account (b18caa90)",
    );
    expect(describeAccount(null, null)).toBe("No account on file");
    expect(describeAccount("Edward", VEHICLE_CUSTOMER_ID)).toBe("Edward");
  });
});

describe("Shop inbox recovery destinations", () => {
  const payload = {
    canManage: true,
    summary: { open: 1, scheduled: 0, awaitingApproval: 0, completed: 0 },
    requests: [
      {
        id: "req-1",
        fleetId: "fleet-1",
        fleetName: "Profixiq Fleet services",
        vehicleId: VEHICLE_ID,
        unitLabel: "QA-WALKIN-0804",
        vehicleDescription: "2018 Ford F-150",
        title: "Hydraulic Brake Inspection",
        summary: "",
        severity: "medium",
        status: "open",
        createdAt: "2026-08-04T00:00:00.000Z",
        requestedForDate: null,
        scheduledForDate: null,
        sourcePmDueEventId: null,
        workOrder: null,
        shopProgress: null,
      },
    ],
  };

  function stubConvertFailure(reason: string, error: string, diagnosis?: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/fleet/service-requests") {
          return new Response(JSON.stringify(payload), { status: 200 });
        }
        return new Response(JSON.stringify({ error, reason, diagnosis }), {
          status: 409,
        });
      }),
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it("offers recovery and destinations for an ownership mismatch", async () => {
    stubConvertFailure("ownership_conflict", "billed to X", {
      cause: "ownership_mismatch",
      vehicleId: VEHICLE_ID,
      unitLabel: "QA-WALKIN-0804",
      fleetId: "fleet-1",
      fleetName: "Profixiq Fleet services",
      vehicleCustomerId: VEHICLE_CUSTOMER_ID,
      vehicleCustomerName: null,
      fleetCustomerId: FLEET_CUSTOMER_ID,
      fleetCustomerName: "Edward",
    });
    render(<ShopFleetRequestInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept into Shop" }));

    expect(
      await screen.findByRole("button", { name: "Resolve billing owner" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open vehicle" })).toHaveAttribute(
      "href",
      `/vehicles/${VEHICLE_ID}`,
    );
    expect(
      screen.getByRole("link", { name: "Open Fleet billing account" }),
    ).toHaveAttribute("href", `/customers/${FLEET_CUSTOMER_ID}`);
  });

  it("does not offer billing-owner recovery for malformed service lines", async () => {
    stubConvertFailure("lines_invalid", "lines are missing", {
      cause: "lines_invalid",
      vehicleId: VEHICLE_ID,
      unitLabel: "QA-WALKIN-0804",
      fleetId: "fleet-1",
      fleetName: "Profixiq Fleet services",
      vehicleCustomerId: FLEET_CUSTOMER_ID,
      vehicleCustomerName: "Edward",
      fleetCustomerId: FLEET_CUSTOMER_ID,
      fleetCustomerName: "Edward",
    });
    render(<ShopFleetRequestInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept into Shop" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("lines are missing");
    expect(
      screen.queryByRole("button", { name: "Resolve billing owner" }),
    ).not.toBeInTheDocument();
  });

  it("keeps Field operators inside the mobile shell", async () => {
    stubConvertFailure("ownership_conflict", "billed to X", {
      cause: "ownership_mismatch",
      vehicleId: VEHICLE_ID,
      unitLabel: "U",
      fleetId: "fleet-1",
      fleetName: "F",
      vehicleCustomerId: VEHICLE_CUSTOMER_ID,
      vehicleCustomerName: null,
      fleetCustomerId: FLEET_CUSTOMER_ID,
      fleetCustomerName: "Edward",
    });
    render(<ShopFleetRequestInbox workOrderBasePath="/mobile/work-orders" />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept into Shop" }));

    expect(
      await screen.findByRole("link", { name: "Open Fleet billing account" }),
    ).toHaveAttribute("href", `/mobile/customers/${FLEET_CUSTOMER_ID}`);
    expect(screen.queryByRole("link", { name: "Open vehicle" })).toBeNull();
  });
});
