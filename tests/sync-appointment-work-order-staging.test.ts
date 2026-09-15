import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAppointmentWorkOrderStagingCandidateMock = vi.fn();
const finalizeAppointmentWorkOrderStagingMock = vi.fn();
const clearAppointmentWorkOrderStagingMock = vi.fn();

vi.mock(
  "@/features/operations/server/appointmentWorkOrderStaging/stageAppointmentWorkOrderLines",
  () => ({
    resolveAppointmentWorkOrderStagingCandidate:
      resolveAppointmentWorkOrderStagingCandidateMock,
    finalizeAppointmentWorkOrderStaging: finalizeAppointmentWorkOrderStagingMock,
    clearAppointmentWorkOrderStaging: clearAppointmentWorkOrderStagingMock,
  }),
);

const MODULE_PATH = "@/features/operations/server/syncAppointmentWorkOrderStaging";
const SHOP_ID = "shop-1";

type Row = Record<string, unknown>;

type QueryNode = {
  select: (columns: string) => QueryNode;
  eq: (column: string, value: unknown) => QueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => QueryNode;
  range: (
    from: number,
    to: number,
  ) => Promise<{ data: Row[] | null; error: { message: string } | null }>;
};

function createPagedQuery(pages: Row[][], error: { message: string } | null = null) {
  let pageIndex = 0;
  const node: QueryNode = {
    select: vi.fn(() => node),
    eq: vi.fn(() => node),
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
  preparationPages: Row[][];
  preparationsError?: { message: string } | null;
  stagedPages?: Row[][];
}) {
  const preparationsQuery = createPagedQuery(
    input.preparationPages,
    input.preparationsError ?? null,
  );
  const stagedQuery = createPagedQuery(input.stagedPages ?? [[]]);
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "appointment_preparations") return preparationsQuery;
      if (table === "appointment_work_order_staging") return stagedQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { supabase, preparationsQuery, stagedQuery };
}

function preparationRow(overrides: Partial<Row> = {}): Row {
  return {
    booking_id: "booking-1",
    status: "active",
    matched_menu_items: [],
    ...overrides,
  };
}

describe("syncAppointmentWorkOrderStaging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("evaluates every active preparation and finalizes each eligible candidate", async () => {
    const { supabase } = createSupabase({
      preparationPages: [[preparationRow({ booking_id: "booking-1" })]],
    });
    resolveAppointmentWorkOrderStagingCandidateMock.mockReturnValue({
      eligible: true,
      candidate: { bookingId: "booking-1", shopId: SHOP_ID, eligibleLines: [] },
    });
    finalizeAppointmentWorkOrderStagingMock.mockResolvedValue({ executed: true });

    const { syncAppointmentWorkOrderStaging } = await import(MODULE_PATH);
    const result = await syncAppointmentWorkOrderStaging({
      supabase: supabase as never,
      shopId: SHOP_ID,
    });

    expect(result.evaluated).toBe(1);
    expect(result.eligible).toBe(1);
    expect(result.executed).toBe(1);
    expect(result.errors).toEqual([]);
    expect(finalizeAppointmentWorkOrderStagingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: { bookingId: "booking-1", shopId: SHOP_ID, eligibleLines: [] },
      }),
    );
  });

  it("does not finalize an ineligible candidate", async () => {
    const { supabase } = createSupabase({
      preparationPages: [[preparationRow({ booking_id: "booking-1" })]],
    });
    resolveAppointmentWorkOrderStagingCandidateMock.mockReturnValue({
      eligible: false,
      reason: "not ready",
    });

    const { syncAppointmentWorkOrderStaging } = await import(MODULE_PATH);
    const result = await syncAppointmentWorkOrderStaging({
      supabase: supabase as never,
      shopId: SHOP_ID,
    });

    expect(result.eligible).toBe(0);
    expect(result.executed).toBe(0);
    expect(finalizeAppointmentWorkOrderStagingMock).not.toHaveBeenCalled();
  });

  it("clears a previously staged booking that is no longer eligible this sweep", async () => {
    const { supabase } = createSupabase({
      preparationPages: [[preparationRow({ booking_id: "booking-1" })]],
      stagedPages: [[{ booking_id: "booking-1" }, { booking_id: "booking-stale" }]],
    });
    resolveAppointmentWorkOrderStagingCandidateMock.mockReturnValue({
      eligible: true,
      candidate: { bookingId: "booking-1", shopId: SHOP_ID, eligibleLines: [] },
    });
    finalizeAppointmentWorkOrderStagingMock.mockResolvedValue({ executed: true });
    clearAppointmentWorkOrderStagingMock.mockResolvedValue(undefined);

    const { syncAppointmentWorkOrderStaging } = await import(MODULE_PATH);
    const result = await syncAppointmentWorkOrderStaging({
      supabase: supabase as never,
      shopId: SHOP_ID,
    });

    expect(result.cleared).toBe(1);
    expect(clearAppointmentWorkOrderStagingMock).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_ID, bookingIds: ["booking-stale"] }),
    );
  });

  it("does not call clear when nothing is stale", async () => {
    const { supabase } = createSupabase({
      preparationPages: [[preparationRow({ booking_id: "booking-1" })]],
      stagedPages: [[{ booking_id: "booking-1" }]],
    });
    resolveAppointmentWorkOrderStagingCandidateMock.mockReturnValue({
      eligible: true,
      candidate: { bookingId: "booking-1", shopId: SHOP_ID, eligibleLines: [] },
    });
    finalizeAppointmentWorkOrderStagingMock.mockResolvedValue({ executed: true });

    const { syncAppointmentWorkOrderStaging } = await import(MODULE_PATH);
    const result = await syncAppointmentWorkOrderStaging({
      supabase: supabase as never,
      shopId: SHOP_ID,
    });

    expect(result.cleared).toBe(0);
    expect(clearAppointmentWorkOrderStagingMock).not.toHaveBeenCalled();
  });

  it("collects a per-booking error without aborting the rest of the sweep", async () => {
    const { supabase } = createSupabase({
      preparationPages: [
        [
          preparationRow({ booking_id: "booking-bad" }),
          preparationRow({ booking_id: "booking-good" }),
        ],
      ],
    });
    resolveAppointmentWorkOrderStagingCandidateMock.mockReturnValue({
      eligible: true,
      candidate: { bookingId: "booking-x", shopId: SHOP_ID, eligibleLines: [] },
    });
    finalizeAppointmentWorkOrderStagingMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ executed: true });

    const { syncAppointmentWorkOrderStaging } = await import(MODULE_PATH);
    const result = await syncAppointmentWorkOrderStaging({
      supabase: supabase as never,
      shopId: SHOP_ID,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("booking-bad");
    expect(result.executed).toBe(1);
  });

  it("returns the preparations query error without throwing", async () => {
    const { supabase } = createSupabase({
      preparationPages: [[]],
      preparationsError: { message: "db down" },
    });

    const { syncAppointmentWorkOrderStaging } = await import(MODULE_PATH);
    const result = await syncAppointmentWorkOrderStaging({
      supabase: supabase as never,
      shopId: SHOP_ID,
    });

    expect(result.errors).toEqual(["db down"]);
    expect(result.evaluated).toBe(0);
  });
});
