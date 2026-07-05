import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRealisticDemoVehicleRows,
  HEAVY_DUTY_VEHICLE_TEMPLATES,
  PASSENGER_VEHICLE_TEMPLATES,
  REALISTIC_VEHICLE_TEMPLATES,
  type DemoVehicleRow,
  type VehicleTemplate,
} from "@/features/vehicles/lib/realisticVehicleTemplates";

const csvHeaders = [
  "vehicle_id", "customer_id", "unit_number", "year", "make", "model", "trim", "vin", "plate", "state_province", "color", "odometer", "odometer_unit", "engine", "fuel_type", "body_type", "drive_type", "asset_type", "status", "purchase_date", "in_service_date", "last_service_date", "tags", "notes",
];

function templateKey(row: Pick<DemoVehicleRow, "make" | "model">) {
  return `${row.make}||${row.model}`;
}

function assertRowMatchesTemplate(row: Pick<DemoVehicleRow, "make" | "model" | "trim" | "engine" | "fuel_type" | "drive_type" | "body_type" | "asset_type" | "odometer">) {
  const template = REALISTIC_VEHICLE_TEMPLATES.find((candidate) => candidate.make === row.make && candidate.model === row.model);
  expect(template, `${row.make} ${row.model} should exist in realistic templates`).toBeTruthy();
  const matchedTemplate = template as VehicleTemplate;
  expect(matchedTemplate.trims).toContain(row.trim);
  expect(matchedTemplate.powertrains).toContainEqual({ engine: row.engine, fuelType: row.fuel_type });
  expect(matchedTemplate.driveTypes).toContain(row.drive_type);
  expect(row.body_type).toBe(matchedTemplate.bodyType);
  expect(row.asset_type).toBe(matchedTemplate.assetType);
  expect(Number(row.odometer)).toBeGreaterThanOrEqual(matchedTemplate.mileageRange[0]);
  expect(Number(row.odometer)).toBeLessThanOrEqual(matchedTemplate.mileageRange[1]);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function readVehicleFixtureRows() {
  const fixture = readFileSync(resolve(process.cwd(), "shop-boost-fixtures/vehicles.csv"), "utf8").trim();
  const [headerLine, ...lines] = fixture.split(/\r?\n/);
  expect(parseCsvLine(headerLine as string)).toEqual(csvHeaders);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(csvHeaders.map((header, index) => [header, values[index] ?? ""]));
  });
}

describe("realistic vehicle templates", () => {
  it("keeps passenger templates internally consistent", () => {
    const requiredMakes = ["Toyota", "Ford", "Chevrolet", "GMC", "Ram", "Honda", "Nissan", "Hyundai", "Kia", "Mazda", "Subaru"];
    for (const make of requiredMakes) {
      expect(PASSENGER_VEHICLE_TEMPLATES.some((template) => template.make === make)).toBe(true);
    }

    for (const template of PASSENGER_VEHICLE_TEMPLATES) {
      expect(template.trims.length).toBeGreaterThan(0);
      expect(template.powertrains.length).toBeGreaterThan(0);
      expect(template.driveTypes.length).toBeGreaterThan(0);
      expect(template.bodyType).not.toBe("Heavy Truck");
      expect(template.mileageRange[0]).toBeLessThan(template.mileageRange[1]);
    }
  });

  it("generates heavy-duty candidates separately", () => {
    expect(HEAVY_DUTY_VEHICLE_TEMPLATES.some((template) => template.make === "Isuzu" && template.model === "NQR")).toBe(true);
    expect(HEAVY_DUTY_VEHICLE_TEMPLATES.every((template) => template.assetType === "fleet_asset")).toBe(true);
    expect(HEAVY_DUTY_VEHICLE_TEMPLATES.every((template) => template.powertrains.every((powertrain) => powertrain.fuelType === "Diesel"))).toBe(true);
  });

  it("generates demo rows only from consistent realistic templates", () => {
    const rows = buildRealisticDemoVehicleRows(REALISTIC_VEHICLE_TEMPLATES.length * 5, true);
    for (const row of rows) assertRowMatchesTemplate(row);

    expect(rows).not.toContainEqual(expect.objectContaining({ make: "Hyundai", model: "Santa Fe", engine: "5.0L V8", body_type: "Van" }));
    expect(rows).not.toContainEqual(expect.objectContaining({ make: "Toyota", model: "Corolla", body_type: "Heavy Truck" }));
    expect(rows).not.toContainEqual(expect.objectContaining({ body_type: expect.stringMatching(/Sedan|SUV|Wagon|Van/), fuel_type: "Diesel", asset_type: "fleet_asset" }));
  });

  it("keeps every generated row's make/model in the template list", () => {
    const templatePairs = new Set(REALISTIC_VEHICLE_TEMPLATES.map(templateKey));
    const rows = buildRealisticDemoVehicleRows(200, true);
    expect(rows.every((row) => templatePairs.has(templateKey(row)))).toBe(true);
  });

  it("keeps the checked-in sample vehicles.csv fixture realistic", () => {
    const rows = readVehicleFixtureRows();
    for (const row of rows) {
      assertRowMatchesTemplate({
        make: row.make,
        model: row.model,
        trim: row.trim,
        engine: row.engine,
        fuel_type: row.fuel_type,
        drive_type: row.drive_type,
        body_type: row.body_type,
        asset_type: row.asset_type as DemoVehicleRow["asset_type"],
        odometer: Number(row.odometer),
      });
    }

    expect(rows).not.toContainEqual(expect.objectContaining({ make: "Hyundai", model: "Santa Fe", engine: "5.0L V8", body_type: "Van" }));
    expect(rows).not.toContainEqual(expect.objectContaining({ make: "Toyota", model: "Corolla", body_type: "Heavy Truck" }));
  });
});
