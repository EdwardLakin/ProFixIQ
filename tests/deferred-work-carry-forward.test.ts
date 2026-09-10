import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  resolveWorkOrderFinancialAccess: vi.fn(),
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));
vi.mock(
  "@/features/work-orders/workspace/server/workOrderFinancialAuthorization",
  () => ({
    resolveWorkOrderFinancialAccess: mocks.resolveWorkOrderFinancialAccess,
  }),
);

import { GET } from "../app/api/work-orders/deferred-history/route";

type Row = Record<string, unknown>;

const SHOP = "73200000-0000-4000-8000-000000000001";
const OTHER_SHOP = "73200000-0000-4000-8000-000000000002";
const VEHICLE = "73300000-0000-4000-8000-000000000001";

/**
 * Minimal PostgREST-shaped double. It honours eq/in/range so the route's real
 * shop scoping, id chunking and pagination run against it rather than being
 * asserted as source text.
 */
function createAdmin(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const eqFilters: Record<string, unknown> = {};
    const inFilters: Record<string, string[]> = {};
    let start = 0;
    let end = Number.MAX_SAFE_INTEGER;

    const resolve = () => {
      const rows = (tables[table] ?? []).filter(
        (row) =>
          Object.entries(eqFilters).every(([key, value]) => row[key] === value) &&
          Object.entries(inFilters).every(([key, values]) =>
            values.includes(String(row[key] ?? "")),
          ),
      );
      return { data: rows.slice(start, end + 1), error: null };
    };

    const api: Record<string, unknown> = {
      select: () => api,
      order: () => api,
      eq: (column: string, value: unknown) => {
        eqFilters[column] = value;
        return api;
      },
      in: (column: string, values: string[]) => {
        inFilters[column] = values;
        return api;
      },
      limit: (count: number) => {
        end = count - 1;
        return api;
      },
      range: (rangeStart: number, rangeEnd: number) => {
        start = rangeStart;
        end = rangeEnd;
        return api;
      },
      maybeSingle: async () => {
        const { data } = resolve();
        return { data: data[0] ?? null, error: null };
      },
      then: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled),
    };

    return api;
  };

  return { from };
}

function quote(overrides: Row = {}): Row {
  return {
    id: "quote-1",
    shop_id: SHOP,
    work_order_id: "wo-1",
    work_order_line_id: null,
    source_work_order_line_id: "line-1",
    source_row_id: null,
    vehicle_id: VEHICLE,
    title: "Replace front lower ball joints",
    description: "Replace front lower ball joints",
    status: "declined",
    stage: "customer_declined",
    decision: "declined",
    decline_reason: null,
    defer_reason: null,
    labor_total: 300,
    parts_total: 700,
    subtotal: 1000,
    tax_total: 50,
    grand_total: 1050,
    metadata: null,
    declined_at: "2026-08-01T18:00:00Z",
    deferred_at: null,
    created_at: "2026-08-01T17:00:00Z",
    updated_at: "2026-08-01T18:00:00Z",
    ...overrides,
  };
}

function line(overrides: Row = {}): Row {
  return {
    id: "line-1",
    shop_id: SHOP,
    work_order_id: "wo-1",
    complaint: "Front lower ball joint play",
    description: "Replace front lower ball joints",
    status: "on_hold",
    voided_at: null,
    ...overrides,
  };
}

function workOrder(overrides: Row = {}): Row {
  return {
    id: "wo-1",
    shop_id: SHOP,
    custom_id: "DEF-SOURCE-1",
    source_intake_id: null,
    external_id: null,
    archived_at: null,
    ...overrides,
  };
}

async function callRoute(
  tables: Record<string, Row[]>,
  options: { canViewSellPricing?: boolean } = {},
) {
  mocks.requireShopScopedApiAccess.mockResolvedValue({
    ok: true,
    profile: { id: "profile-1", shop_id: SHOP },
    supabase: {},
  });
  mocks.resolveWorkOrderFinancialAccess.mockResolvedValue({
    error: null,
    access: { canViewSellPricing: options.canViewSellPricing ?? true },
  });
  mocks.createAdminSupabase.mockReturnValue(createAdmin(tables));

  const response = await GET(
    new Request(
      `http://localhost/api/work-orders/deferred-history?vehicleId=${VEHICLE}`,
    ),
  );

  return {
    status: response.status,
    body: (await response.json()) as {
      ok?: boolean;
      items?: Array<Record<string, unknown>>;
      canViewPricing?: boolean;
    },
  };
}

