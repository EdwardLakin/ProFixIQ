import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type TableName =
  | "inspections"
  | "work_orders"
  | "profiles"
  | "inspection_signatures"
  | "vehicles";
type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  rows: {
    inspections: [] as Row[],
    work_orders: [] as Row[],
    profiles: [] as Row[],
    inspection_signatures: [] as Row[],
    vehicles: [] as Row[],
  },
  fleetActor: {
    isFleetActor: false,
    shopId: null as string | null,
    fleetIds: [] as string[],
  },
  resolveFleetActorContext: vi.fn(),
}));

function queryFor(table: TableName) {
  const filters: Array<{ column: string; value: unknown }> = [];
  const resolveRows = () =>
    mocks.rows[table].filter((row) =>
      filters.every(({ column, value }) => row[column] === value),
    );
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    not: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockImplementation((column: string, value: unknown) => {
    filters.push({ column, value });
    return query;
  });
  query.or.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.maybeSingle.mockImplementation(async () => ({
    data: resolveRows()[0] ?? null,
    error: null,
  }));
  query.then.mockImplementation(
    (
      resolve: (value: { data: Row[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({ data: resolveRows(), error: null }).then(
        resolve,
        reject,
      ),
  );
  return query;
}

vi.mock("server-only", () => ({}));
vi.mock("@/features/integrations/shopreel/server/createAdminClient", () => ({
  createAdminClient: () => ({
    from: (table: TableName) => queryFor(table),
    storage: { from: vi.fn() },
  }),
}));
vi.mock("@/features/fleet/lib/resolveFleetActorContext", () => ({
  resolveFleetActorContext: mocks.resolveFleetActorContext,
}));
vi.mock("@/features/inspections/lib/inspection/report", () => ({
  assembleInspectionReport: vi.fn(() => ({
    title: "Inspection",
    sections: [],
    totals: {},
  })),
}));

import { getInspectionReportForActor } from "@/features/inspections/server/inspectionReportAccess";

function sessionClient(result: { data: boolean | null; error: unknown }) {
  return {
    rpc: vi.fn(async () => result),
  } as unknown as SupabaseClient<Database>;
}

function seedReport() {
  mocks.rows.inspections = [
    {
      id: "inspection-a",
      shop_id: "shop-a",
      work_order_id: "work-order-a",
      summary: { id: "inspection-a" },
      pdf_storage_path:
        "shops/shop-a/work_orders/work-order-a/inspections/inspection-a/report.pdf",
      finalized_at: "2026-08-26T00:00:00.000Z",
      finalized_by: "technician-a",
      signing_cycle: 1,
      is_canonical: true,
    },
  ];
  mocks.rows.work_orders = [
    {
      id: "work-order-a",
      custom_id: "WO-1",
      shop_id: "shop-a",
      customer_id: "customer-a",
      vehicle_id: "vehicle-a",
    },
  ];
  mocks.rows.profiles = [
    {
      id: "portal-user",
      user_id: "portal-user",
      shop_id: "shop-a",
      role: "customer",
    },
  ];
  mocks.rows.inspection_signatures = [];
  mocks.rows.vehicles = [
    { id: "vehicle-a", shop_id: "shop-a", fleet_id: "fleet-a" },
  ];
}

async function loadReport(
  client: SupabaseClient<Database>,
  actorUserId = "portal-user",
) {
  return getInspectionReportForActor({
    sessionClient: client,
    actorUserId,
    inspectionId: "inspection-a",
    includeEvidencePhotos: false,
  });
}

describe("inspection report customer authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const table of Object.keys(mocks.rows) as TableName[]) {
      mocks.rows[table] = [];
    }
    mocks.fleetActor = {
      isFleetActor: false,
      shopId: null,
      fleetIds: [],
    };
    mocks.resolveFleetActorContext.mockImplementation(async () => ({
      ...mocks.fleetActor,
    }));
    seedReport();
  });

  it("allows an actively linked portal customer", async () => {
    const client = sessionClient({ data: true, error: null });

    await expect(loadReport(client)).resolves.toMatchObject({
      inspectionId: "inspection-a",
      workOrderId: "work-order-a",
    });
    expect(client.rpc).toHaveBeenCalledWith("profixiq_is_portal_customer_for", {
      p_customer_id: "customer-a",
      p_shop_id: "shop-a",
    });
  });

  it("denies a customer after portal access is revoked", async () => {
    const client = sessionClient({ data: false, error: null });

    await expect(loadReport(client)).resolves.toBeNull();
  });

  it("fails closed when portal access cannot be checked", async () => {
    const client = sessionClient({
      data: null,
      error: { message: "portal access unavailable" },
    });

    await expect(loadReport(client)).resolves.toBeNull();
  });

  it("preserves staff-first access without requiring a portal result", async () => {
    mocks.rows.profiles = [
      {
        id: "staff-user",
        user_id: "staff-user",
        shop_id: "shop-a",
        role: "owner",
      },
    ];
    const client = sessionClient({
      data: null,
      error: { message: "portal access unavailable" },
    });

    await expect(loadReport(client, "staff-user")).resolves.toMatchObject({
      inspectionId: "inspection-a",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("preserves canonical Fleet fallback after portal denial", async () => {
    mocks.fleetActor = {
      isFleetActor: true,
      shopId: "shop-a",
      fleetIds: ["fleet-a"],
    };
    const client = sessionClient({ data: false, error: null });

    await expect(loadReport(client, "fleet-user")).resolves.toMatchObject({
      inspectionId: "inspection-a",
      vehicleId: "vehicle-a",
    });
  });
});
