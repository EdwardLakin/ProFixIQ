import { describe, expect, it } from "vitest";

import {
  getWorkOrderBoardStageSurface,
  WORK_ORDER_BOARD_STAGE_SURFACES,
} from "@/features/shared/lib/workboard/presentation";
import type { WorkOrderBoardStage } from "@/features/shared/lib/workboard/types";

describe("work-order board stage presentation", () => {
  it("gives every operational stage a color-coded column, card, and count", () => {
    const stages: WorkOrderBoardStage[] = [
      "awaiting",
      "in_progress",
      "awaiting_approval",
      "waiting_parts",
      "on_hold",
      "completed",
    ];

    for (const stage of stages) {
      const surface = getWorkOrderBoardStageSurface(stage);
      expect(surface.column).toMatch(
        /border-(blue|violet|amber|orange|rose|emerald)-500/,
      );
      expect(surface.card).toMatch(
        /bg-(blue|violet|amber|orange|rose|emerald)-500/,
      );
      expect(surface.count).toMatch(
        /text-(blue|violet|amber|orange|rose|emerald)-/,
      );
    }
  });

  it("keeps stage color contracts distinct", () => {
    const operational = Object.entries(WORK_ORDER_BOARD_STAGE_SURFACES)
      .filter(([stage]) => stage !== "empty")
      .map(([, surface]) => surface.column);

    expect(new Set(operational).size).toBe(operational.length);
  });

  it("falls back to the neutral empty surface when a stage is unavailable", () => {
    expect(getWorkOrderBoardStageSurface(undefined)).toBe(
      WORK_ORDER_BOARD_STAGE_SURFACES.empty,
    );
  });
});
