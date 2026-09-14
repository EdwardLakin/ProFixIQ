import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareAppointmentPartsRequestMock = vi.fn();

vi.mock(
  "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest",
  () => ({
    prepareAppointmentPartsRequest: prepareAppointmentPartsRequestMock,
  }),
);

type Row = Record<string, unknown>;

type QueryNode = {
  select: (columns: string) => QueryNode;
  eq: (column: string, value: unknown) => QueryNode;
  not: (column: string, op: string, value: unknown) => QueryNode;
  is: (column: string, value: unknown) => QueryNode;
  in: (column: string, values: unknown[]) => QueryNode;
  gte: (column: string, value: string) => QueryNode;
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

describe("syncAppointmentPartsPreparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("evaluates each candidate line and aggregates eligible/executed counts", async () => {
    const { supabase } = createSupabase({
      bookingPages: [[{ work_order_id: "wo-1" }, { work_order_id: "wo-2" }]],
      linePages: [
        [
          { id: "line-1", work_order_id: "wo-1", menu_item_id: "mri-1", voided_at: null },
          { id: "line-2", work_order_id: "wo-2", menu_item_id: "mri-2", voided_at: null },
        ],
      ],
    });
    prepareAppointmentPartsRequestMock
      .mockResolvedValueOnce({ eligible: true, executed: true, menuRepairItemId: "mri-1", items: [], requestId: "r1" })
      .mockResolvedValueOnce({ eligible: false, reason: "not compatible" });

    const { syncAppointmentPartsPreparation } = await import(
      "@/features/operations/server/syncAppointmentPartsPreparation"
    );
    const summary = await syncAppointmentPartsPreparation({
      supabase: supabase as never,
      shopId: "shop-1",
      now: new Date("2026-09-14T12:00:00.000Z"),
    });

    expect(summary).toEqual({ shopId: "shop-1", evaluated: 2, eligible: 1, executed: 1, errors: [] });
    expect(prepareAppointmentPartsRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop-1", workOrderLineId: "line-1" }),
    );
    expect(prepareAppointmentPartsRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop-1", workOrderLineId: "line-2" }),
    );
  });

  it("captures a per-line failure as an error without aborting the rest of the sweep", async () => {
    const { supabase } = createSupabase({
      bookingPages: [[{ work_order_id: "wo-1" }]],
      linePages: [[{ id: "line-1", work_order_id: "wo-1", menu_item_id: "mri-1", voided_at: null }]],
    });
    prepareAppointmentPartsRequestMock.mockRejectedValue(new Error("boom"));

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
    expect(prepareAppointmentPartsRequestMock).not.toHaveBeenCalled();
  });

  it("dedupes booking-linked work order ids before querying lines", async () => {
    const { supabase, linesQuery } = createSupabase({
      bookingPages: [[{ work_order_id: "wo-1" }, { work_order_id: "wo-1" }]],
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
});
