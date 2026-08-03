import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("fleet control tower composition", () => {
  it("keeps fleet readiness and health ahead of the work-order board", () => {
    const fleetTower = source(
      "features/fleet/components/FleetControlTower.tsx",
    );
    const sharedTower = source(
      "features/operations/components/MaintenanceControlTower.tsx",
    );

    expect(fleetTower).toContain('layout="dashboard-first"');
    expect(fleetTower).toContain("renderContentWhenError");
    expect(sharedTower).toContain(
      'layout?: "board-first" | "dashboard-first"',
    );

    const summaryPosition = sharedTower.indexOf("{summaryCards}");
    const boardPosition = sharedTower.lastIndexOf("{workOrderBoard}");
    expect(summaryPosition).toBeGreaterThan(-1);
    expect(boardPosition).toBeGreaterThan(summaryPosition);
  });

  it("uses a genuinely compact active-work widget", () => {
    const widget = source(
      "features/shared/components/workboard/WorkOrderBoardWidget.tsx",
    );

    expect(widget).toContain("useWorkOrderBoard");
    expect(widget).toContain("limit: 5");
    expect(widget).toContain("Open full board");
    expect(widget).not.toContain('import WorkOrderBoard from "./WorkOrderBoard"');
    expect(widget).not.toContain("min-h-[560px]");
  });

  it("does not hide dashboard sections when the fleet feed fails", () => {
    const fleetTower = source(
      "features/fleet/components/FleetControlTower.tsx",
    );
    const sharedTower = source(
      "features/operations/components/MaintenanceControlTower.tsx",
    );

    expect(sharedTower).toContain(
      "const showContent = !isLoading && (!error || renderContentWhenError)",
    );
    expect(fleetTower).toContain(
      "Dashboard sections remain visible with the data currently available.",
    );
  });
});
