import { describe, expect, it } from "vitest";

import type { CanonicalRole } from "@/features/shared/lib/rbac";
import {
  createWorkOrderHandoffHref,
  VEHICLE_WORKSPACE_READER_ROLES,
} from "@/features/vehicles/lib/vehicleWorkspace";
import {
  vehicleWorkspacePermissionsForRole,
} from "@/features/vehicles/server/vehicleWorkspacePermissions";
import {
  extractInspectionFindings,
  loadVehicleWorkspaceSnapshot,
  vehicleWorkspaceCreateWorkOrderHref,
} from "@/features/vehicles/server/loadVehicleWorkspaceSnapshot";
import { searchShopVehicleRecords } from "@/features/vehicles/server/searchShopVehicleRecords";

const SHOP_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "mechanic",
  "lead_hand",
  "foreman",
] as const satisfies readonly CanonicalRole[];

const NON_SHOP_ROLES = [
  "fleet_manager",
  "dispatcher",
  "driver",
  "customer",
  "unknown",
] as const satisfies readonly CanonicalRole[];

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type QueryCall = {
  table: string;
  operation: string;
  args: unknown[];
};

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  in: (...args: unknown[]) => QueryBuilder;
  neq: (...args: unknown[]) => QueryBuilder;
  or: (...args: unknown[]) => QueryBuilder;
  gte: (...args: unknown[]) => QueryBuilder;
  gt: (...args: unknown[]) => QueryBuilder;
  lt: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  range: (...args: unknown[]) => QueryBuilder;
  maybeSingle: (...args: unknown[]) => QueryBuilder;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2>;
};

