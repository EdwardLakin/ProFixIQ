import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@shared/types/types/supabase";
import { MobileWorkOrderLines } from "@/features/work-orders/mobile/MobileWorkOrderLines";

vi.mock(
  "@/features/work-orders/components/workorders/extras/AssignTechModal",
  () => ({
    default: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? <div>Assignment modal</div> : null,
  }),
);

type WorkOrderLine =
  Database["public"]["Tables"]["work_order_lines"]["Row"];

const lines = [
  {
    id: "line-1",
    description: "Front brake repair",
    status: "in_progress",
    assigned_tech_id: null,
    labor_time: 1.5,
  },
] as unknown as WorkOrderLine[];

describe("mobile work-order assignment capability", () => {
  it("does not render assignment controls when effective access is denied", () => {
    render(
      <MobileWorkOrderLines
        lines={lines}
        workOrderId="wo-1"
        canAssignTechnician={false}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Assign" }),
    ).not.toBeInTheDocument();
  });

  it("opens the established assignment modal when effective access is granted", () => {
    render(
      <MobileWorkOrderLines
        lines={lines}
        workOrderId="wo-1"
        canAssignTechnician
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    expect(screen.getByText("Assignment modal")).toBeInTheDocument();
  });
});