const baseTables = () => ({
  vehicles: [{ id: VEHICLE, shop_id: SHOP }],
  work_order_quote_lines: [quote()],
  work_order_lines: [line()],
  work_orders: [workOrder()],
});

describe("create-work-order deferred history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an unresolved prior recommendation for the selected vehicle", async () => {
    const { status, body } = await callRoute(baseTables());

    expect(status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items?.[0]).toMatchObject({
      rootLineId: "line-1",
      quoteLineId: "quote-1",
      workOrderNumber: "DEF-SOURCE-1",
      decision: "declined",
      title: "Replace front lower ball joints",
      complaint: "Front lower ball joint play",
    });
  });

  it("excludes history belonging to another shop", async () => {
    const tables = baseTables();
    tables.work_order_quote_lines = [
      quote({ id: "quote-other", shop_id: OTHER_SHOP }),
    ];

    const { body } = await callRoute(tables);

    expect(body.items).toEqual([]);
  });

  it("redacts every sell-price total when the actor cannot view sell pricing", async () => {
    const { body } = await callRoute(baseTables(), {
      canViewSellPricing: false,
    });

    expect(body.canViewPricing).toBe(false);
    expect(body.items?.[0]).toMatchObject({
      laborTotal: null,
      partsTotal: null,
      taxTotal: null,
      grandTotal: null,
    });
  });

  it("exposes sell-price totals when the actor can view sell pricing", async () => {
    const { body } = await callRoute(baseTables(), { canViewSellPricing: true });

    expect(body.canViewPricing).toBe(true);
    expect(body.items?.[0]).toMatchObject({
      laborTotal: 300,
      partsTotal: 700,
      taxTotal: 50,
      grandTotal: 1050,
    });
  });

  it("excludes imported history using the canonical source_intake_id marker", async () => {
    const tables = baseTables();
    tables.work_orders = [
      workOrder({ source_intake_id: "73700000-0000-4000-8000-000000000001" }),
    ];

    const { body } = await callRoute(tables);

    expect(body.items).toEqual([]);
  });

  it("excludes portal quote placeholders and archived source work orders", async () => {
    const portal = baseTables();
    portal.work_orders = [workOrder({ external_id: "portal_quote:runtime-1" })];
    expect((await callRoute(portal)).body.items).toEqual([]);

    const archived = baseTables();
    archived.work_orders = [
      workOrder({ archived_at: "2026-08-05T00:00:00Z" }),
    ];
    expect((await callRoute(archived)).body.items).toEqual([]);
  });

  it("treats a completed source repair as resolved and stops carrying it", async () => {
    const tables = baseTables();
    tables.work_order_lines = [line({ status: "completed" })];

    const { body } = await callRoute(tables);

    expect(body.items).toEqual([]);
  });

  it("reduces one recommendation root to its newest state before filtering", async () => {
    const tables = baseTables();
    // A newer approved re-quote on the same root must hide the older decline
    // rather than the older decline masking the newer decision.
    tables.work_order_quote_lines = [
      quote(),
      quote({
        id: "quote-2",
        status: "approved",
        stage: "customer_approved",
        decision: "approved",
        declined_at: null,
        updated_at: "2026-08-09T18:00:00Z",
      }),
    ];

    const { body } = await callRoute(tables);

    expect(body.items).toEqual([]);
  });

  it("keeps the newest decision when the latest state is still declined", async () => {
    const tables = baseTables();
    tables.work_order_quote_lines = [
      quote(),
      quote({
        id: "quote-2",
        decline_reason: "Customer deferred again",
        declined_at: "2026-08-09T18:00:00Z",
        updated_at: "2026-08-09T18:00:00Z",
      }),
    ];

    const { body } = await callRoute(tables);

    expect(body.items).toHaveLength(1);
    expect(body.items?.[0]).toMatchObject({
      quoteLineId: "quote-2",
      decisionAt: "2026-08-09T18:00:00Z",
    });
  });
});
