import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EquipmentDirectoryView from "@/features/equipment/components/EquipmentDirectoryView";
import type { EquipmentDirectoryFilters } from "@/features/equipment/lib/equipmentDirectoryQuery";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const NO_FILTERS: EquipmentDirectoryFilters = {
  q: "",
  equipmentClass: "",
  status: "",
  customerId: "",
  pm: "",
  attention: false,
  page: 1,
};

function view(filters: EquipmentDirectoryFilters) {
  return (
    <EquipmentDirectoryView
      rows={[]}
      info={{ page: 1, pageCount: 1, total: 0, from: 0, to: 0 }}
      totalAssets={5}
      filters={filters}
      facets={{ classes: [["wheel_loader", "Wheel loader"]], customers: [["c1", "Granite"]] }}
      notes={{ indexCapped: false, evidencePartial: false, evidenceLimit: 2000 }}
      canManage={false}
      customers={[]}
      customerOptionsError={null}
    />
  );
}

describe("EquipmentDirectoryView filter controls", () => {
  it("shows the filters the server applied", () => {
    render(view({ ...NO_FILTERS, q: "komatsu", equipmentClass: "wheel_loader", status: "down", pm: "overdue", customerId: "c1", attention: true }));
    expect((screen.getByLabelText("Search Equipment assets") as HTMLInputElement).value).toBe("komatsu");
    expect((screen.getByLabelText("Filter by equipment class") as HTMLSelectElement).value).toBe("wheel_loader");
    expect((screen.getByLabelText("Filter by operating status") as HTMLSelectElement).value).toBe("down");
    expect((screen.getByLabelText("Filter by PM state") as HTMLSelectElement).value).toBe("overdue");
    expect((screen.getByLabelText("Filter by customer") as HTMLSelectElement).value).toBe("c1");
    expect((screen.getByLabelText("Needs attention") as HTMLInputElement).checked).toBe(true);
  });

  it("follows the URL when filters change without a remount (Clear, back/forward)", () => {
    const { rerender } = render(view({ ...NO_FILTERS, q: "komatsu", status: "down", attention: true }));
    rerender(view(NO_FILTERS));
    expect((screen.getByLabelText("Search Equipment assets") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Filter by operating status") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Needs attention") as HTMLInputElement).checked).toBe(false);

    rerender(view({ ...NO_FILTERS, q: "cat", pm: "due" }));
    expect((screen.getByLabelText("Search Equipment assets") as HTMLInputElement).value).toBe("cat");
    expect((screen.getByLabelText("Filter by PM state") as HTMLSelectElement).value).toBe("due");
  });

  it("does not remount the form when only the page changes", () => {
    const { rerender } = render(view({ ...NO_FILTERS, q: "cat" }));
    const input = screen.getByLabelText("Search Equipment assets") as HTMLInputElement;
    input.value = "typed but not submitted";
    rerender(view({ ...NO_FILTERS, q: "cat", page: 2 }));
    expect((screen.getByLabelText("Search Equipment assets") as HTMLInputElement).value).toBe("typed but not submitted");
  });
});
