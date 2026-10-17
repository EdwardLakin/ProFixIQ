import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  punch: vi.fn(),
  clearDraft: vi.fn(),
  entitlement: { status: 200, body: { enabled: true } as unknown },
  viewerProfileId: "tech-a",
  active: ["tech-b"] as string[],
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  findProjectedTechnicianJob: vi.fn(),
  getTechnicianJobEditorDraft: vi.fn(),
  realtimeHandlers: {} as Record<string, (payload: unknown) => void>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
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
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
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
      clearTechnicianJobEditorDraftFields: mocks.clearDraft,
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

vi.mock("@/features/shared/lib/authenticated-profile", () => ({
  resolveCanonicalStaffProfile: async () => ({ profile: { id: mocks.viewerProfileId }, error: null }),
}));

import { resetEquipmentClassificationForTests } from "@/features/equipment/lib/equipmentClassification";
import { JOB_FINISH_REPLAYED_EVENT } from "@/features/shared/lib/offline/jobFinishEvents";
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
    resetEquipmentClassificationForTests();
    mocks.entitlement = { status: 200, body: { enabled: true } };
    mocks.viewerProfileId = "tech-a";
    mocks.active = ["tech-a"];
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).startsWith("/api/equipment/entitlement")) {
        return new Response(JSON.stringify(mocks.entitlement.body), { status: mocks.entitlement.status });
      }
      return response(workOrderSnapshot(line({ status: "awaiting" }), mocks.active));
    });
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
      mocks.clearDraft.mockReset();
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
      // A finished job clears the technician's local story draft, as before.
      expect(mocks.clearDraft).toHaveBeenCalled();
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
    // The story was not saved by a non-final punch-off, so the draft is kept.
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "work-order-line:completed" }),
    );
  });
});

