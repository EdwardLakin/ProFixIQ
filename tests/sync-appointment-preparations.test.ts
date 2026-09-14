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
};

type BookingsQueryNode = {
  select: (columns: string) => BookingsQueryNode;
  eq: (column: string, value: unknown) => BookingsQueryNode;
  gte: (column: string, value: string) => BookingsQueryNode;
  lt: (column: string, value: string) => BookingsQueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => BookingsQueryNode;
  then: (
    resolve: (value: { data: BookingRow[]; error: unknown }) => unknown,
  ) => unknown;
};

function createBookingsQuery(rows: BookingRow[], error: { message: string } | null = null) {
  const calls: { gte?: [string, string]; lt?: [string, string] } = {};
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
    then: (resolve: (value: { data: BookingRow[]; error: unknown }) => unknown) =>
      Promise.resolve({ data: rows, error }).then(resolve),
  };
  return { node, calls };
}

type UpdateNode = {
  eq: (col: string, value: unknown) => UpdateNode;
  not: (col: string, op: string, value: string) => UpdateNode;
  select: (columns: string) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>;
};

function createAppointmentPreparationsTable(input: {
  resolveResponse?: { data: Array<{ id: string }> | null; error: { message: string } | null };
  upsertError?: { message: string } | null;
}) {
  const updateCalls: Array<{ payload: Record<string, unknown>; eqCalls: Array<[string, unknown]>; notCall?: [string, string, string] }> = [];
  const upsertCalls: Array<{ rows: unknown[]; options: unknown }> = [];

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

  const table = {
    update: vi.fn((payload: Record<string, unknown>) => makeUpdateNode(payload)),
    upsert: vi.fn((rows: unknown[], options: unknown) => {
      upsertCalls.push({ rows, options });
      return Promise.resolve({ error: input.upsertError ?? null });
    }),
  };

  return { table, updateCalls, upsertCalls };
}

function createSupabase(input: {
  bookings: BookingRow[];
  bookingsError?: { message: string } | null;
  resolveResponse?: { data: Array<{ id: string }> | null; error: { message: string } | null };
  upsertError?: { message: string } | null;
}) {
  const { node: bookingsQuery, calls: bookingsCalls } = createBookingsQuery(
    input.bookings,
    input.bookingsError ?? null,
  );
  const { table: appointmentPreparationsTable, updateCalls, upsertCalls } =
    createAppointmentPreparationsTable({
      resolveResponse: input.resolveResponse,
      upsertError: input.upsertError,
    });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") return bookingsQuery;
      if (table === "appointment_preparations") return appointmentPreparationsTable;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase, bookingsCalls, updateCalls, upsertCalls };
}

describe("syncAppointmentPreparations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries bookings within the lookahead window and excludes cancelled/completed statuses", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bookings: BookingRow[] = [
      { id: "b1", starts_at: "2026-09-15T09:00:00.000Z", status: "scheduled", customer_id: "c1", vehicle_id: "v1", notes: null },
      { id: "b2", starts_at: "2026-09-16T09:00:00.000Z", status: "cancelled", customer_id: "c2", vehicle_id: "v2", notes: null },
      { id: "b3", starts_at: "2026-09-17T09:00:00.000Z", status: "completed", customer_id: "c3", vehicle_id: "v3", notes: null },
    ];
    buildAppointmentPreparationsMock.mockResolvedValue([]);
    const { supabase, bookingsCalls } = createSupabase({ bookings });

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

  it("upserts a row per upcoming preparation keyed on booking_id", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bookings: BookingRow[] = [
      { id: "b1", starts_at: "2026-09-15T09:00:00.000Z", status: "scheduled", customer_id: "c1", vehicle_id: "v1", notes: null },
    ];
    buildAppointmentPreparationsMock.mockResolvedValue([
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
    ]);
    const { supabase, upsertCalls } = createSupabase({ bookings, resolveResponse: { data: [], error: null } });

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

  it("resolves previously-active rows whose booking is no longer upcoming", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const bookings: BookingRow[] = [
      { id: "b1", starts_at: "2026-09-15T09:00:00.000Z", status: "scheduled", customer_id: "c1", vehicle_id: "v1", notes: null },
    ];
    buildAppointmentPreparationsMock.mockResolvedValue([
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
    ]);
    const { supabase, updateCalls } = createSupabase({
      bookings,
      resolveResponse: { data: [{ id: "prep-old" }], error: null },
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

  it("resolves every active row (no exclusion filter) when there are no upcoming bookings at all", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    buildAppointmentPreparationsMock.mockResolvedValue([]);
    const { supabase, updateCalls } = createSupabase({
      bookings: [],
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
      bookings: [],
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
