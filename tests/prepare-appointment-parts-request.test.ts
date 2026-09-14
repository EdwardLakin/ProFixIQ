import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAutomationEvidenceMock = vi.fn();
const isAiAutomaticExecutionEnabledMock = vi.fn();
const buildPartsReadinessForMenuRepairItemsMock = vi.fn();
const findMenuRepairItemForWorkOrderLineMock = vi.fn();

vi.mock("@/features/ai/server/automationEvidence", () => ({
  recordAutomationEvidence: recordAutomationEvidenceMock,
}));
vi.mock("@/features/ai/server/automationPolicy", () => ({
  isAiAutomaticExecutionEnabled: isAiAutomaticExecutionEnabledMock,
}));
vi.mock("@/features/operations/server/appointmentPreparation/buildPartsReadiness", () => ({
  buildPartsReadinessForMenuRepairItems: buildPartsReadinessForMenuRepairItemsMock,
}));
vi.mock("@/features/menu-repair-items/server/findMenuRepairItemForWorkOrderLine", () => ({
  findMenuRepairItemForWorkOrderLine: findMenuRepairItemForWorkOrderLineMock,
}));

type Row = Record<string, unknown> | null;
type Filters = Record<string, unknown>;
type Resolver = (filters: Filters) => { row: Row; error?: { message: string } | null };

type QueryNode = {
  select: (columns: string) => QueryNode;
  eq: (column: string, value: unknown) => QueryNode;
  is: (column: string, value: unknown) => QueryNode;
  in: (column: string, value: unknown) => QueryNode;
  limit: (count: number) => QueryNode;
  maybeSingle: () => Promise<{ data: Row; error: { message: string } | null }>;
};

function createQuery(resolver: Resolver): QueryNode {
  const filters: Filters = {};
  const node: QueryNode = {
    select: vi.fn(() => node),
    eq: vi.fn((col: string, value: unknown) => {
      filters[col] = value;
      return node;
    }),
    is: vi.fn((col: string, value: unknown) => {
      filters[col] = value;
      return node;
    }),
    in: vi.fn((col: string, value: unknown) => {
      filters[col] = value;
      return node;
    }),
    limit: vi.fn(() => node),
    maybeSingle: vi.fn(() => {
      const { row, error } = resolver(filters);
      return Promise.resolve({ data: row ?? null, error: error ?? null });
    }),
  };
  return node;
}

function createSupabase(
  resolvers: Record<string, Resolver>,
  rpcResult?: { data: unknown; error: { message: string } | null },
) {
  const rpcMock = vi.fn(() => Promise.resolve(rpcResult ?? { data: "req-1", error: null }));
  const supabase = {
    from: vi.fn((table: string) => {
      const resolver = resolvers[table];
      if (!resolver) throw new Error(`Unexpected table: ${table}`);
      return createQuery(resolver);
    }),
    rpc: rpcMock,
  };
  return { supabase, rpcMock };
}

function fixedRow(row: Row): Resolver {
  return () => ({ row });
}

const LINE_ID = "line-1";
const WO_ID = "wo-1";
const SOURCE_LINE_ID = "source-line-1";
const MENU_REPAIR_ITEM_ID = "mri-1";
const VEHICLE_ID = "veh-1";

const BASE_LINE = { id: LINE_ID, shop_id: "shop-1", work_order_id: WO_ID, vehicle_id: null, voided_at: null };
const BASE_WORK_ORDER = {
  id: WO_ID,
  shop_id: "shop-1",
  vehicle_id: VEHICLE_ID,
  archived_at: null,
  vehicle_year: null,
  vehicle_make: null,
  vehicle_model: null,
  vehicle_engine: null,
  vehicle_drivetrain: null,
  vehicle_transmission: null,
};
const BASE_BOOKING = { id: "booking-1" };
const BASE_MENU_ITEM = {
  id: MENU_REPAIR_ITEM_ID,
  shop_id: "shop-1",
  name: "Front Brake Job",
  is_active: true,
  vehicle_year: 2020,
  vehicle_make: "Ford",
  vehicle_model: "F150",
  engine: null,
  drivetrain: null,
  transmission: null,
  source_work_order_line_id: SOURCE_LINE_ID,
  last_pricing_source: "completed_work_order_line",
};
const BASE_VEHICLE = {
  id: VEHICLE_ID,
  year: 2020,
  make: "Ford",
  model: "F150",
  engine: null,
  drivetrain: null,
  transmission: null,
};

