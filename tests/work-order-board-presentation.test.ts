import { describe, expect, it } from "vitest";

import {
  getWorkOrderBoardStageSurface,
  WORK_ORDER_BOARD_STAGE_SURFACES,
} from "@/features/shared/lib/workboard/presentation";
import type { WorkOrderBoardStage } from "@/features/shared/lib/workboard/types";

describe("work-order board stage presentation", () => {
  it("gives every operational stage a color-coded column, card, and count", () => {
    const stages: WorkOrderBoardStage[] = [
      "intake",
      "estimate",
      "awaiting_approval",
      "authorized",
      "waiting",
      "in_progress",
      "quality_check",
      "ready",
      "closed",
    ];

    for (const stage of stages) {
      const surface = getWorkOrderBoardStageSurface(stage);
      expect(surface.column).toMatch(
        /border-(blue|cyan|amber|emerald|orange|violet|teal|lime|slate)-500/,
      );
      expect(surface.card).toMatch(
        /bg-(blue|cyan|amber|emerald|orange|violet|teal|lime|slate)-500/,
      );
      expect(surface.count).toMatch(
        /text-(blue|cyan|amber|emerald|orange|violet|teal|lime|slate)-/,
      );
    }
  });

  it("keeps stage color contracts distinct", () => {
    const operational = Object.values(WORK_ORDER_BOARD_STAGE_SURFACES).map(
      (surface) => surface.column,
    );

    expect(new Set(operational).size).toBe(operational.length);
  });

  it("falls back to intake when a rolling deployment returns no stage", () => {
    expect(getWorkOrderBoardStageSurface(undefined)).toBe(
      WORK_ORDER_BOARD_STAGE_SURFACES.intake,
    );
  });
});
