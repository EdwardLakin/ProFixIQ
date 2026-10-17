import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import View from "@/features/equipment/dispatch/components/EquipmentDispatchView";
import type { EquipmentDispatchData } from "@/features/equipment/dispatch/server/loadEquipmentDispatch";
import { parseEquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";
const data: EquipmentDispatchData = {
  items: [
    {
      id: "visit",
      shopId: "shop",
      workOrderNumber: "WO-42",
      vehicle: { id: "asset" },
      mode: "mobile",
      status: "working",
      version: 9,
      assignmentState: "assigned",
      createdAt: "2026-10-17T12:00:00Z",
      updatedAt: "2026-10-17T12:00:00Z",
      allowedTransitions: ["completed"],
    },
  ],
  info: { page: 1, pageCount: 1, total: 1, from: 1, to: 1 },
  assets: [["asset", "Excavator"]],
  partial: true,
  work: [],
  selected: null,
  addresses: [],
  addressesPartial: false,
  participants: [
    {
      service_visit_id: "visit",
      user_id: "actor",
      role: "support",
      acknowledged_at: null,
    },
  ],
  technicians: [],
  serviceVehicles: [],
  generatedAt: "2026-10-17T12:00:00Z",
  startsAt: "2026-10-17T00:00:00Z",
  endsAt: "2026-10-24T12:00:00Z",
};
describe("Equipment native Dispatch view", () => {
  it("shows scoped visits and partial limits without execution or availability controls", () => {
    render(
      <View
        data={data}
        filters={parseEquipmentQueueFilters({})}
        shopId="shop"
        actorId="actor"
      />,
    );
    expect(screen.getByText("WO-42")).toBeInTheDocument();
    expect(screen.getByText(/Partial data/)).toBeInTheDocument();
    expect(
      screen.getByText(/Eligibility is not availability/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Acknowledge my assignment" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Complete|Start work|Resume|Reassign/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Excavator" })).toHaveAttribute(
      "href",
      "/equipment/asset",
    );
  });
  it("never offers acknowledgement for another participant", () => {
    render(
      <View
        data={data}
        filters={parseEquipmentQueueFilters({})}
        shopId="shop"
        actorId="other"
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Acknowledge my assignment" }),
    ).not.toBeInTheDocument();
  });
  it("distinguishes errors from a genuinely empty board", () => {
    render(
      <View
        error
        filters={parseEquipmentQueueFilters({})}
        shopId="shop"
        actorId="actor"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dispatch could not be loaded",
    );
    expect(
      screen.queryByText(/No Equipment visits match/),
    ).not.toBeInTheDocument();
  });
});
