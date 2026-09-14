import { beforeEach, describe, expect, it, vi } from "vitest";

const loadDeferredWorkHistoryForVehicleMock = vi.fn();
const findMenuRepairItemForWorkOrderLineMock = vi.fn();
const buildPartsReadinessForMenuRepairItemsMock = vi.fn();

vi.mock("@/features/work-orders/server/deferredWorkHistory", () => ({
  loadDeferredWorkHistoryForVehicle: loadDeferredWorkHistoryForVehicleMock,
}));
vi.mock("@/features/menu-repair-items/server/findMenuRepairItemForWorkOrderLine", () => ({
  findMenuRepairItemForWorkOrderLine: findMenuRepairItemForWorkOrderLineMock,
}));
vi.mock("@/features/operations/server/appointmentPreparation/buildPartsReadiness", () => ({
  buildPartsReadinessForMenuRepairItems: buildPartsReadinessForMenuRepairItemsMock,
}));

type Row = Record<string, unknown>;

type QueryNode = {
  select: (columns: string) => QueryNode;
  eq: (column: string, value: unknown) => QueryNode;
  in: (column: string, values: unknown[]) => QueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => QueryNode;
  range: (from: number, to: number) => Promise<{ data: Row[]; error: null }>;
};

function createQuery(rows: Row[]) {
  const node: QueryNode = {
    select: vi.fn(() => node),
    eq: vi.fn(() => node),
    in: vi.fn(() => node),
    order: vi.fn(() => node),
    range: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return node;
}

function createSupabase(tables: Record<string, Row[]>) {
  return {
    from: vi.fn((table: string) => {
      if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
      return createQuery(tables[table]);
    }),
  };
}

describe("buildAppointmentPreparations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadDeferredWorkHistoryForVehicleMock.mockResolvedValue({ items: [], error: null });
    findMenuRepairItemForWorkOrderLineMock.mockResolvedValue(null);
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue(new Map());
  });

  it("returns an empty array for an empty booking list without querying anything", async () => {
    const { buildAppointmentPreparations } = await import(
      "@/features/operations/server/appointmentPreparation/buildAppointmentPreparations"
    );
    const supabase = createSupabase({});
    const result = await buildAppointmentPreparations({
      admin: supabase as never,
      shopId: "shop-1",
      bookings: [],
    });
    expect(result).toEqual([]);
  });

  it("flags missing vehicle/customer info and builds snapshots from loaded rows", async () => {
    const supabase = createSupabase({
      vehicles: [
        {
          id: "v1",
          shop_id: "shop-1",
          year: 2019,
          make: "Toyota",
          model: "Corolla",
          vin: null,
          license_plate: "ABC123",
          unit_number: null,
          mileage: null,
          drivetrain: "FWD",
          engine: null,
          fuel_type: "gas",
          transmission: null,
          notes: null,
        },
      ],
      customers: [
        {
          id: "c1",
          name: null,
          first_name: "Jane",
          last_name: "Doe",
          business_name: null,
          email: null,
          phone: null,
          phone_number: null,
          is_fleet: false,
        },
      ],
    });

    const { buildAppointmentPreparations } = await import(
      "@/features/operations/server/appointmentPreparation/buildAppointmentPreparations"
    );
    const result = await buildAppointmentPreparations({
      admin: supabase as never,
      shopId: "shop-1",
      bookings: [
        { id: "b1", starts_at: "2026-09-15T09:00:00.000Z", status: "scheduled", customer_id: "c1", vehicle_id: "v1", notes: null },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].vehicleSnapshot).toMatchObject({ year: 2019, make: "Toyota", model: "Corolla" });
    expect(result[0].customerSnapshot).toMatchObject({ name: "Jane Doe" });
    expect(result[0].missingInfo).toEqual(
      expect.arrayContaining(["missing_vin", "missing_mileage", "missing_customer_contact"]),
    );
  });

  it("flags missing_vehicle and missing_customer when a booking has neither linked", async () => {
    const supabase = createSupabase({});
    const { buildAppointmentPreparations } = await import(
      "@/features/operations/server/appointmentPreparation/buildAppointmentPreparations"
    );
    const result = await buildAppointmentPreparations({
      admin: supabase as never,
      shopId: "shop-1",
      bookings: [
        { id: "b1", starts_at: "2026-09-15T09:00:00.000Z", status: "scheduled", customer_id: null, vehicle_id: null, notes: null },
      ],
    });

    expect(result[0].missingInfo).toEqual(
      expect.arrayContaining(["missing_vehicle", "missing_customer"]),
    );
    expect(result[0].deferredItems).toEqual([]);
  });

  it("matches deferred history against known menu repair items via the shared work-order-line matcher", async () => {
    const supabase = createSupabase({
      vehicles: [
        { id: "v1", shop_id: "shop-1", year: 2019, make: "Toyota", model: "Corolla", vin: "1T1", license_plate: null, unit_number: null, mileage: "50000", drivetrain: null, engine: null, fuel_type: null, transmission: null, notes: null },
      ],
      customers: [],
      menu_repair_items: [
        { id: "mri-1", name: "Brake Job", labor_hours: 1.5, price_estimate: 250, is_active: true },
      ],
    });

    loadDeferredWorkHistoryForVehicleMock.mockResolvedValue({
      items: [
        {
          rootLineId: "line-1",
          quoteLineId: "q1",
          workOrderId: "wo1",
          workOrderNumber: "A100",
          title: "Front brakes",
          complaint: "Squeaking",
          decision: "deferred",
          decisionAt: "2026-08-01T00:00:00.000Z",
          laborTotal: 100,
          partsTotal: 50,
          taxTotal: 10,
          grandTotal: 160,
        },
      ],
      error: null,
    });
    findMenuRepairItemForWorkOrderLineMock.mockResolvedValue("mri-1");
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue(
      new Map([["mri-1", [{ partName: "Pads", partNumber: "BP-1", qtyRequired: 1, isRequired: true, matchedPartId: "part-1", qtyAvailable: 4, status: "ready" as const }]]]),
    );

    const { buildAppointmentPreparations } = await import(
      "@/features/operations/server/appointmentPreparation/buildAppointmentPreparations"
    );
    const result = await buildAppointmentPreparations({
      admin: supabase as never,
      shopId: "shop-1",
      bookings: [
        { id: "b1", starts_at: "2026-09-15T09:00:00.000Z", status: "scheduled", customer_id: null, vehicle_id: "v1", notes: null },
      ],
    });

    expect(findMenuRepairItemForWorkOrderLineMock).toHaveBeenCalledWith(
      expect.objectContaining({ workOrderLineId: "line-1" }),
    );
    expect(result[0].matchedMenuItems).toEqual([
      expect.objectContaining({
        menuRepairItemId: "mri-1",
        name: "Brake Job",
        sourceRootLineId: "line-1",
        partsReadiness: [expect.objectContaining({ status: "ready" })],
      }),
    ]);
  });

  it("loads deferred history once per distinct vehicle rather than once per booking", async () => {
    const supabase = createSupabase({
      vehicles: [
        { id: "v1", shop_id: "shop-1", year: 2019, make: "Toyota", model: "Corolla", vin: "1T1", license_plate: null, unit_number: null, mileage: "50000", drivetrain: null, engine: null, fuel_type: null, transmission: null, notes: null },
      ],
      customers: [],
    });

    const { buildAppointmentPreparations } = await import(
      "@/features/operations/server/appointmentPreparation/buildAppointmentPreparations"
    );
    await buildAppointmentPreparations({
      admin: supabase as never,
      shopId: "shop-1",
      bookings: [
        { id: "b1", starts_at: "2026-09-15T09:00:00.000Z", status: "scheduled", customer_id: null, vehicle_id: "v1", notes: null },
        { id: "b2", starts_at: "2026-09-16T09:00:00.000Z", status: "scheduled", customer_id: null, vehicle_id: "v1", notes: null },
      ],
    });

    expect(loadDeferredWorkHistoryForVehicleMock).toHaveBeenCalledTimes(1);
  });
});
