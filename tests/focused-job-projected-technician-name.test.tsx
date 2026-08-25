import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const channel: Record<string, ReturnType<typeof vi.fn>> = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);

  const profileQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  profileQuery.select = vi.fn(() => profileQuery);
  profileQuery.eq = vi.fn(() => profileQuery);
  profileQuery.maybeSingle = vi.fn();

  return {
    channel,
    from: vi.fn(() => profileQuery),
    profileQuery,
    removeChannel: vi.fn(),
    rpc: vi.fn(),
  };
});

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    channel: vi.fn(() => mocks.channel),
    from: mocks.from,
    removeChannel: mocks.removeChannel,
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/features/work-orders/components/JobPunchButton", () => ({
  default: () => null,
}));
vi.mock(
  "@/features/work-orders/components/workorders/CauseCorrectionModal",
  () => ({ default: () => null }),
);
vi.mock("@/features/work-orders/components/workorders/AddJobModal", () => ({
  default: () => null,
}));
vi.mock(
  "@/features/work-orders/components/workorders/AiAssistantModal",
  () => ({ default: () => null }),
);
vi.mock("@/features/work-orders/components/SuggestedQuickAdd", () => ({
  default: () => null,
}));
vi.mock(
  "@/features/work-orders/components/workorders/extras/WorkOrderMediaGallery",
  () => ({ default: () => null }),
);
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";

const LINE_ID = "11111111-1111-4111-8111-111111111111";
const TECH_ID = "22222222-2222-4222-8222-222222222222";
const WORK_ORDER_ID = "33333333-3333-4333-8333-333333333333";
const SHOP_ID = "44444444-4444-4444-8444-444444444444";

function projectedSnapshot(techNamesById: Record<string, string>) {
  return {
    workOrder: {
      id: WORK_ORDER_ID,
      shop_id: SHOP_ID,
      custom_id: "WO-000014",
      customer_id: null,
      vehicle_id: null,
      status: "in_progress",
    },
    lines: [
      {
        id: LINE_ID,
        work_order_id: WORK_ORDER_ID,
        shop_id: SHOP_ID,
        assigned_tech_id: TECH_ID,
        approval_state: "approved",
        complaint: "Brake vibration",
        description: "Inspect front brakes",
        job_type: "repair",
        punched_in_at: null,
        punched_out_at: null,
        status: "assigned",
        technician_notes: null,
      },
    ],
    quoteLines: [],
    vehicle: null,
    customer: null,
    techNamesById,
    lineContext: {
      allocationsByLine: {},
      canonicalPartsByLine: {},
      technicianIdsByLine: { [LINE_ID]: [TECH_ID] },
      activeTechnicianIdsByLine: {},
      partRequestsByLine: {},
      partRequestsByQuoteLine: {},
    },
    shopLaborRate: null,
    financialAccess: {
      canViewSellPricing: false,
      canViewCost: false,
      canViewGrossProfit: false,
      canViewInvoice: false,
      canManageInvoice: false,
      canEditPricing: false,
      canViewPartsSellPricing: false,
      canViewPartsCost: false,
    },
    latestInvoiceReview: null,
  };
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderStandalone() {
  return render(
    <FocusedJobModal
      isOpen
      onClose={vi.fn()}
      workOrderLineId={LINE_ID}
      mode="tech"
      variant="panel"
    />,
  );
}

describe("Focused Job projected technician display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.profileQuery.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses its projected name map without a parent snapshot or profile query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(projectedSnapshot({ [TECH_ID]: "Jordan Historical" })),
      ),
    );

    renderStandalone();

    await waitFor(() => {
      expect(screen.getAllByText("Jordan Historical").length).toBeGreaterThan(
        0,
      );
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("retains the browser profile fallback when the projected map has no name", async () => {
    mocks.profileQuery.maybeSingle.mockResolvedValue({
      data: {
        id: TECH_ID,
        full_name: "Browser Profile Fallback",
        role: "mechanic",
      },
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(projectedSnapshot({}))),
    );

    renderStandalone();

    await waitFor(() => {
      expect(
        screen.getAllByText("Browser Profile Fallback").length,
      ).toBeGreaterThan(0);
    });
    expect(mocks.from).toHaveBeenCalledWith("profiles");
  });
});
