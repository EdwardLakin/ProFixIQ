import { describe, expect, it } from "vitest";

import {
  buildCanonicalWorkOrderLineContext,
  collectTechnicianIdsForLineContexts,
  getPartsRequestDisplayState,
  getPartsRequestStatusLabel,
  loadRowsForIdChunks,
  type CanonicalWorkOrderPartRow,
  type WorkOrderAllocationRow,
  type WorkOrderLineLaborSegmentRow,
  type WorkOrderLineTechnicianRow,
  type WorkOrderPartRequestRow,
} from "./loadCanonicalWorkOrderLineContext";

describe("canonical work-order line context", () => {
  it("projects EL000007-shaped parts, requests, and assignments into one line context", () => {
    const allocation = {
      id: "allocation-1",
      work_order_line_id: "brake-fluid-line",
    } as unknown as WorkOrderAllocationRow;
    const activePart = {
      id: "bosch-brake-fluid",
      is_active: true,
      lifecycle_status: "consumed",
      quantity: 1,
      total_price: 255,
      work_order_line_id: "brake-fluid-line",
    } as unknown as CanonicalWorkOrderPartRow;
    const inactivePart = {
      id: "retired-part",
      is_active: false,
      work_order_line_id: "brake-fluid-line",
    } as unknown as CanonicalWorkOrderPartRow;
    const technicians = [
      {
        technician_id: "tech-1",
        work_order_line_id: "brake-fluid-line",
      },
      {
        technician_id: "tech-1",
        work_order_line_id: "brake-fluid-line",
      },
    ] as WorkOrderLineTechnicianRow[];
    const requests = [
      {
        id: "request-fulfilled",
        work_order_id: "EL000007",
        job_id: "brake-fluid-line",
        quote_line_id: "quote-1",
        status: "fulfilled",
      },
      {
        id: "request-cancelled",
        work_order_id: "EL000007",
        job_id: "brake-fluid-line",
        quote_line_id: null,
        status: "cancelled",
      },
    ] as WorkOrderPartRequestRow[];

    const context = buildCanonicalWorkOrderLineContext({
      lineIds: ["brake-fluid-line", "inspection-line"],
      allocations: [allocation],
      canonicalParts: [activePart, inactivePart],
      technicians,
      activeLaborSegments: [
        {
          technician_id: "tech-1",
          work_order_line_id: "brake-fluid-line",
          ended_at: null,
        },
        {
          technician_id: "inactive-tech",
          work_order_line_id: "brake-fluid-line",
          ended_at: "2026-07-26T20:00:00.000Z",
        },
      ] as WorkOrderLineLaborSegmentRow[],
      partRequests: requests,
    });

    expect(context.allocationsByLine["brake-fluid-line"]).toEqual([allocation]);
    expect(context.canonicalPartsByLine["brake-fluid-line"]).toEqual([
      activePart,
    ]);
    expect(context.technicianIdsByLine["brake-fluid-line"]).toEqual(["tech-1"]);
    expect(context.activeTechnicianIdsByLine["brake-fluid-line"]).toEqual([
      "tech-1",
    ]);
    expect(context.partRequestsByLine["brake-fluid-line"]).toEqual(requests);
    expect(context.partRequestsByQuoteLine["quote-1"]).toEqual([requests[0]]);
    expect(
      getPartsRequestStatusLabel(
        context.partRequestsByLine["brake-fluid-line"],
      ),
    ).toBe("Parts handed off");
  });

  it("does not attach rows from another work-order line", () => {
    const context = buildCanonicalWorkOrderLineContext({
      lineIds: ["visible-line"],
      allocations: [
        {
          work_order_line_id: "other-line",
        } as unknown as WorkOrderAllocationRow,
      ],
      canonicalParts: [
        {
          is_active: true,
          work_order_line_id: "other-line",
        } as unknown as CanonicalWorkOrderPartRow,
      ],
      technicians: [
        {
          technician_id: "other-tech",
          work_order_line_id: "other-line",
        },
      ],
      activeLaborSegments: [
        {
          technician_id: "other-tech",
          work_order_line_id: "other-line",
          ended_at: null,
        },
      ],
      partRequests: [
        {
          id: "other-request",
          work_order_id: "other-work-order",
          job_id: "other-line",
          quote_line_id: null,
          status: "requested",
        },
      ],
    });

    expect(context.allocationsByLine).toEqual({});
    expect(context.canonicalPartsByLine).toEqual({});
    expect(context.technicianIdsByLine).toEqual({});
    expect(context.activeTechnicianIdsByLine).toEqual({});
    expect(context.partRequestsByLine).toEqual({});
  });

  it.each([
    ["requested", "requested", "Parts requested"],
    ["quoted", "awaiting_approval", "Awaiting approval"],
    ["approved", "pick_order", "Pick / order active"],
  ] as const)(
    "prefers an outstanding %s request over fulfilled history",
    (activeStatus, displayState, label) => {
      const requests = [
        {
          id: "fulfilled",
          work_order_id: "wo",
          job_id: "line",
          quote_line_id: null,
          status: "fulfilled",
        },
        {
          id: "active",
          work_order_id: "wo",
          job_id: "line",
          quote_line_id: null,
          status: activeStatus,
        },
      ] as WorkOrderPartRequestRow[];

      expect(getPartsRequestDisplayState(requests)).toBe(displayState);
      expect(getPartsRequestStatusLabel(requests)).toBe(label);
    },
  );

  it("collects primary, shared, and actively working technician IDs", () => {
    const context = emptyContextWithTechnicians({
      shared: ["shared-tech"],
      active: ["active-tech"],
    });

    expect(
      collectTechnicianIdsForLineContexts(
        [context],
        ["primary-tech", "shared-tech", null],
      ),
    ).toEqual(["primary-tech", "shared-tech", "active-tech"]);
  });

  it("paginates every ID chunk until all rows are loaded", async () => {
    const rowsById: Record<string, Array<{ id: string }>> = {
      a: Array.from({ length: 5 }, (_, index) => ({ id: `a-${index}` })),
      b: Array.from({ length: 4 }, (_, index) => ({ id: `b-${index}` })),
      c: Array.from({ length: 3 }, (_, index) => ({ id: `c-${index}` })),
    };
    const calls: Array<{ ids: string[]; from: number; to: number }> = [];

    const rows = await loadRowsForIdChunks(
      ["a", "b", "c", "a"],
      async (ids, from, to) => {
        calls.push({ ids, from, to });
        const chunkRows = ids.flatMap((id) => rowsById[id] ?? []);
        return { data: chunkRows.slice(from, to + 1), error: null };
      },
      { idChunkSize: 2, pageSize: 3 },
    );

    expect(rows).toHaveLength(12);
    expect(calls).toEqual([
      { ids: ["a", "b"], from: 0, to: 2 },
      { ids: ["a", "b"], from: 3, to: 5 },
      { ids: ["a", "b"], from: 6, to: 8 },
      { ids: ["a", "b"], from: 9, to: 11 },
      { ids: ["c"], from: 0, to: 2 },
      { ids: ["c"], from: 3, to: 5 },
    ]);
  });
});

function emptyContextWithTechnicians(input: {
  shared: string[];
  active: string[];
}) {
  return {
    allocationsByLine: {},
    canonicalPartsByLine: {},
    technicianIdsByLine: { line: input.shared },
    activeTechnicianIdsByLine: { line: input.active },
    partRequestsByLine: {},
    partRequestsByQuoteLine: {},
  };
}
