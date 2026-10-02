import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TireGrid from "@/features/inspections/lib/inspection/ui/TireCornerGrid";
import { InspectionFormCtx } from "@/features/inspections/lib/inspection/ui/InspectionFormContext";
import { masterInspectionList } from "@/features/inspections/lib/inspection/masterInspectionList";

const airTireGrid = () =>
  masterInspectionList.find((s) => s.title === "Tire Grid — Air Brake (HD)")!;

describe("air tire grid from the master list", () => {
  it("gives every dual axle an outer and an inner pressure per side", () => {
    const labels = airTireGrid().items.map((i) => i.item);
    for (const axle of ["Drive 1", "Rear 1"]) {
      for (const side of ["Left", "Right"]) {
        expect(labels).toContain(`${axle} ${side} Tire Pressure (Outer)`);
        expect(labels).toContain(`${axle} ${side} Tire Pressure (Inner)`);
        expect(labels).not.toContain(`${axle} ${side} Tire Pressure`);
      }
    }
    // steer axles run single tires
    expect(labels).toContain("Steer 1 Left Tire Pressure");
  });

  it("renders every pressure and tread cell enabled, none greyed out", () => {
    const items = airTireGrid().items.map((i) => ({ ...i, value: "" }));
    const { container } = render(
      <InspectionFormCtx.Provider value={{ updateItem: vi.fn(), updateSection: vi.fn() }}>
        <TireGrid sectionIndex={0} items={items as never} />
      </InspectionFormCtx.Provider>,
    );
    const inputs = container.querySelectorAll<HTMLInputElement>('input[data-inspection-measurement-input="true"]');
    // steer: 2 tread + 2 pressure; drive & rear: 4 tread + 4 pressure each
    expect(inputs.length).toBe(4 + 8 + 8);
    expect(Array.from(inputs).filter((input) => input.disabled)).toHaveLength(0);
    expect(screen.getAllByText("Pressure").length).toBe(3);
  });
});

import { fireEvent } from "@testing-library/react";
import { splitDualPressureItems } from "@/features/inspections/lib/inspection/splitDualPressure";

describe("older dual axles with one pressure per side", () => {
  const legacy = () => [
    { item: "Steer 1 Left Tire Pressure", unit: "psi", value: "" },
    { item: "Drive 1 Left Tire Pressure", unit: "psi", value: "95" },
    { item: "Drive 1 Right Tire Pressure", unit: "psi", value: "" },
    { item: "Drive 1 Left Tread Depth (Outer)", unit: "mm", value: "" },
  ];

  it("splits into outer and inner, keeping the entered value on the outer tire", () => {
    const out = splitDualPressureItems(legacy(), "Drive 1");
    expect(out.map((i) => i.item)).toEqual([
      "Steer 1 Left Tire Pressure",
      "Drive 1 Left Tire Pressure (Outer)",
      "Drive 1 Left Tire Pressure (Inner)",
      "Drive 1 Right Tire Pressure (Outer)",
      "Drive 1 Right Tire Pressure (Inner)",
      "Drive 1 Left Tread Depth (Outer)",
    ]);
    expect((out[1] as { value?: string }).value).toBe("95");
    expect(out[2]).toMatchObject({ unit: "psi", status: "na" });
  });

  it("is a no-op once split, and leaves other axles alone", () => {
    const once = splitDualPressureItems(legacy(), "Drive 1");
    expect(splitDualPressureItems(once as never, "Drive 1")).toEqual(once);
    expect(splitDualPressureItems(legacy(), "Rear 1").map((i) => i.item)).toEqual(legacy().map((i) => i.item));
  });

  it("offers the split on a legacy dual axle only, and calls it with the axle", () => {
    const onSplitPressure = vi.fn();
    const { rerender } = render(
      <InspectionFormCtx.Provider value={{ updateItem: vi.fn(), updateSection: vi.fn() }}>
        <TireGrid sectionIndex={0} items={legacy() as never} onSplitPressure={onSplitPressure} />
      </InspectionFormCtx.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /add inner pressures/i }));
    expect(onSplitPressure).toHaveBeenCalledWith("Drive 1");
    expect(screen.getAllByRole("button", { name: /add inner pressures/i })).toHaveLength(1);

    const current = airTireGrid().items.map((i) => ({ ...i, value: "" }));
    rerender(
      <InspectionFormCtx.Provider value={{ updateItem: vi.fn(), updateSection: vi.fn() }}>
        <TireGrid sectionIndex={0} items={current as never} onSplitPressure={onSplitPressure} />
      </InspectionFormCtx.Provider>,
    );
    expect(screen.queryByRole("button", { name: /add inner pressures/i })).toBeNull();
  });
});
