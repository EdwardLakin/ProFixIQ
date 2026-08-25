import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { JobCard } from "@/features/work-orders/components/JobCard";

const CURRENT_TECH_ID = "11111111-1111-4111-8111-111111111111";
const AVAILABLE_TECH_ID = "22222222-2222-4222-8222-222222222222";

function assignedLine() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    assigned_tech_id: CURRENT_TECH_ID,
    approval_state: "approved",
    complaint: "Brake vibration",
    created_at: null,
    description: "Inspect front brakes",
    punched_in_at: null,
    punched_out_at: null,
    status: "assigned",
    updated_at: null,
  } as never;
}

function renderNavigator(input?: {
  primaryTechnicianName?: string | null;
  technicians?: Array<{ id: string; full_name: string | null }>;
  canAssign?: boolean;
}) {
  const onAssign = vi.fn();
  render(
    <JobCard
      index={0}
      line={assignedLine()}
      parts={[]}
      technicians={
        input?.technicians ?? [
          { id: AVAILABLE_TECH_ID, full_name: "Available Technician" },
        ]
      }
      primaryTechnicianName={input?.primaryTechnicianName}
      canAssign={input?.canAssign ?? true}
      isPunchedIn={false}
      isSelectedForPanel
      onOpen={vi.fn()}
      onAssign={onAssign}
      display="navigator"
    />,
  );
  return { onAssign };
}

describe("Work Order assignment display names", () => {
  it("shows the projected current name without adding it to assignable candidates", () => {
    const { onAssign } = renderNavigator({
      primaryTechnicianName: "Jordan Historical",
    });

    expect(screen.getByText("Jordan Historical")).toBeInTheDocument();
    const select = screen.getByRole("combobox", {
      name: "Primary technician",
    });
    expect(select).toHaveValue(CURRENT_TECH_ID);
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => ({
          label: option.textContent,
          value: (option as HTMLOptionElement).value,
        })),
    ).toEqual([
      { label: "Unassigned (clear all)", value: "" },
      {
        label: "Jordan Historical (current)",
        value: CURRENT_TECH_ID,
      },
      { label: "Available Technician", value: AVAILABLE_TECH_ID },
    ]);

    fireEvent.change(select, { target: { value: AVAILABLE_TECH_ID } });
    expect(onAssign).toHaveBeenCalledWith(AVAILABLE_TECH_ID);
  });

  it("retains the unavailable fallback when the projected map has no name", () => {
    renderNavigator({ primaryTechnicianName: null });

    expect(
      screen.getAllByText("Unavailable technician (current)").length,
    ).toBeGreaterThan(0);
    expect(
      within(
        screen.getByRole("combobox", { name: "Primary technician" }),
      ).getByRole("option", { name: "Unavailable technician (current)" }),
    ).toHaveValue(CURRENT_TECH_ID);
  });

  it("does not render a duplicate current sentinel for an active candidate", () => {
    renderNavigator({
      primaryTechnicianName: "Current Technician",
      technicians: [
        { id: CURRENT_TECH_ID, full_name: "Current Technician" },
        { id: AVAILABLE_TECH_ID, full_name: "Available Technician" },
      ],
    });

    const options = within(
      screen.getByRole("combobox", { name: "Primary technician" }),
    ).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Unassigned (clear all)",
      "Current Technician",
      "Available Technician",
    ]);
  });

  it("shows the authoritative assigned name without an assignment control for read-only roles", () => {
    renderNavigator({
      primaryTechnicianName: "Jordan Historical",
      canAssign: false,
    });

    expect(screen.getByText("Jordan Historical")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Primary technician" }),
    ).not.toBeInTheDocument();
  });
});
