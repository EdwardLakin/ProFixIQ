import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("create work order customer and vehicle lookup", () => {
  const form = readFileSync(
    "features/inspections/components/inspection/CustomerVehicleForm.tsx",
    "utf8",
  );
  const createPage = readFileSync(
    "features/work-orders/app/work-orders/create/page.tsx",
    "utf8",
  );

  it("returns explicit customer and vehicle pairs for customer-field searches", () => {
    expect(form).toContain("type CustomerVehicleSearchPick");
    expect(form).toContain('.in("customer_id", customerIds)');
    expect(form).toContain("matches.push({ customer, vehicle })");
    expect(form).toContain("onPick({ customer: c, vehicle: v })");
    expect(form).toContain("handlePickedCustomer(pickedCustomer, pickedVehicle)");
  });

  it("searches unit number and licence plate across the current shop", () => {
    const unitLookup = form.slice(
      form.indexOf("function UnitNumberAutocomplete"),
      form.indexOf("/*                                Form Component"),
    );

    expect(unitLookup).toContain("unit_number.ilike");
    expect(unitLookup).toContain("license_plate.ilike");
    expect(unitLookup).toContain('.eq("shop_id", shopId)');
    expect(unitLookup).not.toContain('.eq("customer_id", customerId)');
    expect(form.match(/q=\{vehicle\.license_plate \?\? ""\}/g)).toHaveLength(1);
  });

  it("hydrates the vehicle owner when a vehicle result is selected", () => {
    expect(form).toContain("async function handlePickedVehicle");
    expect(form).toContain('.eq("id", v.customer_id)');
    expect(form).toContain("await handlePickedCustomer(owner as CustomerRow, v)");
    expect(form).toContain("applyPickedVehicle(pickedVehicle)");
  });

  it("preserves customer-page and URL prefill handoffs", () => {
    expect(createPage).toContain('searchParams.get("customerId")');
    expect(createPage).toContain('searchParams.get("vehicleId")');
    expect(createPage).toContain("selectedCustomerId={customerId}");
    expect(createPage).toContain("selectedVehicleId={vehicleIdProp}");
    expect(createPage).toContain("onCustomerSelected: (id: string) => setCustomerId(id)");
    expect(createPage).toContain("onVehicleSelected: (id: string) => setVehicleId(id)");
  });
});
