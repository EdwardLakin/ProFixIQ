import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAutomationEvidenceMock = vi.fn();
const isAiAutomaticExecutionEnabledMock = vi.fn();
const buildPartsReadinessForMenuRepairItemsMock = vi.fn();

vi.mock("@/features/ai/server/automationEvidence", () => ({
  recordAutomationEvidence: recordAutomationEvidenceMock,
}));
vi.mock("@/features/ai/server/automationPolicy", () => ({
  isAiAutomaticExecutionEnabled: isAiAutomaticExecutionEnabledMock,
}));
vi.mock("@/features/operations/server/appointmentPreparation/buildPartsReadiness", () => ({
  buildPartsReadinessForMenuRepairItems: buildPartsReadinessForMenuRepairItemsMock,
}));

type Row = Record<string, unknown> | null;

type TableConfig = {
  row?: Row;
  error?: { message: string } | null;
};

type QueryNode = {
  select: (columns: string) => QueryNode;
  eq: (column: string, value: unknown) => QueryNode;
  is: (column: string, value: unknown) => QueryNode;
  limit: (count: number) => QueryNode;
  maybeSingle: () => Promise<{ data: Row; error: { message: string } | null }>;
};

function createSupabase(tables: Record<string, TableConfig>, rpcResult?: { data: unknown; error: { message: string } | null }) {
  const rpcMock = vi.fn(() => Promise.resolve(rpcResult ?? { data: "req-1", error: null }));
  const supabase = {
    from: vi.fn((table: string) => {
      const config = tables[table];
      if (!config) throw new Error(`Unexpected table: ${table}`);
      const node: QueryNode = {
        select: vi.fn(() => node),
        eq: vi.fn(() => node),
        is: vi.fn(() => node),
        limit: vi.fn(() => node),
        maybeSingle: vi.fn(() =>
          Promise.resolve({ data: config.row ?? null, error: config.error ?? null }),
        ),
      };
      return node;
    }),
    rpc: rpcMock,
  };
  return { supabase, rpcMock };
}

const BASE_LINE = {
  id: "line-1",
  shop_id: "shop-1",
  work_order_id: "wo-1",
  menu_item_id: "mri-1",
  vehicle_id: null,
  voided_at: null,
};
const BASE_WORK_ORDER = {
  id: "wo-1",
  shop_id: "shop-1",
  vehicle_id: "veh-1",
  archived_at: null,
};
const BASE_BOOKING = { id: "booking-1" };
const BASE_MENU_ITEM = {
  id: "mri-1",
  shop_id: "shop-1",
  name: "Front Brake Job",
  is_active: true,
  vehicle_year: null,
  vehicle_make: null,
  vehicle_model: null,
  engine: null,
  drivetrain: null,
  transmission: null,
  fuel_type: null,
};
const BASE_VEHICLE = {
  id: "veh-1",
  year: 2020,
  make: "Ford",
  model: "F150",
  engine: null,
  drivetrain: null,
  transmission: null,
  fuel_type: null,
};

function baseTables(overrides: Partial<Record<string, TableConfig>> = {}): Record<string, TableConfig> {
  return {
    work_order_lines: { row: BASE_LINE },
    work_orders: { row: BASE_WORK_ORDER },
    bookings: { row: BASE_BOOKING },
    part_request_items: { row: null },
    menu_repair_items: { row: BASE_MENU_ITEM },
    vehicles: { row: BASE_VEHICLE },
    ...overrides,
  };
}

const READY_REQUIRED_LINE = {
  partName: "Brake Pads",
  partNumber: "BP-1",
  qtyRequired: 1,
  isRequired: true,
  matchedPartId: "part-1",
  qtyAvailable: 4,
  status: "ready" as const,
};

