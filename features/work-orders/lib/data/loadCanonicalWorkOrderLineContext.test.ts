import { describe, expect, it } from "vitest";

import {
  buildCanonicalWorkOrderLineContext,
  getPartsRequestStatusLabel,
  type CanonicalWorkOrderPartRow,
  type WorkOrderAllocationRow,
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
      partRequests: requests,
    });

    expect(context.allocationsByLine["brake-fluid-line"]).toEqual([allocation]);
    expect(context.canonicalPartsByLine["brake-fluid-line"]).toEqual([
      activePart,
    ]);
    expect(context.technicianIdsByLine["brake-fluid-line"]).toEqual(["tech-1"]);
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
    expect(context.partRequestsByLine).toEqual({});
  });
});
