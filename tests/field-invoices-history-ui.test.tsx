// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FieldInvoicesHistory from "@/features/mobile/service/FieldInvoicesHistory";
import type { FieldInvoiceHistoryRow } from "@/features/mobile/service/fieldInvoiceHistory";
import {
  getOfflineSnapshot,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";

vi.mock("@/features/shared/lib/offline/database", () => ({
  getOfflineSnapshot: vi.fn(async () => null),
  removeOfflineSnapshots: vi.fn(async () => undefined),
  saveOfflineSnapshot: vi.fn(async () => undefined),
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  getOfflineMutationScope: vi.fn(() => ({
    userId: "user-1",
    shopId: "shop-1",
  })),
}));

function row(
  invoiceVersionId: string,
  paymentState: "unpaid" | "paid",
): FieldInvoiceHistoryRow {
  return {
    invoiceVersionId,
    invoiceNumber: `INV-${invoiceVersionId}`,
    versionNumber: 1,
    workOrderId: `work-order-${invoiceVersionId}`,
    workOrderNumber: `RO-${invoiceVersionId}`,
    lifecycleStatus: paymentState === "paid" ? "paid" : "issued",
    paymentState,
    currency: "CAD",
    total: 500,
    paidTotal: paymentState === "paid" ? 500 : 100,
    refundedTotal: 0,
    outstandingTotal: paymentState === "paid" ? 0 : 400,
    issuedAt: "2026-08-18T12:00:00.000Z",
    updatedAt: "2026-08-18T12:00:00.000Z",
    paidAt: paymentState === "paid" ? "2026-08-18T13:00:00.000Z" : null,
    customerName: paymentState === "paid" ? "Taylor Jones" : "Jamie Smith",
    customerEmail: null,
    vehicleLabel: "2024 Ford F-550",
    licensePlate: paymentState === "paid" ? "PAID1" : "DUE1",
  };
}

const liveRows = [row("101", "unpaid"), row("102", "paid")];

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOfflineSnapshot).mockReset();
  vi.mocked(removeOfflineSnapshots).mockReset();
  vi.mocked(saveOfflineSnapshot).mockReset();
  vi.mocked(getOfflineSnapshot).mockResolvedValue(null);
  vi.mocked(removeOfflineSnapshots).mockResolvedValue(undefined);
  vi.mocked(saveOfflineSnapshot).mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, rows: liveRows }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Field invoices and history", () => {
  it("opens on unpaid balances and preserves canonical payment, PDF, and work-order handoffs", async () => {
    render(<FieldInvoicesHistory />);

    expect(await screen.findByText("INV-101")).toBeInTheDocument();
    expect(screen.queryByText("INV-102")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /collect payment/i }),
    ).toHaveAttribute("href", "/mobile/service/closeout/work-order-101");
    expect(screen.getByRole("link", { name: /pdf/i })).toHaveAttribute(
      "href",
      "/api/work-orders/work-order-101/invoice-pdf",
    );
    expect(screen.getByRole("link", { name: /work order/i })).toHaveAttribute(
      "href",
      "/mobile/work-orders/work-order-101",
    );

    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    expect(await screen.findByText("INV-102")).toBeInTheDocument();
    expect(screen.queryByText("INV-101")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view receipt/i }),
    ).toBeInTheDocument();
  });

  it("uses the tenant-scoped saved snapshot for offline reference without payment or PDF actions", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    vi.mocked(getOfflineSnapshot).mockResolvedValueOnce({
      key: "user-1:shop-1:field-invoice-history:latest",
      kind: "field-invoice-history",
      entityId: "latest",
      userId: "user-1",
      shopId: "shop-1",
      updatedAt: "2026-08-18T12:00:00.000Z",
      expiresAt: "2026-08-19T00:00:00.000Z",
      data: [row("101", "unpaid")],
    });

    render(<FieldInvoicesHistory />);

    expect(await screen.findByText("INV-101")).toBeInTheDocument();
    expect(
      screen.getByText(/Saved invoice history is available/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /collect payment/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /pdf/i }),
    ).not.toBeInTheDocument();
  });

  it("hides live actions when an online request falls back to saved data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Temporarily unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.mocked(getOfflineSnapshot).mockResolvedValueOnce({
      key: "user-1:shop-1:field-invoice-history:latest",
      kind: "field-invoice-history",
      entityId: "latest",
      userId: "user-1",
      shopId: "shop-1",
      updatedAt: "2026-08-18T12:00:00.000Z",
      expiresAt: "2026-08-19T00:00:00.000Z",
      data: [row("101", "unpaid")],
    });

    render(<FieldInvoicesHistory />);

    expect(await screen.findByText("INV-101")).toBeInTheDocument();
    expect(
      screen.getByText(/Saved invoice history is available/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /collect payment/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /pdf/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /work order/i }),
    ).toBeInTheDocument();
  });

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ])(
    "withholds and removes saved financial data after a %s response",
    async (status, message) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: message }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.mocked(getOfflineSnapshot).mockResolvedValueOnce({
        key: "user-1:shop-1:field-invoice-history:latest",
        kind: "field-invoice-history",
        entityId: "latest",
        userId: "user-1",
        shopId: "shop-1",
        updatedAt: "2026-08-18T12:00:00.000Z",
        expiresAt: "2026-08-19T00:00:00.000Z",
        data: [row("101", "unpaid")],
      });

      render(<FieldInvoicesHistory />);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText("INV-101")).not.toBeInTheDocument();
      expect(getOfflineSnapshot).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(removeOfflineSnapshots).toHaveBeenCalledWith({
          scope: { userId: "user-1", shopId: "shop-1" },
          kind: "field-invoice-history",
          entityIds: ["latest"],
        }),
      );
      expect(
        screen.queryByRole("link", { name: /collect payment/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /pdf/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("orders a newly mounted access denial after an older pending snapshot save", async () => {
    const pendingSave = deferred();
    const operations: string[] = [];
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, rows: liveRows }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.mocked(saveOfflineSnapshot).mockImplementationOnce(async () => {
      await pendingSave.promise;
      operations.push("save");
    });
    vi.mocked(removeOfflineSnapshots).mockImplementationOnce(async () => {
      operations.push("remove");
    });

    const firstView = render(<FieldInvoicesHistory />);

    await waitFor(() => expect(saveOfflineSnapshot).toHaveBeenCalledOnce());
    firstView.unmount();
    render(<FieldInvoicesHistory />);
    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    expect(removeOfflineSnapshots).not.toHaveBeenCalled();

    pendingSave.resolve(undefined);
    await waitFor(() => expect(removeOfflineSnapshots).toHaveBeenCalledOnce());
    expect(operations).toEqual(["save", "remove"]);
  });

  it("orders a newly mounted authorized snapshot save after an older pending purge", async () => {
    const pendingRemove = deferred();
    const operations: string[] = [];
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, rows: liveRows }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.mocked(removeOfflineSnapshots).mockImplementationOnce(async () => {
      await pendingRemove.promise;
      operations.push("remove");
    });
    vi.mocked(saveOfflineSnapshot).mockImplementationOnce(async () => {
      operations.push("save");
    });

    const firstView = render(<FieldInvoicesHistory />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    await waitFor(() => expect(removeOfflineSnapshots).toHaveBeenCalledOnce());
    firstView.unmount();
    render(<FieldInvoicesHistory />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(saveOfflineSnapshot).not.toHaveBeenCalled();

    pendingRemove.resolve(undefined);
    expect(await screen.findByText("INV-101")).toBeInTheDocument();
    await waitFor(() => expect(saveOfflineSnapshot).toHaveBeenCalledOnce());
    expect(operations).toEqual(["remove", "save"]);
  });

  it("ignores a successful response that arrives after its view unmounts", async () => {
    const pendingResponse = deferred<Response>();
    const staleJson = vi.fn(async () => ({ ok: true, rows: liveRows }));
    vi.mocked(fetch)
      .mockImplementationOnce(async () => pendingResponse.promise)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const firstView = render(<FieldInvoicesHistory />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    firstView.unmount();
    render(<FieldInvoicesHistory />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    await waitFor(() => expect(removeOfflineSnapshots).toHaveBeenCalledOnce());

    pendingResponse.resolve({
      ok: true,
      status: 200,
      json: staleJson,
    } as unknown as Response);
    await waitFor(() => expect(staleJson).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveOfflineSnapshot).not.toHaveBeenCalled();
  });

  it("keeps live invoice data visible when the optional offline snapshot cannot be saved", async () => {
    vi.mocked(saveOfflineSnapshot).mockRejectedValueOnce(
      new Error("IndexedDB unavailable"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(<FieldInvoicesHistory />);

    expect(await screen.findByText("INV-101")).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith("[field-invoices] snapshot save failed", {
      message: "IndexedDB unavailable",
    });
    warn.mockRestore();
  });
});
