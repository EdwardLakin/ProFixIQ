import React from "react";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTechQueueWorkOrderMap,
  TechQueueWorkOrderLabel,
} from "@/features/work-orders/components/TechQueueWorkOrderLabel";
import { TILES } from "@/features/shared/config/tiles";
import { useTechnicianCopilotAvailability } from "@/features/copilot/technician/client/useTechnicianCopilotAvailability";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("Technician CoPilot navigation rollout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the canonical server access gate before showing the tile", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", request);

    const tile = TILES.find(
      (candidate) => candidate.href === "/copilot/technician",
    );
    const { result } = renderHook(() =>
      useTechnicianCopilotAvailability(true),
    );

    expect(tile?.requiresTechnicianCopilot).toBe(true);
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(request).toHaveBeenCalledWith(
      "/api/copilot/technician/session?accessOnly=1",
      { cache: "no-store" },
    );
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
