import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkOrderBoard from "@/features/shared/components/workboard/WorkOrderBoard";
import { parseWorkOrderBoardStageFilter } from "@/features/shared/lib/workboard/filters";
import type { WorkOrderBoardRow } from "@/features/shared/lib/workboard/types";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const mockRows: WorkOrderBoardRow[] = [
  boardRow("wo-waiting", "WO-WAITING", "waiting_parts"),
  boardRow("wo-hold", "WO-HOLD", "on_hold"),
  boardRow("wo-approval", "WO-APPROVAL", "awaiting_approval"),
  boardRow("wo-progress", "WO-PROGRESS", "in_progress"),
];

vi.mock("@/features/shared/hooks/useWorkOrderBoard", () => ({
  useWorkOrderBoard: () => ({
    rows: mockRows,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function boardRow(
  work_order_id: string,
  custom_id: string,
  overall_stage: WorkOrderBoardRow["overall_stage"],
): WorkOrderBoardRow {
  return {
    work_order_id,
    custom_id,
    display_name: `${custom_id} Customer`,
    unit_label: null,
    vehicle_label: null,
    jobs_total: 1,
    jobs_completed: 0,
    progress_pct: 25,
    assigned_summary: null,
    overall_stage,
    risk_level: "none",
    priority: 3,
    is_waiter: false,
    advisor_name: null,
    first_tech_name: null,
    tech_names: [],
  };
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Phase D1 dashboard source contracts", () => {
  it("removes the revenue snapshot panel from the Operations dashboard", () => {
    expect(read("app/dashboard/_components/OperationsDashboardView.tsx")).not.toContain(
      "Revenue & Efficiency Snapshot",
    );
  });

  it("points Operations dashboard Dispatch actions at the Work Order Board", () => {
    const source = read("app/dashboard/_components/OperationsDashboardView.tsx");
    expect(source).not.toContain("/dashboard/manager/dispatch");
    expect(source).toContain('href: "/work-orders/board"');
  });

  it("keeps the legacy dispatch route as a server redirect", () => {
    const source = read("app/dashboard/manager/dispatch/page.tsx");
    expect(source).toContain('import { redirect } from "next/navigation"');
    expect(source).toContain('redirect("/work-orders/board")');
    expect(source).not.toContain("Placeholder route");
  });

  it("removes invoice-backed revenueEfficiency from Operations payload", () => {
    const source = read("features/dashboard/server/getOperationsDashboardPayload.ts");
    expect(source).not.toContain("revenueEfficiency");
    expect(source).not.toContain('.from("invoices")');
    expect(source).not.toContain("startOfMonth");
    expect(source).not.toContain("revenue snapshot");
  });

  it("does not expose duplicate active Dispatch Board and Work Order Board destinations", () => {
    const activeNavigation = [
      "features/shared/config/tiles.ts",
      "features/shared/lib/ownerSidebarNav.ts",
      "features/shared/components/RoleHubTiles/tiles.ts",
      "features/mobile/config/mobile-tiles.ts",
      "features/shared/components/DashboardQuickActions.tsx",
    ]
      .map((path) => read(path))
      .join("\n");

    expect(activeNavigation).not.toContain('/dashboard/manager/dispatch');
    expect(read("features/shared/components/DashboardQuickActions.tsx")).toContain("Work Order Board");
    expect(read("features/shared/components/DashboardQuickActions.tsx")).not.toContain("Dispatch Board");
    expect(activeNavigation).toContain('/work-orders/board');
  });
});

describe("WorkOrderBoard stage query initialization", () => {
  it.each(["waiting_parts", "on_hold", "awaiting_approval"] as const)(
    "accepts %s as a valid board stage",
    (stage) => {
      expect(parseWorkOrderBoardStageFilter(stage)).toBe(stage);
    },
  );

  it("falls invalid board stages back to all", () => {
    expect(parseWorkOrderBoardStageFilter("dispatch_everything")).toBe("all");
    expect(parseWorkOrderBoardStageFilter(undefined)).toBe("all");
  });

  it("initializes the visible board from a valid stage and lets its summary card clear the filter", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <WorkOrderBoard variant="shop" title="Board" initialStage="waiting_parts" />,
    );

    expect(screen.getByText("WO-WAITING")).toBeInTheDocument();
    expect(screen.queryByText("WO-HOLD")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /waiting parts/i }));
    expect(screen.getByText("WO-WAITING")).toBeInTheDocument();
    expect(screen.getByText("WO-HOLD")).toBeInTheDocument();

    rerender(<WorkOrderBoard variant="shop" title="Board" initialStage="awaiting_approval" />);
    expect(screen.getByText("WO-APPROVAL")).toBeInTheDocument();
    expect(screen.queryByText("WO-HOLD")).not.toBeInTheDocument();
  });

  it("uses the four summary cards as filters and removes the duplicate pill row", () => {
    render(<WorkOrderBoard variant="shop" title="Board" />);

    expect(screen.getByRole("button", { name: /at risk/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ready to work/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /waiting parts/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ready to invoice/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Board stage views")).not.toBeInTheDocument();
  });
});
