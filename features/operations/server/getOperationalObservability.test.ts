import { describe, expect, it } from "vitest";
import {
  deriveOperationalPipelineStatus,
  getOperationalDomain,
  getOperationalEntityHref,
  hasOperationalEventFilter,
} from "./getOperationalObservability";

const NOW = new Date("2026-08-02T15:00:00.000Z");

describe("operational observability helpers", () => {
  it("maps canonical event prefixes to workflow domains", () => {
    expect(getOperationalDomain("work_order.status.in_progress")).toBe("work_orders");
    expect(getOperationalDomain("inspection.status.completed")).toBe("inspections");
    expect(getOperationalDomain("quote_line.status.approved")).toBe("estimates");
    expect(getOperationalDomain("parts.request_item.status.received")).toBe("parts");
    expect(getOperationalDomain("workforce.job.started")).toBe("workforce");
    expect(getOperationalDomain("invoice.payment.captured")).toBe("invoicing");
    expect(getOperationalDomain("messaging.message.created")).toBe("messaging");
  });

  it("reports durable failures before inferred pipeline stalls", () => {
    expect(
      deriveOperationalPipelineStatus({
        installed: true,
        unresolvedFailures: 2,
        recentBusinessWrites: 10,
        lastEventAt: "2026-08-02T14:59:00.000Z",
        now: NOW,
      }),
    ).toBe("needs_attention");

    expect(
      deriveOperationalPipelineStatus({
        installed: true,
        unresolvedFailures: 0,
        recentBusinessWrites: 10,
        lastEventAt: "2026-08-02T06:00:00.000Z",
        now: NOW,
      }),
    ).toBe("stalled");

    expect(
      deriveOperationalPipelineStatus({
        installed: true,
        unresolvedFailures: 0,
        recentBusinessWrites: 10,
        lastEventAt: "2026-08-02T14:30:00.000Z",
        now: NOW,
      }),
    ).toBe("healthy");
  });

  it("links child events back to the authoritative work order", () => {
    expect(
      getOperationalEntityHref({
        entity_type: "part_request_item",
        entity_id: "22222222-2222-4222-8222-222222222222",
        parent_entity_type: "work_order",
        parent_entity_id: "11111111-1111-4111-8111-111111111111",
        metadata: {},
      }),
    ).toBe("/work-orders/11111111-1111-4111-8111-111111111111");
  });

  it("keeps filtered timelines historical while the shop dashboard stays recent", () => {
    expect(hasOperationalEventFilter({ correlationId: null, entityId: null, entityType: null })).toBe(false);
    expect(
      hasOperationalEventFilter({
        correlationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(true);
    expect(hasOperationalEventFilter({ entityType: "work_order" })).toBe(true);
  });
});
