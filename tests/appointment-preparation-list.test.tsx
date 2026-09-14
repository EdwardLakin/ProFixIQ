import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AppointmentPreparationList from "@/features/shop-assistant/components/AppointmentPreparationList";
import type { AppointmentPreparationListItem } from "@/features/operations/types/appointmentPreparations";

afterEach(() => cleanup());

function item(overrides: Partial<AppointmentPreparationListItem> = {}): AppointmentPreparationListItem {
  return {
    bookingId: "booking-1",
    startsAt: "2026-09-15T09:00:00.000Z",
    vehicleId: "vehicle-1",
    customerId: "customer-1",
    vehicleSnapshot: { year: 2020, make: "Ford", model: "F150", vin: "1FT", licensePlate: null, unitNumber: null, mileage: null, drivetrain: null, engine: null, fuelType: null, transmission: null, notes: null },
    customerSnapshot: { name: "Jane Doe", businessName: null, email: null, phone: null, isFleet: false },
    deferredItems: [],
    matchedMenuItems: [],
    missingInfo: [],
    generatedAt: "2026-09-14T12:00:00.000Z",
    ...overrides,
  };
}

describe("AppointmentPreparationList", () => {
  it("shows an empty state when there is nothing upcoming", () => {
    render(<AppointmentPreparationList items={[]} canViewPricing />);
    expect(
      screen.getByText(/No upcoming appointments in the next week/),
    ).toBeVisible();
  });

  it("renders vehicle and customer context for an upcoming preparation", () => {
    render(<AppointmentPreparationList items={[item()]} canViewPricing />);
    expect(screen.getByText("2020 Ford F150")).toBeVisible();
    expect(screen.getByText(/Jane Doe/)).toBeVisible();
  });

  it("shows readable missing-info flags", () => {
    render(
      <AppointmentPreparationList
        items={[item({ missingInfo: ["missing_vin", "missing_customer_contact"] })]}
        canViewPricing
      />,
    );
    expect(screen.getByText("Missing VIN")).toBeVisible();
    expect(screen.getByText("No contact info")).toBeVisible();
  });

  it("hides matched-repair pricing when the viewer cannot see sell pricing", () => {
    render(
      <AppointmentPreparationList
        items={[
          item({
            matchedMenuItems: [
              {
                menuRepairItemId: "mri-1",
                name: "Brake Job",
                laborHours: 1,
                priceEstimate: 250,
                isActive: true,
                sourceRootLineId: "line-1",
                partsReadiness: [],
              },
            ],
          }),
        ]}
        canViewPricing={false}
      />,
    );
    expect(screen.getByText(/Brake Job/)).toBeVisible();
    expect(screen.queryByText(/\$250/)).not.toBeInTheDocument();
  });

  it("flags a job needing parts when any matched readiness line is short", () => {
    render(
      <AppointmentPreparationList
        items={[
          item({
            matchedMenuItems: [
              {
                menuRepairItemId: "mri-1",
                name: "Alternator swap",
                laborHours: 1,
                priceEstimate: null,
                isActive: true,
                sourceRootLineId: "line-1",
                partsReadiness: [
                  { partName: "Alternator", partNumber: "ALT-9", qtyRequired: 1, isRequired: true, matchedPartId: "part-1", qtyAvailable: 0, status: "short" },
                ],
              },
            ],
          }),
        ]}
        canViewPricing
      />,
    );
    expect(screen.getByText("Parts needed")).toBeVisible();
  });
});