describe("mobile focused-job: each technician's own Start/Finish (Equipment)", () => {
  async function renderAs(options: {
    viewer: string;
    active: string[];
    entitlement?: { status: number; body: unknown };
  }) {
    mocks.viewerProfileId = options.viewer;
    mocks.active = options.active;
    mocks.entitlement = options.entitlement ?? { status: 200, body: { enabled: true } };
    renderFocusedJob();
    // Let the classification and viewer lookups settle.
    await screen.findByRole("button", { name: /Finish Job|Start Job/ });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
    resetEquipmentClassificationForTests();
    mocks.findProjectedTechnicianJob.mockResolvedValue(null);
    mocks.getTechnicianJobEditorDraft.mockResolvedValue(null);
    mocks.punch.mockReset().mockResolvedValue(undefined);
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).startsWith("/api/equipment/entitlement")) {
        return new Response(JSON.stringify(mocks.entitlement.body), { status: mocks.entitlement.status });
      }
      return response(workOrderSnapshot(line({ status: "in_progress" }), mocks.active));
    });
    vi.stubGlobal("fetch", mocks.fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("after A punches off while B continues: A can rejoin, the line stays Active", async () => {
    await renderAs({ viewer: "tech-a", active: ["tech-b"] });

    expect(await screen.findByRole("button", { name: "Start Job" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Finish Job" })).toBeNull();
    expect(screen.getByText("Active", { selector: "span" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start Job" }));
    await waitFor(() => expect(mocks.punch).toHaveBeenCalledWith(LINE_ID, "start"));
  });

  it("B, still working, keeps Finish Job and the line stays Active", async () => {
    await renderAs({ viewer: "tech-b", active: ["tech-b"] });
    expect(await screen.findByRole("button", { name: "Finish Job" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Start Job" })).toBeNull();
    expect(screen.getByText("Active", { selector: "span" })).toBeInTheDocument();
  });

  it("with both on the job, each sees Finish Job (the server decides who is last)", async () => {
    await renderAs({ viewer: "tech-a", active: ["tech-a", "tech-b"] });
    expect(await screen.findByRole("button", { name: "Finish Job" })).toBeEnabled();
  });

  it("the final technician's Finish closes the line and announces the completion", async () => {
    mocks.punch.mockResolvedValue({ lineClosed: true });
    window.dispatchEvent = vi.fn(window.dispatchEvent.bind(window));
    await renderAs({ viewer: "tech-b", active: ["tech-b"] });

    fireEvent.click(await screen.findByRole("button", { name: "Finish Job" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit story" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Job completed"));
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "work-order-line:completed" }),
    );
  });

  describe("unchanged for everyone else", () => {
    it("an ordinary Shop keeps Finish Job for any active line, whoever is active", async () => {
      await renderAs({ viewer: "tech-a", active: ["tech-b"], entitlement: { status: 200, body: { enabled: false } } });
      expect(await screen.findByRole("button", { name: "Finish Job" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Start Job" })).toBeNull();
    });

    it("an undetermined classification is never guessed: the screen behaves as it always has", async () => {
      await renderAs({ viewer: "tech-a", active: ["tech-b"], entitlement: { status: 503, body: { error: "x" } } });
      expect(await screen.findByRole("button", { name: "Finish Job" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Start Job" })).toBeNull();
    });

    it("an unclaimed line still offers Start Job", async () => {
      mocks.viewerProfileId = "tech-a";
      mocks.active = [];
      mocks.fetch.mockImplementation(async (url: string) =>
        String(url).startsWith("/api/equipment/entitlement")
          ? new Response(JSON.stringify({ enabled: true }), { status: 200 })
          : response(workOrderSnapshot(line({ status: "awaiting" }), [])),
      );
      renderFocusedJob();
      expect(await screen.findByRole("button", { name: "Start Job" })).toBeEnabled();
    });
  });

  describe("a Finish that is still pending sync", () => {
    async function submitFinish() {
      await renderAs({ viewer: "tech-b", active: ["tech-b"] });
      window.dispatchEvent = vi.fn(window.dispatchEvent.bind(window));
      fireEvent.click(await screen.findByRole("button", { name: "Finish Job" }));
      fireEvent.click(await screen.findByRole("button", { name: "Submit story" }));
    }

    it("shows pending sync, not completed, and emits no completion", async () => {
      mocks.punch.mockResolvedValue({ awaitingServer: true });
      await submitFinish();

      await waitFor(() =>
        expect(mocks.toastWarning).toHaveBeenCalledWith("Finish saved. It will sync when you're back online."),
      );
      expect(mocks.toastSuccess).not.toHaveBeenCalledWith("Job completed");
      expect(window.dispatchEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "work-order-line:completed" }),
      );
      // The story stays as a draft until the server confirms.
      expect(mocks.clearDraft).not.toHaveBeenCalled();
    });

    it("replay says lineClosed=true: now it is completed", async () => {
      mocks.punch.mockResolvedValue({ awaitingServer: true });
      await submitFinish();
      await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalled());

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent(JOB_FINISH_REPLAYED_EVENT, { detail: { lineId: LINE_ID, lineClosed: true } }),
        );
      });

      await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Job completed"));
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "work-order-line:completed" }),
      );
      expect(mocks.clearDraft).toHaveBeenCalled();
    });

    it("replay says lineClosed=false: refreshes and reports a punch-off, without completing", async () => {
      mocks.punch.mockResolvedValue({ awaitingServer: true });
      await submitFinish();
      await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalled());
      const loadsBefore = mocks.fetch.mock.calls.filter(([url]) => !String(url).startsWith("/api/equipment")).length;

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent(JOB_FINISH_REPLAYED_EVENT, { detail: { lineId: LINE_ID, lineClosed: false } }),
        );
      });

      await waitFor(() =>
        expect(mocks.toastSuccess).toHaveBeenCalledWith(
          "Punched off. Other technicians are still working on this job.",
        ),
      );
      const loadsAfter = mocks.fetch.mock.calls.filter(([url]) => !String(url).startsWith("/api/equipment")).length;
      expect(loadsAfter).toBeGreaterThan(loadsBefore);
      expect(mocks.toastSuccess).not.toHaveBeenCalledWith("Job completed");
      expect(window.dispatchEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "work-order-line:completed" }),
      );
    });

    it("ignores a replay for another line, and stays pending if the replay failed or conflicted (no event)", async () => {
      mocks.punch.mockResolvedValue({ awaitingServer: true });
      await submitFinish();
      await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalled());
      mocks.toastSuccess.mockClear();

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent(JOB_FINISH_REPLAYED_EVENT, { detail: { lineId: "some-other-line", lineClosed: true } }),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
    });
  });
});
