import { describe, expect, it } from "vitest";
import { vehicleFieldKind } from "@/features/inspections/lib/form-import";

describe("vehicleFieldKind", () => {
  it.each([
    ["Unit #", "unitNumber"],
    ["Unit Number", "unitNumber"],
    ["VIN", "vin"],
    ["Vehicle VIN #", "vin"],
    ["Licence Plate", "licensePlate"],
    ["Plate #", "licensePlate"],
    ["Odometer (km)", "odometer"],
    ["Mileage", "odometer"],
    ["Hour Meter", "engineHours"],
    ["Make/Model", "makeModel"],
    ["Make", "make"],
    ["Model", "model"],
    ["Model Year", "year"],
    ["Customer", "customerName"],
    ["Carrier Name", "customerName"],
  ])("%s -> %s", (label, kind) => {
    expect(vehicleFieldKind(label)).toBe(kind);
  });

  it.each(["Trailer #", "Trailer VIN", "Driver Name", "Driver Licence #", "Date", "Location", "Hours of Service"])(
    "%s is not a vehicle field",
    (label) => {
      expect(vehicleFieldKind(label)).toBeNull();
    },
  );
});
