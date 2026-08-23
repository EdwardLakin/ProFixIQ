import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserSupabase: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: mocks.createBrowserSupabase,
}));

vi.mock("@/features/parts/components/PickOrderTaskModal", () => ({
  default: () => null,
}));

vi.mock("@/features/parts/components/MenuItemPartsIntakeModal", () => ({
  default: () => null,
}));

type StatusCallback = (status: string) => void;
type ChangeCallback = (payload: unknown) => void;
type ChangeConfig = {
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema: string;
  table: string;
  filter?: string;
};
type FakeChannel = {
  on: (
    kind: string,
    config: ChangeConfig,
    callback: ChangeCallback,
  ) => FakeChannel;
  subscribe: (callback: StatusCallback) => FakeChannel;
};

function realtimeClient() {
  let statusCallback: StatusCallback | null = null;
  const changeCallbacks: Array<{
    config: ChangeConfig;
    callback: ChangeCallback;
  }> = [];
  const channel = {} as FakeChannel;
  Object.assign(channel, {
    on: vi.fn(
      (_kind: string, config: ChangeConfig, callback: ChangeCallback) => {
        changeCallbacks.push({ config, callback });
        return channel;
      },
    ),
    subscribe: vi.fn((callback: StatusCallback) => {
      statusCallback = callback;
      return channel;
    }),
  });
  return {
    channel,
    client: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => undefined),
    },
    emitStatus(status: string) {
      statusCallback?.(status);
    },
    emitChange(
      table: string,
      payload: unknown,
      event: ChangeConfig["event"] = "UPDATE",
    ) {
      for (const listener of changeCallbacks) {
        if (
          listener.config.table === table &&
          (listener.config.event === event || listener.config.event === "*")
        ) {
          listener.callback(payload);
        }
      }
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function emptySnapshot() {
  return {
    shopId: "11111111-1111-4111-8111-111111111111",
    requests: [],
    items: [],
    workOrders: [],
    menuItems: [],
  };
}

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const WORK_ORDER_ID = "33333333-3333-4333-8333-333333333333";

function requestSnapshot(status: "requested" | "quoted") {
  return {
    ...emptySnapshot(),
    requests: [
      {
        id: REQUEST_ID,
        shop_id: emptySnapshot().shopId,
        work_order_id: WORK_ORDER_ID,
        status,
        created_at: "2026-08-22T12:00:00.000Z",
        source_menu_item_id: null,
      },
    ],
    items: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        request_id: REQUEST_ID,
        description: "Oil filter",
        part_id: null,
        requested_part_number: "OF-1",
        requested_manufacturer: null,
        quoted_price: status === "quoted" ? 25 : null,
        unit_price: null,
        unit_cost: null,
        qty: 1,
        qty_requested: 1,
        qty_approved: null,
        qty_ordered: null,
        qty_received: null,
        qty_reserved: null,
        qty_consumed: null,
        qty_returned: null,
        status: "requested",
        updated_at: "2026-08-22T12:01:00.000Z",
      },
    ],
    workOrders: [
      {
        id: WORK_ORDER_ID,
        custom_id: "WO-000014",
        estimate_number: null,
        customers: null,
        vehicles: null,
      },
    ],
  };
}

