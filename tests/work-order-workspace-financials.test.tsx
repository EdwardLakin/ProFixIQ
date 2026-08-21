import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { WorkOrderFinancialWorkspace } from "@/features/work-orders/workspace/WorkOrderFinancialWorkspace";
import { WorkOrderWorkspaceModule } from "@/features/work-orders/workspace/WorkOrderWorkspaceFrame";

vi.mock(
  "@/features/work-orders/components/WorkOrderInvoiceDownloadButton",
  () => ({
    WorkOrderInvoiceDownloadButton: ({
      workOrderId,
      mode,
      label,
    }: {
      workOrderId: string;
      mode: string;
      label: string;
    }) => (
      <button
        type="button"
        data-testid="invoice-preview"
        data-work-order-id={workOrderId}
        data-mode={mode}
      >
        {label}
      </button>
    ),
  }),
);

const workOrderClient = readFileSync("app/work-orders/[id]/Client.tsx", "utf8");

afterEach(() => cleanup());

describe("Work Order Workspace financials composition", () => {
  it("shows the existing line-pricing summary and delegates invoice navigation", () => {
    render(
      <WorkOrderWorkspaceModule module="financials">
        <WorkOrderFinancialWorkspace
          workOrderId="wo-1"
          laborSubtotal={240}
          partsSubtotal={81.5}
          lineSubtotal={321.5}
          workOrderStatusLabel="Ready to invoice"
          paymentStatus="payment_due"
          invoiceReviewStatus="passed"
        />
      </WorkOrderWorkspaceModule>,
    );

    expect(screen.getByLabelText("Financials")).toBeVisible();
    expect(screen.getByText("$240.00")).toBeVisible();
    expect(screen.getByText("$81.50")).toBeVisible();
    expect(screen.getByText("$321.50")).toBeVisible();
    expect(screen.getByText("Work Order: Ready to invoice")).toBeVisible();
    expect(screen.getByText("Payment: Payment Due")).toBeVisible();
    expect(screen.getByText("Invoice review passed")).toBeVisible();
    expect(screen.getByTestId("invoice-preview")).toHaveAttribute(
      "data-work-order-id",
      "wo-1",
    );
    expect(screen.getByTestId("invoice-preview")).toHaveAttribute(
      "data-mode",
      "preview",
    );
  });

  it("keeps the module behind the existing financial capability", () => {
    expect(workOrderClient).toContain(
      "const canViewFinancials = currentActor.canViewFinancials;",
    );
    expect(workOrderClient).toMatch(
      /\{canViewFinancials \? \(\s*<WorkOrderWorkspaceModule\s+module="financials"/,
    );
    expect(workOrderClient).toContain(
      'data-workspace-module-action="financials"',
    );
  });

  it("uses existing read and navigation paths without adding a mutation", () => {
    expect(workOrderClient).toContain(
      'import { resolveWorkOrderLinePricing } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";',
    );
    expect(workOrderClient).not.toContain(
      'fetch("/api/work-orders/workspace/financials"',
    );
  });
});
