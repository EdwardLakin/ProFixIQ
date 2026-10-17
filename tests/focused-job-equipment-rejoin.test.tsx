import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    profileQuery,
    viewer: { equipmentClass: "equipment", viewerProfileId: "tech-a" as string | null },
    punch: vi.fn(),
    storyUpdate: vi.fn(),
    toastSuccess: vi.fn(),
    toastWarning: vi.fn(),
    active: ["tech-b"] as string[],
  };
});

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    channel: vi.fn(() => mocks.channel),
    removeChannel: vi.fn(),
    rpc: vi.fn(async () => ({ error: null })),
    from: (table: string) =>
      table === "work_order_lines"
        ? { update: () => ({ eq: (...args: unknown[]) => mocks.storyUpdate(...args) }) }
        : mocks.profileQuery,
  }),
}));
vi.mock("@/features/equipment/lib/useEquipmentViewer", () => ({
  useEquipmentViewer: () => mocks.viewer,
}));
vi.mock("@/features/work-orders/lib/jobPunchTransitionsClient", () => ({
  runJobPunchTransition: (...args: unknown[]) => mocks.punch(...args),
}));
// Shows which action the punch button is offering.
vi.mock("@/features/work-orders/components/JobPunchButton", () => ({
  default: ({ isActive }: { isActive?: boolean }) => (
    <button type="button" data-testid="punch-button">{isActive ? "Finish job" : "Start job"}</button>
  ),
}));
vi.mock("@/features/work-orders/components/workorders/CauseCorrectionModal", () => ({
  default: function Modal(props: {
    isOpen: boolean;
    onSubmit: (cause: string, correction: string) => Promise<void>;
    onClose: () => void;
  }) {
    const [error, setError] = React.useState<string | null>(null);
    if (!props.isOpen) return null;
    return (
      <div role="dialog" aria-label="story">
        <button type="button" onClick={async () => {
          setError(null);
          try {
            await props.onSubmit("Worn seal", "Replaced seal");
            props.onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "failed");
          }
        }}>Submit story</button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    );
  },
}));
vi.mock("@/features/work-orders/components/workorders/AddJobModal", () => ({ default: () => null }));
vi.mock("@/features/work-orders/components/workorders/AiAssistantModal", () => ({ default: () => null }));
vi.mock("@/features/work-orders/components/SuggestedQuickAdd", () => ({ default: () => null }));
vi.mock("@/features/work-orders/components/workorders/extras/WorkOrderMediaGallery", () => ({ default: () => null }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: mocks.toastSuccess, warning: mocks.toastWarning },
}));

import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";

const LINE_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ORDER_ID = "33333333-3333-4333-8333-333333333333";
const SHOP_ID = "44444444-4444-4444-8444-444444444444";

function snapshot(active: string[]) {
  return {
    workOrder: { id: WORK_ORDER_ID, shop_id: SHOP_ID, custom_id: "WO-1", customer_id: null, vehicle_id: null, status: "in_progress" },
    lines: [
      {
        id: LINE_ID, work_order_id: WORK_ORDER_ID, shop_id: SHOP_ID, assigned_tech_id: "tech-b",
        approval_state: "approved", complaint: "Leak", description: "Replace seal", job_type: "repair",
        punched_in_at: "2026-10-17T10:00:00Z", punched_out_at: null, status: "in_progress", technician_notes: null,
      },
    ],
    quoteLines: [], vehicle: null, customer: null, techNamesById: {},
    lineContext: {
      allocationsByLine: {}, canonicalPartsByLine: {}, technicianIdsByLine: { [LINE_ID]: ["tech-a", "tech-b"] },
      activeTechnicianIdsByLine: { [LINE_ID]: active }, partRequestsByLine: {}, partRequestsByQuoteLine: {},
    },
    shopLaborRate: null,
    financialAccess: {
      canViewSellPricing: false, canViewCost: false, canViewGrossProfit: false, canViewInvoice: false,
      canManageInvoice: false, canEditPricing: false, canViewPartsSellPricing: false, canViewPartsCost: false,
    },
    latestInvoiceReview: null,
  };
}

