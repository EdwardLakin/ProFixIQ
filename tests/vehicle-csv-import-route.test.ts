import { readFileSync } from "node:fs";
import { processVehicleImportRows } from "@/features/vehicles/server/vehicle-import-job";
import { describe, expect, it } from "vitest";

const routeSource = () =>
  `${readFileSync("app/api/vehicles/import/route.ts", "utf8")}\n${readFileSync("features/vehicles/server/vehicle-import-job.ts", "utf8")}`;
const cardSource = () =>
  readFileSync("features/vehicles/components/VehicleCsvImportCard.tsx", "utf8");
const customerVehicleUiSource = () =>
  readFileSync("features/customers/app/customers/[id]/page.tsx", "utf8");

describe("vehicle CSV import route", () => {
  it("resolves CSV customer_id through customers.external_id before assigning vehicles.customer_id", () => {
    const source = routeSource();

    expect(source).toContain("byExternalId: Map<string, string>");
    expect(source).toContain(
      'select("id, external_id, email, phone, phone_number, name, business_name")',
    );
    expect(source).toContain("customers.byExternalId.get(externalCustomerId)");
    expect(source).toContain("customer_id: customerId");
    expect(source).not.toContain("customer_id: cleanString(row.customer_id)");
  });

  it("skips unresolved external customer ids instead of failing the whole import", () => {
    const source = routeSource();

    expect(source).toContain('"Customer not found for external customer_id."');
    expect(source).toContain("counts.skipped += 1");
    expect(source).toContain("skippedRows.push");
  });

  it("matches re-imported vehicles without relying on duplicate insert conflicts", () => {
    const source = routeSource();

    expect(source).toContain(
      '"external_id" | "vin" | "unit_number" | "license_plate"',
    );
    expect(source).toContain("loadExistingVehicleIndex");
    expect(source).toContain("VEHICLE_IMPORT_LOOKUP_CHUNK_SIZE = 100");
    expect(source).toContain("start += VEHICLE_IMPORT_LOOKUP_CHUNK_SIZE");
    expect(source).toContain(".in(field, chunk)");
    expect(source).toContain("counts.updated += 1");
  });



  it("stays synchronous and does not use import job staging", () => {
    const source = routeSource();
    const vehicleSource = `${source}\n${cardSource()}`;

    expect(vehicleSource).toContain('fetch("/api/vehicles/import"');
    expect(vehicleSource).toContain("processVehicleImportRows");
    expect(vehicleSource).not.toContain("import_jobs");
    expect(vehicleSource).not.toContain("import_job_rows");
    expect(vehicleSource).not.toContain("processVehicleImportJobBatch");
    expect(vehicleSource).not.toContain("stageVehicleImportRows");
    expect(vehicleSource).not.toContain("useImportJobProgress");
    expect(vehicleSource).not.toContain("/api/import-jobs/");
    expect(vehicleSource).not.toContain("/api/internal/import-jobs/tick");
  });

  it("persists supported CSV vehicle detail fields and returns compact diagnostics", () => {
    const source = routeSource();

    for (const field of [
      "state_province",
      "odometer_unit",
      "body_type",
      "asset_type",
      "status",
      "purchase_date",
      "in_service_date",
      "last_service_date",
      "tags",
      "notes",
      "drivetrain",
      "submodel",
    ]) {
      expect(source).toContain(`${field}:`);
    }
    expect(source).toContain("mileage: cleanString(row.odometer)");
    expect(source).toContain("skippedRows,");
    expect(source).toContain("failedRows,");
  });
});

describe("vehicle detail UI", () => {
  it("renders imported vehicle detail fields", () => {
    const source = customerVehicleUiSource();

    expect(source).toContain("formatOdometer");
    expect(source).toContain("formatPlateWithRegion");
    expect(source).toContain("Customer since");
    expect(source).toContain(
      "compactDate(customer?.customer_since ?? customer?.created_at)",
    );
    expect(source).toContain("🚗");

    for (const label of [
      "Plate",
      "Mileage",
      "Engine",
      "Drive",
      "Body Type",
      "Asset Type",
      "Purchase Date",
      "In-Service Date",
      "Last Service Date",
      "Tags",
      "Notes",
    ]) {
      expect(source).toContain(label);
    }
  });
});

