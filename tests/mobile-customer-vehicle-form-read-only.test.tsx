import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MobileCustomerVehicleForm from "@/features/work-orders/mobile/MobileCustomerVehicleForm";
import type {
  MobileCustomer,
  MobileVehicle,
} from "@/features/work-orders/mobile/types";
import { hasAnyRole } from "@/features/shared/lib/rbac";

const customer: MobileCustomer = {
  id: "c1",
  first_name: "Edward",
  last_name: "Lakin",
  phone: "4034704568",
  email: "edward@example.com",
  business_name: null,
  address: null,
  city: null,
  province: null,
  postal_code: null,
};

const vehicle: MobileVehicle = {
  id: "v1",
  vin: "123456ABCDEF12345",
  year: 2017,
  make: "Ford",
  model: "Expedition",
  license_plate: null,
  mileage: null,
  color: "White",
  unit_number: null,
  engine_hours: null,
  engine: null,
  transmission: null,
  fuel_type: null,
  drivetrain: null,
};

function renderForm(readOnly?: boolean) {
  const onCustomerChange = vi.fn();
  const onVehicleChange = vi.fn();
  render(
    <MobileCustomerVehicleForm
      wo={null}
      customer={customer}
      vehicle={vehicle}
      onCustomerChange={onCustomerChange}
      onVehicleChange={onVehicleChange}
      supabase={{} as never}
      readOnly={readOnly}
    />,
  );
  return { onCustomerChange, onVehicleChange };
}

describe("MobileCustomerVehicleForm read-only mode", () => {
  it("locks every text input and select when readOnly", () => {
    const { onCustomerChange, onVehicleChange } = renderForm(true);

    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input).toHaveProperty("readOnly", true);
    }
    for (const select of screen.getAllByRole("combobox")) {
      expect(select).toHaveProperty("disabled", true);
    }

    // Values stay visible so technicians can still read them.
    expect(screen.getByDisplayValue("Edward")).toBeTruthy();
    expect(screen.getByDisplayValue("123456ABCDEF12345")).toBeTruthy();

    expect(onCustomerChange).not.toHaveBeenCalled();
    expect(onVehicleChange).not.toHaveBeenCalled();
  });

  it("stays editable by default (existing behavior preserved)", () => {
    const { onCustomerChange } = renderForm();

    for (const input of screen.getAllByRole("textbox")) {
      expect(input).toHaveProperty("readOnly", false);
    }
    for (const select of screen.getAllByRole("combobox")) {
      expect(select).toHaveProperty("disabled", false);
    }

    fireEvent.change(screen.getByDisplayValue("Edward"), {
      target: { value: "Ed" },
    });
    expect(onCustomerChange).toHaveBeenCalledTimes(1);
  });
});

describe("customer & vehicle editor roles", () => {
  const editors = ["owner", "admin", "manager", "advisor", "service"] as const;

  it("treats technician-tier and unresolved roles as not allowed", () => {
    for (const role of ["mechanic", "tech", "lead_hand", "foreman", "parts"]) {
      expect(hasAnyRole(role, editors)).toBe(false);
    }
    expect(hasAnyRole(null, editors)).toBe(false);
    expect(hasAnyRole(undefined, editors)).toBe(false);
  });

  it("allows owner, manager and advisor", () => {
    for (const role of ["owner", "manager", "advisor", "service_advisor"]) {
      expect(hasAnyRole(role, editors)).toBe(true);
    }
  });
});
