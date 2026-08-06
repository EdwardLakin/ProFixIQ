import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FleetRequestBuilderPage from "../app/portal/fleet/request/build/page";

const routerReplace = vi.fn();
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/fleet/request/build",
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => searchParams,
}));

vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock(
  "@/features/portal/components/request/SharedServiceRequestBuilder",
  () => ({
    default: ({
      onAddCatalogItem,
    }: {
      onAddCatalogItem: (item: {
        id: string;
        kind: "menu";
        title: string;
        description: string;
        category: string;
        laborHours: number;
        price: number;
      }) => void;
    }) => (
      <button
        type="button"
        onClick={() =>
          onAddCatalogItem({
            id: "menu-1",
            kind: "menu",
            title: "Oil service",
            description: "Change oil and filter",
            category: "Maintenance",
            laborHours: 1,
            price: 120,
          })
        }
      >
        Add oil service
      </button>
    ),
  }),
);

const builderContext = {
  fleetId: "fleet-1",
  shopId: "shop-1",
  units: [
    {
      fleet_id: "fleet-1",
      vehicle_id: "vehicle-1",
      nickname: "Unit 12",
      vehicles: {
        id: "vehicle-1",
        unit_number: "12",
        year: 2025,
        make: "Ford",
        model: "Transit",
        vin: "VIN12",
        license_plate: "ABC123",
        engine_hours: 100,
        mileage: "25000",
      },
    },
  ],
  menuItems: [
    {
      id: "menu-1",
      name: "Oil service",
      description: "Change oil and filter",
      category: "Maintenance",
      base_labor_hours: 1,
      labor_hours: null,
      base_price: 120,
      total_price: null,
      vehicle_year: null,
      vehicle_make: null,
      vehicle_model: null,
    },
  ],
  inspections: [],
  pmPackages: [],
};

beforeEach(() => {
  routerReplace.mockReset();
  vi.restoreAllMocks();
  vi.stubGlobal("crypto", {
    randomUUID: vi
      .fn()
      .mockReturnValueOnce("line-key")
      .mockReturnValueOnce("operation-key"),
  });
});

describe("Fleet request requested date", () => {
  it("preserves the selected date while lines are added and submits it", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(builderContext), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ serviceRequestId: "request-1" }), {
          status: 200,
        }),
      );

    render(<FleetRequestBuilderPage />);

    const dateInput = await screen.findByLabelText("Requested date");
    fireEvent.input(dateInput, { target: { value: "2026-08-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Add oil service" }));

    expect(dateInput).toHaveValue("2026-08-20");
    fireEvent.click(screen.getByRole("button", { name: "Send to advisor" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, submitInit] = fetchMock.mock.calls[1] ?? [];
    const submitBody = JSON.parse(String(submitInit?.body)) as {
      requestedForDate: string;
    };
    expect(submitBody.requestedForDate).toBe("2026-08-20");
    expect(routerReplace).toHaveBeenCalledWith(
      "/portal/fleet/service-requests",
    );
  });
});