describe("vehicle CSV import card", () => {
  it("can complete guided onboarding after a non-fatal vehicle import", () => {
    const source = cardSource();

    expect(source).toContain("state_province");
    expect(source).toContain("body_type");
    expect(source).toContain("last_service_date");
    expect(source).toContain("/steps/vehicles/complete");
    expect(source).toMatch(
      /nextCounts\.created\s*\+\s*nextCounts\.updated\s*\+\s*nextCounts\.skipped\s*>\s*0/,
    );
    expect(readFileSync(
      "features/shared/components/import/GuidedImportFooterActions.tsx",
      "utf8",
    )).toContain("Continue onboarding");
  });
});

describe("guided CSV import progress UI", () => {
  it("shares the CSV import progress component across customer and vehicle import cards", () => {
    const customerSource = readFileSync(
      "features/customers/components/CustomerCsvImportCard.tsx",
      "utf8",
    );
    const vehicleSource = cardSource();
    const progressSource = readFileSync(
      "features/shared/components/import/CsvImportProgress.tsx",
      "utf8",
    );

    expect(progressSource).toContain("CsvImportProgress");
    expect(progressSource).toContain("processed}/{total} rows");
    expect(progressSource).toContain("percent");
    expect(customerSource).toContain("Customer CSV import progress");
    expect(vehicleSource).toContain("Vehicle CSV import progress");
    expect(customerSource).toContain('phase: "Preparing rows"');
    expect(vehicleSource).toContain('phase: "Preparing rows"');
    expect(customerSource).toContain('phase: "Completing guided step"');
    expect(vehicleSource).toContain('phase: "Completing guided step"');
  });

  it("keeps stale results cleared and duplicate import clicks disabled", () => {
    const customerSource = readFileSync(
      "features/customers/components/CustomerCsvImportCard.tsx",
      "utf8",
    );
    const vehicleSource = cardSource();

    expect(customerSource).toContain("setCounts(null)");
    expect(vehicleSource).toContain("setCounts(null)");
    expect(customerSource).toContain("setImportProgress(null)");
    expect(vehicleSource).toContain("setImportProgress(null)");
    const footerSource = readFileSync(
      "features/shared/components/import/GuidedImportFooterActions.tsx",
      "utf8",
    );
    expect(footerSource).toContain("disabled={importing || completing || !canConfirm}");
    expect(vehicleSource).toContain("canConfirm={importableRows.length > 0}");
  });

  it("only shows guided Continue onboarding after successful zero-failure imports", () => {
    const customerSource = readFileSync(
      "features/customers/components/CustomerCsvImportCard.tsx",
      "utf8",
    );
    const vehicleSource = cardSource();

    expect(customerSource).toContain("counts.failed === 0");
    expect(vehicleSource).toContain("counts.failed === 0");
    expect(customerSource).toContain("importSucceeded");
    expect(vehicleSource).toContain("importSucceeded");
    const footerSource = readFileSync(
      "features/shared/components/import/GuidedImportFooterActions.tsx",
      "utf8",
    );
    expect(footerSource).toContain("Continue onboarding");
  });

  it("calls the vehicle guided completion endpoint with the vehicles step key", () => {
    const vehicleSource = cardSource();

    expect(vehicleSource).toContain("/steps/vehicles/complete");
    expect(vehicleSource).toContain(
      'summary: { importType: "vehicle_csv", ...nextCounts }',
    );
    expect(vehicleSource).toContain("payload.error ??");
  });
});

type VehicleRecord = {
  id: string;
  shop_id: string;
  external_id?: string | null;
  vin?: string | null;
  unit_number?: string | null;
  license_plate?: string | null;
  make?: string | null;
  model?: string | null;
};

