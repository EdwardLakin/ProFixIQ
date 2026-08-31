import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MobileWorkOrderQueue from "@/features/mobile/work-orders/MobileWorkOrderQueue";

type WorkOrderResult = {
  data: Array<Record<string, unknown>>;
  error: null;
};

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(async () => ({
    data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    error: null,
  })),
  defaultWorkOrderResult: { data: [], error: null } as WorkOrderResult,
  workOrderRequestCount: 0,
  workOrderResults: [] as Array<Promise<WorkOrderResult>>,
}));

vi.mock("@/features/shared/lib/offline/database", () => ({
  getOfflineSnapshot: vi.fn(async () => null),
  listOfflineSnapshots: vi.fn(async () => []),
  removeOfflineSnapshots: vi.fn(async () => undefined),
  saveOfflineSnapshot: vi.fn(async () => undefined),
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  getOfflineMutationScope: vi.fn(() => null),
  setOfflineMutationScope: vi.fn(),
}));

vi.mock("@/features/shared/lib/rbac", () => ({
  getActorCapabilities: vi.fn(() => ({
    canManageWorkOrders: true,
    canPerformAssignedWork: false,
    canViewShopWideData: true,
  })),
}));

vi.mock("@/features/shared/lib/supabase/client", () => {
  const chain = (result: Promise<unknown>) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["eq", "in", "is", "limit", "order", "select"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(() => result);
    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => result.then(onFulfilled, onRejected);
    return builder;
  };

  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  return {
    createBrowserSupabase: () => ({
      auth: { getUser: mocks.authGetUser },
      channel: vi.fn(() => channel),
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return chain(
            Promise.resolve({
              data: {
                role: "manager",
                shop_id: "00000000-0000-4000-8000-000000000002",
              },
              error: null,
            }),
          );
        }
        if (table === "work_order_lines") {
          return chain(Promise.resolve({ data: [], error: null }));
        }
        if (table === "work_orders") {
          mocks.workOrderRequestCount += 1;
          return chain(
            mocks.workOrderResults.shift() ??
              Promise.resolve(mocks.defaultWorkOrderResult),
          );
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      removeChannel: vi.fn(async () => undefined),
    }),
  };
});

function workOrder(customId: string): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-${customId.padEnd(12, "0").slice(0, 12)}`,
    custom_id: customId,
    status: "in_progress",
    created_at: "2026-08-18T20:00:00.000Z",
    customers: {
      first_name: "Jamie",
      last_name: "Smith",
      phone: "555-0100",
    },
    vehicles: {
      year: 2024,
      make: "Ford",
      model: "F-550",
      license_plate: "FIELD1",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderEmbeddedQueue() {
  return render(
    <MobileWorkOrderQueue initialStatus="in_progress" embedded lockStatus />,
  );
}

describe("MobileWorkOrderQueue recovery", () => {
  beforeEach(() => {
    mocks.authGetUser.mockClear();
    mocks.workOrderRequestCount = 0;
    mocks.workOrderResults.length = 0;
    mocks.defaultWorkOrderResult = {
      data: [workOrder("WO-INITIAL")],
      error: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ scope: "shop", workOrderIds: null }),
      ),
    );
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  it("reloads from the embedded button and each browser recovery signal", async () => {
    renderEmbeddedQueue();
    await screen.findByText(/WO-INITIAL/);
    expect(mocks.workOrderRequestCount).toBe(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh active repairs" }),
    );
    await waitFor(() => expect(mocks.workOrderRequestCount).toBe(2));

    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(mocks.workOrderRequestCount).toBe(3));

    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.workOrderRequestCount).toBe(4));

    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(mocks.workOrderRequestCount).toBe(5));
  });

  it("does not let an older refresh overwrite the latest queue response", async () => {
    const olderRefresh = deferred<WorkOrderResult>();
    const latestRefresh = deferred<WorkOrderResult>();
    mocks.workOrderResults.push(
      Promise.resolve({ data: [workOrder("WO-INITIAL")], error: null }),
      olderRefresh.promise,
      latestRefresh.promise,
    );

    renderEmbeddedQueue();
    await screen.findByText(/WO-INITIAL/);

    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.workOrderRequestCount).toBe(2));

    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(mocks.workOrderRequestCount).toBe(3));

    await act(async () => {
      latestRefresh.resolve({
        data: [workOrder("WO-LATEST")],
        error: null,
      });
      await latestRefresh.promise;
    });
    await screen.findByText(/WO-LATEST/);

    await act(async () => {
      olderRefresh.resolve({ data: [workOrder("WO-STALE")], error: null });
      await olderRefresh.promise;
    });

    expect(screen.getByText(/WO-LATEST/)).toBeInTheDocument();
    expect(screen.queryByText(/WO-STALE/)).not.toBeInTheDocument();
  });
});
