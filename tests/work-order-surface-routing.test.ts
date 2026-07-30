import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardBoardSource = readFileSync(
  "features/shared/components/workboard/WorkOrderBoard.tsx",
  "utf8",
);
const workOrdersPageSource = readFileSync(
  "features/work-orders/app/work-orders/view/page.tsx",
  "utf8",
);

describe("work-order surface ownership", () => {
  it("keeps the dashboard Work Order Board on its established card-and-stage layout", () => {
    expect(dashboardBoardSource).toContain("function BoardCard");
    expect(dashboardBoardSource).toContain('label="Priority"');
    expect(dashboardBoardSource).toContain("visibleStages.map");
    expect(dashboardBoardSource).not.toContain("function BoardRow");
    expect(dashboardBoardSource).not.toContain(
      "<span>Operational state</span>",
    );
  });

  it("renders the operational Work Orders route as the compact list surface", () => {
    expect(workOrdersPageSource).toContain(
      "bg-[color:var(--desktop-bg-secondary)]",
    );
    expect(workOrdersPageSource).toContain("<span>Operational state</span>");
    expect(workOrdersPageSource).toContain("<span>Assigned</span>");
    expect(workOrdersPageSource).toContain(
      "lg:grid-cols-[minmax(190px,1.25fr)_minmax(170px,1fr)_minmax(210px,1.25fr)_minmax(170px,.9fr)_90px]",
    );
    expect(workOrdersPageSource).not.toContain(
      'className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"',
    );
    expect(workOrdersPageSource).not.toContain("function techRollupChip");
  });

  it("preserves every existing operational action and authorization gate", () => {
    expect(workOrdersPageSource).toContain(
      'fetch("/api/work-orders/assign-all"',
    );
    expect(workOrdersPageSource).toContain(
      "fetch(`/api/work-orders/${id}/delete-draft`",
    );
    expect(workOrdersPageSource).toContain(
      "fetch(`/api/work-orders/${woId}/invoice`",
    );
    expect(workOrdersPageSource).toContain(
      "router.push(`/work-orders/invoice/${woId}`)",
    );
    expect(workOrdersPageSource).toContain(
      "const canAssign = currentActor.canAssignWork",
    );
    expect(workOrdersPageSource).toContain(
      "const canPickStatus = currentActor.canManageWorkOrders",
    );
    expect(workOrdersPageSource).toContain("<StatusPickerModal");
    expect(workOrdersPageSource).toContain("<WorkOrderAssignedSummary");
    expect(workOrdersPageSource).toContain("Assign work order");
    expect(workOrdersPageSource).toContain("Invoice review");
    expect(workOrdersPageSource).toContain("Delete");
  });

  it("does not count a generic on-hold job as waiting for parts", () => {
    expect(workOrdersPageSource).toContain(
      'normalizeStatusKey(row.status) === "waiting_parts"',
    );
    expect(workOrdersPageSource).not.toContain(
      'normalizeStatusKey(row.status) === "waiting_parts" ||',
    );
  });
});
