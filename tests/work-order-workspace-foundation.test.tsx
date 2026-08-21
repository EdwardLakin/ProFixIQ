import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChatListPage from "../app/chat/page";
import ChatListClient from "@/features/chat/components/ChatListClient";
import {
  WorkOrderWorkspaceCommandBar,
  WorkOrderWorkspaceModule,
} from "@/features/work-orders/workspace/WorkOrderWorkspaceFrame";
import {
  WORK_ORDER_WORKSPACE_MODULES,
  createWorkOrderWorkspaceResource,
  workOrderWorkspaceCustomerMessageHref,
} from "@/features/work-orders/workspace/workOrderWorkspace";
import {
  usePublishWorkspaceResourceContext,
  useWorkspaceResourceContext,
  WorkspaceResourceProvider,
} from "@/features/workspace/context/WorkspaceResourceContext";
import type { WorkspaceResourceContext } from "@/features/workspace/lib/workspace";

vi.mock("@/features/shared/components/PageShell", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/chat/components/InboxModal", () => ({
  default: ({
    contextOverride,
  }: {
    contextOverride: {
      context_type: string | null;
      context_id: string | null;
      deep_link: string | null;
      context_label: string;
    } | null;
  }) => (
    <output data-testid="compose-context">
      {contextOverride ? JSON.stringify(contextOverride) : "none"}
    </output>
  ),
}));

afterEach(() => cleanup());

const resource = createWorkOrderWorkspaceResource({
  shopId: "shop-1",
  workOrderId: "wo-1",
  customerId: "customer-1",
  vehicleId: "vehicle-1",
});

function ResourcePublisher({
  value,
}: {
  value: WorkspaceResourceContext | null;
}) {
  usePublishWorkspaceResourceContext(value);
  return null;
}

function ResourceConsumer() {
  const value = useWorkspaceResourceContext();
  return <output data-testid="workspace-resource">{value?.resourceId ?? "none"}</output>;
}

describe("Work Order Workspace foundation", () => {
  it("publishes the canonical Work Order identity to sibling workspace modules", async () => {
    expect(resource).toEqual({
      kind: "work_order",
      shopId: "shop-1",
      resourceId: "wo-1",
      workOrderId: "wo-1",
      customerId: "customer-1",
      vehicleId: "vehicle-1",
      locationId: null,
    });

    const view = render(
      <WorkspaceResourceProvider>
        <ResourcePublisher value={resource} />
        <ResourceConsumer />
      </WorkspaceResourceProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("workspace-resource")).toHaveTextContent("wo-1"),
    );

    view.rerender(
      <WorkspaceResourceProvider>
        <ResourcePublisher value={null} />
        <ResourceConsumer />
      </WorkspaceResourceProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("workspace-resource")).toHaveTextContent("none"),
    );
  });

  it("keeps existing Work Order UI inside semantic module boundaries", () => {
    render(
      <WorkOrderWorkspaceModule module="repairLines">
        <WorkOrderWorkspaceCommandBar>
          <button type="button">Existing action</button>
        </WorkOrderWorkspaceCommandBar>
      </WorkOrderWorkspaceModule>,
    );

    const module = screen.getByLabelText("Repair lines");
    expect(module).toHaveAttribute(
      "id",
      WORK_ORDER_WORKSPACE_MODULES.repairLines.anchorId,
    );
    expect(module).toHaveAttribute("data-workspace-module", "repairLines");
    expect(screen.getByRole("navigation", { name: "Work order actions" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Existing action" })).toBeVisible();
  });

  it("builds a customer message handoff anchored to the canonical Work Order", () => {
    expect(
      workOrderWorkspaceCustomerMessageHref({
        workOrderId: "11111111-1111-4111-8111-111111111111",
        customerId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(
      "/chat?compose=customer&contextType=work_order&contextId=11111111-1111-4111-8111-111111111111&customerId=22222222-2222-4222-8222-222222222222",
    );
    expect(
      workOrderWorkspaceCustomerMessageHref({
        workOrderId: "11111111-1111-4111-8111-111111111111",
        customerId: null,
      }),
    ).toBeNull();
  });

  it("accepts the Work Order compose handoff while preserving Vehicle compose", async () => {
    const workOrderPage = await ChatListPage({
      searchParams: Promise.resolve({
        compose: "customer",
        contextType: "work_order",
        contextId: "11111111-1111-4111-8111-111111111111",
        customerId: "22222222-2222-4222-8222-222222222222",
      }),
    });
    expect(workOrderPage.props).toMatchObject({
      startCustomerCompose: true,
      contextType: "work_order",
      contextId: "11111111-1111-4111-8111-111111111111",
      customerId: "22222222-2222-4222-8222-222222222222",
    });

    const unsupportedContextPage = await ChatListPage({
      searchParams: Promise.resolve({
        compose: "customer",
        contextType: "inspection",
        contextId: "11111111-1111-4111-8111-111111111111",
        customerId: "22222222-2222-4222-8222-222222222222",
      }),
    });
    expect(unsupportedContextPage.props).toMatchObject({
      startCustomerCompose: false,
      contextType: null,
      contextId: null,
      customerId: null,
    });

    render(
      <ChatListClient
        startCustomerCompose
        contextType="work_order"
        contextId="11111111-1111-4111-8111-111111111111"
        customerId="22222222-2222-4222-8222-222222222222"
      />,
    );
    expect(screen.getByTestId("compose-context")).toHaveTextContent(
      '"context_type":"work_order"',
    );
    expect(screen.getByTestId("compose-context")).toHaveTextContent(
      '"deep_link":"/work-orders/11111111-1111-4111-8111-111111111111"',
    );

    cleanup();
    render(
      <ChatListClient
        startCustomerCompose
        contextId="33333333-3333-4333-8333-333333333333"
        customerId="22222222-2222-4222-8222-222222222222"
      />,
    );
    expect(screen.getByTestId("compose-context")).toHaveTextContent(
      '"context_type":"vehicle"',
    );
  });
});