function baseResolvers(overrides: Partial<Record<string, Resolver>> = {}): Record<string, Resolver> {
  return {
    work_order_lines: (filters) => {
      if (filters.id === LINE_ID) return { row: BASE_LINE };
      if (filters.id === SOURCE_LINE_ID) return { row: { id: SOURCE_LINE_ID } };
      return { row: null };
    },
    work_orders: fixedRow(BASE_WORK_ORDER),
    bookings: fixedRow(BASE_BOOKING),
    part_request_items: fixedRow(null),
    menu_repair_items: fixedRow(BASE_MENU_ITEM),
    vehicles: fixedRow(BASE_VEHICLE),
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

describe("resolveAppointmentPartsCandidate / prepareAppointmentPartsRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMenuRepairItemForWorkOrderLineMock.mockResolvedValue(MENU_REPAIR_ITEM_ID);
    recordAutomationEvidenceMock.mockResolvedValue(undefined);
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(false);
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue({
      readinessByMenuRepairItemId: new Map([[MENU_REPAIR_ITEM_ID, [READY_REQUIRED_LINE]]]),
      error: null,
    });
  });

  it("is ineligible when the line is not found", async () => {
    const { supabase } = createSupabase(baseResolvers({ work_order_lines: fixedRow(null) }));
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({ eligible: false, reason: "Work order line not found." });
  });

  it("is ineligible when the line is voided", async () => {
    const { supabase } = createSupabase(
      baseResolvers({ work_order_lines: fixedRow({ ...BASE_LINE, voided_at: "2026-01-01T00:00:00.000Z" }) }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({ eligible: false, reason: "Line is voided." });
  });

  it("throws (infra failure, not ineligibility) when the line query errors", async () => {
    const { supabase } = createSupabase(
      baseResolvers({ work_order_lines: () => ({ row: null, error: { message: "db down" } }) }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    await expect(
      prepareAppointmentPartsRequest({ admin: supabase as never, shopId: "shop-1", workOrderLineId: LINE_ID }),
    ).rejects.toThrow("db down");
  });

  it("is ineligible when the work order is archived", async () => {
    const { supabase } = createSupabase(
      baseResolvers({ work_orders: fixedRow({ ...BASE_WORK_ORDER, archived_at: "2026-01-01T00:00:00.000Z" }) }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({ eligible: false, reason: "Work order is archived." });
  });

  it("is ineligible when the work order has no linked, active booking", async () => {
    const { supabase } = createSupabase(baseResolvers({ bookings: fixedRow(null) }));
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({ eligible: false, reason: "Work order is not linked to an active booking." });
  });

  it("is ineligible (duplicate protection) when a parts request already exists for this line", async () => {
    const { supabase } = createSupabase(baseResolvers({ part_request_items: fixedRow({ id: "pri-1" }) }));
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({ eligible: false, reason: "A parts request already exists for this line." });
  });

  it("is ineligible when no exact matching menu repair item is found", async () => {
    findMenuRepairItemForWorkOrderLineMock.mockResolvedValue(null);
    const { supabase } = createSupabase(baseResolvers());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({ eligible: false, reason: "No exact matching menu repair item for this line." });
  });

  it("is ineligible when the mapped menu repair item is not active", async () => {
    const { supabase } = createSupabase(
      baseResolvers({ menu_repair_items: fixedRow({ ...BASE_MENU_ITEM, is_active: false }) }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({ eligible: false, reason: "Mapped menu repair item is not active." });
  });

  it("is ineligible when the menu repair item has no completed-work provenance", async () => {
    const { supabase } = createSupabase(
      baseResolvers({
        menu_repair_items: fixedRow({ ...BASE_MENU_ITEM, source_work_order_line_id: null }),
      }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Mapped menu repair item is not backed by completed work.",
    });
  });

  it("is ineligible when the menu repair item's last_pricing_source is not the completed-repair source", async () => {
    const { supabase } = createSupabase(
      baseResolvers({
        menu_repair_items: fixedRow({ ...BASE_MENU_ITEM, last_pricing_source: "manual_entry" }),
      }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Mapped menu repair item is not backed by completed work.",
    });
  });

  it("is ineligible when the source work-order line is no longer completed", async () => {
    const { supabase } = createSupabase(
      baseResolvers({
        work_order_lines: (filters) => {
          if (filters.id === LINE_ID) return { row: BASE_LINE };
          // Simulates the DB's .in("status", COMPLETED_REPAIR_STATUSES)
          // filter excluding the source line because it regressed.
          if (filters.id === SOURCE_LINE_ID) return { row: null };
          return { row: null };
        },
      }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Mapped menu repair item's source work is no longer completed.",
    });
  });

  it("is ineligible when there is no vehicle on the work order or line", async () => {
    const { supabase } = createSupabase(
      baseResolvers({ work_orders: fixedRow({ ...BASE_WORK_ORDER, vehicle_id: null }) }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({ eligible: false, reason: "No vehicle on the work order." });
  });

  it("is ineligible when the vehicle does not exactly match the learned repair's year/make/model", async () => {
    const { supabase } = createSupabase(
      baseResolvers({ vehicles: fixedRow({ ...BASE_VEHICLE, year: 2019 }) }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Vehicle is not compatible with the mapped menu repair item.",
    });
  });

  it("is ineligible when the learned repair's vehicle identity is incomplete (missing YMM)", async () => {
    const { supabase } = createSupabase(
      baseResolvers({
        menu_repair_items: fixedRow({ ...BASE_MENU_ITEM, vehicle_year: null, vehicle_make: null, vehicle_model: null }),
      }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    // matchesCompletedRepairVehicle requires exact YMM on both sides —
    // a learned repair with no recorded vehicle identity is never a match.
    expect(result).toEqual({
      eligible: false,
      reason: "Vehicle is not compatible with the mapped menu repair item.",
    });
  });

  it("is eligible when the vehicle exactly matches the learned repair's year/make/model", async () => {
    const { supabase } = createSupabase(baseResolvers());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result.eligible).toBe(true);
  });

  it("records shadow evidence under the appointment_parts_preparation capability and does not execute when disabled", async () => {
    const { supabase, rpcMock } = createSupabase(baseResolvers());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });

    expect(result).toMatchObject({ eligible: true, executed: false, menuRepairItemId: MENU_REPAIR_ITEM_ID });
    expect(recordAutomationEvidenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop-1",
        capability: "appointment_parts_preparation",
        evidenceKey: `work_order_line:${LINE_ID}`,
        outcome: "observed",
      }),
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("creates the parts request via the canonical RPC when automatic execution is enabled", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(true);
    const { supabase, rpcMock } = createSupabase(baseResolvers(), { data: "req-42", error: null });
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });

    expect(result).toMatchObject({ eligible: true, executed: true, requestId: "req-42" });
    expect(rpcMock).toHaveBeenCalledWith(
      "create_part_request_with_items",
      expect.objectContaining({ p_work_order_id: WO_ID, p_job_id: LINE_ID }),
    );
  });

  it("skips execution (without erroring) when a race check finds a request created since eligibility was resolved", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(true);
    let partRequestCalls = 0;
    const { supabase, rpcMock } = createSupabase(
      baseResolvers({
        part_request_items: () => {
          partRequestCalls += 1;
          // First call (inside resolve) finds nothing; second call (the
          // pre-mutation race check inside finalize) finds a request that
          // appeared in between.
          return { row: partRequestCalls > 1 ? { id: "pri-race" } : null };
        },
      }),
    );
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });

    expect(result).toMatchObject({ eligible: true, executed: false });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("never selects a supplier or places a purchase order when executing", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(true);
    const { supabase, rpcMock } = createSupabase(baseResolvers(), { data: "req-42", error: null });
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    await prepareAppointmentPartsRequest({ admin: supabase as never, shopId: "shop-1", workOrderLineId: LINE_ID });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalledWith("place_purchase_order", expect.anything());
    expect(rpcMock).not.toHaveBeenCalledWith(expect.stringContaining("supplier"), expect.anything());
  });

  it("throws when the canonical RPC fails, so the sweep can surface it as an error", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(true);
    const { supabase } = createSupabase(baseResolvers(), { data: null, error: { message: "work order changed" } });
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    await expect(
      prepareAppointmentPartsRequest({ admin: supabase as never, shopId: "shop-1", workOrderLineId: LINE_ID }),
    ).rejects.toThrow("work order changed");
  });

  it("is ineligible when the menu repair item has no required parts defined", async () => {
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue({
      readinessByMenuRepairItemId: new Map([[MENU_REPAIR_ITEM_ID, []]]),
      error: null,
    });
    const { supabase } = createSupabase(baseResolvers());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({
      eligible: false,
      reason: "Mapped menu repair item has no required parts defined.",
    });
  });

  it("is ineligible (fails closed) when a required part cannot be matched to the shop's catalog", async () => {
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue({
      readinessByMenuRepairItemId: new Map([
        [MENU_REPAIR_ITEM_ID, [{ ...READY_REQUIRED_LINE, matchedPartId: null, status: "unmatched" as const }]],
      ]),
      error: null,
    });
    const { supabase } = createSupabase(baseResolvers());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result).toEqual({
      eligible: false,
      reason: "A required part could not be matched unambiguously to the shop's parts catalog.",
    });
  });

  it("treats a required part that is merely short on stock as an exact (still-eligible) mapping", async () => {
    buildPartsReadinessForMenuRepairItemsMock.mockResolvedValue({
      readinessByMenuRepairItemId: new Map([
        [MENU_REPAIR_ITEM_ID, [{ ...READY_REQUIRED_LINE, qtyAvailable: 0, status: "short" as const }]],
      ]),
      error: null,
    });
    const { supabase } = createSupabase(baseResolvers());
    const { prepareAppointmentPartsRequest } = await import(
      "@/features/operations/server/appointmentPartsPreparation/prepareAppointmentPartsRequest"
    );
    const result = await prepareAppointmentPartsRequest({
      admin: supabase as never,
      shopId: "shop-1",
      workOrderLineId: LINE_ID,
    });
    expect(result.eligible).toBe(true);
  });
});
