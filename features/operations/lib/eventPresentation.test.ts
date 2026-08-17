import { describe, expect, it } from "vitest";
import { getOperationalEventPresentation } from "./eventPresentation";

describe("operational event presentation", () => {
  it("explains work-order status transitions in operator language", () => {
    expect(
      getOperationalEventPresentation({
        event_type: "work_order.status.awaiting_approval",
        entity_type: "work_order",
        actor_role: "owner",
        metadata: {
          old_status: "in_progress",
          new_status: "awaiting_approval",
        },
      }),
    ).toEqual({
      title: "Work order status changed",
      detail: "In Progress → Awaiting Approval · by Owner",
    });
  });

  it("turns job and parts events into useful summaries", () => {
    expect(
      getOperationalEventPresentation({
        event_type: "work_order_line.created",
        entity_type: "work_order_line",
        actor_role: "parts",
        metadata: { new_status: "awaiting_approval" },
      }),
    ).toEqual({
      title: "Job added",
      detail: "Awaiting Approval · by Parts",
    });

    expect(
      getOperationalEventPresentation({
        event_type: "parts.request.created",
        entity_type: "part_request",
        metadata: { new_status: "requested" },
      }),
    ).toEqual({
      title: "Parts request created",
      detail: "Requested",
    });
  });
});
