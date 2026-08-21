import { act, cleanup, render, screen } from "@testing-library/react";
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Work Order Workspace financials composition", () => {
  it("shows canonical USD invoice pricing and delegates invoice navigation", async () => {
    const invoiceFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        snapshot: {
          currency: "USD",
          laborCost: 240,
          partsCost: 81.5,
          subtotal: 341.5,
        },
      }),
    });
    vi.stubGlobal("fetch", invoiceFetch);

    render(
      <WorkOrderWorkspaceModule module="financials">
        <WorkOrderFinancialWorkspace
          workOrderId="wo-1"
          workOrderStatusLabel="Ready to invoice"
          paymentStatus="payment_due"
        />
      </WorkOrderWorkspaceModule>,
    );

    expect(screen.getByLabelText("Financials")).toBeVisible();
    expect(await screen.findByText("US$240.00")).toBeVisible();
    expect(screen.getByText("US$81.50")).toBeVisible();
    expect(screen.getByText("US$341.50")).toBeVisible();
    expect(screen.getByText("Work Order: Ready to invoice")).toBeVisible();
    expect(screen.getByText("Payment: Payment Due")).toBeVisible();
    expect(screen.getByText("Canonical invoice snapshot · USD")).toBeVisible();
    expect(screen.queryByText(/Invoice review/i)).not.toBeInTheDocument();
    expect(invoiceFetch).toHaveBeenCalledWith(
      "/api/work-orders/wo-1/invoice",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    expect(screen.getByTestId("invoice-preview")).toHaveAttribute(
      "data-work-order-id",
      "wo-1",
    );
    expect(screen.getByTestId("invoice-preview")).toHaveAttribute(
      "data-mode",
      "preview",
    );
  });

  it("does not fall back to non-canonical line totals when the snapshot fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Snapshot failed" }),
      }),
    );

    render(
      <WorkOrderFinancialWorkspace
        workOrderId="wo-2"
        workOrderStatusLabel="In progress"
        paymentStatus={null}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Snapshot failed. Open Invoice Preview to retry.",
    );
    expect(screen.getAllByText("Unavailable")).toHaveLength(3);
  });

  it("refreshes canonical pricing after returning from invoice preview", async () => {
    const invoiceFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          snapshot: {
            currency: "CAD",
            laborCost: 100,
            partsCost: 25,
            subtotal: 125,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          snapshot: {
            currency: "CAD",
            laborCost: 140,
            partsCost: 25,
            subtotal: 165,
          },
        }),
      });
    vi.stubGlobal("fetch", invoiceFetch);

    render(
      <WorkOrderFinancialWorkspace
        workOrderId="wo-3"
        workOrderStatusLabel="In progress"
        paymentStatus={null}
      />,
    );

    expect(await screen.findByText("$100.00")).toBeVisible();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(await screen.findByText("$140.00")).toBeVisible();
    expect(invoiceFetch).toHaveBeenCalledTimes(2);
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
    expect(workOrderClient).not.toContain(
      'fetch("/api/work-orders/workspace/financials"',
    );
    expect(workOrderClient).not.toContain("invoiceReviewStatus=");
  });
});
