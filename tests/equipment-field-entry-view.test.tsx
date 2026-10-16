import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EquipmentFieldEntryView from "@/features/equipment/components/EquipmentFieldEntryView";
import {
  EQUIPMENT_FIELD_ENTRY_LINKS,
  equipmentFieldEntryState,
} from "@/features/equipment/lib/equipmentFieldEntry";

describe("equipmentFieldEntryState", () => {
  it("maps the canonical Field decision to what the page shows", () => {
    expect(equipmentFieldEntryState({ decision: "ready" })).toBe("ready");
    expect(equipmentFieldEntryState({ decision: "forbidden" })).toBe("operator_required");
    expect(equipmentFieldEntryState({ decision: "setup_required" })).toBe("setup_required");
    expect(equipmentFieldEntryState({ decision: "plan_required" })).toBe("unavailable");
  });
});

describe("EquipmentFieldEntryView", () => {
  it("shows the field actions only when access is ready", () => {
    render(<EquipmentFieldEntryView state="ready" />);
    for (const link of EQUIPMENT_FIELD_ENTRY_LINKS) {
      expect(screen.getByRole("link", { name: new RegExp(link.label) })).toHaveAttribute(
        "href",
        link.href,
      );
    }
  });

  it.each(["operator_required", "setup_required", "unavailable"] as const)(
    "shows no links that lead to a denial in the %s state",
    (state) => {
      render(<EquipmentFieldEntryView state={state} />);
      expect(screen.getByRole("status")).toBeTruthy();
      for (const link of EQUIPMENT_FIELD_ENTRY_LINKS) {
        expect(screen.queryByRole("link", { name: new RegExp(link.label) })).toBeNull();
      }
    },
  );

  it("explains that an operator assignment is needed", () => {
    render(<EquipmentFieldEntryView state="operator_required" />);
    expect(screen.getByText("Field assignment required")).toBeTruthy();
  });

  it("offers setup only to someone who can configure field service", () => {
    const { unmount } = render(<EquipmentFieldEntryView state="setup_required" canConfigure />);
    expect(screen.getByRole("link", { name: "Set up field service" })).toHaveAttribute(
      "href",
      "/mobile/service/setup",
    );
    unmount();
    render(<EquipmentFieldEntryView state="setup_required" />);
    expect(screen.queryByRole("link", { name: "Set up field service" })).toBeNull();
  });
});
