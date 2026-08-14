import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildTechQueueWorkOrderMap,
  TechQueueWorkOrderLabel,
} from "@/features/work-orders/components/TechQueueWorkOrderLabel";
import { TILES } from "@/features/shared/config/tiles";
import { resolveTechnicianCopilotTextAvailability } from "@/features/copilot/technician/client/useTechnicianCopilotAvailability";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("Technician CoPilot navigation rollout", () => {
  it("requires the persisted text capability before showing the tile", () => {
    const technicianId = "0db0aece-ea7c-43d9-9598-9034c5c32dd2";
    const tile = TILES.find(
      (candidate) => candidate.href === "/copilot/technician",
    );

    expect(tile?.requiresTechnicianCopilot).toBe(true);
    expect(
      resolveTechnicianCopilotTextAvailability(
        [{ capability: "technician_copilot_text", enabled: true }],
        technicianId,
      ),
    ).toBe(true);
    expect(
      resolveTechnicianCopilotTextAvailability(
        [
          { capability: "technician_copilot_text", enabled: true },
          {
            capability: `technician_copilot_text:${technicianId}`,
            enabled: false,
          },
        ],
        technicianId,
      ),
    ).toBe(false);
  });
});

describe("Tech Job Queue work-order labels", () => {
  it("renders the canonical number for an ordinary nullable-type work order", () => {
    const workOrderId = "cd281ab6-e6c5-4342-8573-9f2ad3ab63c9";
    const workOrderMap = buildTechQueueWorkOrderMap([
      {
        id: workOrderId,
        custom_id: "EL000005",
        type: null,
      },
    ]);

    render(
      <span>
        <TechQueueWorkOrderLabel
          workOrderId={workOrderId}
          workOrderMap={workOrderMap}
        />
      </span>,
    );

    expect(screen.getByText("EL000005")).toBeInTheDocument();
  });

  it("keeps historical imports out of the display map", () => {
    const workOrderId = "11111111-2222-3333-4444-555555555555";
    const workOrderMap = buildTechQueueWorkOrderMap([
      {
        id: workOrderId,
        custom_id: "HIST-0001",
        type: "historical_import",
      },
    ]);

    render(
      <span>
        <TechQueueWorkOrderLabel
          workOrderId={workOrderId}
          workOrderMap={workOrderMap}
        />
      </span>,
    );

    expect(screen.getByText("WO #11111111")).toBeInTheDocument();
    expect(screen.queryByText("HIST-0001")).not.toBeInTheDocument();
  });
});
