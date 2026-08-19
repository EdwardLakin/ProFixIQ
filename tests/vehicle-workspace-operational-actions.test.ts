import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  vehicleWorkspaceActionHrefs,
  type VehicleWorkspaceSnapshot,
} from "@/features/vehicles/lib/vehicleWorkspace";

function snapshot(
  patch: Partial<VehicleWorkspaceSnapshot> = {},
): VehicleWorkspaceSnapshot {
  return {
    identity: {
      id: "11111111-1111-4111-8111-111111111111",
      year: 2020,
      make: "Ford",
      model: "Transit",
      submodel: null,
      vin: "1FTBR1C80LKA00001",
      licensePlate: "SHOP123",
      unitNumber: null,
      mileage: "100000",
      odometerUnit: "km",
      engineHours: null,
      status: "active",
    },
    currentAccount: {
      id: "22222222-2222-4222-8222-222222222222",
      displayName: "Canonical Customer",
      accountType: "customer",
      active: true,
      archivedAt: null,
      mergedIntoCustomerId: null,
    },
    permissions: {
      canViewAccountContact: true,
      canOpenAccount: true,
      canViewFinancials: true,
      canViewEstimates: true,
      canOpenInspections: true,
      canOpenWorkOrders: true,
      canViewPartRequests: true,
      canCreateWorkOrder: true,
      canBookAppointment: true,
      canOpenAppointments: true,
      canCreateEstimate: true,
      canMessageCustomer: true,
      canViewRelatedVehicles: true,
      isAssignedWorkOnly: false,
    },
    activeWork: [],
    upcomingAppointments: [],
    attentionItems: [],
    recentTimeline: [],
    financialSummary: { visible: false },
    documentSummary: {
      vehicleMediaCount: 0,
      workOrderMediaCount: 0,
      inspectionReportCount: 0,
      latestReference: null,
    },
    relatedVehicles: [],
    conflicts: [],
    ...patch,
  };
}

describe("Vehicle Workspace operational action handoffs", () => {
  it("retains the canonical customer and vehicle in each existing flow", () => {
    expect(vehicleWorkspaceActionHrefs(snapshot())).toEqual({
      bookAppointment:
        "/dashboard/appointments?openCreate=1&customerId=22222222-2222-4222-8222-222222222222&vehicleId=11111111-1111-4111-8111-111111111111",
      createEstimate:
        "/estimates/new?customerId=22222222-2222-4222-8222-222222222222&vehicleId=11111111-1111-4111-8111-111111111111",
      messageCustomer:
        "/chat?compose=customer&contextType=vehicle&contextId=11111111-1111-4111-8111-111111111111&customerId=22222222-2222-4222-8222-222222222222",
    });
  });

  it("does not emit actions that the current role cannot perform", () => {
    const base = snapshot();
    expect(
      vehicleWorkspaceActionHrefs({
        ...base,
        permissions: {
          ...base.permissions,
          canBookAppointment: false,
          canCreateEstimate: false,
          canMessageCustomer: false,
        },
      }),
    ).toEqual({
      bookAppointment: null,
      createEstimate: null,
      messageCustomer: null,
    });
  });

  const blockedCases = [
    ["missing account", { currentAccount: null }],
    [
      "archived account",
      {
        currentAccount: {
          ...snapshot().currentAccount!,
          archivedAt: "2026-08-19T00:00:00.000Z",
        },
      },
    ],
    [
      "vehicle conflict",
      {
        conflicts: [
          {
            kind: "vehicle_status" as const,
            title: "Archived vehicle",
            detail: "Actions are unavailable.",
            sourceIds: ["11111111-1111-4111-8111-111111111111"],
          },
        ],
      },
    ],
  ] satisfies Array<[string, Partial<VehicleWorkspaceSnapshot>]>;

  it.each(blockedCases)(
    "blocks all mutation handoffs for a %s",
    (_label, patch) => {
      expect(vehicleWorkspaceActionHrefs(snapshot(patch))).toEqual({
        bookAppointment: null,
        createEstimate: null,
        messageCustomer: null,
      });
    },
  );

  it("revalidates booking and estimate prefill against shop and ownership", () => {
    const booking = readFileSync(
      "app/dashboard/appointments/page.tsx",
      "utf8",
    );
    const estimate = readFileSync("app/estimates/new/page.tsx", "utf8");

    expect(booking).toContain('.eq("shop_id", selectedShop.id)');
    expect(booking).toContain('.eq("customer_id", requestedCustomerId)');
    expect(booking).toContain("vehicleId: form.vehicleId ?? null");
    expect(estimate).toContain('.eq("shop_id", profile.shop_id)');
    expect(estimate).toContain('.eq("customer_id", customerId)');
    expect(estimate).toContain("initialCustomer={initialCustomer}");
    expect(estimate).toContain("initialVehicle={initialVehicle}");
  });

  it("resolves message handoff customers by exact tenant-scoped id", () => {
    const inbox = readFileSync(
      "features/chat/components/InboxModal.tsx",
      "utf8",
    );

    expect(inbox).toContain("/api/chat/users?customerId=");
    expect(inbox).toContain('cache: "no-store"');
    expect(inbox).not.toContain(
      "customers.find((row) => row.id === initialCustomerId)",
    );
  });
});