function renderModal() {
  return render(
    <FocusedJobModal isOpen onClose={vi.fn()} workOrderLineId={LINE_ID} mode="tech" variant="panel" isPunchedInSnapshot />,
  );
}

async function punchLabel() {
  await waitFor(() => expect(screen.getAllByTestId("punch-button").length).toBeGreaterThan(0));
  // Let the scoped detail read land.
  await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 30));
  return screen.getAllByTestId("punch-button")[0].textContent;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profileQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.viewer.equipmentClass = "equipment";
  mocks.viewer.viewerProfileId = "tech-a";
  mocks.active = ["tech-b"];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(snapshot(mocks.active)), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("desktop job modal: each technician's own Start/Finish (Equipment)", () => {
  it("after A punches off while B continues, A is offered Start (rejoin) and cannot Complete", async () => {
    renderModal();
    expect(await punchLabel()).toBe("Start job");
    expect(screen.getByRole("button", { name: "Complete" })).toBeDisabled();
  });

  it("B, still working, keeps Finish and Complete", async () => {
    mocks.viewer.viewerProfileId = "tech-b";
    renderModal();
    expect(await punchLabel()).toBe("Finish job");
    expect(screen.getByRole("button", { name: "Complete" })).toBeEnabled();
  });

  it("with both working, each keeps Finish", async () => {
    mocks.active = ["tech-a", "tech-b"];
    renderModal();
    expect(await punchLabel()).toBe("Finish job");
  });

  it("an ordinary Shop is unchanged whoever is active", async () => {
    mocks.viewer.equipmentClass = "standard";
    renderModal();
    expect(await punchLabel()).toBe("Finish job");
    expect(screen.getByRole("button", { name: "Complete" })).toBeEnabled();
  });

  it("an undetermined classification, or an unknown viewer, is never guessed", async () => {
    mocks.viewer.equipmentClass = "unknown";
    const first = renderModal();
    expect(await punchLabel()).toBe("Finish job");
    first.unmount();

    mocks.viewer.equipmentClass = "equipment";
    mocks.viewer.viewerProfileId = null;
    renderModal();
    expect(await punchLabel()).toBe("Finish job");
  });
});

describe("desktop job modal: a non-final punch-off whose story cannot be saved", () => {
  beforeEach(() => {
    mocks.viewer.viewerProfileId = "tech-b";
    mocks.punch.mockResolvedValue({ lineClosed: false, remaining: [{ technicianId: "tech-a", state: "running" }] });
  });

  async function openAndSubmit() {
    renderModal();
    await punchLabel();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit story" }));
  }

  it("keeps the dialog open, says what happened, and retries only the save", async () => {
    mocks.storyUpdate.mockResolvedValueOnce({ error: { message: "Network lost." } }).mockResolvedValue({ error: null });
    await openAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You are punched off, but your story was not saved");
    expect(alert).toHaveTextContent("Your text is still here");
    expect(screen.getByRole("dialog", { name: "story" })).toBeInTheDocument();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Submit story" }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Punched off. 1 other technician is still on this job."),
    );
    expect(mocks.punch).toHaveBeenCalledTimes(1);
    expect(mocks.storyUpdate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "story" })).toBeNull());
  });

  it("closing the dialog abandons the retry state, so a later finish is a normal finish again", async () => {
    mocks.storyUpdate.mockResolvedValue({ error: { message: "Network lost." } });
    await openAndSubmit();
    await screen.findByRole("alert");

    // Reopen after the dialog is dismissed: a submit now runs the finish again.
    mocks.punch.mockClear();
    mocks.punch.mockResolvedValue({ lineClosed: true });
    mocks.storyUpdate.mockResolvedValue({ error: null });
    cleanup();
    renderModal();
    await punchLabel();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit story" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Job completed"));
    expect(mocks.punch).toHaveBeenCalledTimes(1);
  });
});
