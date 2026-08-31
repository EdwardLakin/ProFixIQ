import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  focusedJobProps: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  getOfflineMutationScope: vi.fn(),
  jobCardProps: vi.fn(),
  loadProjectedWorkOrderSnapshot: vi.fn(),
  profileAbortSignal: vi.fn(),
  profileEq: vi.fn(),
  profileLookup: vi.fn(),
  removeMobileWorkOrderDetailSnapshots: vi.fn(async () => undefined),
  saveOfflineSnapshot: vi.fn(async () => undefined),
  search: "",
  updateActiveTab: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/shared/hooks/useTabState", async () => {
  const ReactModule = await import("react");
  return {
    useTabState: <T,>(_key: string, initialValue: T) =>
      ReactModule.useState(initialValue),
  };
});

vi.mock("@/features/shared/components/tabs/TabsProvider", () => ({
  useTabs: () => ({ updateActiveTab: mocks.updateActiveTab }),
}));

vi.mock("@/features/shared/lib/supabase/client", () => {
  const profileQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  profileQuery.select = vi.fn(() => profileQuery);
  mocks.profileAbortSignal.mockImplementation(() => profileQuery);
  profileQuery.abortSignal = mocks.profileAbortSignal;
  mocks.profileEq.mockImplementation(() => profileQuery);
  profileQuery.eq = mocks.profileEq;
  profileQuery.maybeSingle = mocks.profileLookup;

  const channel: Record<string, ReturnType<typeof vi.fn>> = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  return {
    supabaseBrowser: {
      auth: {
        getSession: mocks.getSession,
        getUser: mocks.getUser,
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      channel: vi.fn(() => channel),
      from: vi.fn((table: string) => {
        if (table !== "profiles") {
          throw new Error(`Unexpected browser detail query: ${table}`);
        }
        return profileQuery;
      }),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("@/features/shared/lib/offline/database", () => ({
  saveOfflineSnapshot: mocks.saveOfflineSnapshot,
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  getOfflineMutationScope: mocks.getOfflineMutationScope,
  getOfflineSyncSummary: vi.fn(() => ({
    queued: 0,
    syncing: 0,
    failed: 0,
    conflicted: 0,
  })),
  setOfflineMutationScope: vi.fn(),
  subscribeOfflineMutations: vi.fn(() => vi.fn()),
}));

vi.mock("@/features/work-orders/mobile/technicianOfflineExecution", () => ({
  loadProjectedWorkOrderSnapshot: mocks.loadProjectedWorkOrderSnapshot,
  removeMobileWorkOrderDetailSnapshots:
    mocks.removeMobileWorkOrderDetailSnapshots,
}));

vi.mock("@shared/components/ui/PreviousPageButton", () => ({
  default: ({ to }: { to?: string }) => (
    <button type="button" data-return-to={to ?? ""}>
      Back
    </button>
  ),
}));

vi.mock("@/features/shared/voice/VoiceContextSetter", () => ({
  default: () => null,
}));
vi.mock("@/features/assistant/components/AskAssistantEntry", () => ({
  default: () => null,
}));
vi.mock("@/features/work-orders/mobile/MobileFocusedJob", () => ({
  default: (props: { workOrderLineId: string; canAddJob?: boolean }) => {
    mocks.focusedJobProps(props);
    return (
      <div>
        <span>Focused job {props.workOrderLineId}</span>
        <span>
          {props.canAddJob ? "Add job available" : "Add job unavailable"}
        </span>
      </div>
    );
  },
}));
vi.mock("@/features/work-orders/components/JobCard", () => ({
  JobCard: (props: {
    line: { description?: string | null };
    isPunchedIn?: boolean;
    displayNumber?: number | string;
  }) => {
    mocks.jobCardProps(props);
    return (
      <article data-display-number={props.displayNumber}>
        {props.line.description ?? "Untitled job"}
      </article>
    );
  },
}));
vi.mock("@/features/work-orders/lib/jobPunchTransitionsClient", () => ({
  runJobPunchTransition: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import MobileWorkOrderClient from "@/features/work-orders/mobile/MobileWorkOrderClient";

const WORK_ORDER_ID = "11111111-1111-4111-8111-111111111111";

function detailSnapshot(
  customId = "WO-000014",
  lines: Array<Record<string, unknown>> = [],
  activeTechnicianIdsByLine: Record<string, string[]> = {},
) {
  return {
    productScope: "shop",
    workOrder: {
      id: WORK_ORDER_ID,
      shop_id: "shop-1",
      custom_id: customId,
      status: "in_progress",
      vehicle_id: null,
      customer_id: null,
      created_at: "2026-08-21T18:00:00.000Z",
      expected_completion_at: "invalid-legacy-date",
    },
    lines,
    quoteLines: [],
    vehicle: null,
    customer: null,
    techNamesById: {},
    lineContext: {
      allocationsByLine: {},
      canonicalPartsByLine: {},
      technicianIdsByLine: {},
      activeTechnicianIdsByLine,
      partRequestsByLine: {},
      partRequestsByQuoteLine: {},
    },
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
  };
}

function actionableDetailSnapshot() {
  return {
    ...detailSnapshot(),
    lines: [
      {
        id: "line-1",
        work_order_id: WORK_ORDER_ID,
        shop_id: "shop-1",
        description: "Profile authorization",
        status: "in_progress",
        approval_state: "approved",
        job_type: "repair",
      },
    ],
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("mobile work-order detail client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = "";
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: "user-1", user_metadata: { role: "advisor" } },
        },
      },
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mocks.getOfflineMutationScope.mockReturnValue({
      userId: "user-1",
      shopId: "shop-1",
    });
    mocks.profileLookup.mockResolvedValue({
      data: { role: "advisor", shop_id: "shop-1" },
      error: null,
    });
    mocks.loadProjectedWorkOrderSnapshot.mockResolvedValue(null);
    mocks.fetch.mockResolvedValue(response(detailSnapshot()));
    vi.stubGlobal("fetch", mocks.fetch);
    setOnline(true);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders a meaningful sparse work order after a direct deep link", async () => {
    mocks.search = "returnTo=%2Fmobile%2Fwork-orders%3Fstatus%3Din_progress";
    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading work order");
    await screen.findByText("WO-000014");

    expect(screen.getByText("No vehicle linked yet.")).toBeInTheDocument();
    expect(screen.getByText("No customer linked yet.")).toBeInTheDocument();
    expect(screen.getByText("No lines yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toHaveAttribute(
      "data-return-to",
      "/mobile/work-orders?status=in_progress",
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      `/api/mobile/work-orders/${WORK_ORDER_ID}`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("preserves Add Job presentation for a manager whose profile id matches auth", async () => {
    mocks.search = "focus=line-1";
    mocks.profileLookup.mockResolvedValue({
      data: {
        id: "user-1",
        role: "manager",
        shop_id: "shop-1",
      },
      error: null,
    });
    mocks.fetch.mockResolvedValue(response(actionableDetailSnapshot()));

    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    await screen.findByText("Add job available");
    expect(mocks.profileEq).toHaveBeenCalledOnce();
    expect(mocks.profileEq).toHaveBeenCalledWith("id", "user-1");
    expect(mocks.profileAbortSignal).toHaveBeenCalledOnce();
    expect(mocks.profileAbortSignal).toHaveBeenCalledWith(
      expect.any(AbortSignal),
    );
  });

  it("presents Add Job for an imported manager linked through profiles.user_id", async () => {
    mocks.search = "focus=line-1";
    mocks.profileLookup
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          id: "imported-manager-profile",
          role: "manager",
          shop_id: "shop-1",
        },
        error: null,
      });
    mocks.fetch.mockResolvedValue(response(actionableDetailSnapshot()));

    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    await screen.findByText("Add job available");
    expect(mocks.profileEq).toHaveBeenNthCalledWith(1, "id", "user-1");
    expect(mocks.profileEq).toHaveBeenNthCalledWith(2, "user_id", "user-1");
    expect(mocks.profileAbortSignal).toHaveBeenCalledTimes(2);
    expect(mocks.profileAbortSignal.mock.calls[1]?.[0]).toBe(
      mocks.profileAbortSignal.mock.calls[0]?.[0],
    );
  });

  it("keeps canonical line numbers when operational priority reorders cards", async () => {
    const snapshot = detailSnapshot();
    mocks.fetch.mockResolvedValue(
      response({
        ...snapshot,
        lineContext: {
          ...snapshot.lineContext,
          activeTechnicianIdsByLine: { "line-2": ["tech-2"] },
        },
        lines: [
          {
            id: "line-1",
            work_order_id: WORK_ORDER_ID,
            shop_id: "shop-1",
            line_no: 1,
            description: "Brake inspection",
            status: "awaiting",
            approval_state: "approved",
            created_at: "2026-08-21T18:00:00.000Z",
          },
          {
            id: "line-2",
            work_order_id: WORK_ORDER_ID,
            shop_id: "shop-1",
            line_no: 2,
            description: "Front brake pads",
            status: "in_progress",
            approval_state: "approved",
            created_at: "2026-08-21T18:01:00.000Z",
          },
        ],
      }),
    );

    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    const prioritized = await screen.findByText("Front brake pads");
    const inspection = screen.getByText("Brake inspection");
    expect(screen.getAllByRole("article").map((card) => card.textContent)).toEqual([
      "Front brake pads",
      "Brake inspection",
    ]);
    expect(prioritized).toHaveAttribute("data-display-number", "2");
    expect(inspection).toHaveAttribute("data-display-number", "1");
  });

  it("keeps one canonical display number across hidden history and approval views", async () => {
    const snapshot = detailSnapshot();
    mocks.fetch.mockResolvedValue(
      response({
        ...snapshot,
        lines: [
          {
            id: "voided-legacy-line",
            work_order_id: WORK_ORDER_ID,
            shop_id: "shop-1",
            line_no: null,
            description: "Voided diagnosis",
            status: "completed",
            approval_state: "approved",
            voided_at: "2026-08-21T18:02:00.000Z",
            created_at: "2026-08-21T18:00:00.000Z",
          },
          {
            id: "visible-legacy-line",
            work_order_id: WORK_ORDER_ID,
            shop_id: "shop-1",
            line_no: null,
            description: "Customer approval",
            status: "awaiting_approval",
            approval_state: "pending",
            created_at: "2026-08-21T18:01:00.000Z",
          },
        ],
      }),
    );

    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    const renderedCard = await screen.findByRole("article");
    expect(renderedCard).toHaveTextContent("Customer approval");
    expect(renderedCard).toHaveAttribute("data-display-number", "2");
    expect(screen.getByText(/^2\.\s+Customer approval$/)).toBeInTheDocument();
    expect(screen.queryByText("Voided diagnosis")).not.toBeInTheDocument();
  });

  it("renders explicit denied and missing states without stale detail", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ error: "Forbidden" }, 403));
    const denied = render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    await screen.findByText("Access denied");
    expect(screen.queryByText("WO-000014")).not.toBeInTheDocument();
    expect(mocks.loadProjectedWorkOrderSnapshot).not.toHaveBeenCalled();
    expect(mocks.removeMobileWorkOrderDetailSnapshots).toHaveBeenCalledWith({
      scope: { userId: "user-1", shopId: "shop-1" },
      entityId: WORK_ORDER_ID,
    });

    denied.unmount();
    mocks.fetch.mockResolvedValueOnce(
      response({ error: "Work order not found." }, 404),
    );
    render(<MobileWorkOrderClient routeId="missing-work-order" />);

    await screen.findByText("Record not found");
    expect(screen.queryByText("WO-000014")).not.toBeInTheDocument();
    expect(mocks.removeMobileWorkOrderDetailSnapshots).toHaveBeenCalledWith({
      scope: { userId: "user-1", shopId: "shop-1" },
      entityId: "missing-work-order",
    });
  });

  it("keeps the rendered detail visible and coalesces focus recovery events", async () => {
    let resolveRefresh: ((value: Response) => void) | null = null;
    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);
    await screen.findByText("WO-000014");

    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText("WO-000014")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      resolveRefresh?.(response(detailSnapshot("WO-REFRESHED")));
    });
    await screen.findByText("WO-REFRESHED");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("recovers from cached scope when the browser profile read fails", async () => {
    mocks.profileLookup.mockResolvedValue({
      data: null,
      error: new Error("Temporary profile read failure"),
    });
    mocks.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    mocks.loadProjectedWorkOrderSnapshot.mockResolvedValue(
      detailSnapshot("WO-CACHED-ACTOR"),
    );

    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    await screen.findByText("WO-CACHED-ACTOR");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.loadProjectedWorkOrderSnapshot).toHaveBeenCalledWith({
      scope: { userId: "user-1", shopId: "shop-1" },
      entityId: WORK_ORDER_ID,
    });
  });

  it("fails Add Job closed when cached fallback only has mutable role metadata", async () => {
    mocks.search = "focus=line-1";
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: "user-1", user_metadata: { role: "manager" } },
        },
      },
    });
    mocks.profileLookup.mockResolvedValue({
      data: null,
      error: new Error("Temporary profile read failure"),
    });
    mocks.fetch.mockResolvedValue(response(actionableDetailSnapshot()));

    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    await screen.findByText("Add job unavailable");
    expect(mocks.profileLookup).toHaveBeenCalledOnce();
  });

  it("renders an offline snapshot and replaces it after reconnect", async () => {
    setOnline(false);
    mocks.loadProjectedWorkOrderSnapshot.mockResolvedValue(
      detailSnapshot("WO-OFFLINE"),
    );
    mocks.fetch.mockResolvedValue(response(detailSnapshot("WO-RECONNECTED")));
    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    await screen.findByText("WO-OFFLINE");
    expect(
      screen.getByText("Offline copy · changes may be newer on the server."),
    ).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();

    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));

    await screen.findByText("WO-RECONNECTED");
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("WO-OFFLINE")).not.toBeInTheDocument();
  });

  it("passes the genuine active line to the focused-job CTA", async () => {
    const staleLineId = "22222222-2222-4222-8222-222222222222";
    const activeLineId = "33333333-3333-4333-8333-333333333333";
    mocks.fetch.mockResolvedValue(
      response(
        detailSnapshot(
          "WO-ACTIVE-CTA",
          [
            {
              id: staleLineId,
              work_order_id: WORK_ORDER_ID,
              shop_id: "shop-1",
              description: "Older stale job",
              status: "in_progress",
              approval_state: "approved",
              assigned_tech_id: "tech-1",
              punched_in_at: null,
              punched_out_at: null,
              created_at: "2026-08-20T12:00:00.000Z",
            },
            {
              id: activeLineId,
              work_order_id: WORK_ORDER_ID,
              shop_id: "shop-1",
              description: "Canonical active job",
              status: "awaiting",
              approval_state: "approved",
              assigned_tech_id: "tech-2",
              punched_in_at: null,
              punched_out_at: null,
              created_at: "2026-08-21T12:00:00.000Z",
            },
          ],
          { [activeLineId]: ["tech-2"] },
        ),
      ),
    );

    render(<MobileWorkOrderClient routeId={WORK_ORDER_ID} />);

    await screen.findByText("WO-ACTIVE-CTA");
    await waitFor(() => {
      const jobCards = mocks.jobCardProps.mock.calls.map(([props]) => props);
      expect(
        jobCards.find((props) => props.line.id === staleLineId),
      ).toEqual(expect.objectContaining({ isPunchedIn: false }));
      expect(
        jobCards.find((props) => props.line.id === activeLineId),
      ).toEqual(expect.objectContaining({ isPunchedIn: true }));
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Open active job" }),
    );

    await screen.findByText(`Focused job ${activeLineId}`);
    expect(mocks.focusedJobProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ workOrderLineId: activeLineId }),
    );
  });
});
