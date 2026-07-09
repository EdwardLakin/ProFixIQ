import { describe, expect, it } from "vitest";
import {
  normalizeVehicleHistoryImportRow,
  rowCustomerExternalId,
  rowVehicleExternalId,
} from "@/features/work-orders/import/normalizeVehicleHistoryImportRow";
import {
  resolveCustomer,
  resolveVehicle,
} from "@/features/work-orders/server/vehicle-history-import-job";

const customer = {
  id: "customer-uuid-1",
  external_id: "CUST-100386",
  email: null,
  phone: null,
  phone_number: null,
  name: "Customer 100386",
  business_name: null,
  first_name: null,
  last_name: null,
};
const vehicle = {
  id: "vehicle-uuid-1",
  external_id: "VEH-200055",
  vin: null,
  customer_id: customer.id,
};

function resolver() {
  return {
    customersById: new Map([[customer.id, customer]]),
    customersByExternal: new Map([["cust-100386", customer]]),
    customersByEmail: new Map(),
    customersByPhone: new Map(),
    customersByName: new Map(),
    vehiclesById: new Map([[vehicle.id, vehicle]]),
    vehiclesByExternal: new Map([["veh-200055", vehicle]]),
    vehiclesByVin: new Map(),
  };
}

describe("vehicle history import identity aliases", () => {
  it.each([
    ["customer_id", "CUST-100386"],
    ["external_id", "CUST-100386"],
    ["customer_number", "CUST-100386"],
    ["customerid", "CUST-100386"],
    ["customernumber", "CUST-100386"],
  ])("normalizes and resolves customer alias %s", (header, value) => {
    const row = normalizeVehicleHistoryImportRow({ [header]: value });

    expect(rowCustomerExternalId(row)).toBe("CUST-100386");
    expect(resolveCustomer(row, resolver() as never)?.id).toBe(customer.id);
  });

  it.each([
    ["vehicle_id", "VEH-200055"],
    ["vehicle_external_id", "VEH-200055"],
    ["vehicle_number", "VEH-200055"],
    ["vehicleid", "VEH-200055"],
    ["vehiclenumber", "VEH-200055"],
  ])("normalizes and resolves vehicle alias %s", (header, value) => {
    const row = normalizeVehicleHistoryImportRow({ [header]: value });

    expect(rowVehicleExternalId(row)).toBe("VEH-200055");
    expect(resolveVehicle(row, resolver() as never)?.id).toBe(vehicle.id);
  });

  it.each([
    ["CUST-100386", "VEH-200055"],
    ["CUST-101177", "VEH-200168"],
    ["CUST-101310", "VEH-200187"],
  ])("preserves skipped-row authoritative ids %s / %s", (cust, veh) => {
    const row = normalizeVehicleHistoryImportRow({
      customer_number: cust,
      vehicle_number: veh,
    });

    expect(rowCustomerExternalId(row)).toBe(cust);
    expect(rowVehicleExternalId(row)).toBe(veh);
  });
});
