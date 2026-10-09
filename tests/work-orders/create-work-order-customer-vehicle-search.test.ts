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
    expect(form).toContain(
      "handlePickedCustomer(pickedCustomer, pickedVehicle)",
    );
  });

  it("only opens autocomplete for the customer field being edited", () => {
    expect(form).toContain('setActiveCustomerSearchField("business_name")');
    expect(form).toContain('activeCustomerSearchField !== "business_name"');
    expect(form).toContain('setActiveCustomerSearchField("email")');
    expect(form).toContain('activeCustomerSearchField !== "email"');
    expect(form).toContain("setActiveCustomerSearchField(null)");
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

  it("provides a dedicated existing-vehicle picker", () => {
    expect(form).toContain("Select existing vehicle");
    expect(form).toContain("customerVehicles.map((option)");
    expect(form).toContain(
      'query = query.eq("customer_id", currentCustomerId)',
    );
    expect(form).toContain("void handlePickedVehicle(pickedVehicle)");
  });

  it("gates the picker to the Work Order create flow only", () => {
    expect(form).toContain("enableExistingVehiclePicker = false");
    expect(form).toContain("!enableExistingVehiclePicker || !shopId");
    expect(form).toContain("{enableExistingVehiclePicker ? (");
    expect(createPage).toContain("enableExistingVehiclePicker");
    const estimate = readFileSync(
      "features/estimates/components/EstimateBuilder.tsx",
      "utf8",
    );
    expect(estimate).not.toContain("enableExistingVehiclePicker");
  });

  it("surfaces vehicle-picker load failures with a retry", () => {
    expect(form).toContain("setCustomerVehiclesError(true)");
    expect(form).toContain("Couldn&apos;t load saved vehicles.");
    expect(form).toContain("setCustomerVehiclesRetry((n) => n + 1)");
  });

  it("discards stale hydrations and requires owner hydration", () => {
    expect(form).toContain("vehicleSelectionRef");
    expect(form).toContain("selectionId !== vehicleSelectionRef.current");
    expect(form).toContain("setVehicleSelectionError(");
    expect(form).not.toContain("Fall through and at least apply the vehicle");
  });

  it("hydrates the vehicle owner when a vehicle result is selected", () => {
    expect(form).toContain("async function handlePickedVehicle");
    expect(form).toContain('.eq("id", v.customer_id)');
    expect(form).toContain(
      "await handlePickedCustomer(owner, v, selectionId)",
    );
    expect(form).toContain("applyPickedVehicle(pickedVehicle)");
  });

  it("preserves customer-page and URL prefill handoffs", () => {
    expect(createPage).toContain('searchParams.get("customerId")');
    expect(createPage).toContain('searchParams.get("vehicleId")');
    expect(createPage).toContain("selectedCustomerId={customerId}");
    expect(createPage).toContain("selectedVehicleId={vehicleIdProp}");
    expect(createPage).toContain("onCustomerSelected: (id: string) => {");
    expect(createPage).toContain("onVehicleSelected: (id: string) => {");
    expect(createPage).toContain("setCustomerId(id);");
    expect(createPage).toContain("setVehicleId(id);");
  });
});
