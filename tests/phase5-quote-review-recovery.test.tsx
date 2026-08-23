// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TabsProvider,
  useTabs,
} from "@/features/shared/components/tabs/TabsProvider";
import QuoteReviewView from "@/features/work-orders/quote-review/QuoteReviewView";

const WORK_ORDER_ID = "e38e395a-e9c9-496e-8bc0-ac81cc1dcc4d";
const SIBLING_WORK_ORDER_ID = "00000000-0000-4000-8000-000000000099";
const SHOP_ID = "00000000-0000-4000-8000-000000000002";
const QUOTE_LINE_ID = "00000000-0000-4000-8000-000000000003";
const QUOTE_ROUTE = `/quote-review/${WORK_ORDER_ID}`;

type QueryResult = { data: unknown; error: unknown };

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  workOrderRequestCount: 0,
  workOrderResults: [] as Array<Promise<QueryResult>>,
}));

const workOrderResult: QueryResult = {
  data: {
    id: WORK_ORDER_ID,
    shop_id: SHOP_ID,
    customer_id: null,
    custom_id: "WO-000014",
    status: "awaiting_approval",
    shop_supplies_enabled_override: null,
    shop_supplies_amount_override: null,
  },
  error: null,
};

function tableResult(table: string): QueryResult {
  if (table === "shops") {
    return { data: { id: SHOP_ID, labor_rate: 140 }, error: null };
  }
  if (table === "work_order_quote_lines") {
    return {
      data: [
        {
          id: QUOTE_LINE_ID,
          shop_id: SHOP_ID,
          work_order_id: WORK_ORDER_ID,
          description: "QA brake vibration diagnosis",
          labor_hours: 1.2,
          labor_total: 168,
          parts_total: 0,
          subtotal: 168,
          grand_total: 168,
          stage: "ready_to_send",
          status: "quoted",
          metadata: { labor_rate: 140 },
          parts: [],
          created_at: "2026-08-21T18:00:00.000Z",
        },
      ],
      error: null,
    };
  }
  if (
    table === "work_order_lines" ||
    table === "part_requests" ||
    table === "part_request_items"
  ) {
    return { data: [], error: null };
  }
  throw new Error(`Unexpected table: ${table}`);
}

function queryBuilder(result: Promise<QueryResult>) {
  const builder: Record<string, unknown> = {};
  for (const method of ["abortSignal", "eq", "in", "order", "select"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => result);
  builder.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => result.then(onFulfilled, onRejected);
  return builder;
}

vi.mock("next/navigation", () => ({
  usePathname: () => QUOTE_ROUTE,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    from: (table: string) => {
      if (table === "work_orders") {
        mocks.workOrderRequestCount += 1;
        return queryBuilder(
          mocks.workOrderResults.shift() ?? Promise.resolve(workOrderResult),
        );
      }
      return queryBuilder(Promise.resolve(tableResult(table)));
    },
  }),
}));

function OpenWorkProbe() {
  const { activeKey, tabs } = useTabs();
  return (
    <output data-testid="open-work-state">
      {JSON.stringify({
        activeKey,
        tabs: tabs.map(({ href, key, title }) => ({ href, key, title })),
      })}
    </output>
  );
}

function quoteReview() {
  return (
    <TabsProvider userId="phase-5-user">
      <OpenWorkProbe />
      <QuoteReviewView workOrderId={WORK_ORDER_ID} />
    </TabsProvider>
  );
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.workOrderRequestCount = 0;
  mocks.workOrderResults.length = 0;
  mocks.fetch.mockResolvedValue(response({ insights: [] }));
  vi.stubGlobal("fetch", mocks.fetch);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Phase 5 quote-review recovery", () => {
  it("hydrates persisted quote-review markup and loads again after a fresh mount", async () => {
    window.localStorage.setItem(
      "open-work:v2:phase-5-user",
      JSON.stringify({
        version: 2,
        tabs: [
          {
            key: `work-order:${WORK_ORDER_ID}`,
            href: QUOTE_ROUTE,
            title: "WO-000014 · saved quote",
            kind: "work-order",
            lastOpenedAt: 1,
          },
          {
            key: `work-order:${SIBLING_WORK_ORDER_ID}`,
            href: `/work-orders/${SIBLING_WORK_ORDER_ID}`,
            title: "Saved sibling work order",
            kind: "work-order",
            lastOpenedAt: 2,
          },
        ],
        activeKey: `work-order:${WORK_ORDER_ID}`,
      }),
    );

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = renderToString(quoteReview());
    document.body.appendChild(container);

    const hydrated = render(quoteReview(), { container, hydrate: true });

    expect(await screen.findByText("Advisor quote review")).toBeVisible();
    expect(screen.getByText("WO-000014")).toBeVisible();
    expect(screen.getByText(/Canonical quote lines: 1/)).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("open-work-state")).toHaveTextContent(
        `"activeKey":"work-order:${WORK_ORDER_ID}"`,
      ),
    );
    expect(screen.getByTestId("open-work-state")).toHaveTextContent(
      `"key":"work-order:${SIBLING_WORK_ORDER_ID}"`,
    );
    expect(screen.getByTestId("open-work-state")).toHaveTextContent(
      '"title":"Saved sibling work order"',
    );
    expect(
      consoleError.mock.calls.some((call) =>
        /hydration|did not match|server html/i.test(call.map(String).join(" ")),
      ),
    ).toBe(false);

    hydrated.unmount();
    container.remove();
    render(quoteReview());

    expect(await screen.findByText("Advisor quote review")).toBeVisible();
    await waitFor(() => expect(mocks.workOrderRequestCount).toBe(2));
    expect(screen.getByTestId("open-work-state")).toHaveTextContent(
      `"activeKey":"work-order:${WORK_ORDER_ID}"`,
    );
    expect(screen.getByTestId("open-work-state")).toHaveTextContent(
      `"key":"work-order:${SIBLING_WORK_ORDER_ID}"`,
    );
  });

  it("times out a hung first load before retrying canonical data", async () => {
    vi.useFakeTimers();
    mocks.workOrderResults.push(
      new Promise<QueryResult>(() => {}),
      Promise.resolve(workOrderResult),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(quoteReview());

    expect(screen.getByText("Loading…")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(
      screen.getByRole("heading", { name: "Still waiting for data" }),
    ).toBeVisible();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Advisor quote review")).toBeVisible();
    expect(screen.getByText("WO-000014")).toBeVisible();
    expect(mocks.workOrderRequestCount).toBe(2);
  });
});
