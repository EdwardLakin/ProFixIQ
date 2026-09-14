import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAppointmentPreparationsMock = vi.fn();

vi.mock(
  "@/features/operations/server/appointmentPreparation/buildAppointmentPreparations",
  () => ({
    buildAppointmentPreparations: buildAppointmentPreparationsMock,
  }),
);

type BookingRow = {
  id: string;
  starts_at: string;
  status: string;
  customer_id: string | null;
  vehicle_id: string | null;
  notes: string | null;
  work_order_id: string | null;
};

type BookingsQueryNode = {
  select: (columns: string) => BookingsQueryNode;
  eq: (column: string, value: unknown) => BookingsQueryNode;
  gte: (column: string, value: string) => BookingsQueryNode;
  lt: (column: string, value: string) => BookingsQueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => BookingsQueryNode;
  range: (from: number, to: number) => Promise<{ data: BookingRow[] | null; error: { message: string } | null }>;
};

function createBookingsQuery(pages: BookingRow[][], error: { message: string } | null = null) {
  const calls: { gte?: [string, string]; lt?: [string, string]; rangeCalls: Array<[number, number]> } = {
    rangeCalls: [],
  };
  let pageIndex = 0;
  const node: BookingsQueryNode = {
    select: vi.fn(() => node),
    eq: vi.fn(() => node),
    gte: vi.fn((col: string, value: string) => {
      calls.gte = [col, value];
      return node;
    }),
    lt: vi.fn((col: string, value: string) => {
      calls.lt = [col, value];
      return node;
    }),
    order: vi.fn(() => node),
    range: vi.fn((from: number, to: number) => {
      calls.rangeCalls.push([from, to]);
      if (error) return Promise.resolve({ data: null, error });
      const page = pages[pageIndex] ?? [];
      pageIndex += 1;
      return Promise.resolve({ data: page, error: null });
    }),
  };
  return { node, calls };
}

type UpdateNode = {
  eq: (col: string, value: unknown) => UpdateNode;
  not: (col: string, op: string, value: string) => UpdateNode;
  select: (columns: string) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;
};

type SelectExistingNode = {
  eq: (col: string, value: unknown) => SelectExistingNode;
  in: (
    col: string,
    values: string[],
  ) => Promise<{ data: Array<{ booking_id: string; updated_at: string }> | null; error: { message: string } | null }>;
};

function createAppointmentPreparationsTable(input: {
  resolveResponse?: { data: Array<{ id: string }> | null; error: { message: string } | null };
  upsertError?: { message: string } | null;
  existingRows?: Array<{ booking_id: string; updated_at: string }>;
  existingError?: { message: string } | null;
}) {
  const updateCalls: Array<{ payload: Record<string, unknown>; eqCalls: Array<[string, unknown]>; notCall?: [string, string, string] }> = [];
  const upsertCalls: Array<{ rows: unknown[]; options: unknown }> = [];
  const selectExistingCalls: Array<{ eqCalls: Array<[string, unknown]>; inCall?: [string, string[]] }> = [];

  function makeUpdateNode(payload: Record<string, unknown>): UpdateNode {
    const record = { payload, eqCalls: [] as Array<[string, unknown]>, notCall: undefined as [string, string, string] | undefined };
    updateCalls.push(record);
    const node: UpdateNode = {
      eq: vi.fn((col: string, value: unknown) => {
        record.eqCalls.push([col, value]);
        return node;
      }),
      not: vi.fn((col: string, op: string, value: string) => {
        record.notCall = [col, op, value];
        return node;
      }),
      select: vi.fn(() =>
        Promise.resolve(
          input.resolveResponse ?? { data: [], error: null },
        ),
      ),
    };
    return node;
  }

  function makeSelectExistingNode(): SelectExistingNode {
    const record = { eqCalls: [] as Array<[string, unknown]>, inCall: undefined as [string, string[]] | undefined };
    selectExistingCalls.push(record);
    const node: SelectExistingNode = {
      eq: vi.fn((col: string, value: unknown) => {
        record.eqCalls.push([col, value]);
        return node;
      }),
      in: vi.fn((col: string, values: string[]) => {
        record.inCall = [col, values];
        return Promise.resolve(
          input.existingError
            ? { data: null, error: input.existingError }
            : { data: input.existingRows ?? [], error: null },
        );
      }),
    };
    return node;
  }

  const table = {
    select: vi.fn(() => makeSelectExistingNode()),
    update: vi.fn((payload: Record<string, unknown>) => makeUpdateNode(payload)),
    upsert: vi.fn((rows: unknown[], options: unknown) => {
      upsertCalls.push({ rows, options });
      return Promise.resolve({ error: input.upsertError ?? null });
    }),
  };

  return { table, updateCalls, upsertCalls, selectExistingCalls };
}

