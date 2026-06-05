import { describe, expect, it } from "vitest";
import { parseGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";
import { shouldShowVehicleOnboardingCard } from "@/features/vehicles/lib/guided";

describe("Vehicles page guided onboarding card visibility", () => {
  it("does not show the onboarding card during a normal Vehicles visit", () => {
    expect(shouldShowVehicleOnboardingCard(parseGuidedOnboardingQuery(new URLSearchParams()))).toBe(false);
  });

  it("shows the onboarding card for the vehicles import highlight query", () => {
    const guidedQuery = parseGuidedOnboardingQuery(new URLSearchParams({
      onboardingSession: "session-123",
      onboardingStep: "vehicles",
      highlight: "vehicle-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    }));

    expect(shouldShowVehicleOnboardingCard(guidedQuery)).toBe(true);
  });
});

import { filterSortAndCapVehicles, type VehicleListRow } from "@/features/vehicles/lib/list";

const baseVehicle = (overrides: Partial<VehicleListRow>): VehicleListRow => ({
  id: String(overrides.id ?? "vehicle"),
  external_id: null,
  unit_number: null,
  year: null,
  make: null,
  model: null,
  submodel: null,
  vin: null,
  license_plate: null,
  customer_id: null,
  mileage: null,
  engine_hours: null,
  engine: null,
  fuel_type: null,
  import_notes: null,
  source_row_id: null,
  customers: null,
  ...overrides,
});

describe("Vehicles page list filtering", () => {
  it("sorts the default list alphabetically by unit/display label and caps to 20", () => {
    const rows = Array.from({ length: 25 }, (_, index) => baseVehicle({ id: `vehicle-${index}`, unit_number: `Unit-${String(25 - index).padStart(2, "0")}` }));

    const result = filterSortAndCapVehicles(rows, "");

    expect(result).toHaveLength(20);
    expect(result[0].unit_number).toBe("Unit-01");
    expect(result[19].unit_number).toBe("Unit-20");
  });

  it.each([
    ["VIN", "older-vin", { vin: "OLDER-VIN" }],
    ["unit_number", "unit 42", { unit_number: "Unit 42" }],
    ["license_plate", "abc123", { license_plate: "ABC123" }],
    ["year", "2021", { year: 2021 }],
    ["make", "hino", { make: "Hino" }],
    ["model", "268", { model: "268" }],
    ["customer name", "acme", { customers: { id: "customer-1", business_name: "Acme Fleet", name: null, first_name: null, last_name: null, email: null, phone: null, phone_number: null } }],
    ["external_id", "legacy-99", { external_id: "legacy-99" }],
  ])("matches %s without pre-capping the source list", (_label, query, match) => {
    const rows = Array.from({ length: 220 }, (_, index) => baseVehicle({ id: `vehicle-${index}`, unit_number: `Unit-${index}` }));
    rows.push(baseVehicle({ id: "older-match", unit_number: "Unit-999", ...match }));

    const result = filterSortAndCapVehicles(rows, query);

    expect(result.map((row) => row.id)).toContain("older-match");
  });
});

import { fetchVehicleImportCustomers } from "@/features/vehicles/lib/importCustomers";

describe("Vehicles import customer lookup", () => {
  it("paginates same-shop customers beyond the first 1000 rows for CSV preview linking", async () => {
    const rows = Array.from({ length: 1002 }, (_, index) => ({
      id: `customer-${index}`,
      shop_id: index === 1000 ? "other-shop" : "shop-real",
      external_id: index === 1001 ? "CUST-100247" : `CUST-${index}`,
      business_name: index === 1001 ? "Fleet Customer" : null,
      name: null,
      first_name: null,
      last_name: null,
      email: null,
      phone: null,
      phone_number: null,
    }));
    const ranges: Array<{ from: number; to: number; shopId: string }> = [];
    const query = {
      select: () => query,
      eq: (_column: string, shopId: string) => {
        query.shopId = shopId;
        return query;
      },
      order: () => query,
      range: async (from: number, to: number) => {
        ranges.push({ from, to, shopId: query.shopId });
        return { data: rows.filter((row) => row.shop_id === query.shopId).slice(from, to + 1), error: null };
      },
      shopId: "",
    };
    const supabase = { from: () => query } as any;

    const customers = await fetchVehicleImportCustomers(supabase, "shop-real");

    expect(ranges).toEqual([
      { from: 0, to: 999, shopId: "shop-real" },
      { from: 1000, to: 1999, shopId: "shop-real" },
    ]);
    expect(customers).toContainEqual(expect.objectContaining({ id: "customer-1001", external_id: "CUST-100247" }));
    expect(customers).not.toContainEqual(expect.objectContaining({ id: "customer-1000" }));
  });
});
