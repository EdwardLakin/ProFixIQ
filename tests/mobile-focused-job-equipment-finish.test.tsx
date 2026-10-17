import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  punch: vi.fn(),
  toastSuccess: vi.fn(),
  findProjectedTechnicianJob: vi.fn(),
  getTechnicianJobEditorDraft: vi.fn(),
  realtimeHandlers: {} as Record<string, (payload: unknown) => void>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: mocks.toastSuccess,
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
  runJobPunchTransition: mocks.punch,
}));

vi.mock(
  "@/features/work-orders/components/workorders/CauseCorrectionModal",
  () => ({
    default: ({
      isOpen,
      onSubmit,
    }: {
      isOpen: boolean;
      onSubmit: (cause: string, correction: string) => Promise<void>;
    }) =>
      isOpen ? (
        <button type="button" onClick={() => void onSubmit("Worn seal", "Replaced seal")}>
          Submit story
        </button>
      ) : null,
  }),
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

describe("mobile focused-job Finish: Equipment last-one-off", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
    mocks.findProjectedTechnicianJob.mockResolvedValue(null);
    mocks.getTechnicianJobEditorDraft.mockResolvedValue(null);
    // A fresh Response per call: the screen reads the body more than once.
    mocks.fetch.mockImplementation(async () =>
      response(workOrderSnapshot(line({ status: "awaiting" }), ["tech-1"])),
    );
    vi.stubGlobal("fetch", mocks.fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    window.dispatchEvent = vi.fn(window.dispatchEvent.bind(window));
  });

  async function finishJob() {
    renderFocusedJob();
    fireEvent.click(await screen.findByRole("button", { name: "Finish Job" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit story" }));
  }

  it("keeps the standard completion for a finish that closed the line, or any response without lineClosed", async () => {
    for (const outcome of [undefined, { lineClosed: true }]) {
      mocks.punch.mockReset();
      mocks.toastSuccess.mockReset();
      mocks.punch.mockResolvedValue(outcome);
      const view = await (async () => {
        const rendered = render(
          <MobileFocusedJob workOrderLineId={LINE_ID} onBack={vi.fn()} mode="tech" />,
        );
        fireEvent.click(await screen.findByRole("button", { name: "Finish Job" }));
        fireEvent.click(await screen.findByRole("button", { name: "Submit story" }));
        return rendered;
      })();

      await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Job completed"));
      expect(mocks.punch).toHaveBeenCalledWith(LINE_ID, "finish", {
        cause: "Worn seal",
        correction: "Replaced seal",
      });
      view.unmount();
    }
  });

  it("reports a punch-off, not a completion, when other technicians are still working", async () => {
    mocks.punch.mockResolvedValue({
      lineClosed: false,
      remaining: [{ technicianId: "tech-2", state: "running" }],
    });

    await finishJob();

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Punched off. 1 other technician is still on this job."),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith("Job completed");
    expect(window.dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "work-order-line:completed" }),
    );
  });
});