function createSupabase(input: {
  bookingPages: BookingRow[][];
  bookingsError?: { message: string } | null;
  resolveResponse?: { data: Array<{ id: string }> | null; error: { message: string } | null };
  upsertError?: { message: string } | null;
  existingRows?: Array<{ booking_id: string; updated_at: string }>;
  existingError?: { message: string } | null;
}) {
  const { node: bookingsQuery, calls: bookingsCalls } = createBookingsQuery(
    input.bookingPages,
    input.bookingsError ?? null,
  );
  const { table: appointmentPreparationsTable, updateCalls, upsertCalls, selectExistingCalls } =
    createAppointmentPreparationsTable({
      resolveResponse: input.resolveResponse,
      upsertError: input.upsertError,
      existingRows: input.existingRows,
      existingError: input.existingError,
    });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") return bookingsQuery;
      if (table === "appointment_preparations") return appointmentPreparationsTable;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, bookingsCalls, updateCalls, upsertCalls, selectExistingCalls };
}

function booking(overrides: Partial<BookingRow> & { id: string }): BookingRow {
  return {
    starts_at: "2026-09-15T09:00:00.000Z",
    status: "scheduled",
    customer_id: "c1",
    vehicle_id: "v1",
    notes: null,
    work_order_id: null,
    ...overrides,
  };
}

const emptyBuildResult = { preparations: [], failedBookingIds: [], errors: [] };

