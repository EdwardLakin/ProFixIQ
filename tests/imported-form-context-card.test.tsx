import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ImportedFormContextCard from "@/features/inspections/components/inspection/ImportedFormContextCard";
import {
  emptyInspectionFormContext,
  inspectionFormContextValueKey,
  type InspectionFormContext,
} from "@/features/inspections/lib/form-import";

function certificate(): InspectionFormContext {
  const c = emptyInspectionFormContext();
  c.completion = [
    {
      title: "Certificate of Inspection",
      items: [
        { item: "Date of Inspection" },
        { item: "Inspection Station Name" },
        { item: "Inspection Station Location" },
        { item: "License#" },
        { item: "Technician Name (Print)", fieldType: "signature" },
        { item: "Driver Licence Number" },
      ],
    },
  ];
  return c;
}

const key = (label: string) =>
  inspectionFormContextValueKey("completion", 0, "Certificate of Inspection", label);

afterEach(() => vi.unstubAllGlobals());

describe("certification block", () => {
  it("applies every default as ONE update so none overwrites another", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          stationName: "Hansen's",
          stationLocation: "1 Main St, Calgary, AB",
          licenseNumber: "C0521",
        }),
      })),
    );
    const onChange = vi.fn();
    const onChangeMany = vi.fn();
    render(
      <ImportedFormContextCard
        context={certificate()}
        values={{}}
        placement="certification"
        onChange={onChange}
        onChangeMany={onChangeMany}
      />,
    );

    await waitFor(() => {
      const withShop = onChangeMany.mock.calls.find(
        ([updates]) => key("Inspection Station Name") in updates,
      );
      expect(withShop).toBeTruthy();
    });

    const merged = Object.assign({}, ...onChangeMany.mock.calls.map(([u]) => u));
    expect(merged[key("Inspection Station Name")]).toBe("Hansen's");
    expect(merged[key("Inspection Station Location")]).toBe("1 Main St, Calgary, AB");
    expect(merged[key("License#")]).toBe("C0521");
    expect(merged[key("Date of Inspection")]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // never the driver's licence, and never one onChange per field
    expect(merged[key("Driver Licence Number")]).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
    // each shop default arrives together in a single call
    const shopCalls = onChangeMany.mock.calls.filter(
      ([u]) => key("Inspection Station Name") in u || key("License#") in u,
    );
    expect(shopCalls).toHaveLength(1);
  });

  it("does not overwrite a value that is already captured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ stationName: "Shop" }) })),
    );
    const onChangeMany = vi.fn();
    render(
      <ImportedFormContextCard
        context={certificate()}
        values={{ [key("Inspection Station Name")]: "Typed by hand" }}
        placement="certification"
        onChange={vi.fn()}
        onChangeMany={onChangeMany}
      />,
    );
    await waitFor(() => expect(onChangeMany).toHaveBeenCalled());
    const merged = Object.assign({}, ...onChangeMany.mock.calls.map(([u]) => u));
    expect(merged[key("Inspection Station Name")]).toBeUndefined();
  });

  it("hides the technician's signature lines but never a captured value", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const { rerender } = render(
      <ImportedFormContextCard
        context={certificate()}
        values={{}}
        placement="certification"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Technician Name \(Print\)/)).toBeNull();

    rerender(
      <ImportedFormContextCard
        context={certificate()}
        values={{ [key("Technician Name (Print)")]: "E. Lakin" }}
        placement="certification"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("E. Lakin")).toBeTruthy();
  });
});

describe("trip and vehicle header autofill", () => {
  const header = () => {
    const c = emptyInspectionFormContext();
    c.header = [
      {
        title: "Vehicle",
        items: [
          { item: "Unit #" },
          { item: "VIN" },
          { item: "Make/Model" },
          { item: "Odometer Reading" },
          { item: "Trailer #" },
          { item: "Driver Name" },
          { item: "Customer" },
        ],
      },
    ];
    return c;
  };
  const hkey = (label: string) =>
    inspectionFormContextValueKey("header", 0, "Vehicle", label);

  it("fills the unit, VIN, make/model, odometer and customer from the work order as one update", async () => {
    const onChange = vi.fn();
    const onChangeMany = vi.fn();
    render(
      <ImportedFormContextCard
        context={header()}
        values={{}}
        placement="before"
        onChange={onChange}
        onChangeMany={onChangeMany}
        vehicle={{ unit_number: "T-42", vin: "1HTMK", make: "Kenworth", model: "T680", mileage: "412000" }}
        customer={{ business_name: "Hansen's Trucking" }}
      />,
    );
    await waitFor(() => expect(onChangeMany).toHaveBeenCalledTimes(1));
    expect(onChangeMany.mock.calls[0][0]).toEqual({
      [hkey("Unit #")]: "T-42",
      [hkey("VIN")]: "1HTMK",
      [hkey("Make/Model")]: "Kenworth T680",
      [hkey("Odometer Reading")]: "412000",
      [hkey("Customer")]: "Hansen's Trucking",
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("never overwrites a typed value and leaves trailer and driver fields alone", async () => {
    const onChangeMany = vi.fn();
    render(
      <ImportedFormContextCard
        context={header()}
        values={{ [hkey("VIN")]: "MINE" }}
        placement="before"
        onChange={vi.fn()}
        onChangeMany={onChangeMany}
        vehicle={{ unit_number: "T-42", vin: "1HTMK" }}
      />,
    );
    await waitFor(() => expect(onChangeMany).toHaveBeenCalled());
    const filled = onChangeMany.mock.calls[0][0];
    expect(filled[hkey("VIN")]).toBeUndefined();
    expect(filled[hkey("Trailer #")]).toBeUndefined();
    expect(filled[hkey("Driver Name")]).toBeUndefined();
  });
});
