import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import WorkOrderBoard from "@/features/shared/components/workboard/WorkOrderBoard";
import type { WorkOrderBoardRow } from "@/features/shared/lib/workboard/types";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const mockRows: WorkOrderBoardRow[] = [
  {
    work_order_id: "wo-shop-link",
    custom_id: "WO-SHOP-LINK",
    display_name: "Shop Link Customer",
    unit_label: null,
    vehicle_label: null,
    jobs_total: 2,
    jobs_completed: 1,
    progress_pct: 50,
    assigned_summary: null,
    overall_stage: "in_progress",
    risk_level: "none",
    priority: 3,
    is_waiter: false,
    advisor_name: null,
    first_tech_name: null,
    tech_names: [],
  },
  {
    work_order_id: "wo-waiting-parts",
    custom_id: "WO-WAITING-PARTS",
    display_name: "Waiting Parts Customer",
    unit_label: null,
    vehicle_label: null,
    jobs_total: 1,
    jobs_completed: 0,
    progress_pct: 0,
    assigned_summary: null,
    overall_stage: "waiting_parts",
    risk_level: "warn",
    priority: 2,
    is_waiter: false,
    advisor_name: null,
    first_tech_name: null,
    tech_names: [],
  },
];

vi.mock("@/features/shared/hooks/useWorkOrderBoard", () => ({
  useWorkOrderBoard: () => ({
    rows: mockRows,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("WorkOrderBoard Server Component boundary regression", () => {
  it("keeps the shop board page on serializable props while preserving switcher and initialStage", () => {
    const source = read("app/work-orders/board/page.tsx");

    expect(source).toContain("<OperationalViewSwitcher");
    expect(source).toContain("parseWorkOrderBoardStageFilter");
    expect(source).toContain("initialStage={initialStage}");
    expect(source).not.toContain("hrefBuilder=");
  });

  it("resolves shop work-order rows to canonical work order detail hrefs inside the client board", () => {
    render(<WorkOrderBoard variant="shop" title="Board" />);

    expect(screen.getByText("WO-SHOP-LINK").closest("a")).toHaveAttribute(
      "href",
      "/work-orders/wo-shop-link",
    );
  });

  it("still initializes from initialStage", () => {
    render(
      <WorkOrderBoard
        variant="shop"
        title="Board"
        initialStage="waiting_parts"
      />,
    );

    expect(screen.getByText("WO-WAITING-PARTS")).toBeInTheDocument();
    expect(screen.queryByText("WO-SHOP-LINK")).not.toBeInTheDocument();
  });
});
