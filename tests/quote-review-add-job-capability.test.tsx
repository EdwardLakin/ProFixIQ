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

import QuoteReviewView from "@/features/work-orders/quote-review/QuoteReviewView";

const WORK_ORDER_ID = "e38e395a-e9c9-496e-8bc0-ac81cc1dcc4d";
const SHOP_ID = "00000000-0000-4000-8000-000000000002";
const AUTH_USER_ID = "00000000-0000-4000-8000-000000000010";

type ProfileMode = "native" | "imported" | "missing" | "error";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

const mocks = vi.hoisted(() => ({
  authMode: "ok" as "ok" | "missing" | "error",
  fetch: vi.fn(),
  getUser: vi.fn(),
  profileEq: vi.fn(),
  profileMode: "native" as ProfileMode,
  profileRole: "manager",
  push: vi.fn(),
  updateActiveTab: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => `/quote-review/${WORK_ORDER_ID}`,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/features/shared/components/tabs/TabsProvider", () => ({
  useTabs: () => ({ updateActiveTab: mocks.updateActiveTab }),
}));

vi.mock("@/features/work-orders/components/workorders/AddJobModal", () => ({
  default: (props: { isOpen: boolean; workOrderId: string }) =>
    props.isOpen ? (
      <div
        aria-label="Add New Job Line"
        data-work-order-id={props.workOrderId}
        role="dialog"
      />
    ) : null,
}));

function profileResult(input: {
  filters: Map<string, unknown>;
  orExpression: string | null;
}): QueryResult {
  if (mocks.profileMode === "error") {
    return { data: null, error: { message: "Profile lookup failed" } };
  }
  if (mocks.profileMode === "missing") {
    return { data: null, error: null };
  }

  const matchesNative =
    input.filters.get("id") === AUTH_USER_ID ||
    input.orExpression?.includes(`id.eq.${AUTH_USER_ID}`) === true;
  const matchesImported =
    input.filters.get("user_id") === AUTH_USER_ID ||
    input.orExpression?.includes(`user_id.eq.${AUTH_USER_ID}`) === true;

  if (
    (mocks.profileMode === "native" && matchesNative) ||
    (mocks.profileMode === "imported" && matchesImported)
  ) {
    return {
      data: {
        id:
          mocks.profileMode === "native"
            ? AUTH_USER_ID
            : "00000000-0000-4000-8000-000000000011",
        role: mocks.profileRole,
        shop_id: SHOP_ID,
        user_id: mocks.profileMode === "imported" ? AUTH_USER_ID : null,
      },
      error: null,
    };
  }

  return { data: null, error: null };
}

function tableResult(table: string): QueryResult {
  if (table === "work_orders") {
    return {
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
  }
  if (table === "shops") {
    return { data: { id: SHOP_ID, labor_rate: 140 }, error: null };
  }
  if (
    table === "work_order_quote_lines" ||
    table === "work_order_lines" ||
    table === "part_requests" ||
    table === "part_request_items" ||
    table === "parts"
  ) {
    return { data: [], error: null };
  }
  throw new Error(`Unexpected table: ${table}`);
}

function queryBuilder(table: string) {
  const filters = new Map<string, unknown>();
  let orExpression: string | null = null;
  const builder: Record<string, unknown> = {};

  for (const method of ["abortSignal", "in", "limit", "order", "select"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.eq = vi.fn((column: string, value: unknown) => {
    filters.set(column, value);
    if (table === "profiles") mocks.profileEq(column, value);
    return builder;
  });
  builder.or = vi.fn((expression: string) => {
    orExpression = expression;
    return builder;
  });

  const result = () =>
    table === "profiles"
      ? profileResult({ filters, orExpression })
      : tableResult(table);
  builder.maybeSingle = vi.fn(async () => result());
  builder.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result()).then(onFulfilled, onRejected);

  return builder;
}

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => queryBuilder(table),
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function renderQuoteReview() {
  render(<QuoteReviewView workOrderId={WORK_ORDER_ID} />);
  expect(await screen.findByText("Advisor quote review")).toBeVisible();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authMode = "ok";
  mocks.profileMode = "native";
  mocks.profileRole = "manager";
  mocks.getUser.mockImplementation(async () => {
    if (mocks.authMode === "error") throw new Error("Auth lookup failed");
    return {
      data: {
        user: mocks.authMode === "missing" ? null : { id: AUTH_USER_ID },
      },
      error:
        mocks.authMode === "missing"
          ? { message: "Authentication unavailable" }
          : null,
    };
  });
  mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/quote-history-insights")) {
      return jsonResponse({ insights: [] });
    }
    if (url.endsWith("/customer-pricing")) {
      return jsonResponse({});
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Quote Review Add Job capability", () => {
  it.each(["manager", "advisor"])(
    "shows Quick Add and opens the modal for a native-id %s",
    async (role) => {
      mocks.profileMode = "native";
      mocks.profileRole = role;

      await renderQuoteReview();

      const addButton = await screen.findByRole("button", {
        name: /add job line/i,
      });
      expect(mocks.getUser).toHaveBeenCalledOnce();
      expect(mocks.profileEq).toHaveBeenCalledWith("id", AUTH_USER_ID);
      expect(
        screen.queryByRole("dialog", { name: "Add New Job Line" }),
      ).not.toBeInTheDocument();

      fireEvent.click(addButton);

      expect(
        await screen.findByRole("dialog", { name: "Add New Job Line" }),
      ).toHaveAttribute("data-work-order-id", WORK_ORDER_ID);
    },
  );

  it("shows Quick Add for an imported manager linked through profiles.user_id", async () => {
    mocks.profileMode = "imported";
    mocks.profileRole = "manager";

    await renderQuoteReview();

    const addButton = await screen.findByRole("button", {
      name: /add job line/i,
    });
    expect(mocks.profileEq).toHaveBeenNthCalledWith(1, "id", AUTH_USER_ID);
    expect(mocks.profileEq).toHaveBeenNthCalledWith(2, "user_id", AUTH_USER_ID);

    fireEvent.click(addButton);
    expect(
      await screen.findByRole("dialog", { name: "Add New Job Line" }),
    ).toBeVisible();
  });

  it.each(["parts", "mechanic"])(
    "hides Quick Add and the modal from %s",
    async (role) => {
      mocks.profileRole = role;

      await renderQuoteReview();
      await waitFor(() => expect(mocks.profileEq).toHaveBeenCalledOnce());

      expect(
        screen.queryByRole("button", { name: /add job line/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Add New Job Line" }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    ["missing auth", "missing", "native"],
    ["auth lookup error", "error", "native"],
    ["missing profile", "ok", "missing"],
    ["profile lookup error", "ok", "error"],
  ] as const)("fails closed on %s", async (_label, authMode, profileMode) => {
    mocks.authMode = authMode;
    mocks.profileMode = profileMode;

    await renderQuoteReview();
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalledOnce());
    if (authMode === "ok") {
      const expectedLookups = profileMode === "missing" ? 2 : 1;
      await waitFor(() =>
        expect(mocks.profileEq).toHaveBeenCalledTimes(expectedLookups),
      );
    }

    expect(
      screen.queryByRole("button", { name: /add job line/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Add New Job Line" }),
    ).not.toBeInTheDocument();
  });
});