describe("syncAppointmentPreparations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries bookings within the lookahead window and excludes cancelled/completed/already-converted bookings", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bookings: BookingRow[] = [
      booking({ id: "b1" }),
      booking({ id: "b2", status: "cancelled" }),
      booking({ id: "b3", status: "completed" }),
      booking({ id: "b4", work_order_id: "wo-existing" }),
    ];
    buildAppointmentPreparationsMock.mockResolvedValue(emptyBuildResult);
    const { supabase, bookingsCalls } = createSupabase({ bookingPages: [bookings] });

    const { syncAppointmentPreparations } = await import(
      "@/features/operations/server/syncAppointmentPreparations"
    );
    await syncAppointmentPreparations({ supabase: supabase as never, shopId: "shop-1", now });

    expect(bookingsCalls.gte).toEqual(["starts_at", now.toISOString()]);
    expect(buildAppointmentPreparationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop-1",
        bookings: [expect.objectContaining({ id: "b1" })],
      }),
    );
  });

  it("pages through the full booking window instead of a single truncated read", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const fullPage = Array.from({ length: 500 }, (_, i) => booking({ id: `b${i}` }));
    const tailPage = [booking({ id: "b500" })];
    buildAppointmentPreparationsMock.mockResolvedValue(emptyBuildResult);
    const { supabase, bookingsCalls } = createSupabase({ bookingPages: [fullPage, tailPage] });

    const { syncAppointmentPreparations } = await import(
      "@/features/operations/server/syncAppointmentPreparations"
    );
    await syncAppointmentPreparations({ supabase: supabase as never, shopId: "shop-1", now });

    expect(bookingsCalls.rangeCalls).toHaveLength(2);
    const passedBookings = buildAppointmentPreparationsMock.mock.calls[0][0].bookings as BookingRow[];
    expect(passedBookings).toHaveLength(501);
    expect(passedBookings.map((b) => b.id)).toContain("b500");
  });

  it("upserts a row per upcoming preparation keyed on booking_id", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bookings: BookingRow[] = [booking({ id: "b1" })];
    buildAppointmentPreparationsMock.mockResolvedValue({
      preparations: [
        {
          bookingId: "b1",
          shopId: "shop-1",
          startsAt: "2026-09-15T09:00:00.000Z",
          vehicleId: "v1",
          customerId: "c1",
          vehicleSnapshot: { year: 2020, make: "Ford", model: "F150", vin: "1FT", licensePlate: null, unitNumber: null, mileage: null, drivetrain: null, engine: null, fuelType: null, transmission: null, notes: null },
          customerSnapshot: { name: "Jane Doe", businessName: null, email: null, phone: null, isFleet: false },
          deferredItems: [],
          matchedMenuItems: [],
          missingInfo: [],
        },
      ],
      failedBookingIds: [],
      errors: [],
    });
    const { supabase, upsertCalls } = createSupabase({
      bookingPages: [bookings],
      resolveResponse: { data: [], error: null },
      existingRows: [],
    });

    const { syncAppointmentPreparations } = await import(
      "@/features/operations/server/syncAppointmentPreparations"
    );
    const summary = await syncAppointmentPreparations({ supabase: supabase as never, shopId: "shop-1", now });

    expect(summary.upcoming).toBe(1);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].rows).toEqual([
      expect.objectContaining({ shop_id: "shop-1", booking_id: "b1", status: "active" }),
    ]);
    expect(upsertCalls[0].options).toEqual({ onConflict: "booking_id" });
  });

  it("skips re-activating a row a fresher run has already touched since this run started", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bookings: BookingRow[] = [booking({ id: "b1" })];
    buildAppointmentPreparationsMock.mockResolvedValue({
      preparations: [
        {
          bookingId: "b1",
          shopId: "shop-1",
          startsAt: "2026-09-15T09:00:00.000Z",
          vehicleId: "v1",
          customerId: "c1",
          vehicleSnapshot: null,
          customerSnapshot: null,
          deferredItems: [],
          matchedMenuItems: [],
          missingInfo: [],
        },
      ],
      failedBookingIds: [],
      errors: [],
    });
    const { supabase, upsertCalls } = createSupabase({
      bookingPages: [bookings],
      resolveResponse: { data: [], error: null },
      // A fresher run already touched this row after "now".
      existingRows: [{ booking_id: "b1", updated_at: "2026-09-14T12:05:00.000Z" }],
    });

    const { syncAppointmentPreparations } = await import(
      "@/features/operations/server/syncAppointmentPreparations"
    );
    await syncAppointmentPreparations({ supabase: supabase as never, shopId: "shop-1", now });

    expect(upsertCalls).toHaveLength(0);
  });

  it("resolves previously-active rows whose booking is no longer upcoming", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bookings: BookingRow[] = [booking({ id: "b1" })];
    buildAppointmentPreparationsMock.mockResolvedValue({
      preparations: [
        {
          bookingId: "b1",
          shopId: "shop-1",
          startsAt: "2026-09-15T09:00:00.000Z",
          vehicleId: "v1",
          customerId: "c1",
          vehicleSnapshot: null,
          customerSnapshot: null,
          deferredItems: [],
          matchedMenuItems: [],
          missingInfo: [],
        },
      ],
      failedBookingIds: [],
      errors: [],
    });
    const { supabase, updateCalls } = createSupabase({
      bookingPages: [bookings],
      resolveResponse: { data: [{ id: "prep-old" }], error: null },
      existingRows: [],
    });

    const { syncAppointmentPreparations } = await import(
      "@/features/operations/server/syncAppointmentPreparations"
    );
    const summary = await syncAppointmentPreparations({ supabase: supabase as never, shopId: "shop-1", now });

    expect(summary.resolved).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({ status: "resolved", resolved_at: now.toISOString() });
    expect(updateCalls[0].eqCalls).toContainEqual(["shop_id", "shop-1"]);
    expect(updateCalls[0].eqCalls).toContainEqual(["status", "active"]);
    expect(updateCalls[0].notCall).toEqual(["booking_id", "in", "(b1)"]);
  });

  it("excludes a failed booking from the resolve pass so its existing preparation is left untouched", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bookings: BookingRow[] = [booking({ id: "b1" })];
    buildAppointmentPreparationsMock.mockResolvedValue({
      preparations: [],
      failedBookingIds: ["b1"],
      errors: ["vehicle v1: boom"],
    });
    const { supabase, updateCalls } = createSupabase({
      bookingPages: [bookings],
      resolveResponse: { data: [], error: null },
      existingRows: [],
    });

    const { syncAppointmentPreparations } = await import(
      "@/features/operations/server/syncAppointmentPreparations"
    );
    const summary = await syncAppointmentPreparations({ supabase: supabase as never, shopId: "shop-1", now });

    expect(updateCalls[0].notCall).toEqual(["booking_id", "in", "(b1)"]);
    expect(summary.errors).toEqual(["vehicle v1: boom"]);
  });

  it("resolves every active row (no exclusion filter) when there are no upcoming bookings at all", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    buildAppointmentPreparationsMock.mockResolvedValue(emptyBuildResult);
    const { supabase, updateCalls } = createSupabase({
      bookingPages: [[]],
      resolveResponse: { data: [{ id: "prep-old" }], error: null },
    });

    const { syncAppointmentPreparations } = await import(
      "@/features/operations/server/syncAppointmentPreparations"
    );
    const summary = await syncAppointmentPreparations({ supabase: supabase as never, shopId: "shop-1", now });

    expect(summary.resolved).toBe(1);
    expect(updateCalls[0].notCall).toBeUndefined();
  });

  it("surfaces a bookings query failure without throwing", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const { supabase } = createSupabase({
      bookingPages: [[]],
      bookingsError: { message: "db unavailable" },
    });

    const { syncAppointmentPreparations } = await import(
      "@/features/operations/server/syncAppointmentPreparations"
    );
    const summary = await syncAppointmentPreparations({ supabase: supabase as never, shopId: "shop-1", now });

    expect(summary.errors).toEqual(["db unavailable"]);
    expect(buildAppointmentPreparationsMock).not.toHaveBeenCalled();
  });
});