describe("prepareAppointmentPartsRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordAutomationEvidenceMock.mockResolvedValue(undefined);
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(false);
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue({
      readinessByMenuRepairItemId: new Map([["mri-1", [READY_REQUIRED_LINE]]]),
      error: null,
    });
  });

  it("is ineligible when the line is not found", async () => {
    const { supabase } = createSupabase(baseTables({ work_order_lines: { row: null } }));
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({ eligible: false, reason: "Work order line not found." });
  });

  it("is ineligible when the line is voided", async () => {
    const { supabase } = createSupabase(
      baseTables({ work_order_lines: { row: { ...BASE_LINE, voided_at: "2026-01-01T00:00:00.000Z" } } }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({ eligible: false, reason: "Line is voided." });
  });

  it("is ineligible when the line has no explicit menu-repair-item mapping", async () => {
    const { supabase } = createSupabase(
      baseTables({ work_order_lines: { row: { ...BASE_LINE, menu_item_id: null } } }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Line has no explicit menu-repair-item mapping.",
    });
  });

  it("is ineligible when the work order is archived", async () => {
    const { supabase } = createSupabase(
      baseTables({ work_orders: { row: { ...BASE_WORK_ORDER, archived_at: "2026-01-01T00:00:00.000Z" } } }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({ eligible: false, reason: "Work order is archived." });
  });

  it("is ineligible when the work order has no linked, active booking", async () => {
    const { supabase } = createSupabase(baseTables({ bookings: { row: null } }));
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Work order is not linked to an active booking.",
    });
  });

  it("is ineligible (duplicate protection) when a parts request already exists for this line", async () => {
    const { supabase } = createSupabase(
      baseTables({ part_request_items: { row: { id: "pri-1" } } }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({
      eligible: false,
      reason: "A parts request already exists for this line.",
    });
  });

  it("is ineligible when the mapped menu repair item is not active", async () => {
    const { supabase } = createSupabase(
      baseTables({ menu_repair_items: { row: { ...BASE_MENU_ITEM, is_active: false } } }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Mapped menu repair item is not active.",
    });
  });

  it("is ineligible when there is no vehicle on the work order or line", async () => {
    const { supabase } = createSupabase(
      baseTables({ work_orders: { row: { ...BASE_WORK_ORDER, vehicle_id: null } } }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({ eligible: false, reason: "No vehicle on the work order." });
  });

  it("is ineligible when the vehicle year does not match a menu item that specifies one", async () => {
    const { supabase } = createSupabase(
      baseTables({
        menu_repair_items: { row: { ...BASE_MENU_ITEM, vehicle_year: 2019, vehicle_make: "Ford", vehicle_model: "F150" } },
      }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Vehicle is not compatible with the mapped menu repair item.",
    });
  });

  it("is eligible when the menu item's vehicle fields are all null (applies broadly)", async () => {
    const { supabase } = createSupabase(baseTables());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result.eligible).toBe(true);
  });

  it("is ineligible when the menu repair item has no required parts defined", async () => {
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue({
      readinessByMenuRepairItemId: new Map([["mri-1", []]]),
      error: null,
    });
    const { supabase } = createSupabase(baseTables());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Mapped menu repair item has no required parts defined.",
    });
  });

  it("is ineligible (fails closed) when a required part cannot be matched to the shop's catalog", async () => {
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue({
      readinessByMenuRepairItemId: new Map([
        ["mri-1", [{ ...READY_REQUIRED_LINE, matchedPartId: null, status: "unmatched" as const }]],
      ]),
      error: null,
    });
    const { supabase } = createSupabase(baseTables());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });
    expect(result).toEqual({
      eligible: false,
      reason: "A required part could not be matched to the shop's parts catalog.",
    });
  });

  it("records shadow evidence and does not execute when automatic execution is disabled", async () => {
    const { supabase, rpcMock } = createSupabase(baseTables());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });

    expect(result).toMatchObject({ eligible: true, executed: false, menuRepairItemId: "mri-1" });
    expect(recordAutomationEvidenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop-1",
        capability: "parts_ordering",
        evidenceKey: "work_order_line:line-1",
        outcome: "observed",
        source: "prepare_appointment_parts_request",
      }),
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("creates the parts request via the canonical RPC when automatic execution is enabled", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(true);
    const { supabase, rpcMock } = createSupabase(baseTables(), { data: "req-42", error: null });
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });

    expect(result).toMatchObject({ eligible: true, executed: true, requestId: "req-42" });
    expect(rpcMock).toHaveBeenCalledWith(
      "create_part_request_with_items",
      expect.objectContaining({
        p_work_order_id: "wo-1",
        p_job_id: "line-1",
      }),
    );
  });

  it("never selects a supplier or places a purchase order when executing", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(true);
    const { supabase, rpcMock } = createSupabase(baseTables(), { data: "req-42", error: null });
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: "line-1",
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalledWith("place_purchase_order", expect.anything());
    expect(rpcMock).not.toHaveBeenCalledWith(
      expect.stringContaining("supplier"),
      expect.anything(),
    );
  });

  it("throws when the canonical RPC fails, so the sweep can surface it as an error", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(true);
    const { supabase } = createSupabase(baseTables(), {
      data: null,
      error: { message: "work order changed" },
    });
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    await expect(
      prepareAppointmentPartsRequest({
        admin: supabase as never,
        shopId: "shop-1",
        workOrderLineId: "line-1",
      }),
    ).rejects.toThrow("work order changed");
  });
});

describe("isVehicleCompatibleWithMenuRepairItem", () => {
  it("allows a menu item whose vehicle fields are all null regardless of vehicle", async () => {
    const { isVehicleCompatibleWithMenuRepairItem } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    expect(
      isVehicleCompatibleWithMenuRepairItem(BASE_VEHICLE, {
        vehicle_year: null,
        vehicle_make: null,
        vehicle_model: null,
        engine: null,
        drivetrain: null,
        transmission: null,
        fuel_type: null,
      }),
    ).toBe(true);
  });

  it("requires an exact match on any field the menu item specifies", async () => {
    const { isVehicleCompatibleWithMenuRepairItem } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    expect(
      isVehicleCompatibleWithMenuRepairItem(BASE_VEHICLE, {
        vehicle_year: 2020,
        vehicle_make: "ford",
        vehicle_model: "f-150",
        engine: null,
        drivetrain: null,
        transmission: null,
        fuel_type: null,
      }),
    ).toBe(false);
  });

  it("matches case- and punctuation-insensitively", async () => {
    const { isVehicleCompatibleWithMenuRepairItem } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    expect(
      isVehicleCompatibleWithMenuRepairItem(BASE_VEHICLE, {
        vehicle_year: 2020,
        vehicle_make: "FORD",
        vehicle_model: "f150",
        engine: null,
        drivetrain: null,
        transmission: null,
        fuel_type: null,
      }),
    ).toBe(true);
  });

  it("rejects a mismatched optional powertrain field even when make/model/year match", async () => {
    const { isVehicleCompatibleWithMenuRepairItem } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    expect(
      isVehicleCompatibleWithMenuRepairItem(
        { ...BASE_VEHICLE, drivetrain: "4wd" },
        {
          vehicle_year: 2020,
          vehicle_make: "Ford",
          vehicle_model: "F150",
          engine: null,
          drivetrain: "2wd",
          transmission: null,
          fuel_type: null,
        },
      ),
    ).toBe(false);
  });
});
