import { describe, expect, it } from "vitest";

import {
  canOpenMobileCustomerProfile,
  parseMobileWorkOrderSnapshot,
  type MobileWorkOrderSnapshot,
} from "@/features/work-orders/mobile/mobileWorkOrderDetail";
import {
  buildMobileWorkOrderListHref,
  resolveMobileWorkOrderHref,
  resolveMobileWorkOrderReturnHref,
} from "@/features/mobile/work-orders/mobileWorkOrderRouting";

const WORK_ORDER_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";

function emptyLineContext() {
  return {
    allocationsByLine: {},
    canonicalPartsByLine: {},
    technicianIdsByLine: {},
    activeTechnicianIdsByLine: {},
    partRequestsByLine: {},
    partRequestsByQuoteLine: {},
  };
}

function snapshot(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    workOrder: {
      id: WORK_ORDER_ID,
      shop_id: SHOP_ID,
      custom_id: "WO-000014",
      status: "in_progress",
      vehicle_id: null,
      customer_id: null,
      created_at: null,
      expected_completion_at: null,
    },
    lines: [],
    quoteLines: [],
    vehicle: null,
    customer: null,
    techNamesById: {},
    lineContext: emptyLineContext(),
    shopLaborRate: null,
    financialAccess: {
      canViewSellPricing: false,
      canViewPartsSellPricing: false,
      canViewPartsCost: false,
      canViewGrossProfit: false,
      canViewInvoice: false,
      canManageInvoice: false,
      canEditPricing: false,
    },
    latestInvoiceReview: null,
    productScope: "shop",
    ...overrides,
  };
}

describe("Phase 5 mobile work-order detail contract", () => {
  it("accepts a sparse unassigned job with no inspection or parts", () => {
    const value = snapshot({
      lines: [
        {
          id: "line-1",
          shop_id: SHOP_ID,
          work_order_id: WORK_ORDER_ID,
          assigned_tech_id: null,
          status: "awaiting",
        },
      ],
    });

    const parsed = parseMobileWorkOrderSnapshot(value);

    expect(parsed.lines[0]?.assigned_tech_id).toBeNull();
    expect(parsed.vehicle).toBeNull();
    expect(parsed.customer).toBeNull();
    expect(parsed.lineContext?.canonicalPartsByLine).toEqual({});
  });

  it.each([
    "awaiting_approval",
    "in_progress",
    "quality_control",
    "ready_to_invoice",
    "invoiced",
    "closed",
  ])("accepts the %s lifecycle without narrowing legacy statuses", (status) => {
    const value = snapshot({
      workOrder: {
        ...(snapshot().workOrder as Record<string, unknown>),
        status,
      },
    });

    expect(parseMobileWorkOrderSnapshot(value).workOrder.status).toBe(status);
  });

  it("rejects incomplete and cross-record payloads before rendering", () => {
    expect(() => parseMobileWorkOrderSnapshot({})).toThrow(
      "workOrder is missing",
    );
    expect(() =>
      parseMobileWorkOrderSnapshot(
        snapshot({
          lines: [
            {
              id: "line-1",
              shop_id: "different-shop",
              work_order_id: WORK_ORDER_ID,
            },
          ],
        }),
      ),
    ).toThrow("different shop");
    expect(() =>
      parseMobileWorkOrderSnapshot(
        snapshot({
          quoteLines: [
            { id: "quote-1", work_order_id: "different-work-order" },
          ],
        }),
      ),
    ).toThrow("different work order");
  });

  it("preserves the current queue filter through detail and Back", () => {
    const returnTo = buildMobileWorkOrderListHref({
      status: "ready_to_invoice",
      readyToInvoiceCloseout: true,
      inspectionTemplateId: "template-1",
    });
    const href = resolveMobileWorkOrderHref({
      workOrderId: WORK_ORDER_ID,
      status: "in_progress",
      readyToInvoiceCloseout: false,
      returnTo,
    });
    const parsed = new URL(href, "https://profixiq.test");

    expect(returnTo).toBe(
      "/mobile/work-orders?status=ready_to_invoice&mode=field_closeout&templateId=template-1",
    );
    expect(parsed.searchParams.get("returnTo")).toBe(returnTo);
    expect(
      resolveMobileWorkOrderReturnHref(parsed.searchParams.get("returnTo")),
    ).toBe(returnTo);
  });

  it("rejects external and unrelated Back destinations", () => {
    expect(
      resolveMobileWorkOrderReturnHref(
        "https://attacker.example/mobile/work-orders",
      ),
    ).toBeNull();
    expect(
      resolveMobileWorkOrderReturnHref("//attacker.example/path"),
    ).toBeNull();
    expect(resolveMobileWorkOrderReturnHref("/mobile/settings")).toBeNull();
  });

  it("keeps the snapshot type compatible with existing offline storage", () => {
    const parsed: MobileWorkOrderSnapshot =
      parseMobileWorkOrderSnapshot(snapshot());
    expect(parsed.workOrder.id).toBe(WORK_ORDER_ID);
  });

  it("only exposes the nested customer profile action to Shop-authorized snapshots", () => {
    expect(canOpenMobileCustomerProfile("shop")).toBe(true);
    expect(canOpenMobileCustomerProfile("field")).toBe(false);
    expect(canOpenMobileCustomerProfile(undefined)).toBe(false);
  });
});