function createVehicleImportSupabase(existingVehicles: VehicleRecord[] = []) {
  const vehicles = [...existingVehicles];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  const from = (table: string) => {
    if (table === "customers") {
      return {
        select: () => ({
          eq: () => ({
            range: async () => ({ data: [], error: null }),
          }),
        }),
      };
    }

    if (table !== "vehicles") throw new Error(`Unexpected table ${table}`);

    return {
      select: () => {
        const filters: Record<string, unknown> = {};
        return {
          eq(field: string, value: unknown) {
            filters[field] = value;
            return this;
          },
          async in(field: keyof VehicleRecord, values: unknown[]) {
            return {
              data: vehicles.filter((vehicle) => vehicle.shop_id === filters.shop_id && values.includes(vehicle[field])),
              error: null,
            };
          },
        };
      },
      update(payload: Record<string, unknown>) {
        const filters: Record<string, unknown> = {};
        return {
          eq(field: string, value: unknown) {
            filters[field] = value;
            if (filters.id && filters.shop_id) {
              const vehicle = vehicles.find((entry) => entry.id === filters.id && entry.shop_id === filters.shop_id);
              if (vehicle) Object.assign(vehicle, payload);
              updates.push({ id: String(filters.id), payload });
              return Promise.resolve({ error: null });
            }
            return this;
          },
        };
      },
      async insert(payload: VehicleRecord[]) {
        vehicles.push(...payload.map((vehicle, index) => ({ ...vehicle, id: vehicle.id ?? `inserted-${vehicles.length + index + 1}` })));
        return { error: null };
      },
    };
  };

  return { supabase: { from }, vehicles, updates };
}

describe("vehicle CSV import duplicate identity hierarchy", () => {
  it("imports two rows with different vehicle_id values and the same unit_number", async () => {
    const { supabase } = createVehicleImportSupabase();

    const summary = await processVehicleImportRows(supabase as never, "shop-1", [
      { vehicle_id: "veh-1", unit_number: "UNIT-617", make: "Ford", model: "F-150" },
      { vehicle_id: "veh-2", unit_number: "UNIT-617", make: "Ford", model: "F-250" },
    ]);

    expect(summary.counts.created).toBe(2);
    expect(summary.counts.duplicates).toBe(0);
    expect(summary.counts.skipped).toBe(0);
  });

  it("dedupes two rows with no vehicle_id and the same unit_number", async () => {
    const { supabase } = createVehicleImportSupabase();

    const summary = await processVehicleImportRows(supabase as never, "shop-1", [
      { unit_number: "UNIT-617", make: "Ford", model: "F-150" },
      { unit_number: "UNIT-617", make: "Ford", model: "F-250" },
    ]);

    expect(summary.counts.created).toBe(1);
    expect(summary.counts.duplicates).toBe(1);
    expect(summary.counts.skipped).toBe(1);
    expect(summary.skippedRows[0]).toMatchObject({ reason: "Duplicate vehicle identity within this CSV (unit_number:UNIT-617)." });
  });

  it("dedupes two rows with the same vehicle_id", async () => {
    const { supabase } = createVehicleImportSupabase();

    const summary = await processVehicleImportRows(supabase as never, "shop-1", [
      { vehicle_id: "veh-1", unit_number: "UNIT-617", make: "Ford", model: "F-150" },
      { vehicle_id: "veh-1", unit_number: "UNIT-999", make: "Ford", model: "F-250" },
    ]);

    expect(summary.counts.created).toBe(1);
    expect(summary.counts.duplicates).toBe(1);
    expect(summary.skippedRows[0]).toMatchObject({ reason: "Duplicate vehicle identity within this CSV (external_id:veh-1)." });
  });

  it("updates by external_id even if unit_number collides with another vehicle", async () => {
    const { supabase, vehicles, updates } = createVehicleImportSupabase([
      { id: "target", shop_id: "shop-1", external_id: "veh-1", unit_number: "UNIT-OLD", make: "Ford", model: "F-150" },
      { id: "unit-collision", shop_id: "shop-1", external_id: "veh-2", unit_number: "UNIT-617", make: "Ford", model: "F-250" },
    ]);

    const summary = await processVehicleImportRows(supabase as never, "shop-1", [
      { vehicle_id: "veh-1", unit_number: "UNIT-617", make: "Ford", model: "Updated" },
    ]);

    expect(summary.counts.updated).toBe(1);
    expect(summary.counts.created).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("target");
    expect(vehicles.find((vehicle) => vehicle.id === "target")?.model).toBe("Updated");
    expect(vehicles.find((vehicle) => vehicle.id === "unit-collision")?.model).toBe("F-250");
  });
});
