import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  EQUIPMENT_ACQUISITION_SURFACE,
  estimateEquipmentOperationsMonthlyCents,
} from "@/features/equipment/lib/equipmentProduct";
import { acquisitionHomeHref } from "@/features/auth/lib/acquisitionSurfaceRouting";
import {
  PRODUCT_PACKAGE_LOOKUP_KEYS,
  normalizeProductAcquisitionSurface,
  normalizeProductPackageKey,
  productPackageAllows,
} from "@/features/stripe/lib/stripe/product-packages";

describe("Equipment Operations standalone package", () => {
  it("prices at $399 with 10 included users and $50 per additional user", () => {
    expect(estimateEquipmentOperationsMonthlyCents(4)).toBe(39_900);
    expect(estimateEquipmentOperationsMonthlyCents(10)).toBe(39_900);
    expect(estimateEquipmentOperationsMonthlyCents(13)).toBe(54_900);
    expect(PRODUCT_PACKAGE_LOOKUP_KEYS.equipment_operations).toBe(
      "profixiq_equipment_operations_monthly_usd_v1",
    );
  });

  it("grants shop and equipment capabilities but never Field or Fleet", () => {
    expect(productPackageAllows("equipment_operations", "shop")).toBe(true);
    expect(productPackageAllows("equipment_operations", "equipment")).toBe(true);
    expect(productPackageAllows("equipment_operations", "field_service")).toBe(
      false,
    );
    expect(
      productPackageAllows("equipment_operations", "fleet_maintenance"),
    ).toBe(false);
    for (const key of [
      "shop_operations",
      "field_service",
      "fleet_maintenance",
      "complete_operations",
    ] as const) {
      expect(productPackageAllows(key, "equipment")).toBe(false);
    }
  });

  it("routes the equipment surface to its own onboarding home", () => {
    expect(EQUIPMENT_ACQUISITION_SURFACE).toBe("equipment");
    expect(normalizeProductAcquisitionSurface("Equipment")).toBe("equipment");
    expect(normalizeProductPackageKey("equipment_operations")).toBe(
      "equipment_operations",
    );
    expect(acquisitionHomeHref("equipment")).toBe("/equipment/dashboard");
  });

  it("widens the package contract in a forward migration without touching grants", () => {
    const sql = readFileSync(
      "supabase/migrations/20261016120000_equipment_operations_package.sql",
      "utf8",
    );
    expect(sql).toContain("'equipment_operations'");
    expect(sql).toContain("p_capability = 'equipment'");
    expect(sql).not.toMatch(/\b(grant|revoke)\b/i);
    expect(sql).not.toMatch(/create (or replace )?trigger/i);
  });
});
