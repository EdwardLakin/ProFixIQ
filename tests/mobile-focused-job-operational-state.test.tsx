import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  findProjectedTechnicianJob: vi.fn(),
  getTechnicianJobEditorDraft: vi.fn(),
  realtimeHandlers: {} as Record<string, (payload: unknown) => void>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  getOfflineSyncSummary: vi.fn(() => ({
    queued: 0,
    syncing: 0,
    failed: 0,
    conflicted: 0,
  })),
  getOfflineMutationScope: vi.fn(() => ({
    userId: "tech-1",
    shopId: "shop-1",
  })),
  getSessionMatchedOfflineScope: vi.fn(async () => ({
    userId: "tech-1",
    shopId: "shop-1",
  })),
  listOfflineMutations: vi.fn(() => []),
  listPendingMutations: vi.fn(() => []),
  runMutationWithOfflineQueue: vi.fn(),
  subscribeOfflineMutations: vi.fn(() => vi.fn()),
}));

vi.mock("@/features/shared/lib/offline/replay", () => ({
  replayAndReconcileOfflineMutations: vi.fn(async () => ({
    replayed: 0,
    failed: 0,
    conflicted: 0,
  })),
}));

vi.mock("@/features/shared/lib/offline/server-mutations", () => ({
  postOfflineServerMutation: vi.fn(),
}));

vi.mock("@/features/shared/lib/offline/database", () => ({
  getOfflineSnapshot: vi.fn(),
  listOfflineSnapshots: vi.fn(async () => []),
  removeOfflineBlob: vi.fn(),
  removeOfflineSnapshots: vi.fn(),
  saveOfflineBlob: vi.fn(),
  saveOfflineSnapshot: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/client", () => {
  const channel: Record<string, ReturnType<typeof vi.fn>> = {};
  channel.on = vi.fn(
    (
      _event: string,
      config: { table?: string },
      handler: (payload: unknown) => void,
    ) => {
      if (config.table) mocks.realtimeHandlers[config.table] = handler;
      return channel;
    },
  );
  channel.subscribe = vi.fn(() => channel);
  return {
    createBrowserSupabase: vi.fn(() => ({
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
      storage: {
        from: vi.fn(() => ({ upload: vi.fn() })),
      },
    })),
  };
});

vi.mock(
  "@/features/work-orders/mobile/technicianOfflineExecution",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/features/work-orders/mobile/technicianOfflineExecution")
    >();
    return {
      ...actual,
      clearTechnicianJobEditorDraftFields: vi.fn(),
      findProjectedTechnicianJob: mocks.findProjectedTechnicianJob,
      getTechnicianJobEditorDraft: mocks.getTechnicianJobEditorDraft,
      saveTechnicianJobEditorDraft: vi.fn(),
    };
  },
);

vi.mock("@/features/work-orders/lib/jobPunchTransitionsClient", () => ({
  runJobPunchTransition: vi.fn(),
}));

vi.mock(
  "@/features/work-orders/components/workorders/CauseCorrectionModal",
  () => ({ default: () => null }),
);
vi.mock(
  "@/features/work-orders/components/workorders/PartsRequestModal",
  () => ({ default: () => null }),
);
vi.mock(
  "@/features/work-orders/components/workorders/HoldModal",
  () => ({ default: () => null }),
);
vi.mock(
  "@/features/work-orders/components/workorders/extras/PhotoCaptureModal",
  () => ({ default: () => null }),
);
vi.mock(
  "@/features/work-orders/components/workorders/extras/WorkOrderMediaGallery",
  () => ({ default: () => null }),
);
vi.mock("@/features/work-orders/components/workorders/AddJobModal", () => ({
  default: () => null,
}));
vi.mock("@/features/work-orders/components/workorders/AiAssistantModal", () => ({
  default: () => null,
}));
vi.mock("@/features/ai/components/chat/NewChatModal", () => ({
  default: () => null,
}));
vi.mock("@/features/work-orders/components/SuggestedQuickAdd", () => ({
  default: () => null,
}));
vi.mock(
  "@/features/work-orders/components/workorders/VehicleHistoryModal",
  () => ({ default: () => null }),
);
vi.mock("@/features/shared/voice/VoiceDictationButton", () => ({
  default: () => null,
}));

import MobileFocusedJob from "@/features/work-orders/mobile/MobileFocusedJob";
import { projectTechnicianWorkOrderSnapshot } from "@/features/work-orders/mobile/technicianOfflineExecution";

const WORK_ORDER_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";

function line(overrides: Record<string, unknown> = {}) {
  return {
    id: LINE_ID,
    work_order_id: WORK_ORDER_ID,
    shop_id: "shop-1",
    line_no: 1,
    description: "Brake inspection",
    complaint: null,
    job_type: "inspection",
    status: "in_progress",
    approval_state: "approved",
    assigned_tech_id: "tech-1",
    punched_in_at: null,
    punched_out_at: null,
    hold_reason: null,
    cause: null,
    correction: null,
    notes: null,
    technician_notes: null,
    labor_time: 1,
    ...overrides,
  };
}

