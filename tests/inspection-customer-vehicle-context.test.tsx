import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CustomerVehicleHeader from "@/features/inspections/lib/inspection/ui/CustomerVehicleHeader";
import {
  hasCustomerContext,
  hasVehicleContext,
  toSessionCustomerFromRecord,
  toSessionVehicleFromRecord,
} from "@/features/inspections/lib/inspection/inspectionCustomerVehicleContext";
import type {
  SessionCustomer,
  SessionVehicle,
} from "@/features/inspections/lib/inspection/types";

const EMPTY_CUSTOMER: SessionCustomer = {
  business_name: "",
  name: "",
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  province: "",
  postal_code: "",
};

const EMPTY_VEHICLE: SessionVehicle = {
  year: "",
  make: "",
  model: "",
  vin: "",
  license_plate: "",
  mileage: "",
  color: "",
};

describe("inspection customer/vehicle context resolution", () => {
  it("treats a customer with no identifying fields as having no context", () => {
    expect(hasCustomerContext(EMPTY_CUSTOMER)).toBe(false);
    expect(hasCustomerContext({ ...EMPTY_CUSTOMER, phone: "555-0100" })).toBe(
      true,
    );
    // A fleet account may have no personal name at all — business_name alone
    // must still count as real context.
    expect(
      hasCustomerContext({ ...EMPTY_CUSTOMER, business_name: "Acme Fleet" }),
    ).toBe(true);
  });

  it("treats a vehicle with no identifying fields as having no context", () => {
    expect(hasVehicleContext(EMPTY_VEHICLE)).toBe(false);
    expect(hasVehicleContext({ ...EMPTY_VEHICLE, vin: "1FTFW1E5" })).toBe(
      true,
    );
    expect(hasVehicleContext({ ...EMPTY_VEHICLE, make: "Ford" })).toBe(true);
  });

  it("maps the work-order-line customer relationship, preferring the fleet business name", () => {
    const mapped = toSessionCustomerFromRecord({
      business_name: "Acme Fleet Services",
      name: null,
      first_name: null,
      last_name: null,
      phone: null,
      phone_number: "555-0100",
      email: "dispatch@acmefleet.example",
      address: "1 Fleet Way",
      city: "Springfield",
      province: "ON",
      postal_code: "A1A 1A1",
    });

    expect(mapped.business_name).toBe("Acme Fleet Services");
    // Falls back to phone_number when the primary phone column is empty.
    expect(mapped.phone).toBe("555-0100");
    expect(mapped.email).toBe("dispatch@acmefleet.example");
    expect(hasCustomerContext(mapped)).toBe(true);
  });

  it("maps the work-order-line vehicle relationship, coercing numeric fields to strings", () => {
    const mapped = toSessionVehicleFromRecord({
      year: 2019,
      make: "Freightliner",
      model: "Cascadia",
      vin: "1FUJGHDV5KLXXXXXX",
      license_plate: "ABC123",
      mileage: "182000",
      color: "White",
      unit_number: "T-42",
      engine_hours: 5400,
    });

    expect(mapped.year).toBe("2019");
    expect(mapped.make).toBe("Freightliner");
    expect(mapped.unit_number).toBe("T-42");
    expect(mapped.engine_hours).toBe("5400");
    expect(hasVehicleContext(mapped)).toBe(true);
  });

  it("renders a resolved fleet customer and vehicle instead of placeholder dashes", () => {
    const customer = toSessionCustomerFromRecord({
      business_name: "Acme Fleet Services",
      name: null,
      first_name: null,
      last_name: null,
      phone: "555-0100",
      email: "dispatch@acmefleet.example",
      address: null,
      city: null,
      province: null,
      postal_code: null,
    });
    const vehicle = toSessionVehicleFromRecord({
      year: 2019,
      make: "Freightliner",
      model: "Cascadia",
      vin: "1FUJGHDV5KLXXXXXX",
      license_plate: "ABC123",
      mileage: null,
      color: null,
      unit_number: "T-42",
      engine_hours: null,
    });

    render(
      <CustomerVehicleHeader
        templateName="Hydraulic Brake Inspection"
        customer={customer}
        vehicle={vehicle}
      />,
    );

    expect(screen.getByText("Acme Fleet Services")).toBeTruthy();
    expect(screen.getByText("2019 Freightliner Cascadia")).toBeTruthy();
    expect(screen.getByText(/Plate: ABC123/)).toBeTruthy();
    expect(screen.getByText(/Unit: T-42/)).toBeTruthy();
    // Neither card should have fallen back to the empty-state dash.
    expect(screen.queryByText("—")).toBeNull();
  });

  it("still falls back to the placeholder dash when no context is available", () => {
    render(
      <CustomerVehicleHeader
        templateName=""
        customer={EMPTY_CUSTOMER}
        vehicle={EMPTY_VEHICLE}
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("inspection screen resolves missing context from the work order (source contract)", () => {
  const screenSource = readFileSync(
    "features/inspections/screens/GenericInspectionScreen.tsx",
    "utf8",
  );

  it("falls back to the existing work-order-line relationship instead of a new lookup workflow", () => {
    // Reuses the same authoritative endpoint the focused job screen already
    // calls — no new customer/vehicle lookup UI or API surface.
    expect(screenSource).toContain(
      "/api/work-order-lines/${encodeURIComponent(workOrderLineId)}/workspace-detail",
    );
    expect(screenSource).toContain("hasCustomerContext(paramCustomer)");
    expect(screenSource).toContain("hasVehicleContext(paramVehicle)");
    expect(screenSource).toContain("toSessionCustomerFromRecord(data.customer)");
    expect(screenSource).toContain("toSessionVehicleFromRecord(data.vehicle)");
  });

  it("prefers an already-populated session over the resolved fallback, and vice versa", () => {
    expect(screenSource).toContain(
      "hasCustomerContext((session.customer ?? {}) as SessionCustomer)\n                ? session.customer\n                : customer,",
    );
    expect(screenSource).toContain(
      "hasVehicleContext((session.vehicle ?? {}) as SessionVehicle)\n                ? session.vehicle\n                : vehicle,",
    );
  });
});
