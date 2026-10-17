import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: mocks.error },
}));
import View from "@/features/equipment/parts/components/EquipmentPartsView";
import type { EquipmentPartsRow } from "@/features/equipment/parts/lib/equipmentParts";
const row: EquipmentPartsRow = {
  id: "request",
  workOrderId: "equipment-work",
  workOrderLabel: "WO-42",
  assetId: "asset",
  stage: "order_receive",
  createdAt: null,
  items: [
    {
      id: "item",
      description: "Hydraulic filter",
      requested: 3,
      received: 0,
      reserved: 0,
    },
  ],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("Equipment Parts workspace", () => {
  it("composes the real pick modal and delegates allocation to the existing command with idempotency and bounded quantity", async () => {
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("pick-task")
              ? {
                  ok: true,
                  items: [
                    {
                      id: "item",
                      requestId: "request",
                      description: "Stock filter",
                      partId: "part",
                      required: 3,
                      remainingToStage: 3,
                      ordered: 0,
                      received: 0,
                      staged: 0,
                      stock: [
                        {
                          locationId: "location",
                          locationLabel: "Main",
                          available: 2,
                          onHand: 2,
                          reserved: 0,
                        },
                      ],
                    },
                  ],
                }
              : { ok: true },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<View rows={[row]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Pick / order approved parts" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Pick 2" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/parts/requests/items/item/allocate",
        expect.any(Object),
      ),
    );
    const call = fetch.mock.calls.find(([url]) =>
      url.endsWith("/allocate"),
    ) as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({
      locationId: "location",
      qty: 2,
      idempotencyKey: expect.any(String),
    });
    expect(call[1].headers).toMatchObject({
      "Idempotency-Key": body.idempotencyKey,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/parts/requests/pick-task?workOrderId=equipment-work",
      { cache: "no-store" },
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });
  it("preserves canonical command error reporting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: false, error: "Parts access denied" }),
            { status: 403 },
          ),
      ),
    );
    render(<View rows={[row]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Pick / order approved parts" }),
    );
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Parts access denied"),
    );
  });
  it("does not offer picking before approval and clearly links shared inventory and purchasing", () => {
    render(<View rows={[{ ...row, stage: "awaiting_approval" }]} />);
    expect(
      screen.queryByRole("button", { name: "Pick / order approved parts" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Inventory/ })).toHaveAttribute(
      "href",
      "/parts/inventory",
    );
    expect(
      screen.getByRole("link", { name: /Purchase orders/ }),
    ).toHaveAttribute("href", "/parts/po");
    expect(
      screen.getByRole("link", { name: /Open request workflow/ }),
    ).toHaveAttribute("href", "/parts/requests/equipment-work");
    expect(screen.getByText(/whole shop/)).toBeInTheDocument();
  });
  it("keeps inaccessible and failed queues free of request data and actions", () => {
    const { rerender } = render(<View restricted rows={[row]} />);
    expect(screen.queryByText("WO-42")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Inventory/ }),
    ).not.toBeInTheDocument();
    rerender(<View error rows={[row]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
    expect(screen.queryByText("WO-42")).not.toBeInTheDocument();
  });
  it("updates counts and pages together and resets pagination on search", () => {
    render(
      <View
        rows={Array.from({ length: 26 }, (_, i) => ({
          ...row,
          id: `r${i}`,
          workOrderLabel: `WO-${i}`,
        }))}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "26 matching requests · Page 1 of 2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("WO-25")).toBeInTheDocument();
    expect(screen.queryByText("WO-0")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search requests" }), {
      target: { value: "WO-0" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 matching requests · Page 1 of 1",
    );
  });
});
