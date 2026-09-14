import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAppointmentPartsCandidateMock = vi.fn();
const finalizeAppointmentPartsRequestMock = vi.fn();
const buildPartsReadinessForMenuRepairItemsMock = vi.fn();

vi.mock(
  "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest",
  () => ({
    resolveAppointmentPartsCandidate: resolveAppointmentPartsCandidateMock,
    finalizeAppointmentPartsRequest: finalizeAppointmentPartsRequestMock,
  }),
);
vi.mock("@/features/operations/server/appointmentPreparation/buildPartsReadiness", () => ({
  buildPartsReadinessForMenuRepairItems: buildPartsReadinessForMenuRepairItemsMock,
}));

type Row = Record<string, unknown>;

type QueryNode = {
  select: (columns: string) => QueryNode;
  eq: (column: string, value: unknown) => QueryNode;
  not: (column: string, op: string, value: unknown) => QueryNode;
  is: (column: string, value: unknown) => QueryNode;
  in: (column: string, values: unknown[]) => QueryNode;
  gte: (column: string, value: string) => QueryNode;
  lt: (column: string, value: string) => QueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => QueryNode;
  range: (from: number, to: number) => Promise<{ data: Row[] | null; error: { message: string } | null }>;
};

function createPagedQuery(pages: Row[][], error: { message: string } | null = null) {
  let pageIndex = 0;
  const node: QueryNode = {
    select: vi.fn(() => node),
    eq: vi.fn(() => node),
    not: vi.fn(() => node),
    is: vi.fn(() => node),
    in: vi.fn(() => node),
    gte: vi.fn(() => node),
    lt: vi.fn(() => node),
    order: vi.fn(() => node),
    range: vi.fn(() => {
      if (error) return Promise.resolve({ data: null, error });
      const page = pages[pageIndex] ?? [];
      pageIndex += 1;
      return Promise.resolve({ data: page, error: null });
    }),
  };
  return node;
}

function createSupabase(input: {
  bookingPages: Row[][];
  bookingsError?: { message: string } | null;
  linePages: Row[][];
}) {
  const bookingsQuery = createPagedQuery(input.bookingPages, input.bookingsError ?? null);
  const linesQuery = createPagedQuery(input.linePages);
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") return bookingsQuery;
      if (table === "work_order_lines") return linesQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { supabase, bookingsQuery, linesQuery };
}

function candidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    line: { id: "line-1", shop_id: "shop-1", work_order_id: "wo-1", vehicle_id: null, voided_at: null },
    workOrder: { id: "wo-1", shop_id: "shop-1", vehicle_id: "veh-1", archived_at: null },
    menuRepairItem: { id: "mri-1", shop_id: "shop-1", name: "Brake Job", is_active: true },
    ...overrides,
  };
}

describe("syncAppointmentPartsPreparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue({
      readinessByMenuRepairItemId: new Map(),
      error: null,
    });
  });

  it("returns zero evaluated with no bookings and does not query lines", async () => {
    const { supabase, linesQuery } = createSupabase({ bookingPages: [[]], linePages: [[]] });
    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    const summary = await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary).toEqual({ shopId: "shop-1", evaluated: 0, eligible: 0, executed: 0, errors: [] });
    expect(linesQuery.select).not.toHaveBeenCalled();
  });

  it("excludes cancelled/completed bookings before collecting candidate work orders", async () => {
    const { supabase, linesQuery } = createSupabase({
      bookingPages: [[
        { work_order_id: "wo-1", status: "scheduled" },
        { work_order_id: "wo-2", status: "cancelled" },
        { work_order_id: "wo-3", status: "completed" },
      ]],
      linePages: [[]],
    });
    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(linesQuery.in).toHaveBeenCalledWith("work_order_id", ["wo-1"]);
  });

  it("resolves each candidate line, batches parts readiness once, and finalizes each candidate", async () => {
    const { supabase } = createSupabase({
      bookingPages: [[{ work_order_id: "wo-1", status: "scheduled" }]],
      linePages: [[
        { id: "line-1", work_order_id: "wo-1", voided_at: null },
        { id: "line-2", work_order_id: "wo-1", voided_at: null },
      ]],
    });
    resolveAppointmentPartsCandidateMock
      .mockResolvedValueOnce({ eligible: true, candidate: candidate({ line: { id: "line-1" }, menuRepairItem: { id: "mri-1" } }) })
      .mockResolvedValueOnce({ eligible: false, reason: "no vehicle" });
    finalizeAppointmentPartsRequestMock.mockResolvedValueOnce({
      eligible: true,
      executed: true,
      menuRepairItemId: "mri-1",
      items: [],
      requestId: "r1",
    });

    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    const summary = await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary).toEqual({ shopId: "shop-1", evaluated: 2, eligible: 1, executed: 1, errors: [] });
    expect(resolveAppointmentPartsCandidateMock).toHaveBeenCalledTimes(2);
    expect(buildPartsReadinessForMenuRepairItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop-1", menuRepairItemIds: ["mri-1"] }),
    );
    expect(finalizeAppointmentPartsRequestMock).toHaveBeenCalledTimes(1);
  });

  it("only resolves parts readiness once even when multiple candidates share the same menu repair item", async () => {
    const { supabase } = createSupabase({
      bookingPages: [[{ work_order_id: "wo-1", status: "scheduled" }]],
      linePages: [[
        { id: "line-1", work_order_id: "wo-1", voided_at: null },
        { id: "line-2", work_order_id: "wo-1", voided_at: null },
      ]],
    });
    resolveAppointmentPartsCandidateMock
      .mockResolvedValueOnce({ eligible: true, candidate: candidate({ line: { id: "line-1" }, menuRepairItem: { id: "mri-shared" } }) })
      .mockResolvedValueOnce({ eligible: true, candidate: candidate({ line: { id: "line-2" }, menuRepairItem: { id: "mri-shared" } }) });
    finalizeAppointmentPartsRequestMock.mockResolvedValue({
      eligible: true,
      executed: false,
      menuRepairItemId: "mri-shared",
      items: [],
    });

    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(buildPartsReadinessForMenuRepairItemsMock).toHaveBeenCalledTimes(1);
    expect(buildPartsReadinessForMenuRepairItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ menuRepairItemIds: ["mri-shared"] }),
    );
  });

  it("captures a per-line resolve failure as an error without aborting the rest of the sweep", async () => {
    const { supabase } = createSupabase({
      bookingPages: [[{ work_order_id: "wo-1", status: "scheduled" }]],
      linePages: [[{ id: "line-1", work_order_id: "wo-1", voided_at: null }]],
    });
    resolveAppointmentPartsCandidateMock.mockRejectedValue(new Error("boom"));

    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    const summary = await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.errors).toEqual([expect.stringContaining("boom")]);
    expect(summary.evaluated).toBe(1);
  });

  it("captures a readiness-batch error and still finalizes candidates with whatever came back", async () => {
    const { supabase } = createSupabase({
      bookingPages: [[{ work_order_id: "wo-1", status: "scheduled" }]],
      linePages: [[{ id: "line-1", work_order_id: "wo-1", voided_at: null }]],
    });
    resolveAppointmentPartsCandidateMock.mockResolvedValueOnce({
      eligible: true,
      candidate: candidate({ menuRepairItem: { id: "mri-1" } }),
    });
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue({
      readinessByMenuRepairItemId: new Map(),
      error: "parts unavailable",
    });
    finalizeAppointmentPartsRequestMock.mockResolvedValue({
      eligible: false,
      reason: "Mapped menu repair item has no required parts defined.",
    });

    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    const summary = await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.errors).toEqual(["parts unavailable"]);
  });

  it("captures a per-candidate finalize failure as an error without aborting the rest of the sweep", async () => {
    const { supabase } = createSupabase({
      bookingPages: [[{ work_order_id: "wo-1", status: "scheduled" }]],
      linePages: [[{ id: "line-1", work_order_id: "wo-1", voided_at: null }]],
    });
    resolveAppointmentPartsCandidateMock.mockResolvedValueOnce({
      eligible: true,
      candidate: candidate({ menuRepairItem: { id: "mri-1" } }),
    });
    finalizeAppointmentPartsRequestMock.mockRejectedValue(new Error("rpc exploded"));

    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    const summary = await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.errors).toEqual([expect.stringContaining("rpc exploded")]);
  });

  it("surfaces a bookings query failure without throwing", async () => {
    const { supabase } = createSupabase({
      bookingPages: [[]],
      bookingsError: { message: "db unavailable" },
      linePages: [[]],
    });
    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    const summary = await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary.errors).toEqual(["db unavailable"]);
    expect(resolveAppointmentPartsCandidateMock).not.toHaveBeenCalled();
  });

  it("dedupes booking-linked work order ids before querying lines", async () => {
    const { supabase, linesQuery } = createSupabase({
      bookingPages: [[
        { work_order_id: "wo-1", status: "scheduled" },
        { work_order_id: "wo-1", status: "scheduled" },
      ]],
      linePages: [[]],
    });
    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(linesQuery.in).toHaveBeenCalledWith("work_order_id", ["wo-1"]);
  });

  it("bounds the booking window with both a lower and an upper limit", async () => {
    const { supabase, bookingsQuery } = createSupabase({ bookingPages: [[]], linePages: [[]] });
    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(bookingsQuery.gte).toHaveBeenCalledWith("starts_at", expect.any(String));
    expect(bookingsQuery.lt).toHaveBeenCalledWith("starts_at", expect.any(String));
  });
});
