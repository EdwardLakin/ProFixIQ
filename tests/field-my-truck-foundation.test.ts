import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildFieldMyTruckSummary,
  type FieldTruckRecord,
} from "@/features/mobile/service/myTruck";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260820221500_field_my_truck_foundation.sql",
);
const route = read("app/api/mobile/service/my-truck/route.ts");
const fileRoute = read("app/api/mobile/service/my-truck/files/route.ts");
const screen = read("features/mobile/service/FieldMyTruck.tsx");
const shell = read("features/mobile/service/FieldWorkspaceShell.tsx");
const runtime = read("tests/mobile/field-my-truck.runtime.sql");
const workflow = read(".github/workflows/mobile-v1-validation.yml");

function record(
  input: Partial<FieldTruckRecord> &
    Pick<FieldTruckRecord, "id" | "record_type" | "title">,
): FieldTruckRecord {
  return {
    amount: null,
    content_type: null,
    created_at: "2026-08-20T12:00:00.000Z",
    created_by_profile_id: "profile-1",
    currency: null,
    due_odometer: null,
    due_on: null,
    ends_at: null,
    file_bucket: null,
    file_path: null,
    file_size_bytes: null,
    notes: null,
    occurred_on: null,
    odometer: null,
    odometer_unit: null,
    operation_key: input.id,
    original_filename: null,
    service_vehicle_id: "truck-1",
    shop_id: "shop-1",
    starts_at: null,
    status: "completed",
    updated_at: "2026-08-20T12:00:00.000Z",
    vendor: null,
    ...input,
  };
}

describe("Field My Truck foundation", () => {
  it("summarizes latest mileage, current alerts, downtime and monthly costs", () => {
    const summary = buildFieldMyTruckSummary(
      [
        record({
          id: "mileage-old",
          record_type: "odometer",
          title: "Reading",
          occurred_on: "2026-08-01",
          odometer: 1000,
          odometer_unit: "km",
        }),
        record({
          id: "mileage-new",
          record_type: "maintenance",
          title: "Oil service",
          occurred_on: "2026-08-19",
          odometer: 1200,
          odometer_unit: "km",
          amount: 125,
          currency: "CAD",
        }),
        record({
          id: "expense",
          record_type: "expense",
          title: "Fuel",
          occurred_on: "2026-08-18",
          amount: 75.5,
          currency: "CAD",
        }),
        record({
          id: "reminder",
          record_type: "reminder",
          title: "Registration",
          status: "open",
          due_on: "2026-09-01",
        }),
        record({
          id: "downtime",
          record_type: "downtime",
          title: "Repair",
          status: "open",
          starts_at: "2026-08-20T10:00:00.000Z",
        }),
      ],
      new Date("2026-08-20T18:00:00.000Z"),
    );

    expect(summary).toEqual({
      latestOdometer: 1200,
      odometerUnit: "km",
      openReminders: 1,
      activeDowntime: 1,
      monthCosts: 200.5,
      currency: "CAD",
    });
  });

  it("binds every record to the authenticated operator's active Field truck", () => {
    expect(migration).toContain("field_actor_can_access_service_vehicle");
    expect(migration).toContain("vehicle.primary_user_id = profile.id");
    expect(migration).toContain("mobile_profile_has_field_service_access");
    expect(migration).toContain(
      "foreign key (shop_id, service_vehicle_id)",
    );
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("field_truck_records_assigned_insert");
    expect(route).toContain("resolveAssignedFieldTruck");
    expect(route).toContain("service_vehicle_id: access.truck.id");
    expect(route).not.toContain("body.serviceVehicleId");
    expect(migration).toContain("field_truck_records_operation_key_unique");
    expect(route).toContain('error.code === "23505"');
    expect(fileRoute).toContain('insertError?.code === "23505"');
    expect(runtime).toContain("cross-truck insert was accepted");
    expect(runtime).toContain("operator one can read operator two records");
    expect(workflow).toContain("tests/mobile/field-my-truck.runtime.sql");
  });

  it("keeps files private and cleans storage if metadata persistence fails", () => {
    expect(migration).toContain("'field-truck-files'");
    expect(migration).toMatch(/'field-truck-files',[\s\S]*?false,/);
    expect(migration).toContain("field_truck_files_assigned_select");
    expect(migration).toContain("field_truck_files_assigned_insert");
    expect(fileRoute).toContain("createSignedUrl(record.file_path, 60)");
    expect(fileRoute).toContain("remove([storagePath])");
    expect(fileRoute).toContain("MAX_FILE_BYTES");
  });

  it("exposes all requested My Truck record types only inside Field", () => {
    for (const label of [
      "Mileage",
      "Maintenance",
      "Cost or receipt",
      "Reminder",
      "Downtime",
      "Document",
    ]) {
      expect(screen).toContain(`title="${label}"`);
    }
    expect(shell).toContain('href: "/mobile/service/my-truck"');
    expect(shell).not.toContain('href: "/fleet/maintenance"');
    expect(screen).not.toContain("Fleet");
  });

  it("uses a forward additive migration without destructive schema operations", () => {
    expect(migration).not.toMatch(/\bdrop\s+(table|column|schema)\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });
});