function createSupabaseFixture(
  results: Record<string, QueryResult[]>,
): { client: unknown; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const tableCounts = new Map<string, number>();

  const client = {
    from(table: string) {
      const index = tableCounts.get(table) ?? 0;
      tableCounts.set(table, index + 1);
      const result = results[table]?.[index];
      if (!result) {
        throw new Error(`Missing Supabase fixture result for ${table}[${index}]`);
      }
      const query: QueryBuilder = {
        select(...args: unknown[]) {
          calls.push({ table, operation: "select", args });
          return query;
        },
        eq(...args: unknown[]) {
          calls.push({ table, operation: "eq", args });
          return query;
        },
        in(...args: unknown[]) {
          calls.push({ table, operation: "in", args });
          return query;
        },
        neq(...args: unknown[]) {
          calls.push({ table, operation: "neq", args });
          return query;
        },
        or(...args: unknown[]) {
          calls.push({ table, operation: "or", args });
          return query;
        },
        gte(...args: unknown[]) {
          calls.push({ table, operation: "gte", args });
          return query;
        },
        gt(...args: unknown[]) {
          calls.push({ table, operation: "gt", args });
          return query;
        },
        lt(...args: unknown[]) {
          calls.push({ table, operation: "lt", args });
          return query;
        },
        order(...args: unknown[]) {
          calls.push({ table, operation: "order", args });
          return query;
        },
        limit(...args: unknown[]) {
          calls.push({ table, operation: "limit", args });
          return query;
        },
        range(...args: unknown[]) {
          calls.push({ table, operation: "range", args });
          return query;
        },
        maybeSingle(...args: unknown[]) {
          calls.push({ table, operation: "maybeSingle", args });
          return query;
        },
        then<TResult1 = QueryResult, TResult2 = never>(
          onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
          return Promise.resolve(result).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };

  return { client, calls };
}

function workspaceFixture(
  overrides: {
    additionalWorkOrders?: unknown[];
    bookings?: unknown[];
    history?: unknown[];
    invoices?: unknown[];
    inspections?: unknown[];
    maintenanceSuggestion?: unknown | null;
    partRequests?: unknown[];
    quoteLines?: unknown[];
    workOrderLines?: unknown[];
    workOrderMedia?: unknown[];
    workOrderParts?: unknown[];
  } = {},
) {
  const vehicle = {
    id: "vehicle-1",
    shop_id: "shop-a",
    customer_id: "customer-1",
    year: 2022,
    make: "Ford",
    model: "Transit",
    submodel: null,
    vin: "1FTBW1X80NKA12345",
    license_plate: "SHOP-22",
    unit_number: "17",
    mileage: "64000",
    odometer_unit: "km",
    engine_hours: null,
    status: "active",
  };
  const workOrders = [
    {
      id: "wo-1",
      customer_id: "customer-1",
      vehicle_id: vehicle.id,
      custom_id: "1048",
      status: "in_progress",
      record_type: "work_order",
      approval_state: "approved",
      estimate_number: null,
      estimate_status: null,
      scheduled_at: null,
      odometer_km: 64000,
      created_at: "2026-01-01T10:00:00.000Z",
      updated_at: "2026-01-03T10:00:00.000Z",
    },
    {
      id: "wo-2",
      customer_id: "customer-1",
      vehicle_id: vehicle.id,
      custom_id: "1051",
      status: "awaiting_approval",
      record_type: "work_order",
      approval_state: "pending",
      estimate_number: null,
      estimate_status: null,
      scheduled_at: null,
      odometer_km: 64100,
      created_at: "2026-01-02T10:00:00.000Z",
      updated_at: "2026-01-04T10:00:00.000Z",
    },
    ...(overrides.additionalWorkOrders ?? []),
  ];
  const workOrderChunkCount = Math.max(1, Math.ceil(workOrders.length / 100));
  const chunkedResults = (data: unknown[]) =>
    Array.from({ length: workOrderChunkCount }, (_, index) => ({
      data: index === 0 ? data : [],
      error: null,
    }));

  const inspections =
    overrides.inspections ??
    [
      {
        id: "inspection-1",
        work_order_id: "wo-1",
        work_order_line_id: null,
        inspection_type: "Digital vehicle inspection",
        status: "completed",
        completed: true,
        summary: {
          items: [
            {
              item: "Front brakes",
              status: "fail",
              value: "3",
              unit: "mm",
              note: "Below service limit",
            },
          ],
        },
        created_at: "2026-01-02T10:00:00.000Z",
        started_at: "2026-01-02T10:00:00.000Z",
        finalized_at: "2026-01-02T11:00:00.000Z",
        updated_at: "2026-01-02T11:00:00.000Z",
        pdf_url: null,
        pdf_storage_path: null,
      },
    ];

  return createSupabaseFixture({
    vehicles: [
      { data: vehicle, error: null },
      { data: [], error: null },
    ],
    work_orders: [{ data: workOrders, error: null }],
    customers: [
      {
        data: {
          id: "customer-1",
          account_type: "business",
          active: true,
          business_name: "North Star Plumbing",
          name: null,
          first_name: null,
          last_name: null,
          email: "dispatch@example.test",
          phone: "555-0100",
          phone_number: null,
          archived_at: null,
          merged_into_customer_id: null,
        },
        error: null,
      },
    ],
    bookings: [
      {
        data:
          overrides.bookings ??
          [
            {
              id: "booking-1",
              work_order_id: "wo-1",
              starts_at: "2026-02-03T10:00:00.000Z",
              ends_at: "2026-02-03T11:00:00.000Z",
              status: "confirmed",
              notes: "Waiter",
              created_at: "2026-01-01T10:00:00.000Z",
            },
          ],
        error: null,
      },
      { data: [], error: null },
    ],
    inspections: [{ data: inspections, error: null }],
    work_order_lines: chunkedResults(overrides.workOrderLines ?? []),
    work_order_parts: chunkedResults(overrides.workOrderParts ?? []),
    work_order_quote_lines: chunkedResults(overrides.quoteLines ?? []),
    maintenance_suggestions: [
      { data: overrides.maintenanceSuggestion ?? null, error: null },
    ],
    history: [{ data: overrides.history ?? [], error: null }],
    vehicle_media: [{ data: [], error: null }],
    work_order_media: chunkedResults(overrides.workOrderMedia ?? []),
    part_requests: chunkedResults(overrides.partRequests ?? []),
    invoices: chunkedResults(
      overrides.invoices ??
        [
          {
            id: "invoice-1",
            work_order_id: "wo-1",
            invoice_number: "INV-1048",
            status: "open",
            currency: "CAD",
            total: 850,
            outstanding_total: 250,
            paid_total: 600,
            created_at: "2026-01-03T10:00:00.000Z",
            issued_at: "2026-01-03T10:00:00.000Z",
            paid_at: null,
            updated_at: "2026-01-03T10:00:00.000Z",
          },
        ],
    ),
    payments: chunkedResults([]),
  });
}

function searchVehicleRow(
  overrides: {
    customerId?: string | null;
    id?: string;
    licensePlate?: string | null;
    make?: string;
    status?: string | null;
    vin?: string | null;
  } = {},
) {
  return {
    id: overrides.id ?? "vehicle-1",
    customer_id: overrides.customerId ?? null,
    year: 2022,
    make: overrides.make ?? "Ford",
    model: "Transit",
    submodel: null,
    vin:
      overrides.vin === undefined
        ? "1FTBW1X80NKA12345"
        : overrides.vin,
    license_plate:
      overrides.licensePlate === undefined
        ? "SHOP-22"
        : overrides.licensePlate,
    unit_number: "17",
    mileage: "64000",
    odometer_unit: "km",
    engine_hours: null,
    status: overrides.status === undefined ? "active" : overrides.status,
    created_at: "2026-01-01T10:00:00.000Z",
  };
}

function searchWorkOrderRow(
  id: string,
  vehicleId: string,
  overrides: {
    customId?: string | null;
    estimateNumber?: string | null;
    estimateStatus?: string | null;
    odometerKm?: number | null;
    recordType?: string;
    scheduledAt?: string | null;
    status?: string;
    createdAt?: string;
    updatedAt?: string | null;
    vehicleMileage?: string | null;
  } = {},
) {
  return {
    id,
    custom_id: overrides.customId === undefined ? id : overrides.customId,
    status: overrides.status ?? "in_progress",
    record_type: overrides.recordType ?? "work_order",
    estimate_number: overrides.estimateNumber ?? null,
    estimate_status: overrides.estimateStatus ?? null,
    customer_id: null,
    customer_name: null,
    vehicle_id: vehicleId,
    vehicle_year: 2022,
    vehicle_make: "Ford",
    vehicle_model: "Transit",
    vehicle_submodel: null,
    vehicle_vin: "1FTBW1X80NKA12345",
    vehicle_license_plate: "SHOP-22",
    vehicle_unit_number: "17",
    vehicle_mileage:
      overrides.vehicleMileage === undefined
        ? "64000"
        : overrides.vehicleMileage,
    odometer_km:
      overrides.odometerKm === undefined ? 64000 : overrides.odometerKm,
    scheduled_at: overrides.scheduledAt ?? null,
    created_at: overrides.createdAt ?? "2026-01-01T10:00:00.000Z",
    updated_at:
      overrides.updatedAt === undefined
        ? "2026-01-02T10:00:00.000Z"
        : overrides.updatedAt,
  };
}

async function runDirectVehicleSearch(query: string, vehicle: unknown) {
  const fixture = createSupabaseFixture({
    vehicles: [
      { data: [vehicle], error: null },
      { data: [vehicle], error: null },
    ],
    work_orders: [
      { data: [], error: null },
      { data: [], error: null },
    ],
    customers: [{ data: [], error: null }],
    bookings: [{ data: [], error: null }],
    work_order_lines: [{ data: [], error: null }],
    work_order_quote_lines: [{ data: [], error: null }],
  });
  const response = await searchShopVehicleRecords({
    supabase: fixture.client as never,
    shopId: "shop-a",
    role: "owner",
    query,
    now: new Date("2026-01-10T00:00:00.000Z"),
  });
  return { fixture, response };
}

describe("Shop Vehicle Workspace contract", () => {
  it("keeps an explicit Shop-reader allowlist and excludes portal and Fleet roles", () => {
    expect(VEHICLE_WORKSPACE_READER_ROLES).toEqual(SHOP_ROLES);
    expect(
      NON_SHOP_ROLES.filter((role) =>
        VEHICLE_WORKSPACE_READER_ROLES.includes(
          role as (typeof VEHICLE_WORKSPACE_READER_ROLES)[number],
        ),
      ),
    ).toEqual([]);
  });

  it("projects role capabilities without expanding financial access", () => {
    const projected = Object.fromEntries(
      [...SHOP_ROLES, ...NON_SHOP_ROLES].map((role) => [
        role,
        vehicleWorkspacePermissionsForRole(role),
      ]),
    );

    expect(Object.fromEntries(SHOP_ROLES.map((role) => [role, projected[role]])))
      .toEqual({
        owner: {
          canViewAccountContact: true,
          canOpenAccount: true,
          canViewFinancials: true,
          canViewEstimates: true,
          canOpenInspections: true,
          canOpenWorkOrders: true,
          canViewPartRequests: true,
          canCreateWorkOrder: true,
          canBookAppointment: true,
          canCreateEstimate: true,
          canMessageCustomer: true,
          canViewRelatedVehicles: true,
          isAssignedWorkOnly: false,
        },
        admin: {
          canViewAccountContact: true,
          canOpenAccount: true,
          canViewFinancials: true,
          canViewEstimates: true,
          canOpenInspections: true,
          canOpenWorkOrders: true,
          canViewPartRequests: true,
          canCreateWorkOrder: true,
          canBookAppointment: true,
          canCreateEstimate: true,
          canMessageCustomer: true,
          canViewRelatedVehicles: true,
          isAssignedWorkOnly: false,
        },
        manager: {
          canViewAccountContact: true,
          canOpenAccount: true,
          canViewFinancials: true,
          canViewEstimates: true,
          canOpenInspections: true,
          canOpenWorkOrders: true,
          canViewPartRequests: true,
          canCreateWorkOrder: true,
          canBookAppointment: true,
          canCreateEstimate: true,
          canMessageCustomer: true,
          canViewRelatedVehicles: true,
          isAssignedWorkOnly: false,
        },
        advisor: {
          canViewAccountContact: true,
          canOpenAccount: true,
          canViewFinancials: false,
          canViewEstimates: true,
          canOpenInspections: true,
          canOpenWorkOrders: true,
          canViewPartRequests: false,
          canCreateWorkOrder: true,
          canBookAppointment: true,
          canCreateEstimate: true,
          canMessageCustomer: true,
          canViewRelatedVehicles: true,
          isAssignedWorkOnly: false,
        },
        service: {
          canViewAccountContact: true,
          canOpenAccount: false,
          canViewFinancials: false,
          canViewEstimates: true,
          canOpenInspections: false,
          canOpenWorkOrders: false,
          canViewPartRequests: false,
          canCreateWorkOrder: true,
          canBookAppointment: false,
          canCreateEstimate: true,
          canMessageCustomer: true,
          canViewRelatedVehicles: true,
          isAssignedWorkOnly: false,
        },
        parts: {
          canViewAccountContact: false,
          canOpenAccount: false,
          canViewFinancials: false,
          canViewEstimates: true,
          canOpenInspections: false,
          canOpenWorkOrders: false,
          canViewPartRequests: true,
          canCreateWorkOrder: false,
          canBookAppointment: false,
          canCreateEstimate: false,
          canMessageCustomer: false,
          canViewRelatedVehicles: true,
          isAssignedWorkOnly: false,
        },
        mechanic: {
          canViewAccountContact: false,
          canOpenAccount: false,
          canViewFinancials: false,
          canViewEstimates: false,
          canOpenInspections: false,
          canOpenWorkOrders: true,
          canViewPartRequests: false,
          canCreateWorkOrder: false,
          canBookAppointment: false,
          canCreateEstimate: false,
          canMessageCustomer: false,
          canViewRelatedVehicles: false,
          isAssignedWorkOnly: true,
        },
        lead_hand: {
          canViewAccountContact: true,
          canOpenAccount: false,
          canViewFinancials: false,
          canViewEstimates: true,
          canOpenInspections: true,
          canOpenWorkOrders: true,
          canViewPartRequests: false,
          canCreateWorkOrder: true,
          canBookAppointment: true,
          canCreateEstimate: false,
          canMessageCustomer: true,
          canViewRelatedVehicles: true,
          isAssignedWorkOnly: false,
        },
        foreman: {
          canViewAccountContact: true,
          canOpenAccount: false,
          canViewFinancials: false,
          canViewEstimates: true,
          canOpenInspections: true,
          canOpenWorkOrders: true,
          canViewPartRequests: false,
          canCreateWorkOrder: true,
          canBookAppointment: true,
          canCreateEstimate: true,
          canMessageCustomer: true,
          canViewRelatedVehicles: true,
          isAssignedWorkOnly: false,
        },
      });
    expect(
      Object.entries(projected)
        .filter(([, permissions]) => permissions.canViewFinancials)
        .map(([role]) => role),
    ).toEqual(["owner", "admin", "manager"]);
    expect(
      Object.entries(projected)
        .filter(([, permissions]) => permissions.canViewEstimates)
        .map(([role]) => role),
    ).toEqual([
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
      "parts",
      "lead_hand",
      "foreman",
    ]);
    expect(
      Object.entries(projected)
        .filter(([, permissions]) => permissions.canOpenInspections)
        .map(([role]) => role),
    ).toEqual([
      "owner",
      "admin",
      "manager",
      "advisor",
      "lead_hand",
      "foreman",
    ]);
    expect(
      Object.entries(projected)
        .filter(([, permissions]) => permissions.canOpenWorkOrders)
        .map(([role]) => role),
    ).toEqual([
      "owner",
      "admin",
      "manager",
      "advisor",
      "mechanic",
      "lead_hand",
      "foreman",
    ]);
    expect(
      Object.entries(projected)
        .filter(([, permissions]) => permissions.canViewPartRequests)
        .map(([role]) => role),
    ).toEqual(["owner", "admin", "manager", "parts"]);
    expect(NON_SHOP_ROLES.map((role) => projected[role])).toEqual(
      NON_SHOP_ROLES.map(() => ({
        canViewAccountContact: false,
        canOpenAccount: false,
        canViewFinancials: false,
        canViewEstimates: false,
        canOpenInspections: false,
        canOpenWorkOrders: false,
        canViewPartRequests: false,
        canCreateWorkOrder: false,
        canBookAppointment: false,
        canCreateEstimate: false,
        canMessageCustomer: false,
        canViewRelatedVehicles: false,
        isAssignedWorkOnly: false,
      })),
    );
  });

  it("hands the canonical customer and vehicle to the existing fast work-order flow", () => {
    const href = createWorkOrderHandoffHref({
      customerId: "customer/id",
      vehicleId: "vehicle id",
    });

    expect(href).not.toBeNull();
    const url = new URL(href!, "https://shop.example.test");
    expect(url.pathname).toBe("/work-orders/create");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      autostart: "1",
      customerId: "customer/id",
      vehicleId: "vehicle id",
    });
    expect(
      createWorkOrderHandoffHref({ customerId: null, vehicleId: "vehicle-1" }),
    ).toBeNull();
  });

  it("parses only failed and recommended inspection evidence", () => {
    expect(
      extractInspectionFindings({
        items: [
          { item: "Battery", status: "pass" },
          { item: "Front brakes", status: "FAIL", value: "3", unit: "mm" },
        ],
        sections: [
          {
            title: "Tires",
            items: [
              {
                name: "Right rear",
                status: "recommend",
                notes: "Uneven wear",
              },
            ],
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        label: "Front brakes",
        status: "fail",
        measurement: "3 mm",
      }),
      expect.objectContaining({
        label: "Right rear",
        section: "Tires",
        status: "recommend",
        note: "Uneven wear",
      }),
    ]);
  });

  it("returns canonical source references and preserves every active work order", async () => {
    const fixture = workspaceFixture();
    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.identity).toMatchObject({
      mileage: "64100",
      odometerUnit: "km",
    });
    expect(snapshot).toEqual(
      expect.objectContaining({
        activeWork: expect.any(Array),
        upcomingAppointments: expect.any(Array),
        attentionItems: expect.any(Array),
        recentTimeline: expect.any(Array),
        relatedVehicles: expect.any(Array),
        conflicts: expect.any(Array),
      }),
    );

    const workOrderSources = snapshot!.activeWork
      .filter((item) => item.reference.sourceType === "work_order")
      .map((item) => item.reference.sourceId);
    expect(workOrderSources).toEqual(["wo-2", "wo-1"]);
    expect(snapshot!.conflicts).toContainEqual(
      expect.objectContaining({
        kind: "multiple_active_work_orders",
        sourceIds: ["wo-1", "wo-2"],
      }),
    );

    for (const collection of [
      snapshot!.activeWork,
      snapshot!.upcomingAppointments,
      snapshot!.attentionItems,
      snapshot!.recentTimeline,
    ]) {
      expect(collection.length).toBeGreaterThan(0);
      expect(collection.every((item) => item.reference.sourceId.length > 0)).toBe(
        true,
      );
    }
    expect(snapshot!.attentionItems).toContainEqual(
      expect.objectContaining({
        kind: "failed_inspection",
        title: "Front brakes",
        explanation: expect.stringContaining("3 mm"),
        reference: expect.objectContaining({
          sourceType: "inspection",
          sourceId: "inspection-1",
        }),
      }),
    );
    expect(snapshot!.recentTimeline).toContainEqual(
      expect.objectContaining({
        kind: "work_order",
        detail: expect.stringContaining("Odometer: 64100 km"),
        reference: expect.objectContaining({ sourceId: "wo-2" }),
      }),
    );
  });

  it("blocks Create WO for archived-account or vehicle-status conflicts only", async () => {
    const fixture = workspaceFixture();
    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });
    const conflict = (
      kind: "archived_account" | "historical_owner" | "vehicle_status",
    ) => ({
      kind,
      title: kind,
      detail: kind,
      sourceIds: ["source-1"],
    });

    expect(vehicleWorkspaceCreateWorkOrderHref(snapshot!)).not.toBeNull();
    expect(
      vehicleWorkspaceCreateWorkOrderHref({
        ...snapshot!,
        conflicts: [conflict("historical_owner")],
      }),
    ).not.toBeNull();
    expect(
      vehicleWorkspaceCreateWorkOrderHref({
        ...snapshot!,
        conflicts: [conflict("archived_account")],
      }),
    ).toBeNull();
    expect(
      vehicleWorkspaceCreateWorkOrderHref({
        ...snapshot!,
        conflicts: [conflict("vehicle_status")],
      }),
    ).toBeNull();
  });

  it("retains imported odometer evidence and earlier-account ambiguity", async () => {
    const historyRow = (id: string) => ({
      id,
      customer_id: "customer-old",
      work_order_id: null,
      work_order_number: "LEGACY-17",
      historical_status: "completed",
      description: "Imported service",
      odometer: 59000,
      service_date: "2025-12-01",
      opened_at: "2025-12-01T10:00:00.000Z",
      closed_at: "2025-12-01T12:00:00.000Z",
      source_system: "legacy",
    });
    const fixture = workspaceFixture({
      history: [historyRow("history-1"), historyRow("history-2")],
    });
    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });

    expect(snapshot?.recentTimeline).toContainEqual(
      expect.objectContaining({
        kind: "history",
        detail: expect.stringContaining("Odometer: 59000"),
        reference: expect.objectContaining({
          sourceType: "history",
          sourceId: "history-1",
        }),
      }),
    );
    expect(snapshot?.conflicts).toContainEqual(
      expect.objectContaining({
        kind: "historical_owner",
        sourceIds: ["customer-old"],
      }),
    );
  });

  it("keeps only genuinely open inspections in Active now", async () => {
    const inspection = (id: string, status: string, completed = false) => ({
      id,
      work_order_id: "wo-1",
      work_order_line_id: null,
      inspection_type: id,
      status,
      completed,
      summary: { items: [] },
      created_at: "2026-01-02T10:00:00.000Z",
      started_at: "2026-01-02T10:00:00.000Z",
      finalized_at: status === "finalized" ? "2026-01-02T11:00:00.000Z" : null,
      updated_at: "2026-01-02T11:00:00.000Z",
      pdf_url: null,
      pdf_storage_path: null,
    });
    const fixture = workspaceFixture({
      inspections: [
        inspection("inspection-open", "in-progress"),
        inspection("inspection-finalized", "finalized"),
        inspection("inspection-cancelled", "cancelled"),
        inspection("inspection-completed", "completed", true),
      ],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });

    expect(
      snapshot?.activeWork
        .filter((item) => item.kind === "inspection")
        .map((item) => item.reference.sourceId),
    ).toEqual(["inspection-open"]);
  });

  it("keeps completed or canceled future bookings out of upcoming appointments", async () => {
    const booking = (id: string, status: string) => ({
      id,
      work_order_id: "wo-1",
      starts_at: "2026-02-03T10:00:00.000Z",
      ends_at: "2026-02-03T11:00:00.000Z",
      status,
      notes: null,
      created_at: "2026-01-01T10:00:00.000Z",
    });
    const fixture = workspaceFixture({
      bookings: [
        booking("booking-confirmed", "confirmed"),
        booking("booking-completed", "completed"),
        booking("booking-canceled", "canceled"),
      ],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(
      snapshot?.upcomingAppointments.map(
        (appointment) => appointment.reference.sourceId,
      ),
    ).toEqual(["booking-confirmed"]);
    const upcomingCalls = fixture.calls.filter(
      (call) => call.table === "bookings" &&
        ["gte", "order", "range"].includes(call.operation),
    );
    expect(upcomingCalls).toContainEqual({
      table: "bookings",
      operation: "gte",
      args: ["ends_at", "2026-01-10T00:00:00.000Z"],
    });
    expect(upcomingCalls).toContainEqual({
      table: "bookings",
      operation: "order",
      args: ["starts_at", { ascending: true }],
    });
    expect(upcomingCalls).toContainEqual({
      table: "bookings",
      operation: "range",
      args: [0, 99],
    });
  });

  it("pages complete work-order evidence and retains an older open record", async () => {
    const newerClosedRows = Array.from({ length: 101 }, (_, index) => ({
      id: `wo-closed-${index}`,
      customer_id: "customer-1",
      vehicle_id: "vehicle-1",
      custom_id: `CLOSED-${index}`,
      status: "completed",
      record_type: "work_order",
      approval_state: "approved",
      estimate_number: null,
      estimate_status: null,
      scheduled_at: null,
      odometer_km: null,
      created_at: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
      updated_at: "2026-02-01T10:00:00.000Z",
    }));
    const olderOpen = {
      id: "wo-older-open",
      customer_id: "customer-1",
      vehicle_id: "vehicle-1",
      custom_id: "0042",
      status: "in_progress",
      record_type: "work_order",
      approval_state: "approved",
      estimate_number: null,
      estimate_status: null,
      scheduled_at: "2020-01-05T10:00:00.000Z",
      odometer_km: 12000,
      created_at: "2020-01-01T10:00:00.000Z",
      updated_at: "2026-08-01T10:00:00.000Z",
    };
    const fixture = workspaceFixture({
      additionalWorkOrders: [...newerClosedRows, olderOpen],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });

    expect(snapshot?.identity.mileage).toBe("64100");
    expect(snapshot?.activeWork).toContainEqual(
      expect.objectContaining({
        kind: "work_order",
        reference: expect.objectContaining({ sourceId: "wo-older-open" }),
      }),
    );
    expect(
      snapshot?.conflicts.find(
        (conflict) => conflict.kind === "multiple_active_work_orders",
      )?.sourceIds,
    ).toContain("wo-older-open");

    const partScopes = fixture.calls.filter(
      (call) => call.table === "work_order_parts" && call.operation === "in",
    );
    expect(partScopes).toHaveLength(2);
    expect(partScopes[1]?.args[1]).toContain("wo-older-open");
    const workOrderCalls = fixture.calls.filter(
      (call) => call.table === "work_orders",
    );
    expect(workOrderCalls).toContainEqual({
      table: "work_orders",
      operation: "range",
      args: [0, 499],
    });
    expect(workOrderCalls.some((call) => call.operation === "limit")).toBe(
      false,
    );
  });

  it("uses only a fresh cache for the latest canonical service work order", async () => {
    const suggestion = {
      work_order_id: "wo-2",
      vehicle_id: "vehicle-1",
      status: "ready",
      suggestions: [
        {
          label: "Engine oil service",
          serviceCode: "OIL",
          dueNow: true,
          suppressed: false,
          whyDue: "Mileage interval reached",
        },
      ],
      created_at: "2026-01-02T12:00:00.000Z",
      updated_at: "2026-01-05T12:00:00.000Z",
      error_message: null,
      mileage_km: 64100,
    };
    const freshFixture = workspaceFixture({ maintenanceSuggestion: suggestion });
    const staleFixture = workspaceFixture({
      maintenanceSuggestion: {
        ...suggestion,
        updated_at: "2026-01-03T12:00:00.000Z",
      },
    });

    const [fresh, stale] = await Promise.all([
      loadVehicleWorkspaceSnapshot({
        supabase: freshFixture.client as never,
        shopId: "shop-a",
        role: "owner",
        vehicleId: "vehicle-1",
      }),
      loadVehicleWorkspaceSnapshot({
        supabase: staleFixture.client as never,
        shopId: "shop-a",
        role: "owner",
        vehicleId: "vehicle-1",
      }),
    ]);

    expect(fresh?.attentionItems).toContainEqual(
      expect.objectContaining({
        kind: "maintenance_due",
        title: "Engine oil service",
        explanation: "Mileage interval reached · evaluated for WO-1051",
        reference: expect.objectContaining({ sourceId: "wo-2" }),
      }),
    );
    expect(
      fresh?.attentionItems.filter((item) => item.kind === "maintenance_due"),
    ).toHaveLength(1);
    expect(
      fresh?.attentionItems.find((item) => item.kind === "maintenance_due")
        ?.explanation,
    ).not.toContain("OIL");
    expect(stale?.attentionItems.some((item) => item.kind === "maintenance_due"))
      .toBe(false);
    expect(
      freshFixture.calls.filter(
        (call) => call.table === "maintenance_suggestions" &&
          call.operation === "eq",
      ),
    ).toContainEqual({
      table: "maintenance_suggestions",
      operation: "eq",
      args: ["work_order_id", "wo-2"],
    });
  });

  it("deduplicates deferred quote evidence without suppressing unrelated line attention", async () => {
    const line = (
      id: string,
      overrides: Partial<{
        approval_state: string | null;
        hold_reason: string | null;
        line_status: string | null;
        status: string;
        voided_at: string | null;
      }> = {},
    ) => ({
      id,
      work_order_id: "wo-1",
      description: `Repair ${id}`,
      complaint: "Customer concern",
      correction: null,
      hold_reason: null,
      status: "pending",
      line_status: "pending",
      approval_state: "pending",
      urgency: "normal",
      voided_at: null,
      created_at: "2026-01-02T10:00:00.000Z",
      updated_at: "2026-01-03T10:00:00.000Z",
      ...overrides,
    });
    const quoteLine = (
      id: string,
      workOrderLineId: string,
      decision: string,
    ) => ({
      id,
      work_order_id: "wo-1",
      work_order_line_id: workOrderLineId,
      source_work_order_line_id: null,
      description: `Estimate ${id}`,
      title: `Estimate ${id}`,
      status: "open",
      decision,
      defer_reason: decision.includes("defer") ? "Customer deferred" : null,
      decline_reason: null,
      approved_at: decision.includes("approved")
        ? "2026-01-04T10:00:00.000Z"
        : null,
      deferred_at: decision.includes("defer")
        ? "2026-01-04T10:00:00.000Z"
        : null,
      declined_at: null,
      created_at: "2026-01-02T10:00:00.000Z",
      updated_at: "2026-01-04T10:00:00.000Z",
    });
    const fixture = workspaceFixture({
      workOrderLines: [
        line("line-waiting", { line_status: "Waiting Parts" }),
        line("line-linked-deferred", { line_status: "deferred" }),
        line("line-awaiting", { line_status: "awaiting-parts" }),
        line("line-declined", {
          line_status: "pending",
          approval_state: "customer declined",
        }),
        line("line-held", { hold_reason: "Backordered" }),
        line("line-voided", {
          line_status: "deferred",
          voided_at: "2026-01-05T10:00:00.000Z",
        }),
        line("line-canceled", {
          status: "canceled",
        }),
      ],
      quoteLines: [
        quoteLine("quote-approved", "line-waiting", "approved"),
        quoteLine(
          "quote-deferred",
          "line-linked-deferred",
          "customer deferred",
        ),
      ],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });
    const attentionSources = snapshot?.attentionItems.map(
      (item) => `${item.reference.sourceType}:${item.reference.sourceId}`,
    );

    expect(attentionSources).toEqual(
      expect.arrayContaining([
        "work_order_quote_line:quote-deferred",
        "work_order_line:line-waiting",
        "work_order_line:line-awaiting",
        "work_order_line:line-declined",
        "work_order_line:line-held",
      ]),
    );
    expect(attentionSources).not.toContain(
      "work_order_line:line-linked-deferred",
    );
    expect(attentionSources).not.toContain("work_order_quote_line:quote-approved");
    expect(attentionSources).not.toContain("work_order_line:line-voided");
    expect(attentionSources).not.toContain("work_order_line:line-canceled");
    expect(snapshot?.recentTimeline).toContainEqual(
      expect.objectContaining({
        kind: "approval",
        title: "Estimate quote-approved",
        detail: "Decision: Approved",
        reference: expect.objectContaining({
          sourceType: "work_order_quote_line",
          sourceId: "quote-approved",
          href: "/estimates/wo-1",
        }),
      }),
    );
  });

  it("projects only net-installed canonical parts into the timeline", async () => {
    const part = (
      id: string,
      overrides: Partial<{
        description_snapshot: string | null;
        is_active: boolean;
        manufacturer_snapshot: string | null;
        part_number_snapshot: string | null;
        quantity_consumed: number;
        quantity_returned: number;
        updated_at: string;
        work_order_id: string;
        work_order_line_id: string | null;
      }> = {},
    ) => ({
      id,
      work_order_id: "wo-1",
      work_order_line_id: "line-1",
      description_snapshot: `Part ${id}`,
      manufacturer_snapshot: null,
      part_number_snapshot: null,
      sku_snapshot: null,
      quantity_consumed: 1,
      quantity_returned: 0,
      is_active: true,
      created_at: "2026-01-07T10:00:00.000Z",
      updated_at: "2026-01-08T10:00:00.000Z",
      ...overrides,
    });
    const fixture = workspaceFixture({
      workOrderParts: [
        part("part-focused", {
          description_snapshot: "Front brake pad set",
          quantity_consumed: 3,
          quantity_returned: 1,
          updated_at: "2026-01-09T10:00:00.000Z",
        }),
        part("part-work-order", {
          description_snapshot: null,
          manufacturer_snapshot: "ACDelco",
          part_number_snapshot: "PF63",
          work_order_id: "wo-2",
          work_order_line_id: null,
        }),
        part("part-inactive", { is_active: false, quantity_consumed: 4 }),
        part("part-returned", {
          quantity_consumed: 2,
          quantity_returned: 2,
        }),
      ],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });
    const partEvents = snapshot?.recentTimeline.filter(
      (event) => event.kind === "part",
    );
    const partSelect = fixture.calls.find(
      (call) =>
        call.table === "work_order_parts" && call.operation === "select",
    );

    expect(partEvents).toEqual([
      expect.objectContaining({
        title: "Front brake pad set",
        detail: "Installed quantity: 2",
        reference: expect.objectContaining({
          sourceType: "work_order_part",
          sourceId: "part-focused",
          href: "/work-orders/wo-1/focused-job/line-1",
        }),
      }),
      expect.objectContaining({
        title: "ACDelco PF63",
        detail: "Installed quantity: 1",
        reference: expect.objectContaining({
          sourceType: "work_order_part",
          sourceId: "part-work-order",
          href: "/work-orders/wo-2",
        }),
      }),
    ]);
    expect(partSelect?.args[0]).toContain("quantity_consumed");
    expect(partSelect?.args[0]).toContain("quantity_returned");
    expect(String(partSelect?.args[0])).not.toContain("price");
    expect(String(partSelect?.args[0])).not.toContain("cost");
    expect(
      fixture.calls.some(
        (call) =>
          call.table === "work_order_parts" &&
          call.operation === "eq" &&
          call.args[0] === "shop_id" &&
          call.args[1] === "shop-a",
      ),
    ).toBe(true);
  });

  it("shows active parts requests only to roles accepted by the canonical parts route", async () => {
    const requested = {
      id: "request-open",
      work_order_id: "wo-1",
      status: "requested",
      notes: "Brake pads needed",
      created_at: "2026-01-08T10:00:00.000Z",
    };
    const fulfilled = {
      ...requested,
      id: "request-fulfilled",
      status: "fulfilled",
    };
    const partsFixture = workspaceFixture({
      partRequests: [requested, fulfilled],
    });
    const partsSnapshot = await loadVehicleWorkspaceSnapshot({
      supabase: partsFixture.client as never,
      shopId: "shop-a",
      role: "parts",
      vehicleId: "vehicle-1",
    });
    const advisorFixture = workspaceFixture({ partRequests: [requested] });
    const advisorSnapshot = await loadVehicleWorkspaceSnapshot({
      supabase: advisorFixture.client as never,
      shopId: "shop-a",
      role: "advisor",
      vehicleId: "vehicle-1",
    });

    expect(
      partsSnapshot?.activeWork.filter((item) => item.kind === "part_request"),
    ).toEqual([
      expect.objectContaining({
        title: "Brake pads needed",
        status: "requested",
        detail: "Requested for WO-1048",
        reference: expect.objectContaining({
          sourceType: "part_request",
          sourceId: "request-open",
          href: "/parts/requests/request-open",
        }),
      }),
    ]);
    expect(
      partsFixture.calls.filter((call) => call.table === "part_requests"),
    ).not.toHaveLength(0);
    expect(
      advisorFixture.calls.filter((call) => call.table === "part_requests"),
    ).toEqual([]);
    expect(
      advisorSnapshot?.activeWork.some((item) => item.kind === "part_request"),
    ).toBe(false);
  });

  it("labels opaque work-order media with its canonical source record", async () => {
    const fixture = workspaceFixture({
      workOrderMedia: [
        {
          id: "media-1",
          work_order_id: "wo-1",
          kind: "photo",
          file_name: "ea15b3b8-7ed4-421a-bf68-92475461c6cd.jpg",
          created_at: "2026-01-08T10:00:00.000Z",
        },
      ],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });

    expect(snapshot?.documentSummary.latestReference).toEqual({
      sourceType: "work_order_media",
      sourceId: "media-1",
      sourceLabel: "Photo from WO-1048",
      href: "/work-orders/wo-1",
    });
    expect(snapshot?.documentSummary.latestReference?.sourceLabel).not.toContain(
      "ea15b3b8",
    );
  });

  it("opens estimate records through their canonical estimate route", async () => {
    const fixture = workspaceFixture({
      additionalWorkOrders: [
        {
          id: "estimate-1",
          customer_id: "customer-1",
          vehicle_id: "vehicle-1",
          custom_id: null,
          status: "awaiting_approval",
          record_type: "estimate",
          approval_state: "pending",
          estimate_number: "EST-72",
          estimate_status: "sent",
          scheduled_at: null,
          odometer_km: 64200,
          created_at: "2026-01-05T10:00:00.000Z",
          updated_at: "2026-01-06T10:00:00.000Z",
        },
      ],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });
    const estimate = snapshot?.activeWork.find(
      (item) => item.reference.sourceId === "estimate-1",
    );

    expect(estimate).toMatchObject({
      kind: "estimate",
      reference: {
        sourceId: "estimate-1",
        sourceLabel: "Estimate EST-72",
        href: "/estimates/estimate-1",
      },
    });
  });

  it("treats an approved converted estimate as its canonical work order", async () => {
    const fixture = workspaceFixture({
      additionalWorkOrders: [
        {
          id: "wo-converted-estimate",
          customer_id: "customer-1",
          vehicle_id: "vehicle-1",
          custom_id: "1072",
          status: "in_progress",
          record_type: "work_order",
          approval_state: "approved",
          estimate_number: "EST-72",
          estimate_status: "approved",
          scheduled_at: "2026-01-06T10:00:00.000Z",
          odometer_km: null,
          created_at: "2026-01-05T10:00:00.000Z",
          updated_at: "2026-01-06T10:00:00.000Z",
        },
      ],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });

    expect(snapshot?.activeWork).toContainEqual(
      expect.objectContaining({
        kind: "work_order",
        reference: {
          sourceType: "work_order",
          sourceId: "wo-converted-estimate",
          sourceLabel: "WO-1072",
          href: "/work-orders/wo-converted-estimate",
        },
      }),
    );
    expect(snapshot?.recentTimeline).toContainEqual(
      expect.objectContaining({
        kind: "work_order",
        reference: expect.objectContaining({
          sourceId: "wo-converted-estimate",
          href: "/work-orders/wo-converted-estimate",
        }),
      }),
    );
  });

  it("retains estimate, quote, and inspection evidence for a mechanic without granting detail access", async () => {
    const fixture = workspaceFixture({
      additionalWorkOrders: [
        {
          id: "estimate-mechanic",
          customer_id: "customer-1",
          vehicle_id: "vehicle-1",
          custom_id: null,
          status: "awaiting_approval",
          record_type: "estimate",
          approval_state: "pending",
          estimate_number: "EST-MECH",
          estimate_status: "sent",
          scheduled_at: null,
          odometer_km: null,
          created_at: "2026-01-05T10:00:00.000Z",
          updated_at: "2026-01-06T10:00:00.000Z",
        },
      ],
      quoteLines: [
        {
          id: "quote-mechanic",
          work_order_id: "estimate-mechanic",
          work_order_line_id: null,
          source_work_order_line_id: null,
          description: "Front brakes",
          title: "Front brakes",
          status: "open",
          decision: "customer deferred",
          defer_reason: "Return next visit",
          decline_reason: null,
          approved_at: null,
          deferred_at: "2026-01-07T10:00:00.000Z",
          declined_at: null,
          created_at: "2026-01-05T10:00:00.000Z",
          updated_at: "2026-01-07T10:00:00.000Z",
        },
      ],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "mechanic",
      vehicleId: "vehicle-1",
    });

    expect(snapshot?.permissions).toMatchObject({
      canViewEstimates: false,
      canOpenInspections: false,
      canOpenWorkOrders: true,
    });
    expect(snapshot?.activeWork).toContainEqual(
      expect.objectContaining({
        kind: "estimate",
        reference: expect.objectContaining({
          sourceId: "estimate-mechanic",
          href: "/estimates/estimate-mechanic",
        }),
      }),
    );
    expect(snapshot?.attentionItems).toContainEqual(
      expect.objectContaining({
        kind: "deferred_work",
        reference: expect.objectContaining({
          sourceType: "work_order_quote_line",
          sourceId: "quote-mechanic",
          href: "/estimates/estimate-mechanic",
        }),
      }),
    );
    expect(snapshot?.recentTimeline).toContainEqual(
      expect.objectContaining({
        kind: "approval",
        reference: expect.objectContaining({
          sourceType: "work_order_quote_line",
          sourceId: "quote-mechanic",
        }),
      }),
    );
    expect(snapshot?.attentionItems).toContainEqual(
      expect.objectContaining({
        kind: "failed_inspection",
        reference: expect.objectContaining({
          sourceType: "inspection",
          sourceId: "inspection-1",
        }),
      }),
    );
  });

  it("shows only actionable estimates and operationally active work orders", async () => {
    const actionableEstimateStatuses = [
      "draft",
      "waiting_for_parts",
      "ready_for_advisor",
      "sent",
      "partially_approved",
    ];
    const inactiveEstimateStatuses = [
      "approved",
      "declined",
      "deferred",
      "expired",
    ];
    const terminalWorkOrderStatuses = [
      "archived",
      "canceled",
      "cancelled",
      "closed",
      "completed",
      "done",
      "invoiced",
      "paid",
      "void",
      "voided",
    ];
    const row = (
      id: string,
      status: string,
      recordType: "estimate" | "work_order",
    ) => ({
      id,
      customer_id: "customer-1",
      vehicle_id: "vehicle-1",
      custom_id: recordType === "work_order" ? id : null,
      status: recordType === "estimate" ? "awaiting_approval" : status,
      record_type: recordType,
      approval_state: "pending",
      estimate_number: recordType === "estimate" ? `EST-${id}` : null,
      estimate_status: recordType === "estimate" ? status : null,
      scheduled_at: null,
      odometer_km: null,
      created_at: "2026-01-07T10:00:00.000Z",
      updated_at: "2026-01-08T10:00:00.000Z",
    });
    const fixture = workspaceFixture({
      additionalWorkOrders: [
        ...actionableEstimateStatuses.map((status) =>
          row(`estimate-${status}`, status, "estimate"),
        ),
        ...inactiveEstimateStatuses.map((status) =>
          row(`estimate-${status}`, status, "estimate"),
        ),
        {
          ...row("estimate-terminal-sent", "sent", "estimate"),
          status: "completed",
        },
        ...terminalWorkOrderStatuses.map((status) =>
          row(`wo-${status}`, status, "work_order"),
        ),
        row("wo-ready", "ready_to_invoice", "work_order"),
      ],
    });

    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      vehicleId: "vehicle-1",
    });

    expect(
      snapshot?.activeWork
        .filter((item) => item.kind === "estimate")
        .map((item) => item.status)
        .sort(),
    ).toEqual([...actionableEstimateStatuses].sort());
    expect(
      snapshot?.activeWork
        .filter((item) => item.kind === "work_order")
        .map((item) => item.reference.sourceId)
        .sort(),
    ).toEqual(["wo-1", "wo-2", "wo-ready"]);
    expect(
      snapshot?.conflicts.find(
        (conflict) => conflict.kind === "multiple_active_work_orders",
      )?.sourceIds,
    ).toEqual(["wo-1", "wo-2", "wo-ready"]);
  });

  it("does not serialize mixed or unknown currency sums and distinguishes no invoices", async () => {
    const invoice = (id: string, currency: string | null) => ({
      id,
      work_order_id: "wo-1",
      invoice_number: id,
      status: "open",
      currency,
      total: 100,
      outstanding_total: 60,
      paid_total: 40,
      created_at: "2026-01-03T10:00:00.000Z",
      issued_at: "2026-01-03T10:00:00.000Z",
      paid_at: null,
      updated_at: "2026-01-03T10:00:00.000Z",
    });
    const loadFinancialSummary = async (invoices: unknown[]) => {
      const fixture = workspaceFixture({ invoices });
      const snapshot = await loadVehicleWorkspaceSnapshot({
        supabase: fixture.client as never,
        shopId: "shop-a",
        role: "owner",
        vehicleId: "vehicle-1",
      });
      return snapshot?.financialSummary;
    };

    const [mixed, unknown, empty] = await Promise.all([
      loadFinancialSummary([
        invoice("invoice-cad", "CAD"),
        invoice("invoice-usd", "USD"),
      ]),
      loadFinancialSummary([
        invoice("invoice-known", "CAD"),
        invoice("invoice-unknown", null),
      ]),
      loadFinancialSummary([]),
    ]);

    expect(mixed).toEqual({
      visible: true,
      currency: null,
      invoiceCount: 2,
      outstandingAmount: null,
      paidAmount: null,
    });
    expect(unknown).toEqual({
      visible: true,
      currency: null,
      invoiceCount: 2,
      outstandingAmount: null,
      paidAmount: null,
    });
    expect(empty).toEqual({
      visible: true,
      currency: null,
      invoiceCount: 0,
      outstandingAmount: null,
      paidAmount: null,
    });
  });

  it("projects a mechanic-visible account without selecting contact fields", async () => {
    const fixture = workspaceFixture();
    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "mechanic",
      vehicleId: "vehicle-1",
    });
    const customerSelect = fixture.calls.find(
      (call) => call.table === "customers" && call.operation === "select",
    );

    expect(snapshot?.currentAccount).toMatchObject({
      id: "customer-1",
      displayName: "North Star Plumbing",
    });
    expect(snapshot?.currentAccount).not.toHaveProperty("email");
    expect(snapshot?.currentAccount).not.toHaveProperty("phone");
    expect(customerSelect?.args[0]).not.toContain("email");
    expect(customerSelect?.args[0]).not.toContain("phone");
    expect(snapshot?.financialSummary).toEqual({ visible: false });
  });

  it("does not execute invoice or payment queries for a non-financial role", async () => {
    const fixture = workspaceFixture();
    const snapshot = await loadVehicleWorkspaceSnapshot({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "advisor",
      vehicleId: "vehicle-1",
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(snapshot?.financialSummary).toEqual({ visible: false });
    expect(
      fixture.calls.filter((call) =>
        ["invoices", "payments"].includes(call.table),
      ),
    ).toEqual([]);
  });

  it("requires a mechanic-visible work-order anchor before returning history", async () => {
    const fixture = createSupabaseFixture({
      vehicles: [
        {
          data: {
            id: "vehicle-1",
            shop_id: "shop-a",
            customer_id: "customer-1",
            year: 2022,
            make: "Ford",
            model: "Transit",
            submodel: null,
            vin: "1FTBW1X80NKA12345",
            license_plate: "SHOP-22",
            unit_number: "17",
            mileage: "64000",
            odometer_unit: "km",
            engine_hours: null,
            status: "active",
          },
          error: null,
        },
      ],
      work_orders: [{ data: [], error: null }],
    });

    await expect(
      loadVehicleWorkspaceSnapshot({
        supabase: fixture.client as never,
        shopId: "shop-a",
        role: "mechanic",
        vehicleId: "vehicle-1",
      }),
    ).resolves.toBeNull();
    expect(fixture.calls.map((call) => call.table)).not.toContain("history");
    expect(fixture.calls.map((call) => call.table)).not.toContain("customers");
  });

  it("retains mechanic search evidence with explicit record kinds for link gating", async () => {
    const vehicle = searchVehicleRow();
    const workOrder = searchWorkOrderRow("wo-mechanic", vehicle.id);
    const estimate = searchWorkOrderRow("estimate-mechanic", vehicle.id, {
      estimateNumber: "EST-MECH",
      estimateStatus: "sent",
      recordType: "estimate",
      status: "awaiting_approval",
    });
    const fixture = createSupabaseFixture({
      work_orders: [
        { data: [workOrder, estimate], error: null },
        { data: [workOrder, estimate], error: null },
      ],
      vehicles: [
        { data: [vehicle], error: null },
        { data: [vehicle], error: null },
      ],
      bookings: [{ data: [], error: null }],
      work_order_lines: [{ data: [], error: null }],
      work_order_quote_lines: [{ data: [], error: null }],
    });

    const response = await searchShopVehicleRecords({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "mechanic",
      query: "Ford",
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(response.permissions).toMatchObject({
      canViewEstimates: false,
      canOpenWorkOrders: true,
    });
    expect(response.groups[0]?.vehicles[0]?.activeWork).toEqual([
      expect.objectContaining({
        kind: "work_order",
        reference: expect.objectContaining({ sourceId: "wo-mechanic" }),
      }),
      expect.objectContaining({
        kind: "estimate",
        reference: expect.objectContaining({
          sourceId: "estimate-mechanic",
          href: "/estimates/estimate-mechanic",
        }),
      }),
    ]);
  });

  it("deduplicates candidates by ID, reloads canonical vehicles, and keeps all active work", async () => {
    const vehicle = searchVehicleRow();
    const visibleWorkOrders = [
      searchWorkOrderRow("wo-1", vehicle.id),
      searchWorkOrderRow("wo-2", vehicle.id),
    ];
    const fixture = createSupabaseFixture({
      vehicles: [
        { data: [vehicle, vehicle], error: null },
        { data: [vehicle], error: null },
      ],
      work_orders: [
        {
          data: [
            ...visibleWorkOrders,
            searchWorkOrderRow(
              "wo-cross-reference",
              "vehicle-not-canonical",
            ),
          ],
          error: null,
        },
        { data: visibleWorkOrders, error: null },
      ],
      customers: [{ data: [], error: null }],
      bookings: [{ data: [], error: null }],
      work_order_lines: [{ data: [], error: null }],
      work_order_quote_lines: [{ data: [], error: null }],
      invoices: [{ data: [], error: null }],
    });

    const response = await searchShopVehicleRecords({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      query: "Ford",
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(response.groups.flatMap((group) => group.vehicles)).toHaveLength(1);
    expect(response.groups[0]?.vehicles[0]?.vehicle.id).toBe("vehicle-1");
    expect(
      response.groups[0]?.vehicles[0]?.activeWork.map(
        (item) => item.reference.sourceId,
      ),
    ).toEqual(["wo-1", "wo-2"]);

    const canonicalVehicleIdQuery = fixture.calls.find(
      (call) =>
        call.table === "vehicles" &&
        call.operation === "in" &&
        call.args[0] === "id",
    );
    expect(canonicalVehicleIdQuery?.args[1]).toEqual([
      "vehicle-1",
      "vehicle-not-canonical",
    ]);
  });

  it("only offers Create WO for an active canonical vehicle and account", async () => {
    const baseAccount = {
      id: "customer-1",
      account_type: "business",
      active: true,
      business_name: "North Star Plumbing",
      name: null,
      first_name: null,
      last_name: null,
      archived_at: null,
      merged_into_customer_id: null,
    };
    const cardFor = async (
      vehicleStatus: string | null,
      accountOverrides: {
        active?: boolean;
        archived_at?: string | null;
        merged_into_customer_id?: string | null;
      } | null = {},
    ) => {
      const vehicle = searchVehicleRow({
        customerId: baseAccount.id,
        status: vehicleStatus,
      });
      const account = accountOverrides
        ? { ...baseAccount, ...accountOverrides }
        : null;
      const activeWorkOrders = [
        searchWorkOrderRow("wo-1", vehicle.id),
        searchWorkOrderRow("wo-2", vehicle.id),
      ];
      const fixture = createSupabaseFixture({
        vehicles: [
          { data: [vehicle], error: null },
          { data: [vehicle], error: null },
        ],
        work_orders: [
          { data: [], error: null },
          { data: activeWorkOrders, error: null },
        ],
        customers: [
          { data: [], error: null },
          { data: account ? [account] : [], error: null },
        ],
        bookings: [{ data: [], error: null }],
        work_order_lines: [{ data: [], error: null }],
        work_order_quote_lines: [{ data: [], error: null }],
      });
      const response = await searchShopVehicleRecords({
        supabase: fixture.client as never,
        shopId: "shop-a",
        role: "advisor",
        query: "Ford",
      });
      return response.groups[0]?.vehicles[0];
    };

    const eligible = await cardFor("active");
    expect(eligible?.activeWork).toHaveLength(2);
    expect(eligible?.createWorkOrderHref).toBe(
      "/work-orders/create?autostart=1&customerId=customer-1&vehicleId=vehicle-1",
    );

    for (const status of ["archived", "merged", "duplicate", "inactive"]) {
      expect((await cardFor(status))?.createWorkOrderHref).toBeNull();
    }
    expect(
      (await cardFor("active", { active: false }))?.createWorkOrderHref,
    ).toBeNull();
    expect(
      (
        await cardFor("active", {
          archived_at: "2026-01-05T10:00:00.000Z",
        })
      )?.createWorkOrderHref,
    ).toBeNull();
    expect(
      (
        await cardFor("active", {
          merged_into_customer_id: "customer-2",
        })
      )?.createWorkOrderHref,
    ).toBeNull();
    expect((await cardFor("active", null))?.createWorkOrderHref).toBeNull();
  });

  it("does not project account-only IDs to Parts in the raw search response", async () => {
    const customerOnly = {
      id: "customer-without-vehicle",
      account_type: "business",
      active: true,
      business_name: "No Vehicle Holdings",
      name: null,
      first_name: null,
      last_name: null,
      email: "private@example.test",
      phone: "555-0199",
      phone_number: null,
      identity_name: "no vehicle holdings",
      identity_email: "private@example.test",
      identity_phone: "5550199",
      archived_at: null,
      merged_into_customer_id: null,
    };
    const searchAs = async (role: "owner" | "parts") => {
      const fixture = createSupabaseFixture({
        vehicles: [
          { data: [], error: null },
          { data: [], error: null },
        ],
        work_orders: [{ data: [], error: null }],
        customers: [{ data: [customerOnly], error: null }],
      });
      const response = await searchShopVehicleRecords({
        supabase: fixture.client as never,
        shopId: "shop-a",
        role,
        query: "No Vehicle Holdings",
      });
      return { fixture, response };
    };

    const owner = await searchAs("owner");
    const parts = await searchAs("parts");

    expect(owner.response.accountsWithoutVehicles).toEqual([
      expect.objectContaining({ id: customerOnly.id }),
    ]);
    expect(parts.response.accountsWithoutVehicles).toEqual([]);
    expect(parts.response.groups).toEqual([]);
    expect(JSON.stringify(parts.response)).not.toContain(customerOnly.id);
    const partsCustomerSelect = parts.fixture.calls.find(
      (call) => call.table === "customers" && call.operation === "select",
    );
    expect(partsCustomerSelect?.args[0]).not.toContain("email");
    expect(partsCustomerSelect?.args[0]).not.toContain("phone");
  });

  it("returns bounded recent canonical cards for an empty search", async () => {
    const vehicle = searchVehicleRow();
    const fixture = createSupabaseFixture({
      vehicles: [
        { data: [vehicle], error: null },
        { data: [vehicle], error: null },
      ],
      work_orders: [{ data: [], error: null }],
      bookings: [{ data: [], error: null }],
      work_order_lines: [{ data: [], error: null }],
      work_order_quote_lines: [{ data: [], error: null }],
    });

    const response = await searchShopVehicleRecords({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      query: "   ",
      limit: 5,
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(response.query).toBe("");
    expect(response.groups[0]?.vehicles[0]?.vehicle.id).toBe("vehicle-1");
    expect(
      fixture.calls.filter(
        (call) => call.table === "vehicles" && call.operation === "or",
      ),
    ).toEqual([]);
    expect(
      fixture.calls.some(
        (call) =>
          call.table === "vehicles" &&
          call.operation === "limit" &&
          call.args[0] === 120,
      ),
    ).toBe(true);
  });

  it("finds VINs, plates, and phone numbers across stored separators", async () => {
    const compactVin = await runDirectVehicleSearch(
      "1FTBW1X80NKA12345",
      searchVehicleRow({ vin: "1FT-BW1X80-NKA12345" }),
    );
    const compactPlate = await runDirectVehicleSearch(
      "SHOP22",
      searchVehicleRow({ licensePlate: "SHOP-22" }),
    );

    expect(compactVin.response.groups[0]?.vehicles[0]?.vehicle.id).toBe(
      "vehicle-1",
    );
    expect(compactPlate.response.groups[0]?.vehicles[0]?.vehicle.id).toBe(
      "vehicle-1",
    );
    expect(
      compactVin.fixture.calls
        .filter(
          (call) => call.table === "vehicles" && call.operation === "or",
        )
        .flatMap((call) => call.args.map(String))
        .join(" "),
    ).toContain("vin.ilike.%1%f%t%b%w%1%x%8%0%n%k%a%1%2%3%4%5%");
    expect(
      compactPlate.fixture.calls
        .filter(
          (call) => call.table === "vehicles" && call.operation === "or",
        )
        .flatMap((call) => call.args.map(String))
        .join(" "),
    ).toContain("license_plate.ilike.%s%h%o%p%2%2%");

    const customer = {
      id: "customer-1",
      account_type: "business",
      active: true,
      business_name: "North Star Plumbing",
      name: null,
      first_name: null,
      last_name: null,
      email: "dispatch@example.test",
      phone: "555-0100",
      phone_number: null,
      identity_name: "north star plumbing",
      identity_email: "dispatch@example.test",
      identity_phone: "5550100",
    };
    const vehicle = searchVehicleRow({ customerId: customer.id });
    const phoneFixture = createSupabaseFixture({
      vehicles: [
        { data: [], error: null },
        { data: [vehicle], error: null },
        { data: [vehicle], error: null },
      ],
      work_orders: [
        { data: [], error: null },
        { data: [], error: null },
      ],
      customers: [
        { data: [customer], error: null },
        { data: [customer], error: null },
      ],
      bookings: [{ data: [], error: null }],
      work_order_lines: [{ data: [], error: null }],
      work_order_quote_lines: [{ data: [], error: null }],
    });
    const phoneResponse = await searchShopVehicleRecords({
      supabase: phoneFixture.client as never,
      shopId: "shop-a",
      role: "owner",
      query: "5550100",
    });

    expect(phoneResponse.groups[0]?.vehicles[0]?.currentAccount?.id).toBe(
      "customer-1",
    );
    expect(
      phoneFixture.calls
        .filter(
          (call) => call.table === "customers" && call.operation === "or",
        )
        .flatMap((call) => call.args.map(String))
        .join(" "),
    ).toContain("phone.ilike.%5%5%5%0%1%0%0%");
  });

  it("normalizes a WO-prefixed query and opens estimate matches canonically", async () => {
    const vehicle = searchVehicleRow();
    const estimate = searchWorkOrderRow("estimate-1048", vehicle.id, {
      customId: "1048",
      estimateNumber: "EST-1048",
      estimateStatus: "sent",
      recordType: "estimate",
      status: "awaiting_approval",
    });
    const declinedEstimate = searchWorkOrderRow(
      "estimate-1048-declined",
      vehicle.id,
      {
        customId: "1048",
        estimateNumber: "EST-1048-B",
        estimateStatus: "declined",
        recordType: "estimate",
        status: "awaiting_approval",
      },
    );
    const fixture = createSupabaseFixture({
      vehicles: [
        { data: [], error: null },
        { data: [vehicle], error: null },
      ],
      work_orders: [
        { data: [estimate, declinedEstimate], error: null },
        { data: [estimate, declinedEstimate], error: null },
      ],
      customers: [{ data: [], error: null }],
      bookings: [{ data: [], error: null }],
      work_order_lines: [{ data: [], error: null }],
      work_order_quote_lines: [{ data: [], error: null }],
      invoices: [{ data: [], error: null }],
    });

    const response = await searchShopVehicleRecords({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      query: "WO-1048",
      now: new Date("2026-01-10T00:00:00.000Z"),
    });
    const card = response.groups[0]?.vehicles[0];
    const workOrderFilters = fixture.calls
      .filter(
        (call) => call.table === "work_orders" && call.operation === "or",
      )
      .flatMap((call) => call.args.map(String))
      .join(" ");

    expect(card?.vehicle.id).toBe("vehicle-1");
    expect(card?.activeWork).toContainEqual(
      expect.objectContaining({
        kind: "estimate",
        title: "Estimate EST-1048",
        status: "sent",
        reference: expect.objectContaining({
          sourceId: "estimate-1048",
          href: "/estimates/estimate-1048",
        }),
      }),
    );
    expect(card?.activeWork).not.toContainEqual(
      expect.objectContaining({
        reference: expect.objectContaining({
          sourceId: "estimate-1048-declined",
        }),
      }),
    );
    expect(workOrderFilters).toContain("custom_id.ilike.%1048%");
    expect(workOrderFilters).not.toContain("custom_id.ilike.%wo%");
  });

  it("normalizes a compact single-token WO prefix to the canonical custom id", async () => {
    const vehicle = searchVehicleRow();
    const workOrder = searchWorkOrderRow("work-order-1048", vehicle.id, {
      customId: "1048",
    });
    const fixture = createSupabaseFixture({
      vehicles: [
        { data: [], error: null },
        { data: [vehicle], error: null },
      ],
      work_orders: [
        { data: [workOrder], error: null },
        { data: [workOrder], error: null },
      ],
      customers: [{ data: [], error: null }],
      bookings: [{ data: [], error: null }],
      work_order_lines: [{ data: [], error: null }],
      work_order_quote_lines: [{ data: [], error: null }],
      invoices: [{ data: [], error: null }],
    });

    const response = await searchShopVehicleRecords({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      query: "WO1048",
    });
    const workOrderFilters = fixture.calls
      .filter(
        (call) => call.table === "work_orders" && call.operation === "or",
      )
      .flatMap((call) => call.args.map(String))
      .join(" ");

    expect(response.groups[0]?.vehicles[0]?.vehicle.id).toBe(vehicle.id);
    expect(workOrderFilters).toContain("custom_id.ilike.%1048%");
    expect(workOrderFilters).not.toContain("custom_id.ilike.%wo1048%");
  });

  it("excludes terminal work and stale terminal-line attention while preserving current summaries", async () => {
    const vehicle = searchVehicleRow();
    const newest = searchWorkOrderRow("wo-newest", vehicle.id, {
      odometerKm: 67000,
      createdAt: "2026-01-05T10:00:00.000Z",
      updatedAt: null,
      vehicleMileage: "64000",
    });
    const canceled = searchWorkOrderRow("wo-canceled", vehicle.id, {
      status: "canceled",
      updatedAt: "2026-01-03T10:00:00.000Z",
    });
    const done = searchWorkOrderRow("wo-done", vehicle.id, {
      odometerKm: null,
      status: "done",
      updatedAt: "2026-01-02T18:00:00.000Z",
    });
    const ready = searchWorkOrderRow("wo-ready", vehicle.id, {
      odometerKm: null,
      status: "ready_to_invoice",
      updatedAt: "2026-01-02T12:00:00.000Z",
    });
    const older = searchWorkOrderRow("wo-older", vehicle.id, {
      odometerKm: 65000,
      createdAt: "2026-01-01T09:00:00.000Z",
      updatedAt: "2026-08-04T10:00:00.000Z",
      vehicleMileage: null,
    });
    const convertedEstimate = searchWorkOrderRow(
      "wo-converted-estimate",
      vehicle.id,
      {
        customId: "1072",
        estimateNumber: "EST-72",
        estimateStatus: "approved",
        odometerKm: null,
        recordType: "work_order",
        status: "in_progress",
        scheduledAt: "2026-01-06T10:00:00.000Z",
        createdAt: "2026-01-06T09:00:00.000Z",
      },
    );
    // Mirrors `updated_at desc nulls last`: the newest created WO appears after
    // older rows whose updated_at is populated.
    const workOrders = [older, canceled, done, ready, newest, convertedEstimate];
    const fixture = createSupabaseFixture({
      vehicles: [
        { data: [vehicle], error: null },
        { data: [vehicle], error: null },
      ],
      work_orders: [
        { data: workOrders, error: null },
        { data: workOrders, error: null },
      ],
      customers: [{ data: [], error: null }],
      bookings: [
        {
          data: [
            {
              id: "booking-completed",
              vehicle_id: vehicle.id,
              work_order_id: older.id,
              status: "Completed",
              starts_at: "2026-01-11T10:00:00.000Z",
              ends_at: "2026-01-11T11:00:00.000Z",
              notes: null,
            },
            {
              id: "booking-next",
              vehicle_id: vehicle.id,
              work_order_id: newest.id,
              status: "confirmed",
              starts_at: "2026-01-12T10:00:00.000Z",
              ends_at: "2026-01-12T11:00:00.000Z",
              notes: null,
            },
          ],
          error: null,
        },
      ],
      work_order_lines: [
        {
          data: [
            {
              id: "line-active-deferred",
              vehicle_id: vehicle.id,
              work_order_id: newest.id,
              status: "open",
              line_status: "deferred",
              approval_state: null,
              hold_reason: null,
              voided_at: null,
            },
            ...["canceled", "completed", "invoiced", "ready_to_invoice"].map(
              (status) => ({
                id: `line-terminal-${status}`,
                vehicle_id: vehicle.id,
                work_order_id: newest.id,
                status,
                line_status: "deferred",
                approval_state: "declined",
                hold_reason: "Stale hold reason",
                voided_at: null,
              }),
            ),
          ],
          error: null,
        },
      ],
      work_order_quote_lines: [{ data: [], error: null }],
      invoices: [
        {
          data: [
            {
              id: "invoice-cad",
              work_order_id: newest.id,
              outstanding_total: 100,
              currency: "CAD",
            },
            {
              id: "invoice-usd",
              work_order_id: older.id,
              outstanding_total: 80,
              currency: "USD",
            },
          ],
          error: null,
        },
      ],
    });

    const response = await searchShopVehicleRecords({
      supabase: fixture.client as never,
      shopId: "shop-a",
      role: "owner",
      query: "Ford",
      now: new Date("2026-01-10T00:00:00.000Z"),
    });
    const card = response.groups[0]?.vehicles[0];

    expect(card?.activeWork.map((item) => item.reference.sourceId)).toEqual([
      "wo-older",
      "wo-ready",
      "wo-newest",
      "wo-converted-estimate",
    ]);
    expect(card?.activeWork.at(-1)).toMatchObject({
      kind: "work_order",
      title: "WO-1072",
      reference: {
        sourceId: "wo-converted-estimate",
        href: "/work-orders/wo-converted-estimate",
      },
    });
    expect(card?.latestOdometer).toBe("67000");
    expect(card?.attentionCount).toBe(1);
    expect(card?.nextAppointment?.reference.sourceId).toBe("booking-next");
    expect(card).not.toHaveProperty("outstandingAmount");
    expect(card?.currency).toBeNull();
  });
});