function lineContext(activeTechnicianIds: string[] = []) {
  return {
    allocationsByLine: {},
    canonicalPartsByLine: {},
    technicianIdsByLine: {},
    activeTechnicianIdsByLine:
      activeTechnicianIds.length > 0
        ? { [LINE_ID]: activeTechnicianIds }
        : {},
    partRequestsByLine: {},
    partRequestsByQuoteLine: {},
  };
}

function workOrderSnapshot(
  selectedLine: ReturnType<typeof line>,
  activeTechnicianIds: string[] = [],
) {
  return {
    workOrder: {
      id: WORK_ORDER_ID,
      shop_id: "shop-1",
      status: "in_progress",
      vehicle_id: null,
      customer_id: null,
    },
    lines: [selectedLine],
    quoteLines: [],
    vehicle: null,
    customer: null,
    techNamesById: {},
    lineContext: lineContext(activeTechnicianIds),
  };
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function renderFocusedJob() {
  return render(
    <MobileFocusedJob
      workOrderLineId={LINE_ID}
      onBack={vi.fn()}
      mode="tech"
    />,
  );
}

describe("mobile focused-job operational state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.realtimeHandlers)) {
      delete mocks.realtimeHandlers[key];
    }
    setOnline(true);
    mocks.findProjectedTechnicianJob.mockResolvedValue(null);
    mocks.getTechnicianJobEditorDraft.mockResolvedValue(null);
    mocks.fetch.mockResolvedValue(
      response(workOrderSnapshot(line())),
    );
    vi.stubGlobal("fetch", mocks.fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("shows Awaiting and Start Job for stale raw in_progress without live evidence", async () => {
    renderFocusedJob();

    expect(
      await screen.findByRole("button", { name: "Start Job" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Awaiting", { selector: "span" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start Job" })).toBeEnabled(),
    );
  });

  it("shows Active and Finish Job from canonical-only live evidence", async () => {
    mocks.fetch.mockResolvedValue(
      response(
        workOrderSnapshot(
          line({ status: "awaiting" }),
          ["tech-1"],
        ),
      ),
    );

    renderFocusedJob();

    expect(
      await screen.findByRole("button", { name: "Finish Job" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Active", { selector: "span" })).toBeInTheDocument();
  });

  it("retires stale canonical activity after a realtime punch line change", async () => {
    mocks.fetch.mockResolvedValue(
      response(
        workOrderSnapshot(
          line({ status: "awaiting" }),
          ["tech-1"],
        ),
      ),
    );

    renderFocusedJob();

    expect(
      await screen.findByRole("button", { name: "Finish Job" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.realtimeHandlers.work_order_lines).toEqual(
        expect.any(Function),
      ),
    );

    mocks.fetch.mockResolvedValue(
      response(workOrderSnapshot(line({ status: "awaiting" }))),
    );
    act(() => {
      mocks.realtimeHandlers.work_order_lines({
        new: line({ status: "awaiting" }),
      });
    });

    expect(
      await screen.findByRole("button", { name: "Start Job" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Finish Job" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Awaiting", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["pause", "On Hold", "Remove Hold"],
    ["finish", "Completed", "View Details"],
  ] as const)(
    "does not keep an offline projected %s active from stale cached technician IDs",
    async (action, expectedState, expectedAction) => {
      setOnline(false);
      const snapshot = workOrderSnapshot(
        line({
          status: "in_progress",
          punched_in_at: "2026-08-25T12:00:00.000Z",
        }),
        ["tech-1"],
      );
      const projected = projectTechnicianWorkOrderSnapshot(
        snapshot as never,
        [
          {
            clientMutationId: `${LINE_ID}:${action}`,
            actionType: "job:punch-transition",
            payload: {
              lineId: LINE_ID,
              action,
              occurredAt: "2026-08-25T13:00:00.000Z",
              body:
                action === "pause"
                  ? { holdReason: "Waiting for parts" }
                  : { cause: "Failed seal", correction: "Replaced seal" },
            },
            createdAt: "2026-08-25T13:00:00.000Z",
            retryCount: 0,
            userId: "tech-1",
            shopId: "shop-1",
            status: "queued",
          },
        ] as never,
      );
      mocks.findProjectedTechnicianJob.mockResolvedValue({
        snapshot: projected,
        line: projected.lines[0],
      });

      renderFocusedJob();

      expect(
        await screen.findByRole("button", { name: expectedAction }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(expectedState, { selector: "span" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Finish Job" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Active", { selector: "span" }),
      ).not.toBeInTheDocument();
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
});