describe("Parts Requests page aggregate bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps search usable and waits for the direct aggregate before subscribing", async () => {
    const realtime = realtimeClient();
    mocks.createBrowserSupabase.mockReturnValue(realtime.client);
    let resolveFetch: ((response: Response) => void) | null = null;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingFetch),
    );
    const { default: PartsRequestsPage } =
      await import("../app/parts/requests/page");
    const user = userEvent.setup();

    render(<PartsRequestsPage />);

    expect(realtime.client.channel).not.toHaveBeenCalled();
    expect(screen.getAllByText("—")).toHaveLength(3);
    const search = screen.getByPlaceholderText(
      "Search work orders, customers, parts…",
    );
    await user.type(search, "WO-000014");
    expect(search).toHaveValue("WO-000014");

    await act(async () => {
      resolveFetch?.(
        Response.json({ ok: true, snapshot: emptySnapshot() }, { status: 200 }),
      );
      await pendingFetch;
    });

    await waitFor(() =>
      expect(realtime.client.channel).toHaveBeenCalledTimes(1),
    );
    expect(realtime.channel.on).toHaveBeenCalledTimes(6);
    const listenerConfigs = vi
      .mocked(realtime.channel.on)
      .mock.calls.map((call) => call[1]);
    for (const table of ["part_requests", "part_request_items"]) {
      expect(listenerConfigs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: "INSERT",
            filter: `shop_id=eq.${emptySnapshot().shopId}`,
            table,
          }),
          expect.objectContaining({
            event: "UPDATE",
            filter: `shop_id=eq.${emptySnapshot().shopId}`,
            table,
          }),
        ]),
      );
      expect(
        listenerConfigs.filter(
          (config) => config.table === table && config.event === "DELETE",
        ),
      ).toEqual([{ event: "DELETE", schema: "public", table }]);
    }
    expect(
      screen.getByText("Active request groups").previousElementSibling,
    ).toHaveTextContent("0");
    expect(
      screen.getByText("Open requests").previousElementSibling,
    ).toHaveTextContent("0");
    expect(screen.getByText("Items").previousElementSibling).toHaveTextContent(
      "0",
    );

    act(() => realtime.emitStatus("CHANNEL_ERROR"));
    expect(
      await screen.findByText(/Live Parts updates are unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeEnabled();
  });

  it("surfaces an aggregate failure instead of presenting a real zero", async () => {
    const realtime = realtimeClient();
    mocks.createBrowserSupabase.mockReturnValue(realtime.client);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { ok: false, error: "The Parts request queue could not be loaded." },
          { status: 500 },
        ),
      ),
    );
    const { default: PartsRequestsPage } =
      await import("../app/parts/requests/page");

    render(<PartsRequestsPage />);

    const failureTitle = await screen.findByText(
      "Parts request queue unavailable",
    );
    expect(failureTitle.closest('[role="alert"]')).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(realtime.client.channel).not.toHaveBeenCalled();
  });

  it("coalesces create/update deliveries and reconciles the request once", async () => {
    const realtime = realtimeClient();
    mocks.createBrowserSupabase.mockReturnValue(realtime.client);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { ok: true, snapshot: requestSnapshot("requested") },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { ok: true, snapshot: requestSnapshot("quoted") },
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { default: PartsRequestsPage } =
      await import("../app/parts/requests/page");

    render(<PartsRequestsPage />);
    await waitFor(() =>
      expect(realtime.client.channel).toHaveBeenCalledTimes(1),
    );

    act(() => {
      realtime.emitChange("part_requests", { new: { id: REQUEST_ID } });
      realtime.emitChange("part_request_items", {
        new: { request_id: REQUEST_ID },
      });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      `requestId=${REQUEST_ID}`,
    );
    expect(await screen.findByText("Customer pending")).toBeInTheDocument();
    expect(screen.getAllByText("WO-000014")).toHaveLength(1);
  });

  it("discards an older request response that completes after a newer response", async () => {
    const realtime = realtimeClient();
    mocks.createBrowserSupabase.mockReturnValue(realtime.client);
    const olderResponse = deferred<Response>();
    const newerResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { ok: true, snapshot: requestSnapshot("requested") },
          { status: 200 },
        ),
      )
      .mockImplementationOnce(() => olderResponse.promise)
      .mockImplementationOnce(() => newerResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { default: PartsRequestsPage } =
      await import("../app/parts/requests/page");

    render(<PartsRequestsPage />);
    await waitFor(() =>
      expect(realtime.client.channel).toHaveBeenCalledTimes(1),
    );

    act(() =>
      realtime.emitChange("part_requests", { new: { id: REQUEST_ID } }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    act(() =>
      realtime.emitChange("part_requests", { new: { id: REQUEST_ID } }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    await act(async () => {
      newerResponse.resolve(
        Response.json(
          { ok: true, snapshot: requestSnapshot("quoted") },
          { status: 200 },
        ),
      );
      await newerResponse.promise;
    });
    expect(await screen.findByText("Customer pending")).toBeInTheDocument();

    await act(async () => {
      olderResponse.resolve(
        Response.json(
          { ok: true, snapshot: requestSnapshot("requested") },
          { status: 200 },
        ),
      );
      await olderResponse.promise;
    });
    expect(screen.getByText("Customer pending")).toBeInTheDocument();
  });

  it("uses unfiltered delete notifications only as a tenant-scoped full reload signal", async () => {
    const realtime = realtimeClient();
    mocks.createBrowserSupabase.mockReturnValue(realtime.client);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { ok: true, snapshot: requestSnapshot("requested") },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ ok: true, snapshot: emptySnapshot() }, { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { default: PartsRequestsPage } =
      await import("../app/parts/requests/page");

    render(<PartsRequestsPage />);
    expect(await screen.findByText("WO-000014")).toBeInTheDocument();

    act(() => {
      realtime.emitChange(
        "part_request_items",
        { old: { id: "44444444-4444-4444-8444-444444444444" } },
        "DELETE",
      );
      realtime.emitChange(
        "part_requests",
        { old: { id: REQUEST_ID } },
        "DELETE",
      );
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "/api/parts/requests/queue",
    );
    await waitFor(() =>
      expect(screen.queryByText("WO-000014")).not.toBeInTheDocument(),
    );
  });

  it("clears a transient reconciliation warning after a successful delta", async () => {
    const realtime = realtimeClient();
    mocks.createBrowserSupabase.mockReturnValue(realtime.client);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { ok: true, snapshot: requestSnapshot("requested") },
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error("Temporary reconciliation failure"))
      .mockResolvedValueOnce(
        Response.json(
          { ok: true, snapshot: requestSnapshot("quoted") },
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { default: PartsRequestsPage } =
      await import("../app/parts/requests/page");

    render(<PartsRequestsPage />);
    await waitFor(() =>
      expect(realtime.client.channel).toHaveBeenCalledTimes(1),
    );
    act(() => realtime.emitStatus("SUBSCRIBED"));

    act(() =>
      realtime.emitChange("part_requests", { new: { id: REQUEST_ID } }),
    );
    expect(
      await screen.findByText(/could not be reconciled/i),
    ).toBeInTheDocument();

    act(() =>
      realtime.emitChange("part_requests", { new: { id: REQUEST_ID } }),
    );
    expect(await screen.findByText("Customer pending")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText(/could not be reconciled/i),
      ).not.toBeInTheDocument(),
    );
  });

  it("clears a transient reconciliation warning after a successful manual refresh", async () => {
    const realtime = realtimeClient();
    mocks.createBrowserSupabase.mockReturnValue(realtime.client);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { ok: true, snapshot: requestSnapshot("requested") },
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error("Temporary reconciliation failure"))
      .mockResolvedValueOnce(
        Response.json(
          { ok: true, snapshot: requestSnapshot("quoted") },
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { default: PartsRequestsPage } =
      await import("../app/parts/requests/page");
    const user = userEvent.setup();

    render(<PartsRequestsPage />);
    await waitFor(() =>
      expect(realtime.client.channel).toHaveBeenCalledTimes(1),
    );
    act(() => realtime.emitStatus("SUBSCRIBED"));
    act(() =>
      realtime.emitChange("part_requests", { new: { id: REQUEST_ID } }),
    );

    expect(
      await screen.findByText(/could not be reconciled/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh now" }));

    expect(await screen.findByText("Customer pending")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText(/could not be reconciled/i),
      ).not.toBeInTheDocument(),
    );
  });
});
