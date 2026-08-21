import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WorkOrderJobCommunicationWorkspace,
  WorkOrderJobDocumentsWorkspace,
} from "@/features/work-orders/workspace/WorkOrderJobWorkspaceSurfaces";
import { WorkOrderWorkspaceModule } from "@/features/work-orders/workspace/WorkOrderWorkspaceFrame";
import {
  getComposedWorkOrderJobWorkspaceTabs,
  getWorkOrderJobWorkspaceTabs,
} from "@/features/work-orders/workspace/workOrderWorkspace";

vi.mock(
  "@/features/work-orders/components/workorders/extras/WorkOrderMediaGallery",
  () => ({
    default: ({
      workOrderId,
      workOrderLineId,
      refreshKey,
    }: {
      workOrderId: string;
      workOrderLineId: string;
      refreshKey: number;
    }) => (
      <output
        data-testid="media-gallery"
        data-work-order-id={workOrderId}
        data-work-order-line-id={workOrderLineId}
        data-refresh-key={refreshKey}
      >
        Existing media gallery
      </output>
    ),
  }),
);

afterEach(() => cleanup());

describe("Work Order Workspace Communication and Documents composition", () => {
  it("adds Messages through a composed adapter without changing the existing tab contract", () => {
    expect(
      getWorkOrderJobWorkspaceTabs({ inspectionAvailable: false }).map(
        (tab) => tab.id,
      ),
    ).toEqual(["overview", "story", "parts", "evidence", "details"]);

    expect(
      getComposedWorkOrderJobWorkspaceTabs({
        inspectionAvailable: true,
        communicationAvailable: true,
      }).map((tab) => [tab.id, tab.module]),
    ).toEqual([
      ["overview", "repairLines"],
      ["story", "repairLines"],
      ["inspection", "inspection"],
      ["parts", "parts"],
      ["communication", "communication"],
      ["evidence", "documents"],
      ["details", "repairLines"],
    ]);
  });

  it("delegates job and customer messages to the existing authorized entry points", () => {
    const onOpenJobChat = vi.fn();
    render(
      <WorkOrderWorkspaceModule module="communication">
        <WorkOrderJobCommunicationWorkspace
          jobLabel="Brake inspection"
          customerMessageHref="/chat?compose=customer&contextType=work_order&contextId=wo-1&customerId=customer-1"
          onOpenJobChat={onOpenJobChat}
        />
      </WorkOrderWorkspaceModule>,
    );

    expect(screen.getByLabelText("Communication")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open job chat" }));
    expect(onOpenJobChat).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: "Message customer" }),
    ).toHaveAttribute(
      "href",
      "/chat?compose=customer&contextType=work_order&contextId=wo-1&customerId=customer-1",
    );
  });

  it("does not manufacture a customer action when the role-shaped handoff is unavailable", () => {
    render(
      <WorkOrderJobCommunicationWorkspace
        jobLabel="Brake inspection"
        onOpenJobChat={() => undefined}
      />,
    );

    expect(screen.queryByRole("link", { name: "Message customer" })).toBeNull();
    expect(
      screen.getByText(
        "Customer messaging is not available for this job or role.",
      ),
    ).toBeVisible();
  });

  it("keeps evidence loading and media capture on their existing handlers", () => {
    const onAddMedia = vi.fn();
    render(
      <WorkOrderWorkspaceModule module="documents">
        <WorkOrderJobDocumentsWorkspace
          workOrderId="wo-1"
          workOrderLineId="line-1"
          refreshKey={4}
          onAddMedia={onAddMedia}
        />
      </WorkOrderWorkspaceModule>,
    );

    expect(screen.getByLabelText("Documents")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add photo or video" }));
    expect(onAddMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("media-gallery")).toHaveAttribute(
      "data-work-order-id",
      "wo-1",
    );
    expect(screen.getByTestId("media-gallery")).toHaveAttribute(
      "data-work-order-line-id",
      "line-1",
    );
    expect(screen.getByTestId("media-gallery")).toHaveAttribute(
      "data-refresh-key",
      "4",
    );
  });
});
