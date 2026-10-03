import { describe, expect, it } from "vitest";

import {
  getWorkOrderBoardStageSurface,
  WORK_ORDER_BOARD_STAGE_SURFACES,
} from "@/features/shared/lib/workboard/presentation";
import type { WorkOrderBoardStage } from "@/features/shared/lib/workboard/types";

const stages: WorkOrderBoardStage[] = [
  "intake",
  "estimate",
  "awaiting_approval",
  "authorized",
  "waiting",
  "in_progress",
  "quality_check",
  "ready",
  "awaiting_pickup",
  "closed",
];

describe("work-order board stage presentation", () => {
  it("keeps board structure neutral while preserving semantic stage accents", () => {
    for (const stage of stages) {
      const surface = getWorkOrderBoardStageSurface(stage);

      expect(surface.column).toContain(
        "bg-[color:var(--theme-surface-panel)]",
      );
      expect(surface.card).toContain(
        "bg-[color:var(--theme-surface-panel-strong)]",
      );
      expect(surface.column).toMatch(/border-t-[a-z]+-(400|500)\//);
      expect(surface.card).toMatch(/border-l-[a-z]+-(400|500)\//);
      expect(surface.count).toMatch(/text-[a-z]+-(700|800)/);
    }
  });

  it("keeps semantic edge accents distinct", () => {
    const columnAccents = stages.map((stage) =>
      getWorkOrderBoardStageSurface(stage).column.match(
        /border-t-([a-z]+-(?:400|500))\//,
      )?.[1],
    );

    expect(columnAccents.every(Boolean)).toBe(true);
    expect(new Set(columnAccents).size).toBe(columnAccents.length);
  });

  it("falls back to intake when a rolling deployment returns no stage", () => {
    expect(getWorkOrderBoardStageSurface(undefined)).toBe(
      WORK_ORDER_BOARD_STAGE_SURFACES.intake,
    );
  });
});
