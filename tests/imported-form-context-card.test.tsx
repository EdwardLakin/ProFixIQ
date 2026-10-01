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
